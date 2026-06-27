# TODO: Review this file
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User

router = APIRouter()

@router.get("/integrations/plex/stream/{rating_key}")
async def plex_stream(
    rating_key: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> RedirectResponse:
    from otix.domain.media import UserPlexServer
    from otix.services.plex_sync_service import _resolve_stream_url_for_server_with_base, get_plex_stream_url

    base_url_hint = request.query_params.get("base_url")
    if base_url_hint:
        token = current_user.plex_auth_token
        servers_result = await db.execute(select(UserPlexServer).where(UserPlexServer.user_id == current_user.id))
        for server in servers_result.scalars().all():
            if server.access_token:
                token = server.access_token
                break
        if token:
            url = await _resolve_stream_url_for_server_with_base(base_url_hint, token, rating_key)
            if url:
                return RedirectResponse(url, status_code=302)

    url = await get_plex_stream_url(db, current_user, rating_key)
    if url is None:
        raise HTTPException(status_code=404, detail="Stream URL not available")
    return RedirectResponse(url, status_code=302)
