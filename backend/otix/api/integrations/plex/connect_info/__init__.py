# TODO: Review this file
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User

router = APIRouter()

@router.get("/integrations/plex/connect-info/{media_item_id}")
async def plex_connect_info(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.domain.media import UserPlexItem, UserPlexServer
    from otix.services.plex_sync_service import _get_alternative_plex_urls

    plex_item = await db.scalar(
        select(UserPlexItem).where(
            UserPlexItem.user_id == current_user.id,
            UserPlexItem.media_item_id == media_item_id,
        )
    )
    if plex_item is None:
        raise HTTPException(status_code=404, detail="Media item not found in your Plex library")

    server = await db.get(UserPlexServer, plex_item.server_id)
    if server is None:
        raise HTTPException(status_code=404, detail="Plex server not found")

    alt_urls = await _get_alternative_plex_urls(server, current_user)
    base_urls = [server.base_url] if server.base_url else []
    for url in alt_urls:
        if url not in base_urls:
            base_urls.append(url)

    token = server.access_token or current_user.plex_auth_token
    album_thumb_url = None
    if base_urls and token and plex_item.rating_key:
        album_thumb_url = f"{base_urls[0]}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"

    return {
        "base_url": base_urls[0] if base_urls else None,
        "base_urls": base_urls,
        "token": token,
        "rating_key": plex_item.rating_key,
        "album_thumb_url": album_thumb_url,
    }
