"""Run company embedding backfill inline (not via Celery).

Usage: docker compose exec -w /app api python -m scripts.backfill_company_embeddings_inline
"""
from __future__ import annotations

import asyncio
import gc
import time

import structlog

from otix.domain import Company
from otix.infrastructure.database import async_session
from otix.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

_INFERENCE_BATCH = 50
_DB_BATCH = 500


async def backfill_companies() -> dict:
    """Generate embeddings for all companies missing them, inline."""
    async with async_session() as session:
        from sqlalchemy import select, func

        total = await session.scalar(
            select(func.count()).select_from(Company).where(Company.embedding.is_(None))
        )
        result = await session.execute(select(Company.id).where(Company.embedding.is_(None)))
        all_ids = [row[0] for row in result]

    if not all_ids:
        return {"enqueued": 0}

    logger.info("backfill_companies: starting", total=total)
    service = EmbeddingService()
    model = service._get_model()
    logger.info("backfill_companies: model loaded", model=service._model_name)

    processed = 0
    t_start = time.time()

    for i in range(0, len(all_ids), _DB_BATCH):
        batch_ids = all_ids[i : i + _DB_BATCH]

        async with async_session() as session:
            from sqlalchemy import select

            rows = await session.scalars(
                select(Company).where(Company.id.in_(batch_ids))
            )
            companies = list(rows)

        texts = [service.build_company_embedding_text(c) for c in companies]

        all_embeddings = []
        for j in range(0, len(texts), _INFERENCE_BATCH):
            sub_texts = texts[j : j + _INFERENCE_BATCH]
            embs = await service.embed_batch(sub_texts, purpose="document")
            all_embeddings.extend(embs)

        async with async_session() as session:
            rows = await session.scalars(
                select(Company).where(Company.id.in_([c.id for c in companies]))
            )
            company_map = {c.id: c for c in rows}
            for old_c, embedding in zip(companies, all_embeddings, strict=False):
                fresh = company_map.get(old_c.id)
                if fresh is not None:
                    fresh.embedding = embedding
            await session.commit()

        processed += len(companies)
        elapsed = time.time() - t_start
        rate = processed / elapsed if elapsed > 0 else 0
        logger.info(
            "backfill_companies: progress",
            processed=processed,
            total=total,
            pct=f"{processed / total * 100:.1f}%",
            rate=f"{rate:.1f} items/s",
            elapsed=f"{elapsed:.0f}s",
        )

        del companies, texts, all_embeddings, company_map, rows
        gc.collect()

    elapsed = time.time() - t_start
    logger.info("backfill_companies: complete", processed=processed, elapsed=f"{elapsed:.0f}s")
    return {"enqueued": processed}


if __name__ == "__main__":
    asyncio.run(backfill_companies())
