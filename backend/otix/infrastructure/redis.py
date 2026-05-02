from __future__ import annotations

import asyncio

import redis.asyncio as aioredis

from otix.infrastructure.config import settings

_redis: aioredis.Redis | None = None
_redis_loop_id: int | None = None


async def get_redis() -> aioredis.Redis:
    global _redis, _redis_loop_id
    try:
        current_loop_id = id(asyncio.get_running_loop())
    except RuntimeError:
        current_loop_id = None

    if _redis is not None and _redis_loop_id != current_loop_id:
        # Event loop changed (e.g. Celery prefork worker) — discard cached connection
        try:
            await _redis.aclose()
        except Exception:
            pass
        _redis = None
        _redis_loop_id = None

    if _redis is None:
        _redis = aioredis.from_url(
            settings.redis_url,
            decode_responses=True,
        )
        _redis_loop_id = current_loop_id
    return _redis


async def close_redis() -> None:
    global _redis, _redis_loop_id
    if _redis is not None:
        await _redis.aclose()
        _redis = None
        _redis_loop_id = None
