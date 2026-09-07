from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.schemas.auth import PlexAlbumTracksResponse, PlexTrackItem

router = APIRouter()


@router.get(
    "/integrations/plex/album-tracks/{media_item_id}",
    response_model=PlexAlbumTracksResponse,
)
async def plex_album_tracks(
    media_item_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> PlexAlbumTracksResponse:
    from otix.domain.media import UserPlexItem, UserPlexServer
    from otix.services.plex_sync_service import _get_plex_album_tracks_by_rating_key

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

    result = await _get_plex_album_tracks_by_rating_key(current_user, server, plex_item.rating_key)
    if result is None:
        raise HTTPException(status_code=502, detail="Could not fetch Plex album tracks")

    tracks, working_base_url = result
    token = server.access_token or current_user.plex_auth_token

    album_thumb_url = None
    if working_base_url and token and plex_item.rating_key:
        album_thumb_url = f"{working_base_url}/library/metadata/{plex_item.rating_key}/thumb?X-Plex-Token={token}"

    return PlexAlbumTracksResponse(
        tracks=[PlexTrackItem(**t) for t in tracks],
        base_url=working_base_url,
        token=token,
        rating_key=plex_item.rating_key,
        album_thumb_url=album_thumb_url,
    )
