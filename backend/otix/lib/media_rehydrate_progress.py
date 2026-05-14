"""Redis pub/sub progress publisher for media rehydration SSE streams."""

from __future__ import annotations

import json
from typing import Any

from otix.infrastructure.redis import get_redis

_CHANNEL_TPL = "media:rehydrate:{}:events"
_RESULT_TPL = "media:rehydrate:{}:result"
_PROGRESS_TPL = "media:rehydrate:{}:progress"
_TTL = 300


async def publish_progress(task_id: str, event_type: str, **data: Any) -> None:
    redis = await get_redis()
    payload = json.dumps({"type": event_type, **data})
    await redis.publish(_CHANNEL_TPL.format(task_id), payload)


async def store_progress(task_id: str, event_type: str, **data: Any) -> None:
    redis = await get_redis()
    payload = json.dumps({"type": event_type, **data})
    await redis.set(_PROGRESS_TPL.format(task_id), payload, ex=_TTL)


async def get_latest_progress(task_id: str) -> dict | None:
    redis = await get_redis()
    raw = await redis.get(_PROGRESS_TPL.format(task_id))
    if raw:
        return json.loads(raw)
    return None


async def store_result(task_id: str, result: dict) -> None:
    redis = await get_redis()
    await redis.set(_RESULT_TPL.format(task_id), json.dumps(result), ex=_TTL)


async def get_stored_result(task_id: str) -> dict | None:
    redis = await get_redis()
    raw = await redis.get(_RESULT_TPL.format(task_id))
    if raw:
        return json.loads(raw)
    return None


def channel_name(task_id: str) -> str:
    return _CHANNEL_TPL.format(task_id)
