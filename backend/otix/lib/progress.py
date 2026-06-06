# TODO: Review this file
"""Redis-backed atomic progress counters for worker observability.

Uses HINCRBY on a fixed key. snapshot_and_reset() atomically reads and
clears all counters in one pipeline so each window is independent.
"""

from __future__ import annotations

from otix.infrastructure.redis import get_redis

_COUNTER_KEY = "otix:progress:counters"


async def incr(field: str, amount: int = 1) -> None:
    """Atomically increment a counter field."""
    redis = await get_redis()
    await redis.hincrby(_COUNTER_KEY, field, amount)


async def snapshot_and_reset() -> dict[str, int]:
    """Read all counters and atomically reset them.

    Returns a dict of field_name → count, with values cast to int.
    """
    redis = await get_redis()

    async with redis.pipeline() as pipe:
        pipe.hgetall(_COUNTER_KEY)
        pipe.delete(_COUNTER_KEY)
        raw, _ = await pipe.execute()

    if not raw:
        return {}
    return {k: int(v) for k, v in raw.items()}
