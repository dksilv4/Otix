"""Run person embedding backfill inline (not via Celery).

Usage: docker compose exec -w /app api python -m scripts.backfill_people_embeddings_inline
"""
from __future__ import annotations

import asyncio
import gc
import time

import structlog

from otix.domain.people import Person
from otix.infrastructure.database import async_session
from otix.services.embedding_service import EmbeddingService

logger = structlog.get_logger(__name__)

_INFERENCE_BATCH = 50
_DB_BATCH = 500


async def backfill_people() -> dict:
    """Generate embeddings for all people missing them, inline."""
    async with async_session() as session:
        from sqlalchemy import select, func

        total = await session.scalar(
            select(func.count()).select_from(Person).where(Person.embedding.is_(None))
        )
        result = await session.execute(select(Person.id).where(Person.embedding.is_(None)))
        all_ids = [row[0] for row in result]

    if not all_ids:
        return {"enqueued": 0}

    logger.info("backfill_people: starting", total=total)
    service = EmbeddingService()
    model = service._get_model()
    logger.info("backfill_people: model loaded", model=service._model_name)

    processed = 0
    t_start = time.time()

    for i in range(0, len(all_ids), _DB_BATCH):
        batch_ids = all_ids[i : i + _DB_BATCH]

        async with async_session() as session:
            from sqlalchemy import select

            rows = await session.scalars(
                select(Person).where(Person.id.in_(batch_ids))
            )
            people = list(rows)

        texts = [service.build_person_embedding_text(p) for p in people]

        all_embeddings = []
        for j in range(0, len(texts), _INFERENCE_BATCH):
            sub_texts = texts[j : j + _INFERENCE_BATCH]
            embs = await service.embed_batch(sub_texts, purpose="document")
            all_embeddings.extend(embs)

        async with async_session() as session:
            rows = await session.scalars(
                select(Person).where(Person.id.in_([p.id for p in people]))
            )
            person_map = {p.id: p for p in rows}
            for old_person, embedding in zip(people, all_embeddings, strict=False):
                fresh = person_map.get(old_person.id)
                if fresh is not None:
                    fresh.embedding = embedding
            await session.commit()

        processed += len(people)
        elapsed = time.time() - t_start
        rate = processed / elapsed if elapsed > 0 else 0
        logger.info(
            "backfill_people: progress",
            processed=processed,
            total=total,
            pct=f"{processed / total * 100:.1f}%",
            rate=f"{rate:.1f} items/s",
            elapsed=f"{elapsed:.0f}s",
        )

        del people, texts, all_embeddings, person_map, rows
        gc.collect()

    elapsed = time.time() - t_start
    logger.info("backfill_people: complete", processed=processed, elapsed=f"{elapsed:.0f}s")
    return {"enqueued": processed}


if __name__ == "__main__":
    asyncio.run(backfill_people())
