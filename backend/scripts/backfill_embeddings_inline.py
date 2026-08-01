"""Optimized embedding backfill — direct sync inference, larger batches.

Usage: docker compose up -d backfill-media (runs via docker-compose.yml)
"""
from __future__ import annotations

import asyncio
import gc
import time

import structlog

from otix.domain.media import MediaItem
from otix.infrastructure.database import async_session
from otix.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

_DB_BATCH = 250


async def backfill_media() -> dict:
    """Generate embeddings for all media items missing them, inline."""
    async with async_session() as session:
        from sqlalchemy import select, func

        total = await session.scalar(
            select(func.count()).select_from(MediaItem).where(MediaItem.embedding.is_(None))
        )
        result = await session.execute(select(MediaItem.id).where(MediaItem.embedding.is_(None)))
        all_ids = [row[0] for row in result]

    if not all_ids:
        return {"enqueued": 0}

    logger.info("backfill_media: starting", total=total)
    service = EmbeddingService()
    model = service._get_model()
    logger.info("backfill_media: model loaded", model=service._model_name)

    processed = 0
    t_start = time.time()

    for i in range(0, len(all_ids), _DB_BATCH):
        batch_ids = all_ids[i : i + _DB_BATCH]

        # Load items with relationships
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload

        from otix.domain.genre import MediaGenre
        from otix.domain.people import MediaCredit

        async with async_session() as session:
            rows = await session.scalars(
                select(MediaItem)
                .where(MediaItem.id.in_(batch_ids))
                .options(
                    selectinload(MediaItem.genres).joinedload(MediaGenre.genre),
                    selectinload(MediaItem.credits).joinedload(MediaCredit.person),
                )
            )
            items = list(rows)

        # Build texts
        texts = [service.build_embedding_text(item) for item in items]

        # Run inference synchronously (blocks event loop — fine for sequential backfill)
        all_embeddings = service._embed_sync(texts, purpose="document")

        # Write embeddings
        async with async_session() as session:
            rows = await session.scalars(
                select(MediaItem).where(MediaItem.id.in_([it.id for it in items]))
            )
            item_map = {item.id: item for item in rows}
            for old_item, embedding in zip(items, all_embeddings, strict=False):
                fresh = item_map.get(old_item.id)
                if fresh is not None:
                    fresh.embedding = embedding
            await session.commit()

        processed += len(items)
        elapsed = time.time() - t_start
        rate = processed / elapsed if elapsed > 0 else 0
        logger.info(
            "backfill_media: progress",
            processed=processed,
            total=total,
            pct=f"{processed / total * 100:.1f}%",
            rate=f"{rate:.1f} items/s",
            elapsed=f"{elapsed:.0f}s",
        )

        # Force GC to keep memory stable
        del items, texts, all_embeddings, item_map, rows
        gc.collect()

    elapsed = time.time() - t_start
    logger.info("backfill_media: complete", processed=processed, elapsed=f"{elapsed:.0f}s")
    return {"enqueued": processed}


if __name__ == "__main__":
    asyncio.run(backfill_media())
