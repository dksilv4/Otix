"""Realtime fan-out for in-app notifications (Redis pub/sub → SSE).

Publishes to ``user:{id}:notifications``, the same channel
``NotificationStreamView`` / ``core.sse.sse_response`` subscribe to. Fail-open:
a Redis hiccup must never roll back notification creation.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from apps.social.models import Notification
from core.redis import get_client

logger = logging.getLogger(__name__)


def notification_channel(user_id: int) -> str:
    """Redis pub/sub channel for a user's notification SSE stream."""
    return f"user:{user_id}:notifications"


def notification_sse_payload(notification: Notification) -> dict[str, Any]:
    """Shape matching ``NotificationOutSerializer`` (snake_case for SSE clients)."""
    created = notification.created_at
    return {
        "id": notification.id,
        "type": notification.type,
        "title": notification.title,
        "body": notification.body,
        "metadata_json": notification.metadata_json or {},
        "is_read": notification.is_read,
        "created_at": created.isoformat() if created is not None else None,
    }


def publish_notification(notification: Notification) -> None:
    """Publish a created notification to the user's SSE channel (fail-open)."""
    channel = notification_channel(notification.user_id)
    payload = json.dumps(
        notification_sse_payload(notification),
        ensure_ascii=False,
        default=str,
        separators=(",", ":"),
    )
    try:
        get_client().publish(channel, payload)
    except Exception:  # noqa: BLE001 - realtime must never break the write path
        logger.exception("notification publish failed on %s", channel)
