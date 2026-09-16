"""Import / match / rehydrate / local-game-sync routes.

``/import*`` and ``/sync-local-games`` talk to the local database. Game matching
runs through ``GameMatcher``. Rehydrate still returns a placeholder because
there is no task worker in the Django backend.
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


def import_igdb_game(igdb_id: int) -> MediaItem | None:
    """Return the catalog row for an IGDB id, seeding it when missing."""
    item = resolve_imported_item("igdb", str(igdb_id))
    if item is not None:
        return item
    from apps.media.services.igdb import IGDBProvider, configured
    from apps.media.services.igdb_ingest import seed_game_from_igdb

    if not configured():
        return None
    try:
        raw = IGDBProvider().get_game(igdb_id)
    except Exception:  # noqa: BLE001 - import must fail cleanly for the client
        logger.exception("igdb import fetch failed igdb_id=%s", igdb_id)
        return None
    if not raw:
        return None
    media_id = seed_game_from_igdb(raw, igdb_id)
    return MediaItem.objects.filter(pk=media_id).first()


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


# ── Game matching ────────────────────────────────────────────────────────


def empty_game_match(query_id: str, query_title: str | None = None) -> dict:
    return {
        "query_id": query_id,
        "query_title": query_title or "",
        "candidates": [],
        "auto_match": None,
    }


def _serialize_match_candidate(candidate) -> dict | None:
    if candidate is None:
        return None
    media_id = candidate.media_item_id
    return {
        "media_item_id": str(media_id) if media_id is not None else None,
        "title": candidate.title,
        "poster_url": candidate.poster_url,
        "backdrop_url": candidate.backdrop_url,
        "release_year": candidate.release_year,
        "platforms": candidate.platforms,
        "confidence": candidate.confidence,
        "match_type": candidate.match_type,
        "needs_import": candidate.needs_import,
    }


def _serialize_match_result(request, outcome) -> dict:
    if outcome is None:
        return empty_game_match(request.query_id, request.title)
    return {
        "query_id": getattr(outcome, "query_id", None) or request.query_id,
        "query_title": getattr(outcome, "query_title", None) or request.title,
        "candidates": [
            row
            for row in (_serialize_match_candidate(c) for c in getattr(outcome, "candidates", []))
            if row is not None
        ],
        "auto_match": _serialize_match_candidate(getattr(outcome, "auto_match", None)),
    }


def _match_request_from_game(game: dict):
    from apps.media.services.game_matcher import ExternalIDRef, MatchRequest

    title = str(game.get("title") or game.get("query_title") or "").strip()
    platforms = game.get("platforms")
    if isinstance(platforms, str) and platforms.strip():
        platforms = [platforms.strip()]
    elif not isinstance(platforms, list):
        platform = game.get("platform")
        platforms = [platform] if isinstance(platform, str) and platform.strip() else None
    else:
        platforms = [str(item) for item in platforms if item] or None
    refs = []
    for raw in game.get("external_ids") or []:
        if isinstance(raw, dict) and raw.get("source") and raw.get("id"):
            refs.append(ExternalIDRef(source=str(raw["source"]), id=str(raw["id"])))
    developer = game.get("developer")
    return MatchRequest(
        title=title,
        query_id=str(game.get("query_id") or ""),
        developer=developer if isinstance(developer, str) else None,
        platforms=platforms,
        external_ids=refs or None,
    )


def match_games_payload(games: list[dict]) -> dict:
    """Run GameMatcher on scanned/local titles and return the batch envelope."""
    from apps.media.services.game_matcher import GameMatcher

    prepared: list[tuple[dict | None, object | None]] = []
    for game in games:
        if not isinstance(game, dict):
            prepared.append((None, None))
            continue
        request = _match_request_from_game(game)
        prepared.append((game, request if request.title else None))

    runnable = [request for _, request in prepared if request is not None]
    outcomes = []
    if runnable:
        try:
            outcomes = GameMatcher().match_batch(runnable)
        except Exception:  # noqa: BLE001 - callers still need a decodable row per input
            logger.exception("match_batch failed")
    queued = iter(outcomes)
    matches: list[dict] = []
    for game, request in prepared:
        if request is None:
            if game is None:
                matches.append(empty_game_match("", ""))
            else:
                matches.append(
                    empty_game_match(
                        str(game.get("query_id") or ""),
                        str(game.get("title") or game.get("query_title") or ""),
                    )
                )
            continue
        matches.append(_serialize_match_result(request, next(queued, None)))
    return {"matches": matches}


def match_game_payload(game: dict) -> dict:
    return match_games_payload([game])["matches"][0]


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
