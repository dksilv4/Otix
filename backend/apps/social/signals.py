"""Signals for the social app (notification realtime fan-out)."""

from django.db import transaction
from django.db.models.signals import post_save
from django.dispatch import receiver

from apps.social.models import Notification
from apps.social.services.realtime import publish_notification


@receiver(post_save, sender=Notification)
def publish_notification_on_create(
    sender, instance: Notification, created: bool, **kwargs
) -> None:
    """Push new rows onto ``user:{id}:notifications`` after the DB commit."""
    if not created:
        return
    # Capture the instance now; on_commit runs after the row is durable so SSE
    # clients that refetch the list on the event will see it.
    notification = instance
    transaction.on_commit(lambda: publish_notification(notification))
