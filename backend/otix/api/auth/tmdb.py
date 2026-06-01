from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.auth.helpers import _tmdb_frontend_redirect
from otix.api.deps import get_current_user, get_db
from otix.api.schemas.auth import (
    TmdbCallbackRequest,
    TmdbInitiateResponse,
    TmdbRatingSyncRequest,
    TmdbRatingSyncResponse,
    TmdbWatchlistImportResponse,
)
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.tmdb.client import TMDBProvider
from otix.services.tmdb_auth_service import (
    build_tmdb_link_url_for_user,
    link_tmdb_state_to_user,
    link_tmdb_to_user,
    unlink_tmdb_from_user,
)
from otix.services.tmdb_rating_service import (
    get_tmdb_account_stats,
    import_tmdb_watchlist,
    run_tmdb_rating_sync,
)

auth_router = APIRouter()

logger = structlog.get_logger()


async def _tmdb_stats(user: User) -> dict | None:
    if user.tmdb_session_id is None:
        return None
    try:
        redis = await get_redis()
        provider = TMDBProvider(redis)
        return await get_tmdb_account_stats(provider, user)
    except Exception:
        return None


@auth_router.post("/integrations/tmdb", response_model=TmdbInitiateResponse)
async def tmdb_connect_initiate(
    request: Request,
    current_user: User = Depends(get_current_user),
) -> TmdbInitiateResponse:
    if current_user.tmdb_session_id is not None:
        raise HTTPException(status_code=400, detail="TMDb account already linked")
    redirect_url = str(request.url_for("tmdb_connect_redirect"))
    url, state = await build_tmdb_link_url_for_user(current_user.id, redirect_url)
    return TmdbInitiateResponse(auth_url=url, state=state)


@auth_router.get("/integrations/tmdb/redirect", name="tmdb_connect_redirect")
async def tmdb_connect_redirect(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    approved = request.query_params.get("approved")
    state_value = request.query_params.get("state") or ""
    request_token = request.query_params.get("request_token")

    if approved == "false":
        return _tmdb_frontend_redirect("error", "TMDb authorization was cancelled.")
    if not state_value and not request_token:
        return _tmdb_frontend_redirect("error", "TMDb did not return the expected authorization details.")

    try:
        await link_tmdb_state_to_user(db, state_value, request_token)
        await db.commit()
    except HTTPException as exc:
        await db.rollback()
        detail = exc.detail if isinstance(exc.detail, str) else "Failed to link TMDb account."
        return _tmdb_frontend_redirect("error", detail)
    except Exception:
        await db.rollback()
        logger.exception("tmdb connect redirect failed")
        return _tmdb_frontend_redirect("error", "Failed to link TMDb account. Please try again.")

    return _tmdb_frontend_redirect("success")


@auth_router.post("/integrations/tmdb/callback")
async def tmdb_connect_callback(
    body: TmdbCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await link_tmdb_to_user(db, current_user, body.state, body.request_token)
    await db.commit()
    return {"message": "TMDb account linked successfully"}


@auth_router.post("/integrations/tmdb/rating-sync", response_model=TmdbRatingSyncResponse)
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
        raise

    return TmdbRatingSyncResponse(
        direction=result.direction,
        imported=result.imported,
        exported=result.exported,
        skipped=result.skipped,
        errors=result.errors,
    )


@auth_router.post("/integrations/tmdb/watchlist-import", response_model=TmdbWatchlistImportResponse)
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


@auth_router.delete("/integrations/tmdb")
async def tmdb_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_tmdb_from_user(db, current_user)
    await db.commit()
    return {"message": "TMDb account unlinked successfully"}
