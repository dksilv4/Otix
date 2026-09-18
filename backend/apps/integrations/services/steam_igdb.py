"""Resolve unmatched Steam library games through the IGDB ``GameMatcher``.

Ports ``old-backend/otix/services/steam_igdb_resolver.py``: finds the user's
``UserSteamGame`` rows still missing a catalog ``media_item`` and runs them
through the 4-phase matcher (whose IGDB stages auto-seed new titles), then
relinks any bare media stubs to their canonical entry. Returns the legacy
``{resolved, synced, failed, total}`` counters the resolve-unmatched route
returns (``repaired`` is internal).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from django.contrib.contenttypes.models import ContentType
from django.db.models import Q

from apps.integrations.models import UserSteamGame
from apps.media.models import ExternalID, MediaItem
from apps.media.services.game_matcher import (
    ExternalIDRef,
    GameMatcher,
    MatchRequest,
)

logger = logging.getLogger(__name__)


@dataclass
class ResolverResult:
    resolved: int = 0
    synced: int = 0
    failed: int = 0
    total: int = 0
    repaired: int = 0


def _ensure_steam_external(media_item_id: int, steam_app_id: int) -> None:
    """Record the steam app id → catalog item mapping for future phase-1 hits."""
    content_type = ContentType.objects.get_for_model(MediaItem)
    row, created = ExternalID.objects.get_or_create(
        content_type=content_type,
        provider="steam",
        external_id=str(steam_app_id),
        media_type="game",
        defaults={"object_id": media_item_id},
    )
    if not created and row.object_id != media_item_id:
        row.object_id = media_item_id
        row.save(update_fields=("object_id", "updated_at"))


def repair_bare_steam_links(user) -> int:
    """Relink Steam library entries that point at bare media items.

    A "bare" item has no ``Game`` row and/or no overview — stubs from older
    seeding paths. When the matcher resolves a canonical (richer) item for the
    same steam app id, relink the user's row to it instead. Returns the count
    of links repaired.
    """
    stale = list(
        UserSteamGame.objects.filter(user=user, media_item__isnull=False).filter(
            Q(media_item__overview__isnull=True) | Q(media_item__game__isnull=True)
        )
    )
    if not stale:
        return 0

    matcher = GameMatcher()
    requests = [
        MatchRequest(
            title=game.name,
            external_ids=[ExternalIDRef(source="steam", id=str(game.steam_app_id))],
        )
        for game in stale
    ]
    matches = matcher.match_batch(requests)

    repaired = 0
    for game, match in zip(stale, matches, strict=False):
        auto = match.auto_match
        if auto is None or not auto.media_item_id:
            continue
        if auto.media_item_id == game.media_item_id:
            continue
        game.media_item_id = auto.media_item_id
        game.save(update_fields=("media_item_id", "updated_at"))
        _ensure_steam_external(auto.media_item_id, game.steam_app_id)
        repaired += 1
    logger.info(
        "steam bare-link repair user=%s scanned=%s repaired=%s",
        user.id,
        len(stale),
        repaired,
    )
    return repaired


def resolve_unmatched_steam_games(user) -> ResolverResult:
    """Resolve the user's unmatched Steam games via the GameMatcher pipeline."""
    try:
        repaired = repair_bare_steam_links(user)
    except Exception:
        logger.exception("steam bare-link repair failed user=%s", user.id)
        repaired = 0

    unmatched = list(UserSteamGame.objects.filter(user=user, media_item__isnull=True))
    if not unmatched:
        return ResolverResult(total=0)

    result = ResolverResult(total=len(unmatched))
    matcher = GameMatcher()

    # Snapshot catalog ids before matching so newly-seeded entries ("synced")
    # can be told apart from pre-existing matches ("resolved").
    existing_ids = set(MediaItem.objects.values_list("id", flat=True))
    requests = [
        MatchRequest(
            title=game.name,
            external_ids=[ExternalIDRef(source="steam", id=str(game.steam_app_id))],
        )
        for game in unmatched
    ]
    matches = matcher.match_batch(requests)

    for game, match in zip(unmatched, matches, strict=False):
        auto = match.auto_match
        if auto is not None and auto.media_item_id:
            game.media_item_id = auto.media_item_id
            game.save(update_fields=("media_item_id", "updated_at"))
            _ensure_steam_external(auto.media_item_id, game.steam_app_id)
            if auto.media_item_id in existing_ids:
                result.resolved += 1
            else:
                result.synced += 1
        elif auto is not None and auto.provider_id:
            from apps.integrations.services.catalog_seed import ensure_catalog_job

            ensure_catalog_job(
                auto.provider or "igdb",
                "game",
                str(auto.provider_id),
                priority=1,
                dispatch=False,
            )
            result.synced += 1
        else:
            result.failed += 1

    result.repaired = repaired
    logger.info(
        "steam-igdb resolver user=%s resolved=%s synced=%s failed=%s total=%s repaired=%s",
        user.id,
        result.resolved,
        result.synced,
        result.failed,
        result.total,
        result.repaired,
    )
    return result
