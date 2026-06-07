# TODO: Review this file
"""Task-level guards for Celery tasks: cooldown, dedup, poison-pill, pacing.

Uses Redis so state is shared across workers. All keys are prefixed and
TTL-limited so nothing leaks permanently.

Usage in a Celery task::

    from otix.lib.task_guard import TaskGuard

    guard = TaskGuard(redis, "spotify")

    # 1. Cooldown gate — skip API call entirely when provider is rate-limited
    if cooldown := await guard.cooldown():
        raise self.retry(countdown=cooldown)

    # 2. Dedup — skip if this entity was already processed recently
    if await guard.is_duplicate("seed_album", spotify_id):
        return {"skipped": True, "reason": "duplicate"}

    # 3. Poison pill — stop retrying after N consecutive failures
    if await guard.should_skip("enrich_album", spotify_id):
        return {"skipped": True, "reason": "poison"}

    try:
        result = await do_work()
    except Exception:
        await guard.record_failure("enrich_album", spotify_id)
        raise
    else:
        await guard.reset_failures("enrich_album", spotify_id)

    # 4. Smart pacing — scale batch size based on cooldown
    batch = guard.pace(cooldown, base=5, floor=1)
"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from redis.asyncio import Redis


class TaskGuard:
    """Per-task guards backed by Redis."""

    def __init__(self, redis: Redis, provider: str):
        self.redis = redis
        self.provider = provider

    # ── Cooldown ──────────────────────────────────────────────────────────

    COOLDOWN_KEY = "ratelimit:{provider}:cooldown"

    async def cooldown(self) -> int:
        """Return remaining cooldown seconds, or 0 if the provider is ready."""
        try:
            ttl = await self.redis.ttl(self.COOLDOWN_KEY.format(provider=self.provider))
            return ttl if ttl > 0 else 0
        except Exception:
            return 0

    # ── Dedup ─────────────────────────────────────────────────────────────

    DEDUP_PREFIX = "dedup:{provider}"
    DEDUP_TTL = 86400  # 24 hours — long enough to cover a crawl cycle

    async def is_duplicate(self, operation: str, entity_id: str) -> bool:
        """Return True if *entity_id* was already processed for *operation*."""
        try:
            key = f"{self.DEDUP_PREFIX.format(provider=self.provider)}:{operation}:{entity_id}"
            # SET NX returns True only if the key didn't already exist
            was_set = await self.redis.set(key, "1", nx=True, ex=self.DEDUP_TTL)
            return not was_set
        except Exception:
            return False

    # ── Poison pill ───────────────────────────────────────────────────────

    FAILURE_PREFIX = "dead:{provider}"
    FAILURE_TTL = 604800  # 7 days
    MAX_FAILURES = 3

    async def record_failure(self, operation: str, entity_id: str) -> int:
        """Increment the failure counter. Returns the new count."""
        try:
            key = f"{self.FAILURE_PREFIX.format(provider=self.provider)}:{operation}:{entity_id}"
            count = await self.redis.incr(key)
            await self.redis.expire(key, self.FAILURE_TTL)
            return count
        except Exception:
            return 0

    async def reset_failures(self, operation: str, entity_id: str) -> None:
        """Clear the failure counter after a successful attempt."""
        try:
            key = f"{self.FAILURE_PREFIX.format(provider=self.provider)}:{operation}:{entity_id}"
            await self.redis.delete(key)
        except Exception:
            pass

    async def should_skip(self, operation: str, entity_id: str) -> bool:
        """Return True if this entity has failed too many times and should be skipped."""
        try:
            key = f"{self.FAILURE_PREFIX.format(provider=self.provider)}:{operation}:{entity_id}"
            count = await self.redis.get(key)
            return count is not None and int(count) >= self.MAX_FAILURES
        except Exception:
            return False

    # ── Pacing ────────────────────────────────────────────────────────────

    def pace(self, cooldown_seconds: int, base: int, floor: int = 1) -> int:
        """Scale batch size based on current cooldown.

        When cooldown=0, return *base*. As cooldown increases, scale down
        toward *floor*. Returns *floor* (or 0 to skip) when heavily throttled.
        """
        if cooldown_seconds <= 0:
            return base
        if cooldown_seconds >= 300:  # 5+ minutes — skip entirely
            return 0
        if cooldown_seconds >= 120:
            return max(floor, base // 5)
        if cooldown_seconds >= 60:
            return max(floor, base // 3)
        return max(floor, base // 2)
