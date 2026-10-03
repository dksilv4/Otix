"""GOG library scan: proxy through Otix Server and match catalog ExternalIDs."""

from __future__ import annotations

import logging

from django.conf import settings
from django.contrib.contenttypes.models import ContentType

from apps.integrations.models import UserGOGGame
from apps.integrations.services import gog_client
from apps.library.services.game_server import (
    NO_GOG_NODE,
    pick_online_game_server,
    proxy_gog_scan,
)
from apps.media.models import ExternalID, MediaItem
from apps.media.services.game_matcher import _comparison_key

logger = logging.getLogger(__name__)

_SCAN_FAILED = "Failed to scan GOG library. Please try again."


def _media_content_type() -> ContentType:
    return ContentType.objects.get_for_model(MediaItem)


def _gog_external_id_map(ids: list[str]) -> dict[str, int]:
    rows = ExternalID.objects.filter(
        content_type=_media_content_type(),
        provider="gog",
        external_id__in=[i for i in ids if i],
    ).values_list("external_id", "object_id")
    return {ext: media_id for ext, media_id in rows}


def scan_gog_library(user, server=None, auto_resolve: bool = False) -> dict:
    """Fetch the user's GOG library from their Otix Server or direct cloud scan.

    Returns ``{total_in_gog, matched_in_otix, failed, source}``.
    """
    if server is None:
        server = pick_online_game_server(user)

    games: list[dict] = []
    scanned = False
    source = "cloud"

    if server is not None:
        status, data = proxy_gog_scan(server)
        if status == 200 and isinstance(data, dict):
            games = data.get("games") or []
            scanned = True
            source = "node"
        elif not getattr(user, "gog_refresh_token", None):
            if status == 400:
                detail = _SCAN_FAILED
                if isinstance(data, dict) and data.get("detail"):
                    detail = data["detail"]
                raise ValueError(detail)
            raise RuntimeError(_SCAN_FAILED)

    if not scanned and getattr(user, "gog_refresh_token", None):
        try:
            games = gog_client.scan_gog_cloud_library(user)
            scanned = True
            source = "cloud"
        except gog_client.GOGAuthError as exc:
            raise ValueError(str(exc)) from exc
        except gog_client.GOGScanError as exc:
            raise RuntimeError(str(exc)) from exc

    if not scanned:
        if server is None and not getattr(user, "gog_refresh_token", None):
            raise ValueError(NO_GOG_NODE)
        raise RuntimeError(_SCAN_FAILED)

    game_ids = [str(g.get("game_id")) for g in games if g.get("game_id")]
    id_map = _gog_external_id_map(game_ids)

    catalog_games = {
        _comparison_key(m.title): m.id
        for m in MediaItem.objects.filter(media_type="game").only("id", "title")
    }

    existing = {
        row.game_id: row for row in UserGOGGame.objects.filter(user=user, game_id__in=game_ids)
    }

    matched = 0
    new_rows = []
    for game in games:
        game_id = str(game.get("game_id") or "")
        if not game_id:
            continue
        title = game.get("title") or game_id
        media_id = id_map.get(game_id)

        if media_id is None and title:
            media_id = catalog_games.get(_comparison_key(title))
            if media_id is not None:
                content_type = _media_content_type()
                ExternalID.objects.get_or_create(
                    content_type=content_type,
                    provider="gog",
                    external_id=game_id,
                    media_type="game",
                    defaults={"object_id": media_id},
                )

        if media_id is not None:
            matched += 1

        defaults = {
            "media_item_id": media_id,
            "title": title,
            "slug": game.get("slug"),
            "image": game.get("image"),
        }
        row = existing.get(game_id)
        if row is None:
            new_rows.append(UserGOGGame(user=user, game_id=game_id, **defaults))
            continue
        if any(getattr(row, field) != value for field, value in defaults.items()):
            for field, value in defaults.items():
                setattr(row, field, value)
            row.save(update_fields=tuple(defaults) + ("updated_at",))

    if new_rows:
        UserGOGGame.objects.bulk_create(new_rows)

    failed = len(games) - matched
    if auto_resolve and failed > 0:
        api_key = getattr(settings, "STEAMGRID_API_KEY", "")
        if api_key:
            try:
                from apps.integrations.services.gog_steamgrid import (
                    resolve_unmatched_gog_with_steamgrid,
                )

                sg_res = resolve_unmatched_gog_with_steamgrid(user, delay=0.05)
                matched += sg_res.get("matched", 0)
                failed = max(0, len(games) - matched)
            except Exception:
                logger.exception("Failed to auto-resolve GOG games with SteamGridDB")

    logger.info("gog library scanned user=%s total=%s matched=%s", user.id, len(games), matched)
    return {
        "total_in_gog": len(games),
        "matched_in_otix": matched,
        "failed": failed,
        "source": source,
    }
