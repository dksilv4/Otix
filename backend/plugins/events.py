"""Plugin lifecycle events the host publishes to Redis pub/sub.

As the host reconciles its live registry with the DB it emits one event per
plugin transition onto a channel the API/browser can subscribe to for live
status — ``plugin.loaded`` / ``plugin.unloaded`` / ``plugin.error``. Publishing
is best-effort and fail-open: if ``PLUGIN_EVENTS_URL`` is empty or Redis is
down the host simply logs a warning and continues, because the DB rows remain
the source of truth and any subscriber can re-sync from them.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from django.conf import settings

logger = logging.getLogger(__name__)


def publish_lifecycle(
    action: str,
    plugin_id: str,
    *,
    version: str | None = None,
    error: str | None = None,
    client=None,
) -> None:
    """Publish ``plugin.<action>`` for ``plugin_id``; no-op unless configured.

    ``client`` is an injection seam for tests; production uses a ``redis``
    client built from ``settings.PLUGIN_EVENTS_URL`` on first call.
    """
    url = (getattr(settings, "PLUGIN_EVENTS_URL", "") or "").strip()
    if not url:
        return
    payload = {
        "type": f"plugin.{action}",
        "id": plugin_id,
        "version": version,
        "error": error,
        "at": datetime.now(UTC).isoformat(),
    }
    try:
        if client is None:
            from redis import Redis  # local import: only pay the dep when enabled

            client = Redis.from_url(url)
        channel = getattr(settings, "PLUGIN_EVENTS_CHANNEL", "otix.plugins.lifecycle")
        client.publish(channel, json.dumps(payload))
    except Exception as exc:  # noqa: BLE001 - events must never break the host
        logger.warning("plugin lifecycle publish to %s failed: %s", url, exc)
