# TODO: Review this file
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider
from otix.schemas.auth import TmdbRatingSyncRequest, TmdbRatingSyncResponse
from otix.services.tmdb_rating_service import run_tmdb_rating_sync

router = APIRouter()

@router.post("/integrations/tmdb/rating-sync", response_model=TmdbRatingSyncResponse)
async def tmdb_rating_sync(
    body: TmdbRatingSyncRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TmdbRatingSyncResponse:
    if current_user.tmdb_session_id is None:
        raise HTTPException(status_code=400, detail="TMDb account not linked")

    current_user.tmdb_rating_sync_direction = body.direction
    await db.flush()

    redis = await get_redis()
    provider = TMDBProvider(redis)
    try:
        result = await run_tmdb_rating_sync(db, provider, current_user, body.direction)
        current_user.tmdb_rating_last_synced_at = func.now()
        await db.commit()
    except Exception:
        await db.rollback()
        # If the session was revoked externally, auto-disconnect
        if current_user.tmdb_session_id is not None:
            from otix.services.tmdb_auth_service import get_tmdb_account, unlink_tmdb_quietly

            try:
                account = await get_tmdb_account(current_user.tmdb_session_id)
                if account is None:
                    await unlink_tmdb_quietly(db, current_user)
            except Exception:
                pass
        raise

    return TmdbRatingSyncResponse(
        direction=result.direction,
        imported=result.imported,
        exported=result.exported,
        skipped=result.skipped,
        errors=result.errors,
    )
