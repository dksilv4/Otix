"""Import / match / rehydrate / local-game-sync routes.

Most of these are deferred-platform: legacy handlers block on a Celery worker or
the SteamGridDB/embedding platform that does not exist in the Django backend
yet (see ARCHITECTURE §7). They are NOT silently dropped — each returns the
closest legacy success shape so callers get a decodable response, and the
``/import*`` + ``/sync-local-games`` routes are implemented for the parts that
only touch the local database.
"""

from __future__ import annotations

import logging

from django.contrib.auth.models import AbstractBaseUser
from django.contrib.contenttypes.models import ContentType
from django.utils import timezone

from apps.library.models import UserLocalGame
from apps.media.models import ExternalID, MediaItem
from apps.media.services.interaction import set_interaction

logger = logging.getLogger(__name__)


def _enqueue_local_game_mirror(media_item_id: int) -> None:
    """Best-effort offload of a local game's artwork mirror to the worker.

    The task is imported lazily: ``apps.media.tasks`` -> ``assets`` ->
    ``apps.media.services`` eagerly pulls in this module, so a module-level task
    import here would circle back to the partially-initialized ``tasks`` when
    Celery autodiscovers it first.
    """
    try:
        from apps.media.tasks import mirror_local_game_artwork_task

        mirror_local_game_artwork_task.delay(media_item_id)
    except Exception:  # noqa: BLE001 - an enqueue failure never breaks a sync
        logger.exception("could not enqueue local-game mirror for %s", media_item_id)


def resolve_imported_item(
    provider: str, provider_id: str, media_type: str | None = None
) -> MediaItem | None:
    """Resolve an already-imported item by ExternalID (mirrors legacy pre-task lookup)."""
    content_type = ContentType.objects.get_for_model(MediaItem)
    qs = ExternalID.objects.filter(
        content_type=content_type, provider=provider, external_id=provider_id
    )
    if provider == "tmdb" and media_type:
        qs = qs.filter(media_type=media_type)
    row = qs.first()
    if row is None:
        return None
    return MediaItem.objects.filter(pk=row.object_id).first()


def import_response(provider: str, provider_id: str, item: MediaItem) -> dict:
    return {
        "media_id": item.id,
        "title": item.title,
        "slug": item.slug,
        "provider": provider,
        "provider_id": provider_id,
    }


# ── Game matching (deferred platform) ────────────────────────────────────


def empty_game_match(query_id: str, query_title: str | None = None) -> dict:
    return {
        "query_id": query_id,
        "query_title": query_title or "",
        "candidates": [],
        "auto_match": None,
    }


# ── Sync local games ─────────────────────────────────────────────────────


def sync_local_games(user: AbstractBaseUser, games: list[dict]) -> dict:
    """Upsert the user's local game rows and delete ones no longer installed.

    Mirror of the legacy ``/sync-local-games`` handler: rows key on
    (user, title, platform); every game with an ``otix_media_id`` also records
    the private ``owned`` interaction.
    """
    user_local_games = UserLocalGame.objects.filter(user=user)
    existing_by_key = {
        _local_key(g.title, g.platform): g for g in user_local_games
    }
    incoming_keys: set[str] = set()
    upserted = 0
    for game in games:
        title = (game.get("title") or "").strip()
        platform = game.get("platform") or ""
        if not title:
            continue
        key = _local_key(title, platform)
        incoming_keys.add(key)
        otix_media_id = game.get("otix_media_id")
        match_suggestion_id = game.get("match_suggestion_media_id")
        existing = existing_by_key.get(key)
        if existing is None:
            UserLocalGame.objects.create(
                user=user,
                title=title,
                platform=platform,
                media_item_id=otix_media_id,
                match_suggestion_media_id=match_suggestion_id,
                last_seen_at=timezone.now(),
            )
            upserted += 1
        else:
            changed = False
            if (existing.media_item_id or None) != (otix_media_id or None):
                existing.media_item_id = otix_media_id
                changed = True
            if (existing.match_suggestion_media_id or None) != (match_suggestion_id or None):
                existing.match_suggestion_media_id = match_suggestion_id
                changed = True
            if changed:
                existing.save()
        if otix_media_id:
            set_interaction(user, int(otix_media_id), "owned")
            _enqueue_local_game_mirror(int(otix_media_id))
    deleted = 0
    for key, existing in list(existing_by_key.items()):
        if key not in incoming_keys:
            existing.delete()
            deleted += 1
    return {"upserted": upserted, "deleted": deleted}


def _local_key(title: str, platform: str) -> str:
    return f"{title.strip().lower()}|{platform.strip().lower()}"
