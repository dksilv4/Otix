"""Resolve unmatched Steam games via the central GameMatcher pipeline."""
from __future__ import annotations

from dataclasses import dataclass

import structlog
from sqlalchemy import exists, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, Game, MediaItem, UserSteamGame
from otix.infrastructure.redis import get_redis
from otix.services.external_id_service import ExternalIDService
from otix.schemas.media import ExternalIDRef
from otix.services.game_matcher import GameMatcher, GameMatchRequest

logger = structlog.get_logger()


@dataclass
class ResolverResult:
    resolved: int = 0
    synced: int = 0
    failed: int = 0
    total: int = 0
    repaired: int = 0


async def repair_bare_steam_links(db: AsyncSession, user_id: str) -> int:
    """Relink Steam library entries pointing at bare media items.

    A "bare" item has no Game row and/or no overview — e.g. stubs left by an
    older SteamGrid-only seeding path. When a canonical (richer) item exists
    for the same steam app id, the user's library was still showing the bare
    one. Reuses the GameMatcher pipeline: Phase 1 resolves the steam external
    id via the ExternalID table (DIRECT match) to the canonical item, which
    we then link instead. Returns the number of links repaired.
    """
    no_game_row = ~exists(select(Game.media_item_id).where(Game.media_item_id == MediaItem.id))
    bare_ids = select(MediaItem.id).where(or_(MediaItem.overview.is_(None), no_game_row))
    rows = await db.execute(
        select(UserSteamGame).where(
            UserSteamGame.user_id == user_id,
            UserSteamGame.media_item_id.isnot(None),
            UserSteamGame.media_item_id.in_(bare_ids),
        )
    )
    stale = list(rows.scalars().all())
    if not stale:
        return 0

    redis = await get_redis()
    matcher = GameMatcher(db, redis)
    requests = [
        GameMatchRequest(
            title=game.name,
            external_ids=[ExternalIDRef(source="steam", id=str(game.steam_app_id))],
        )
        for game in stale
    ]
    matches = await matcher.match_batch(requests)

    repaired = 0
    for game, match in zip(stale, matches):
        auto = match.auto_match
        if auto is None or not auto.media_item_id:
            continue
        if auto.media_item_id == game.media_item_id:
            continue
        game.media_item_id = auto.media_item_id
        repaired += 1

    if repaired:
        await db.flush()

    logger.info(
        "steam bare-link repair complete",
        user_id=user_id,
        scanned=len(stale),
        repaired=repaired,
    )
    return repaired


async def resolve_unmatched_steam_games(
    db: AsyncSession,
    user_id: str,
) -> ResolverResult:
    """Resolve unmatched Steam games via the central GameMatcher.

    Delegates to the 4-stage matching pipeline (ExternalID, IGDB cross-ref,
    IGDB title search, trigram). Auto-imports from IGDB when needed.
    Also repairs stale links that point at bare media items.
    """
    try:
        repaired = await repair_bare_steam_links(db, user_id)
    except Exception:
        await db.rollback()
        logger.exception("steam bare-link repair failed", user_id=user_id)
        repaired = 0

    unmatched = await db.execute(
        select(UserSteamGame).where(
            UserSteamGame.user_id == user_id,
            UserSteamGame.media_item_id.is_(None),
        )
    )
    unmatched_games = list(unmatched.scalars().all())
    if not unmatched_games:
        return ResolverResult(total=0)

    result = ResolverResult(total=len(unmatched_games))
    redis = await get_redis()
    matcher = GameMatcher(db, redis)
    eid_svc = ExternalIDService(db)

    # Snapshot existing catalog IDs before matching so we can tell newly
    # seeded entries ("synced") apart from pre-existing matches ("resolved").
    existing_ids = set((await db.execute(select(MediaItem.id))).scalars().all())

    # Build batch request
    requests = [
        GameMatchRequest(
            title=game.name,
            external_ids=[ExternalIDRef(source="steam", id=str(game.steam_app_id))],
        )
        for game in unmatched_games
    ]

    matches = await matcher.match_batch(requests)

    for game, match in zip(unmatched_games, matches):
        auto = match.auto_match
        if auto is not None and auto.media_item_id:
            game.media_item_id = auto.media_item_id
            # Ensure steam ExternalID is set for future Stage 1 hits
            await eid_svc.upsert("steam", str(game.steam_app_id), "media_item", auto.media_item_id)
            if auto.media_item_id not in existing_ids:
                result.synced += 1
            else:
                result.resolved += 1
        else:
            result.failed += 1

    await db.flush()
    await db.commit()

    result.repaired = repaired
    logger.info(
        "steam-igdb resolver complete via GameMatcher",
        user_id=user_id,
        resolved=result.resolved,
        synced=result.synced,
        failed=result.failed,
        total=result.total,
        repaired=repaired,
    )
    return result
