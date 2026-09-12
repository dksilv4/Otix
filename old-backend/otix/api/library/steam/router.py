from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.media import UserSteamGame
from otix.domain.user import User
from otix.schemas.media import (
    MediaItemListResponse,
    MediaItemSummary,
    SteamUnmatchedGameSummary,
    SteamUnmatchedListResponse,
    SteamWishlistItemSummary,
    SteamWishlistListResponse,
)
from otix.services.asset_selection import enrich_items_with_assets
from otix.services.steam_library_service import (
    get_steam_library,
    get_steam_wishlist,
    get_unmatched_steam_games,
)

logger = structlog.get_logger()

router = APIRouter()


@router.get("/steam", response_model=MediaItemListResponse)
async def get_steam_library_tab(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> MediaItemListResponse:
    """Get the authenticated user's Steam library with pagination."""
    ip = request.client.host if request.client else None

    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam library is only available when Steam is connected",
        )

    try:
        item_tuples, has_more, next_cursor = await get_steam_library(db, current_user.id, cursor=cursor, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch steam library", user_id=current_user.id, ip=ip)
        raise

    await enrich_items_with_assets(db, [t[0] for t in item_tuples])
    summaries: list[MediaItemSummary] = []
    for media_item, playtime_forever, playtime_2weeks, rtime_last_played in item_tuples:
        summary = MediaItemSummary.model_validate(media_item)
        summary.steam_playtime_forever = playtime_forever
        summary.steam_playtime_2weeks = playtime_2weeks
        summary.steam_rtime_last_played = rtime_last_played
        summaries.append(summary)

    logger.info("steam library fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return MediaItemListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/steam/status")
async def get_steam_status(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get Steam library sync status (game count, last scanned)."""
    ip = request.client.host if request.client else None

    if not current_user.steam_id:
        return {"game_count": 0, "last_scanned_at": None}

    try:
        result = await db.execute(
            select(
                func.count(UserSteamGame.id),
                func.max(UserSteamGame.updated_at),
            ).where(UserSteamGame.user_id == current_user.id)
        )
        count, last_scanned = result.one()
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch steam status", user_id=current_user.id, ip=ip)
        raise

    logger.info("steam status fetched", user_id=current_user.id, ip=ip)
    return {
        "game_count": count or 0,
        "last_scanned_at": last_scanned.isoformat() if last_scanned else None,
    }


@router.get("/steam/unmatched", response_model=SteamUnmatchedListResponse)
async def get_steam_unmatched_games(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SteamUnmatchedListResponse:
    """Get unmatched Steam game (not yet linked to a media item)."""
    ip = request.client.host if request.client else None

    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam library is only available when Steam is connected",
        )

    try:
        items, has_more, next_cursor = await get_unmatched_steam_games(db, current_user.id, cursor=cursor, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch unmatched steam game", user_id=current_user.id, ip=ip)
        raise

    summaries = [SteamUnmatchedGameSummary.model_validate(g) for g in items]
    logger.info("steam unmatched game fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return SteamUnmatchedListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )


@router.get("/steam/wishlist", response_model=SteamWishlistListResponse)
async def get_steam_wishlist_tab(
    request: Request,
    cursor: str | None = Query(None, description="Pagination cursor"),
    limit: int = Query(48, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> SteamWishlistListResponse:
    """Get the authenticated user's Steam wishlist with pagination."""
    ip = request.client.host if request.client else None

    if not current_user.steam_id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Steam wishlist is only available when Steam is connected",
        )

    try:
        item_tuples, has_more, next_cursor = await get_steam_wishlist(db, current_user.id, cursor=cursor, limit=limit)
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch steam wishlist", user_id=current_user.id, ip=ip)
        raise

    await enrich_items_with_assets(db, [t[0] for t in item_tuples])
    summaries: list[SteamWishlistItemSummary] = []
    for media_item, priority in item_tuples:
        summary = SteamWishlistItemSummary.model_validate(media_item)
        summary.steam_priority = priority
        summaries.append(summary)

    logger.info("steam wishlist fetched", user_id=current_user.id, count=len(summaries), ip=ip)
    return SteamWishlistListResponse(
        items=summaries,
        next_cursor=next_cursor,
        has_more=has_more,
    )
