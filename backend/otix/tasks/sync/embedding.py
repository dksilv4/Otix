"""Embedding generation tasks — produce pgvector embeddings for semantic search."""

from __future__ import annotations

import structlog

from otix.domain.genre import MediaGenre
from otix.domain.media import MediaItem
from otix.domain.people import MediaCredit
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr

logger = structlog.get_logger()

# Process embeddings in batches for throughput.
# GPU inference scales with batch size; CPU ONNX also benefits from vectorisation.
_BATCH_SIZE = 10


@app.task(
    name="embedding.generate",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_embedding_task(self, media_item_id: str) -> dict | None:
    """Generate and store an embedding for a single media item."""
    return run_async(_generate_embedding(media_item_id))


@app.task(
    name="embedding.generate_batch",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_embedding_batch_task(self, media_item_ids: list[str]) -> dict | None:
    """Generate and store embeddings for multiple media items in one inference call."""
    return run_async(_generate_embedding_batch(media_item_ids))


async def _generate_embedding(media_item_id: str) -> dict | None:
    """Generate a single embedding. Delegates to batch internally."""
    result = await _generate_embedding_batch([media_item_id])
    return result


async def _generate_embedding_batch(media_item_ids: list[str]) -> dict | None:
    from sqlalchemy import select
    from sqlalchemy.orm import selectinload, joinedload

    from otix.services.embedding_service import EmbeddingService

    # Load items in a short-lived session — ONNX inference runs outside any
    # transaction so we don't hit idle_in_transaction_session_timeout.
    async with async_session() as session:
        result = await session.scalars(
            select(MediaItem)
            .where(MediaItem.id.in_(media_item_ids))
            .options(
                selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                selectinload(MediaItem.credits).joinedload(MediaCredit.person),
            )
        )
        items = list(result)
        await session.commit()

    if not items:
        logger.warning("embedding batch: no items found", ids=media_item_ids)
        return None

    service = EmbeddingService()
    texts = [service.build_embedding_text(item) for item in items]

    try:
        embeddings = await service.embed_batch(texts, purpose="document")
    except Exception:
        logger.warning(
            "embedding batch failed", count=len(items), exc_info=True
        )
        raise

    # Write embeddings in a fresh session (no long-running transaction)
    async with async_session() as session:
        result = await session.scalars(
            select(MediaItem).where(MediaItem.id.in_([it.id for it in items]))
        )
        item_map = {item.id: item for item in result}
        for old_item, embedding in zip(items, embeddings):
            fresh = item_map.get(old_item.id)
            if fresh is not None:
                fresh.embedding = embedding
        await session.commit()

    await _progress_incr("embedding_enqueued", amount=len(items))
    logger.info("embedding batch generated", count=len(items))
    return {"media_item_ids": media_item_ids, "count": len(items), "dimension": len(embeddings[0]) if embeddings else 0}
