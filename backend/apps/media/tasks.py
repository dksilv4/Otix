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


@shared_task(name="media.hydrate_game_characters_and_credits", ignore_result=True)
def hydrate_game_characters_and_credits_task(
    media_item_id: int, fandom_community: str | None = None
) -> dict:
    """Automated background hydration of video game cast, crew, and enriched characters."""
    import logging

    from asgiref.sync import async_to_sync

    from apps.media.models import MediaItem
    from apps.media.services.character_enrichment import enrich_game_characters
    from apps.media.services.game_credits import hydrate_game_credits

    logger = logging.getLogger(__name__)
    media = MediaItem.objects.filter(pk=media_item_id, media_type="game").first()
    if not media:
        return {"status": "skipped", "reason": "not_found_or_not_game"}

    credits_hydrated = 0
    try:
        credits_hydrated = async_to_sync(hydrate_game_credits)(media)
    except Exception as e:
        logger.warning("Automated credits hydration error for %s: %s", media.title, e)

    chars_enriched = 0
    try:
        chars_enriched = enrich_game_characters(media, fandom_community=fandom_community)
    except Exception as e:
        logger.warning("Automated character enrichment error for %s: %s", media.title, e)

    logger.info(
        "Automated hydration completed for game '%s' (ID %s): %s credits, %s characters",
        media.title,
        media.pk,
        credits_hydrated,
        chars_enriched,
    )
    return {
        "status": "success",
        "media_id": media_item_id,
        "credits_hydrated": credits_hydrated,
        "characters_enriched": chars_enriched,
    }


@shared_task(name="media.sweep_unhydrated_games", ignore_result=True)
def sweep_unhydrated_games_task(limit: int = 10) -> dict:
    """Periodic sweep task that automatically hydrates games missing characters or credits."""
    from django.db.models import Count

    from apps.media.models import MediaItem

    unhydrated = (
        MediaItem.objects.filter(media_type="game")
        .annotate(c_count=Count("characters"))
        .filter(c_count=0)
        .order_by("-popularity")[:limit]
    )

    enqueued = 0
    for media in unhydrated:
        hydrate_game_characters_and_credits_task.delay(media.pk)
        enqueued += 1

    return {"status": "success", "enqueued": enqueued}
