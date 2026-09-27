"""Signals for the social app (notification realtime + web-push fan-out)."""

import logging

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.push.services.sender import send_notification
from apps.social.models import Notification
from apps.social.services.realtime import publish_notification

logger = logging.getLogger(__name__)


@receiver(post_save, sender=Notification)
def publish_notification_on_create(
    sender, instance: Notification, created: bool, **kwargs
) -> None:
    """Fan out new rows to SSE and web-push after the DB commit."""
    if not created:
        return
    # Capture the instance now; on_commit runs after the row is durable so SSE
    # clients that refetch the list on the event will see it.
    notification = instance

    def _fanout() -> None:
        publish_notification(notification)
        try:
            send_notification(notification)
        except Exception:  # noqa: BLE001 — push must never break the write path
            logger.exception(
                "web-push fan-out failed for notification %s", notification.pk
            )

    transaction.on_commit(_fanout)
