# TODO: Review this file
"""Resolve unmatched Steam game via IGDB cross-reference."""

from __future__ import annotations

from dataclasses import dataclass

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, UserSteamGame
from otix.infrastructure.redis import get_redis
from otix.providers.igdb.client import IGDBProvider
from otix.tasks.sync.igdb import _sync_igdb_game

logger = structlog.get_logger()

BATCH_SIZE = 250


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
    """Resolve unmatched Steam game by looking them up in IGDB.

    For each unmatched UserSteamGame:
    1. Look up the Steam app ID in IGDB's external_games table
    2. If the IGDB game already exists in the catalog → link it
    3. If the IGDB game is not in the catalog → sync it from IGDB, then link
    4. If IGDB has no match → leave unmatched
    """
    # Fetch all unmatched game for this user
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
    unmatched_count = len(unmatched_games)  # game IGDB didn't know about at all

    # Batch by BATCH_SIZE for the IGDB lookup
    for i in range(0, len(unmatched_games), BATCH_SIZE):
        batch = unmatched_games[i : i + BATCH_SIZE]
        app_ids = [g.steam_app_id for g in batch]
        app_to_game = {g.steam_app_id: g for g in batch}

        try:
            redis = await get_redis()
            provider = IGDBProvider(redis)
            steam_to_igdb = await provider.lookup_steam_app_ids(app_ids)
        except Exception:
            logger.exception("igdb steam lookup failed", user_id=user_id)
            result.failed += len(batch)
            unmatched_count -= len(batch)
            continue

        matched_igdb_ids = list(steam_to_igdb.values())
        if not matched_igdb_ids:
            # Games not found in IGDB — they just stay unmatched, not failures
            continue

        unmatched_count -= len(steam_to_igdb)

        # Batch-query existing ExternalIDs for these IGDB IDs
        existing = await db.execute(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id.in_([str(gid) for gid in matched_igdb_ids]),
            )
        )
        igdb_id_to_media: dict[int, str] = {}
        for ext in existing.scalars().all():
            try:
                igdb_id_to_media[int(ext.external_id)] = ext.media_item_id
            except ValueError:
                pass

        # Link game that are already in the catalog
        for steam_app_id, igdb_game_id in steam_to_igdb.items():
            game = app_to_game.get(steam_app_id)
            if game is None:
                continue

            media_item_id = igdb_id_to_media.get(igdb_game_id)
            if media_item_id is not None:
                game.media_item_id = media_item_id
                result.resolved += 1

        # Sync game not yet in the catalog
        for steam_app_id, igdb_game_id in steam_to_igdb.items():
            game = app_to_game.get(steam_app_id)
            if game is None:
                continue

            if igdb_game_id in igdb_id_to_media:
                continue  # already handled above

            try:
                await _sync_igdb_game(igdb_game_id, force=False)
            except Exception:
                logger.exception(
                    "igdb game sync failed",
                    igdb_id=igdb_game_id,
                    steam_app_id=steam_app_id,
                )
                result.failed += 1
                continue

            # Re-query ExternalID (committed by _sync_igdb_game in its own session)
            ext = await db.scalar(
                select(ExternalID).where(
                    ExternalID.provider == "igdb",
                    ExternalID.external_id == str(igdb_game_id),
                )
            )
            if ext is not None:
                game.media_item_id = ext.media_item_id
                result.synced += 1
            else:
                result.failed += 1
                logger.warning(
                    "igdb game sync returned but no ExternalID found",
                    igdb_id=igdb_game_id,
                )

        await db.flush()

    await db.commit()

    logger.info(
        "steam-igdb resolver complete",
        user_id=user_id,
        resolved=result.resolved,
        synced=result.synced,
        failed=result.failed,
        total=result.total,
    )
    return result
