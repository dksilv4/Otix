"""GET /library/installed — user's locally installed game enriched with catalog data."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select

from otix.api._utils import get_optional_user
from otix.domain.media import MediaItem, UserLocalGame
from otix.domain.user import User
from otix.infrastructure.database import async_session
from otix.schemas.media import InstalledGamesResponse, InstalledGameSummary

router = APIRouter(prefix="/installed", tags=["library"])


@router.get("", response_model=InstalledGamesResponse)
async def get_installed_games(
    current_user: User = Depends(get_optional_user),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
) -> InstalledGamesResponse:
    """Return the user's locally installed game, enriched with catalog data.

    Ordered by last_seen_at descending (most recently seen first).
    """
    if current_user is None:
        raise HTTPException(status_code=401, detail="Authentication required")

    async with async_session() as session:
        user_id = current_user.id

        # Count total
        total_q = select(func.count()).select_from(UserLocalGame).where(UserLocalGame.user_id == user_id)
        total = (await session.execute(total_q)).scalar_one()

        # Fetch paginated local game
        q = (
            select(UserLocalGame)
            .where(UserLocalGame.user_id == user_id)
            .order_by(UserLocalGame.last_seen_at.desc())
            .offset(offset)
            .limit(limit)
        )
        rows = (await session.execute(q)).scalars().all()

        # Batch-load catalog MediaItems for enrichment (avoids N+1)
        media_ids = [g.media_item_id for g in rows if g.media_item_id]
        catalog_map: dict[str, MediaItem] = {}
        if media_ids:
            catalog_rows = (await session.execute(select(MediaItem).where(MediaItem.id.in_(media_ids)))).scalars().all()
            catalog_map = {m.id: m for m in catalog_rows}

        games: list[InstalledGameSummary] = []
        for g in rows:
            catalog = catalog_map.get(g.media_item_id) if g.media_item_id else None
            games.append(
                InstalledGameSummary(
                    id=g.id,
                    title=g.title,
                    platform=g.platform,
                    media_item_id=g.media_item_id,
                    match_suggestion_media_id=g.match_suggestion_media_id,
                    last_seen_at=g.last_seen_at.isoformat() if g.last_seen_at else None,
                    catalog_title=catalog.title if catalog else None,
                    catalog_slug=catalog.slug if catalog else None,
                    catalog_poster_url=catalog.poster_url if catalog else None,
                    catalog_textless_poster_url=catalog.textless_poster_url if catalog else None,
                    catalog_logo_url=catalog.logo_url if catalog else None,
                    catalog_avg_rating=catalog.avg_rating if catalog else None,
                )
            )

    return InstalledGamesResponse(games=games, total=total)
