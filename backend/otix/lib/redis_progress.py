"""Consolidated Redis progress publisher for SSE task streams.

Replaces the four duplicate modules:
    ``otix.lib.plex_progress``
    ``otix.lib.spotify_progress``
    ``otix.lib.youtube_progress``
    ``otix.lib.media_rehydrate_progress``

Usage
-----
::

    from otix.lib.redis_progress import RedisProgress, plex_progress

    # Use a pre-built instance:
    await plex_progress.publish("task-123", "progress", current=5, total=100)
    stored = await plex_progress.get_stored_result("task-123")

    # Or create one with a custom namespace:
    friend_activity = RedisProgress("friend:activity")
"""

from __future__ import annotations

import json
from typing import Any

from otix.infrastructure.redis import get_redis

_DEFAULT_TTL = 300  # 5 minutes


class RedisProgress:
    """Publish, store, and replay progress events for a task namespace.

    Each namespace uses three Redis key patterns::

        {namespace}:{task_id}:events      — pub/sub channel
        {namespace}:{task_id}:result      — stored final result (TTL)
        {namespace}:{task_id}:progress    — stored latest progress (TTL)
    """

    def __init__(self, namespace: str, *, ttl: int = _DEFAULT_TTL) -> None:
        self._channel_tpl = f"{namespace}:{{}}:events"
        self._result_tpl = f"{namespace}:{{}}:result"
        self._progress_tpl = f"{namespace}:{{}}:progress"
        self._ttl = ttl

    @property
    def namespace(self) -> str:
        return self._channel_tpl.split(":")[0]

    # -- publish -----------------------------------------------------------

    async def publish(self, task_id: str, event_type: str, **data: Any) -> None:
        """Publish a progress event to the task's Redis pub/sub channel."""
        redis = await get_redis()
        channel = self._channel_tpl.format(task_id)
        payload = json.dumps({"type": event_type, **data})
        await redis.publish(channel, payload)

    # -- progress (intermediate state, for progress_replay) ----------------

    async def store_progress(self, task_id: str, event_type: str, **data: Any) -> None:
        """Store the latest intermediate progress for replay."""
        redis = await get_redis()
        payload = json.dumps({"type": event_type, **data})
        await redis.set(self._progress_tpl.format(task_id), payload, ex=self._ttl)

    async def get_latest_progress(self, task_id: str) -> dict[str, Any] | None:
        """Retrieve the latest stored intermediate progress."""
        redis = await get_redis()
        raw = await redis.get(self._progress_tpl.format(task_id))
        if raw:
            return json.loads(raw)
        return None

    # -- result (final state, for result_replay) ----------------------------

    async def store_result(self, task_id: str, result: dict[str, Any]) -> None:
        """Store the final result so late-connecting SSE clients can replay it."""
        redis = await get_redis()
        await redis.set(self._result_tpl.format(task_id), json.dumps(result), ex=self._ttl)

    async def get_stored_result(self, task_id: str) -> dict[str, Any] | None:
        """Check for a pre-existing final result."""
        redis = await get_redis()
        raw = await redis.get(self._result_tpl.format(task_id))
        if raw:
            return json.loads(raw)
        return None

    # -- helper ------------------------------------------------------------

    def channel_name(self, task_id: str) -> str:
        """Return the pub/sub channel for *task_id*."""
        return self._channel_tpl.format(task_id)


# ---------------------------------------------------------------------------
# Pre-built instances matching the old module-level import paths.
# Consumers can migrate one at a time::
#
#   from otix.lib.plex_progress import publish_progress   # old
#   from otix.lib.redis_progress import plex_progress      # new
#   await plex_progress.publish(  ...  )
# ---------------------------------------------------------------------------

plex_progress = RedisProgress("plex:sync")
spotify_progress = RedisProgress("spotify:sync")
youtube_progress = RedisProgress("youtube:sync")
media_rehydrate_progress = RedisProgress("media:rehydrate")
