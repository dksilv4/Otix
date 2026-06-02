"""Redis pub/sub progress publisher for Plex sync SSE streams."""

from __future__ import annotations

import json
from typing import Any

import structlog

from otix.infrastructure.redis import get_redis

_CHANNEL_TPL = "plex:sync:{}:events"
_RESULT_TPL = "plex:sync:{}:result"
_RESULT_TTL = 300  # 5 minutes

logger = structlog.get_logger()


async def publish_progress(task_id: str, event_type: str, **data: Any) -> None:
    """Publish a progress event to the task's Redis pub/sub channel."""
    redis = await get_redis()
    channel = _CHANNEL_TPL.format(task_id)
    payload = json.dumps({"type": event_type, **data})
    logger.debug("plex progress publish", event_type=event_type, payload_len=len(payload), key_fields=list(data.keys()))
    await redis.publish(channel, payload)


async def store_result(task_id: str, result: dict) -> None:
    """Store the final sync result so the SSE endpoint can replay it."""
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    await redis.set(key, json.dumps(result), ex=_RESULT_TTL)


async def get_stored_result(task_id: str) -> dict | None:
    """Check for a pre-existing result (task finished before SSE connected)."""
    redis = await get_redis()
    key = _RESULT_TPL.format(task_id)
    raw = await redis.get(key)
    if raw:
        return json.loads(raw)
    return None
