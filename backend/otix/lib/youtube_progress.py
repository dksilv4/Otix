"""Redis pub/sub progress publisher for YouTube sync SSE streams."""

from __future__ import annotations

import json
from typing import Any

from otix.infrastructure.redis import get_redis

_CHANNEL_TPL = "youtube:sync:{}:events"
_RESULT_TPL = "youtube:sync:{}:result"
_PROGRESS_TPL = "youtube:sync:{}:progress"
_TTL = 300  # 5 minutes


async def publish_progress(task_id: str, event_type: str, **data: Any) -> None:
    redis = await get_redis()
    channel = _CHANNEL_TPL.format(task_id)
    payload = json.dumps({"type": event_type, **data})
    await redis.publish(channel, payload)


async def store_progress(task_id: str, event_type: str, **data: Any) -> None:
    redis = await get_redis()
    key = _PROGRESS_TPL.format(task_id)
    payload = json.dumps({"type": event_type, **data})
    await redis.set(key, payload, ex=_TTL)


async def get_latest_progress(task_id: str) -> dict | None:
    redis = await get_redis()
    key = _PROGRESS_TPL.format(task_id)
    raw = await redis.get(key)
    if raw:
        return json.loads(raw)
    return None


async def store_result(task_id: str, result: dict) -> None:
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    await redis.set(key, json.dumps(result), ex=_TTL)


async def get_stored_result(task_id: str) -> dict | None:
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    raw = await redis.get(key)
    if raw:
        return json.loads(raw)
    return None
