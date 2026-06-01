from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.api.rate_limit import client_ip
from otix.api.schemas.auth import (
    SteamCallbackRequest,
    SteamInitiateResponse,
    SteamResolveResponse,
    TokenResponse,
)
from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services.auth_service import (
    create_access_token,
    create_refresh_token,
    get_refresh_cookie_config,
)
from otix.services.steam_auth_service import (
    build_steam_link_url,
    build_steam_login_url,
    find_or_create_steam_user,
    link_steam_to_user,
    unlink_steam_from_user,
    validate_steam_callback,
    validate_steam_link_callback,
)

auth_router = APIRouter()

logger = structlog.get_logger()


# ── Steam OAuth ──────────────────────────────────────────────────────


@auth_router.post("/steam/initiate", response_model=SteamInitiateResponse)
async def steam_initiate() -> SteamInitiateResponse:
    url, state = await build_steam_login_url()
    return SteamInitiateResponse(auth_url=url, state=state)


@auth_router.post("/steam/callback", response_model=TokenResponse)
async def steam_callback(
    body: SteamCallbackRequest,
    request: Request,
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    logger.info("steam callback received", params_keys=list(body.params.keys()) if body.params else None)
    steam_id = await validate_steam_callback(body.params, body.raw_query)
    user = await find_or_create_steam_user(db, steam_id)

    from otix.services.session_service import SessionService

    session_key = await SessionService(db).create_session(
        user,
        ip_address=client_ip(request),
        user_agent=request.headers.get("User-Agent"),
    )

    access_token = create_access_token(user.id)
    refresh_token, jti, exp = create_refresh_token(user.id, session_key)

    from otix.domain.user import RefreshToken

    rt = RefreshToken(user_id=user.id, jti=jti, expires_at=exp)
    db.add(rt)
    await db.flush()

    response.set_cookie(value=refresh_token, **get_refresh_cookie_config())
    logger.info("steam login succeeded", user_id=user.id, steam_id=steam_id)
    return TokenResponse(access_token=access_token)


@auth_router.post("/integrations/steam", response_model=SteamInitiateResponse)
async def steam_connect_initiate(
    current_user: User = Depends(get_current_user),
) -> SteamInitiateResponse:
    if current_user.steam_id is not None:
        raise HTTPException(status_code=400, detail="Steam account already linked")
    url, state = await build_steam_link_url()
    return SteamInitiateResponse(auth_url=url, state=state)


@auth_router.post("/integrations/steam/callback")
async def steam_connect_callback(
    body: SteamCallbackRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    steam_id = await validate_steam_link_callback(body.params, body.raw_query)
    await link_steam_to_user(db, current_user, steam_id)
    await db.commit()
    return {"message": "Steam account linked successfully"}


@auth_router.delete("/integrations/steam")
async def steam_disconnect(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    await unlink_steam_from_user(db, current_user)
    await db.commit()
    return {"message": "Steam account unlinked successfully"}


@auth_router.post("/integrations/steam/scan")
async def steam_scan_library(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.steam_api_key:
        raise HTTPException(status_code=503, detail="Steam API key not configured")

    from otix.providers.base import ProviderError
    from otix.providers.steam.client import SteamError
    from otix.services.steam_library_service import scan_steam_library

    try:
        result = await scan_steam_library(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (SteamError, ProviderError) as e:
        logger.exception("steam library scan failed")
        raise HTTPException(status_code=502, detail=f"Steam API error: {e}")
    except Exception:
        logger.exception("steam library scan failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to scan Steam library. Please try again.")

    return result


@auth_router.post("/integrations/steam/wishlist/scan")
async def steam_scan_wishlist(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.steam_api_key:
        raise HTTPException(status_code=503, detail="Steam API key not configured")

    from otix.providers.base import ProviderError
    from otix.providers.steam.client import SteamError
    from otix.services.steam_library_service import scan_steam_wishlist

    try:
        result = await scan_steam_wishlist(db, current_user)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except (SteamError, ProviderError) as e:
        logger.exception("steam wishlist scan failed")
        raise HTTPException(status_code=502, detail=f"Steam API error: {e}")
    except Exception:
        logger.exception("steam wishlist scan failed unexpectedly")
        raise HTTPException(status_code=500, detail="Failed to scan Steam wishlist. Please try again.")

    return result


@auth_router.post("/integrations/steam/resolve-unmatched", response_model=SteamResolveResponse)
async def steam_resolve_unmatched(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if not current_user.steam_id:
        raise HTTPException(status_code=400, detail="No Steam account linked")
    if not settings.igdb_client_id:
        raise HTTPException(status_code=503, detail="IGDB not configured")

    from otix.services.steam_igdb_resolver import resolve_unmatched_steam_games

    try:
        result = await resolve_unmatched_steam_games(db, current_user.id)
    except Exception:
        logger.exception("steam-igdb resolve failed")
        raise HTTPException(status_code=500, detail="Failed to resolve unmatched games. Please try again.")

    return {
        "resolved": result.resolved,
        "synced": result.synced,
        "failed": result.failed,
        "total": result.total,
    }
