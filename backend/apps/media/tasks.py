"""Celery tasks for the media app: periodic artwork auto-mirroring.

``mirror_discover_artwork`` sweeps catalog items that carry remote primary
artwork but no local copy yet. Beat fires it every minute and the task
self-throttles to the admin-configured ``mirror_sweep_interval_minutes``;
``mirror_local_game_artwork_task`` mirrors a claimed/owned local game's artwork
off the web request (bulk library syncs can carry many games). Discovered
automatically by ``config.celery``'s ``app.autodiscover_tasks()``.
"""

from __future__ import annotations

from celery import shared_task

from apps.media.services import assets as assets_service


@shared_task(name="media.mirror_discover_artwork")
def mirror_discover_artwork() -> dict:
    """Mirror artwork for the highest-profile unmirrored catalog items."""
    if not assets_service.should_run_sweep():
        return {"scanned": 0, "mirrored": 0, "bytes": 0, "skipped": True}
    result = assets_service.sweep_unmirrored_media(limit=assets_service.sweep_limit())
    assets_service.record_sweep_run()
    return result


@shared_task(name="media.mirror_local_game_artwork")
def mirror_local_game_artwork_task(media_item_id: int) -> bool:
    """Mirror artwork for a claimed/owned local game (own toggle, game rows only)."""
    return assets_service.mirror_local_game_artwork(media_item_id)
