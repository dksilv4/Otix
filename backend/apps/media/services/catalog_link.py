"""Attach source-native ids and relink unmatched library rows after a seed."""

from __future__ import annotations

from django.contrib.contenttypes.models import ContentType

from apps.media.models import ExternalID, MediaItem
from apps.media.services.identity import attach_external_id


def link_pending_library_rows(media_id: int) -> None:
    """Point unmatched Plex/Steam rows at *media_id* using attached ExternalIDs."""
    ct = ContentType.objects.get_for_model(MediaItem)
    rows = list(
        ExternalID.objects.filter(content_type=ct, object_id=media_id).values(
            "provider", "external_id", "media_type"
        )
    )
    if not rows:
        return
    by_provider: dict[str, list[str]] = {}
    for row in rows:
        by_provider.setdefault(row["provider"], []).append(str(row["external_id"]))

    steam_ids = by_provider.get("steam") or []
    if steam_ids:
        from apps.integrations.models import UserSteamGame

        ints: list[int] = []
        for value in steam_ids:
            try:
                ints.append(int(value))
            except (TypeError, ValueError):
                continue
        if ints:
            UserSteamGame.objects.filter(steam_app_id__in=ints, media_item_id__isnull=True).update(
                media_item_id=media_id
            )

    try:
        from apps.integrations.models import UserPlexItem
    except Exception:  # noqa: BLE001
        return
    plex_guids = set(by_provider.get("plex") or [])
    tmdb_ids = set(by_provider.get("tmdb") or [])
    imdb_ids = set(by_provider.get("imdb") or [])
    pending = UserPlexItem.objects.filter(media_item_id__isnull=True)
    for item in pending.iterator():
        guids = item.guids if isinstance(item.guids, dict) else {}
        if (
            (item.guid and item.guid in plex_guids)
            or (guids.get("tmdb") in tmdb_ids)
            or (guids.get("imdb") in imdb_ids)
        ):
            item.media_item_id = media_id
            item.save(update_fields=("media_item_id", "updated_at"))
            if item.guid:
                attach_external_id(media_id, "plex", item.guid, None)


def attach_igdb_store_ids(media_id: int, raw: dict) -> None:
    """Fold IGDB ``external_games`` storefront ids onto the hub."""
    sources = {
        1: "steam",
        5: "gog",
        26: "epic",
    }
    seen: set[str] = set()
    for entry in raw.get("external_games") or []:
        if not isinstance(entry, dict):
            continue
        provider = sources.get(entry.get("external_game_source"))
        uid = str(entry.get("uid") or "").strip()
        if not provider or not uid or provider in seen:
            continue
        seen.add(provider)
        attach_external_id(media_id, provider, uid, "game")
