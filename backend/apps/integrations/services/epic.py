"""Epic library scan: proxy through Otix Server and match catalog ExternalIDs."""

from __future__ import annotations

import logging

from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import UserEpicGame
from apps.library.services.game_server import (
    NO_EPIC_NODE,
    pick_online_game_server,
    proxy_epic_scan,
)
from apps.media.models import ExternalID, MediaItem
from apps.media.services.game_matcher import _comparison_key

logger = logging.getLogger(__name__)

_SCAN_FAILED = "Failed to scan Epic library. Please try again."


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _epic_external_id_map(ids: list[str]) -> dict[str, int]:
    rows = ExternalID.objects.filter(
        content_type=_media_content_type(),
        provider="epic",
        external_id__in=[i for i in ids if i],
    ).values_list("external_id", "object_id")
    return {ext: media_id for ext, media_id in rows}


def scan_epic_library(user, server=None) -> dict:
    """Fetch the user's Epic library from their Otix Server and upsert rows.

    Returns ``{total_in_epic, matched_in_otix, failed}``. Matching uses
    ``ExternalID`` ``provider="epic"`` on catalog_item_id, then offer_id, then
    app_name. Does not call IGDB.
    """
    if server is None:
        server = pick_online_game_server(user)
    if server is None:
        raise ValueError(NO_EPIC_NODE)

    status, data = proxy_epic_scan(server)
    if status != 200:
        if status == 400:
            detail = _SCAN_FAILED
            if isinstance(data, dict) and data.get("detail"):
                detail = data["detail"]
            raise ValueError(detail)
        raise RuntimeError(_SCAN_FAILED)

    games = (data.get("games") or []) if isinstance(data, dict) else []
    ids: list[str] = []
    for game in games:
        ids.extend(
            [
                game.get("catalog_item_id"),
                game.get("offer_id"),
                game.get("app_name"),
            ]
        )
    id_map = _epic_external_id_map(ids)
    catalog_games = {
        _comparison_key(m.title): m.id
        for m in MediaItem.objects.filter(media_type="game").only("id", "title")
    }

    app_names = [game.get("app_name") for game in games if game.get("app_name")]
    existing = {
        row.app_name: row for row in UserEpicGame.objects.filter(user=user, app_name__in=app_names)
    }

    matched = 0
    new_rows = []
    for game in games:
        app_name = game.get("app_name")
        if not app_name:
            continue
        media_id = (
            id_map.get(game.get("catalog_item_id"))
            or id_map.get(game.get("offer_id"))
            or id_map.get(app_name)
        )
        if media_id is None and game.get("title"):
            media_id = catalog_games.get(_comparison_key(game["title"]))
            if media_id is not None:
                content_type = _media_content_type()
                for ext in [game.get("catalog_item_id"), game.get("offer_id"), app_name]:
                    if ext:
                        ExternalID.objects.get_or_create(
                            content_type=content_type,
                            provider="epic",
                            external_id=str(ext),
                            media_type="game",
                            defaults={"object_id": media_id},
                        )

        if media_id is not None:
            matched += 1
        defaults = {
            "media_item_id": media_id,
            "namespace": game.get("namespace"),
            "catalog_item_id": game.get("catalog_item_id"),
            "offer_id": game.get("offer_id"),
            "title": game.get("title") or app_name,
        }
        row = existing.get(app_name)
        if row is None:
            new_rows.append(UserEpicGame(user=user, app_name=app_name, **defaults))
            continue
        if any(getattr(row, field) != value for field, value in defaults.items()):
            for field, value in defaults.items():
                setattr(row, field, value)
            row.save(update_fields=tuple(defaults) + ("updated_at",))

    if new_rows:
        UserEpicGame.objects.bulk_create(new_rows)

    logger.info("epic library scanned user=%s total=%s matched=%s", user.id, len(games), matched)
    return {
        "total_in_epic": len(games),
        "matched_in_otix": matched,
        "failed": len(games) - matched,
    }
