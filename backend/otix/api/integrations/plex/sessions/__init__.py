# TODO: Review this file
from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.auth import PlexSessionResponse, PlexSessionsResponse
from otix.services.plex_sync_service import get_plex_sessions

router = APIRouter()

@router.get("/integrations/plex/sessions", response_model=PlexSessionsResponse)
async def plex_sessions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexSessionsResponse:
    if not current_user.plex_auth_token:
        raise HTTPException(status_code=400, detail="No Plex account linked")
    try:
        sessions = await get_plex_sessions(db, current_user)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            from otix.services.plex_auth_service import unlink_plex_quietly

            await unlink_plex_quietly(db, current_user)
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Plex account was disconnected because access was revoked externally. "
                "Please re-link your account.",
            ) from e
        raise HTTPException(status_code=502, detail="Plex returned an error. Please try again.") from e
    return PlexSessionsResponse(sessions=[PlexSessionResponse(**s) for s in sessions])
