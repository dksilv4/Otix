"""Embedding generation task — produces pgvector embeddings for semantic search."""

from __future__ import annotations

import structlog
from sqlalchemy import column, select, table, text, update, String

from otix.domain.genre import MediaGenre, Genre
from otix.domain.media import MediaItem
from otix.domain.people import MediaCredit, Person
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session
from otix.lib.concurrency import run_async
from otix.lib.progress import incr as _progress_incr

logger = structlog.get_logger()


@app.task(
    name="embedding.generate",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_embedding_task(self, media_item_id: str) -> dict | None:
    """Generate and store an embedding vector for a media item."""
    return run_async(_generate_embedding(media_item_id))


async def _generate_embedding(media_item_id: str) -> dict | None:
    from sqlalchemy.orm import selectinload, joinedload

    from otix.services.embedding_service import EmbeddingService

    async with async_session() as session:
        result = await session.scalars(
            select(MediaItem)
            .where(MediaItem.id == media_item_id)
            .options(
                selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                selectinload(MediaItem.credits).joinedload(MediaCredit.person),
            )
        )
        item = result.one_or_none()
        if not item:
            logger.warning("embedding: media item not found", id=media_item_id)
            return None

        service = EmbeddingService()
        embedding_text = service.build_embedding_text(item)

        try:
            embedding = await service.embed(embedding_text)
        except Exception:
            logger.warning("embedding generation failed", media_item_id=media_item_id, exc_info=True)
            raise

        from pgvector.sqlalchemy import Vector

        col_check = await session.execute(
            text("SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='media_items' AND column_name='embedding')")
        )
        if col_check.scalar_one():
            media_tbl = table("media_items", column("id", String), column("embedding", Vector(384)))
            await session.execute(
                update(media_tbl).where(media_tbl.c.id == media_item_id).values(embedding=embedding)
            )
            await session.commit()
        else:
            logger.debug("embedding column not available, skipping write", media_item_id=media_item_id)

    logger.info("embedding generated", title=item.title, media_type=item.media_type, media_item_id=media_item_id)
    await _progress_incr("embedding_enqueued")
    return {"media_item_id": media_item_id, "dimension": len(embedding)}
