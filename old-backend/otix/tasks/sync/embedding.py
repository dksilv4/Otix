# TODO: Review this file
"""Embedding generation tasks — produce pgvector embeddings for semantic search."""

from __future__ import annotations

import gc

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
_BATCH_SIZE = 50


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
    from sqlalchemy.orm import selectinload

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
        for old_item, embedding in zip(items, embeddings, strict=False):
            fresh = item_map.get(old_item.id)
            if fresh is not None:
                fresh.embedding = embedding
        await session.commit()

    await _progress_incr("embedding_enqueued", amount=len(items))
    logger.info("embedding batch generated", count=len(items))
    gc.collect()
    return {"media_item_ids": media_item_ids, "count": len(items), "dimension": len(embeddings[0]) if embeddings else 0}


@app.task(
    name="embedding.generate_user_batch",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_user_embedding_batch_task(self, user_ids: list[str]) -> dict | None:
    """Generate and store embeddings for multiple users in one inference call."""
    return run_async(_generate_user_embedding_batch(user_ids))


@app.task(
    name="embedding.generate_person_batch",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_person_embedding_batch_task(self, person_ids: list[str]) -> dict | None:
    """Generate and store embeddings for multiple people in one inference call."""
    return run_async(_generate_person_embedding_batch(person_ids))


@app.task(
    name="embedding.generate_company_batch",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def generate_company_embedding_batch_task(self, company_ids: list[str]) -> dict | None:
    """Generate and store embeddings for multiple companies in one inference call."""
    return run_async(_generate_company_embedding_batch(company_ids))


async def _generate_user_embedding_batch(user_ids: list[str]) -> dict | None:
    from sqlalchemy import select
    from otix.domain.user import User
    from otix.services.embedding_service import EmbeddingService

    async with async_session() as session:
        result = await session.scalars(
            select(User).where(User.id.in_(user_ids))
        )
        users = list(result)
        await session.commit()

    if not users:
        logger.warning("user embedding batch: no users found", ids=user_ids)
        return None

    service = EmbeddingService()
    texts = [service.build_user_embedding_text(user) for user in users]

    try:
        embeddings = await service.embed_batch(texts, purpose="document")
    except Exception:
        logger.warning("user embedding batch failed", count=len(users), exc_info=True)
        raise

    async with async_session() as session:
        result = await session.scalars(
            select(User).where(User.id.in_([u.id for u in users]))
        )
        user_map = {user.id: user for user in result}
        for old_user, embedding in zip(users, embeddings, strict=False):
            fresh = user_map.get(old_user.id)
            if fresh is not None:
                fresh.embedding = embedding
        await session.commit()

    logger.info("user embedding batch generated", count=len(users))
    gc.collect()
    return {"user_ids": user_ids, "count": len(users)}


async def _generate_person_embedding_batch(person_ids: list[str]) -> dict | None:
    from sqlalchemy import select
    from otix.domain.people import Person
    from otix.services.embedding_service import EmbeddingService

    async with async_session() as session:
        result = await session.scalars(
            select(Person).where(Person.id.in_(person_ids))
        )
        people = list(result)
        await session.commit()

    if not people:
        logger.warning("person embedding batch: no people found", ids=person_ids)
        return None

    service = EmbeddingService()
    texts = [service.build_person_embedding_text(person) for person in people]

    try:
        embeddings = await service.embed_batch(texts, purpose="document")
    except Exception:
        logger.warning("person embedding batch failed", count=len(people), exc_info=True)
        raise

    async with async_session() as session:
        result = await session.scalars(
            select(Person).where(Person.id.in_([p.id for p in people]))
        )
        person_map = {person.id: person for person in result}
        for old_person, embedding in zip(people, embeddings, strict=False):
            fresh = person_map.get(old_person.id)
            if fresh is not None:
                fresh.embedding = embedding
        await session.commit()

    logger.info("person embedding batch generated", count=len(people))
    gc.collect()
    return {"person_ids": person_ids, "count": len(people)}


async def _generate_company_embedding_batch(company_ids: list[str]) -> dict | None:
    from sqlalchemy import select
    from otix.domain.company import Company
    from otix.services.embedding_service import EmbeddingService

    async with async_session() as session:
        result = await session.scalars(
            select(Company).where(Company.id.in_(company_ids))
        )
        companies = list(result)
        await session.commit()

    if not companies:
        logger.warning("company embedding batch: no companies found", ids=company_ids)
        return None

    service = EmbeddingService()
    texts = [service.build_company_embedding_text(company) for company in companies]

    try:
        embeddings = await service.embed_batch(texts, purpose="document")
    except Exception:
        logger.warning("company embedding batch failed", count=len(companies), exc_info=True)
        raise

    async with async_session() as session:
        result = await session.scalars(
            select(Company).where(Company.id.in_([c.id for c in companies]))
        )
        company_map = {company.id: company for company in result}
        for old_company, embedding in zip(companies, embeddings, strict=False):
            fresh = company_map.get(old_company.id)
            if fresh is not None:
                fresh.embedding = embedding
        await session.commit()

    logger.info("company embedding batch generated", count=len(companies))
    gc.collect()
    return {"company_ids": company_ids, "count": len(companies)}

