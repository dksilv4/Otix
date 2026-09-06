"""Redis progress publisher — write half of the SSE sync streams.

Sync counterpart of ``core.sse`` (the read half): a task that runs a provider
sync engine publishes progress frames and stores a final result, while the SSE
route streams them. Each namespace uses three Redis key patterns (mirroring the
legacy ``otix.lib.redis_progress``)::

    {namespace}:{task_id}:events      — pub/sub channel
    {namespace}:{task_id}:result      — stored final result (TTL)
    {namespace}:{task_id}:progress    — stored latest progress (TTL)

Writes fail open: a hiccup publishing progress must never abort the sync engine
that produced it, so Redis errors are logged and swallowed. Tests patch
``core.progress.get_client`` with a fake (same seam ``core.sse`` exposes).
"""

from __future__ import annotations

import json
import logging
from typing import Any

from django.conf import settings

from core.redis import get_client

logger = logging.getLogger(__name__)


class RedisProgress:
    """Publish, store, and replay progress events for a task namespace.

    ``namespace`` is the full ``{provider}:sync`` prefix the SSE route reads, so
    ``RedisProgress("plex:sync")`` writes the same keys the ``PlexSyncStreamView``
    subscribes to.
    """

    def __init__(self, namespace: str) -> None:
        default_ttl = getattr(settings, "REDIS_PROGRESS_TTL", 86400)
        self._ttl = default_ttl
        self._channel_tpl = f"{namespace}:{{}}:events"
        self._result_tpl = f"{namespace}:{{}}:result"
        self._progress_tpl = f"{namespace}:{{}}:progress"

    @property
    def namespace(self) -> str:
        return self._channel_tpl.split(":")[0]

    def channel_name(self, task_id: str) -> str:
        """Return the pub/sub channel for *task_id*."""
        return self._channel_tpl.format(task_id)

    # -- publish -----------------------------------------------------------

    def publish(self, task_id: str, event_type: str, **data: Any) -> None:
        """Publish a progress event to the task's Redis pub/sub channel."""
        channel = self.channel_name(task_id)
        payload = json.dumps(
            {"type": event_type, **data}, default=str, separators=(",", ":")
        )
        try:
            get_client().publish(channel, payload)
        except Exception:  # noqa: BLE001 - a progress write must never break the sync
            logger.exception("RedisProgress publish failed on %s", channel)

    # -- progress (intermediate state, for progress_replay) ----------------

    def store_progress(self, task_id: str, event_type: str, **data: Any) -> None:
        """Store the latest intermediate progress for late-joining replay."""
        key = self._progress_tpl.format(task_id)
        payload = json.dumps(
            {"type": event_type, **data}, default=str, separators=(",", ":")
        )
        try:
            get_client().set(key, payload, ex=self._ttl)
        except Exception:  # noqa: BLE001
            logger.exception("RedisProgress store_progress failed on %s", key)

    def get_latest_progress(self, task_id: str) -> dict[str, Any] | None:
        """Retrieve the latest stored intermediate progress (``None`` on miss)."""
        key = self._progress_tpl.format(task_id)
        try:
            raw = get_client().get(key)
        except Exception:  # noqa: BLE001
            logger.exception("RedisProgress get_latest_progress failed on %s", key)
            return None
        if not raw:
            return None
        return json.loads(raw)

    # -- result (final state, for result_replay) ---------------------------

    def store_result(self, task_id: str, result: dict[str, Any]) -> None:
        """Store the final result so late-connecting SSE clients can replay it.

        Mirrors legacy: the raw result dict is stored *without* a ``type`` key;
        the read half (``core.sse.normalize_stored_result``) synthesizes the
        terminal ``type`` on replay.
        """
        key = self._result_tpl.format(task_id)
        try:
            get_client().set(
                key, json.dumps(result, default=str, separators=(",", ":")), ex=self._ttl
            )
        except Exception:  # noqa: BLE001
            logger.exception("RedisProgress store_result failed on %s", key)

    def get_stored_result(self, task_id: str) -> dict[str, Any] | None:
        """Check for a pre-existing final result (``None`` on miss)."""
        key = self._result_tpl.format(task_id)
        try:
            raw = get_client().get(key)
        except Exception:  # noqa: BLE001
            logger.exception("RedisProgress get_stored_result failed on %s", key)
            return None
        if not raw:
            return None
        return json.loads(raw)


# Pre-built instances mirroring the legacy module-level singletons. Provider
# sync engines address their own namespace; add further prefabs as engines land.
plex_progress = RedisProgress("plex:sync")
youtube_progress = RedisProgress("youtube:sync")
tmdb_progress = RedisProgress("tmdb:sync")
musicbrainz_progress = RedisProgress("musicbrainz:sync")
igdb_progress = RedisProgress("igdb:sync")
