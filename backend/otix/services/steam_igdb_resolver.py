"""Resolve unmatched Steam games via the central GameMatcher pipeline."""
from __future__ import annotations

from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, MediaItem, UserSteamGame
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


async def resolve_unmatched_steam_games(
    db: AsyncSession,
    user_id: str,
) -> ResolverResult:
    """Resolve unmatched Steam games via the central GameMatcher.

    Delegates to the 4-stage matching pipeline (ExternalID, IGDB cross-ref,
    IGDB title search, trigram). Auto-imports from IGDB when needed.
    """
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

    logger.info(
        "steam-igdb resolver complete via GameMatcher",
        user_id=user_id,
        resolved=result.resolved,
        synced=result.synced,
        failed=result.failed,
        total=result.total,
    )
    return result
