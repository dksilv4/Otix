"""Redis pub/sub progress publisher for Spotify sync SSE streams."""

from __future__ import annotations

import json
from typing import Any

from otix.infrastructure.redis import get_redis

_CHANNEL_TPL = "spotify:sync:{}:events"
_RESULT_TPL = "spotify:sync:{}:result"
_PROGRESS_TPL = "spotify:sync:{}:progress"
_TTL = 300  # 5 minutes


async def publish_progress(task_id: str, event_type: str, **data: Any) -> None:
    """Publish a progress event to the task's Redis pub/sub channel."""
    redis = await get_redis()
    channel = _CHANNEL_TPL.format(task_id)
    payload = json.dumps({"type": event_type, **data})
    await redis.publish(channel, payload)


async def store_progress(task_id: str, event_type: str, **data: Any) -> None:
    """Store the latest progress event so SSE can replay it on reconnect."""
    redis = await get_redis()
    key = _PROGRESS_TPL.format(task_id)
    payload = json.dumps({"type": event_type, **data})
    await redis.set(key, payload, ex=_TTL)


async def get_latest_progress(task_id: str) -> dict | None:
    """Retrieve the latest intermediate progress event for replay."""
    redis = await get_redis()
    key = _PROGRESS_TPL.format(task_id)
    raw = await redis.get(key)
    if raw:
        return json.loads(raw)
    return None


async def store_result(task_id: str, result: dict) -> None:
    """Store the final sync result so the SSE endpoint can replay it."""
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    await redis.set(key, json.dumps(result), ex=_TTL)


async def get_stored_result(task_id: str) -> dict | None:
    """Check for a pre-existing result (task finished before SSE connected)."""
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    raw = await redis.get(key)
    if raw:
        return json.loads(raw)
    return None
