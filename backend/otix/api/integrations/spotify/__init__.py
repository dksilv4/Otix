"""Shared utilities and endpoints for Spotify integration.

Utilities intended for internal use by other Spotify endpoint modules:
  - verify_spotify_linked  – replaces inline "if spotify_id is None" in every POST handler
  - generate_task_id       – centralized UUID generation
  - acquire_sync_lock      – prevents concurrent syncs per user (Redis SET NX)
  - release_sync_lock      – cleans up the sync lock in a finally block
  - SpotifySyncResponse    – Pydantic model for POST /sync responses

Routes defined here:
  - GET /integrations/spotify/token  – return a valid access token to the frontend
"""

from __future__ import annotations

import uuid

import structlog
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.redis import get_redis

logger = structlog.get_logger()

router = APIRouter()


class SpotifySyncResponse(BaseModel):
    """Response returned immediately when a sync task is accepted."""

    task_id: str


@router.get("/integrations/spotify/token")
async def spotify_get_token(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    """Return a valid Spotify access token for the frontend.

    Retrieves the stored token, refreshing it if expired.
    The frontend uses this token for direct Spotify API calls
    (e.g. Web Playback SDK).
    """
    if current_user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")
    if not current_user.spotify_refresh_token:
        raise HTTPException(
            status_code=400,
            detail="Spotify session expired. Please reconnect your account in Settings.",
        )
    from otix.services.spotify_auth_service import get_user_access_token

    token = await get_user_access_token(current_user, session=db)
    if token is None:
        if current_user.spotify_id is None:
            # Auto-disconnected due to external revocation
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Spotify account was disconnected because access was revoked externally. "
                "Please re-link your account.",
            )
        raise HTTPException(
            status_code=502,
            detail="Spotify token refresh failed. Please reconnect your account in Settings.",
        )
    await db.commit()
    return {"accessToken": token, "expiresIn": 3600}


async def verify_spotify_linked(user: User) -> None:
    """Raise 400 if the user has no Spotify account linked."""
    if user.spotify_id is None:
        raise HTTPException(status_code=400, detail="No Spotify account linked")


def generate_task_id() -> str:
    """Return a new UUID4 task identifier."""
    return str(uuid.uuid4())


async def acquire_sync_lock(user_id: str) -> bool:
    """Try to acquire an exclusive sync lock for *user_id*.

    Uses Redis SET NX so only one caller wins atomically.
    Returns True if the lock was acquired (caller should proceed),
    False if another sync is already in-flight.

    The lock auto-expires after 10 minutes as a safety net.
    """
    redis = await get_redis()
    key = f"spotify:sync:running:{user_id}"
    return bool(await redis.set(key, "1", ex=600, nx=True))


async def release_sync_lock(user_id: str) -> None:
    """Release the sync lock for *user_id*.

    Always call this from a ``finally`` block so the lock is
    released even when the background task fails.
    """
    redis = await get_redis()
    key = f"spotify:sync:running:{user_id}"
    await redis.delete(key)
