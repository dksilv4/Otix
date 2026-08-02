"""Priority queue + backlog fallback for the full-hydration pipeline.

Candidates to fully process are tracked in a Redis sorted set
(``catalog:priority``) scored by priority (higher = sooner). A bounded seen
set (``catalog:seen``) prevents re-enqueuing the same item. When the priority
queue is empty the pipeline falls back to the TMDB stub backlog so it
eventually hydrates everything.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select

from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

PRIORITY_KEY = "catalog:priority"
SEEN_KEY = "catalog:seen"
DRAIN_KEY = "catalog:drain"
QUEUE_DRAIN_BATCH = 10
DRAIN_TTL = 300  # seconds; self-heals if the drain process dies mid-cycle


def _member(media_type: str, external_id: int | str) -> str:
    return f"{media_type}:{external_id}"


async def enqueue_candidate(media_type: str, external_id: int | str, priority: float = 0.0) -> bool:
    """Add a candidate to the priority queue unless it's already been seen."""
    redis = await get_redis()
    member = _member(media_type, external_id)
    if await redis.sismember(SEEN_KEY, member):
        return False
    await redis.sadd(SEEN_KEY, member)
    await redis.zadd(PRIORITY_KEY, {member: priority})
    await redis.setex(DRAIN_KEY, DRAIN_TTL, "1")
    return True


async def pop_candidates(limit: int = QUEUE_DRAIN_BATCH) -> list[tuple[str, str]]:
    """Pop up to *limit* highest-priority candidates as (media_type, external_id)."""
    redis = await get_redis()
    if limit <= 0:
        return []
    raw = await redis.zrevrange(PRIORITY_KEY, 0, limit - 1)
    if not raw:
        return []
    await redis.zrem(PRIORITY_KEY, *raw)
    parsed: list[tuple[str, str]] = []
    for member in raw:
        media_type, _, ext = str(member).partition(":")
        if media_type and ext:
            parsed.append((media_type, ext))
    return parsed


async def priority_size() -> int:
    redis = await get_redis()
    return await redis.zcard(PRIORITY_KEY)


async def fetch_backlog(limit: int = QUEUE_DRAIN_BATCH) -> list[tuple[str, str]]:
    """Pull next unclaimed TMDB stub-backlog candidates as (media_type, external_id).

    Adult content is deprioritised. Stubs already in the seen set (claimed or
    already prioritized) are excluded, so each stub is dispatched once.
    """
    from otix.domain.media import ExternalID
    from otix.infrastructure.database import async_session

    async with async_session() as session:
        result = await session.execute(
            select(ExternalID.external_id, ExternalID.media_type)
            .where(
                ExternalID.provider == "tmdb",
                ExternalID.media_item_id.is_(None),
                ExternalID.media_type.in_(["movie", "show"]),
            )
            .order_by(ExternalID.is_adult.asc(), ExternalID.created_at.asc())
            .limit(limit * 3)
        )
        rows = result.all()
    if not rows:
        return []

    redis = await get_redis()
    pipe = redis.pipeline()
    for ext, mt in rows:
        pipe.sismember(SEEN_KEY, _member(mt or "movie", ext))
    seen_flags = await pipe.execute()

    out: list[tuple[str, str]] = []
    for (ext, mt), is_seen in zip(rows, seen_flags, strict=False):
        if not is_seen:
            out.append((mt or "movie", ext))
        if len(out) >= limit:
            break
    return out


async def claim_backlog(members: list[tuple[str, str]]) -> None:
    """Mark backlog items as claimed so they are not picked up again."""
    redis = await get_redis()
    pipe = redis.pipeline()
    for media_type, ext in members:
        pipe.sadd(SEEN_KEY, _member(media_type, ext))
    await pipe.execute()


async def drain_needed() -> bool:
    """True if a candidate was enqueued since the last drain cycle."""
    redis = await get_redis()
    return bool(await redis.exists(DRAIN_KEY))


async def clear_drain_needed() -> None:
    redis = await get_redis()
    await redis.delete(DRAIN_KEY)
