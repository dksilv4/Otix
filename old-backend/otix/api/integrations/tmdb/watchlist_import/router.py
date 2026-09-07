# TODO: Review this file
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider
from otix.schemas.auth import TmdbWatchlistImportResponse
from otix.services.tmdb_rating_service import import_tmdb_watchlist

router = APIRouter()


@router.post("/integrations/tmdb/watchlist-import", response_model=TmdbWatchlistImportResponse)
async def tmdb_watchlist_import(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TmdbWatchlistImportResponse:
    if current_user.tmdb_session_id is None:
        raise HTTPException(status_code=400, detail="TMDb account not linked")

    redis = await get_redis()
    provider = TMDBProvider(redis)
    try:
        result = await import_tmdb_watchlist(db, provider, current_user)
        await db.commit()
    except Exception:
        await db.rollback()
        raise

    return TmdbWatchlistImportResponse(
        imported=result.imported,
        skipped=result.skipped,
        errors=result.errors,
    )
