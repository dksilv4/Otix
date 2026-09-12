"""Thin delegation wrapper — delegates to ``otix.lib.redis_progress.media_rehydrate_progress``.

All four progress modules now funnel through the single
:class:`otix.lib.redis_progress.RedisProgress` class.  These stubs remain
for backward compatibility during migration.
"""

from __future__ import annotations

from typing import Any

from otix.lib.redis_progress import media_rehydrate_progress


async def publish_progress(task_id: str, event_type: str, **data: Any) -> None:
    await media_rehydrate_progress.publish(task_id, event_type, **data)


async def store_progress(task_id: str, event_type: str, **data: Any) -> None:
    await media_rehydrate_progress.store_progress(task_id, event_type, **data)


async def get_latest_progress(task_id: str) -> dict[str, Any] | None:
    return await media_rehydrate_progress.get_latest_progress(task_id)


async def store_result(task_id: str, result: dict[str, Any]) -> None:
    await media_rehydrate_progress.store_result(task_id, result)


async def get_stored_result(task_id: str) -> dict[str, Any] | None:
    return await media_rehydrate_progress.get_stored_result(task_id)


def channel_name(task_id: str) -> str:
    """Return the pub/sub channel for a given task ID."""
    return media_rehydrate_progress.channel_name(task_id)
