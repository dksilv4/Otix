"""Celery tasks for studio release notifications.

``social.release_notify`` is enqueued by the TMDB sync engine the moment a
not-previously-mapped title is seeded; ``social.notify_release_transitions``
runs daily on beat to catch announced titles whose release date has arrived. Both
delegate the fan-out to ``apps.social.services.release_notify``. Web-push delivery
is handled by the ``Notification`` post_save signal (same path as SSE).
"""

from __future__ import annotations

from celery import shared_task

from apps.media.models import MediaItem
from apps.social.services import release_notify


@shared_task(name="social.release_notify")
def release_notify_task(media_item_id: int) -> int:
    """Notify followers of a freshly-seeded title's studios; returns rows created."""
    media = MediaItem.objects.filter(pk=media_item_id).first()
    if media is None or not release_notify.is_recent_release(media):
        return 0
    created = release_notify.notify_company_followers(
        media_item_id, kind=release_notify.kind_for(media)
    )
    return len(created)


@shared_task(name="social.notify_release_transitions")
def notify_release_transitions_task() -> int:
    """Send ``available`` notifications for titles released since the last sweep."""
    created_count = 0
    for media in release_notify.transitioning_titles():
        created = release_notify.notify_company_followers(media.pk, kind="available")
        created_count += len(created)
    return created_count
