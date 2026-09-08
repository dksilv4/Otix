"""Celery tasks for the media app: periodic artwork auto-mirroring.

``mirror_discover_artwork`` sweeps catalog items that carry remote primary
artwork but no local copy yet (bounded by ``MIRROR_SWEEP_LIMIT``); beat
schedules it every 10 minutes. Discovered automatically by ``config.celery``'s
``app.autodiscover_tasks()``.
"""

from __future__ import annotations

from celery import shared_task
from django.conf import settings

from apps.media.services import assets as assets_service


@shared_task(name="media.mirror_discover_artwork")
def mirror_discover_artwork() -> dict:
    """Mirror artwork for the highest-profile unmirrored catalog items."""
    return assets_service.sweep_unmirrored_media(limit=settings.MIRROR_SWEEP_LIMIT)
