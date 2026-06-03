"""Spotify playlist API endpoints.

All endpoints require authenticated user with linked Spotify account.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from otix.api.deps import get_current_user, get_db
from otix.domain.user import User
from otix.infrastructure.celery import app as celery_app
from otix.infrastructure.redis import get_redis
from otix.providers.spotify.client import SpotifyProvider
from otix.services.spotify_auth_service import get_user_access_token

spotify_playlists_router = APIRouter(prefix="/library/spotify/playlists", tags=["spotify-playlists"])


async def _require_spotify(user: User) -> str:
    """Ensure user has linked Spotify and get a valid access token."""
    if not user.spotify_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Spotify not linked")
    token = await get_user_access_token(user)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Spotify session expired. Please reconnect."
        )
    return token


@spotify_playlists_router.get("")
async def list_playlists(
    limit: int = Query(50, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """List current user's Spotify playlists, annotated with subscription status."""
    token = await _require_spotify(current_user)
    redis = await get_redis()
    spotify = SpotifyProvider(redis)
    data = await spotify.get_user_playlists(token, limit=limit, offset=offset)

    # Annotate with subscription status
    items = data.get("items", [])
    if items:
        playlist_ids = [p.get("id") for p in items if p.get("id")]
        result = await db.execute(
            text(
                "SELECT playlist_id, auto_sync, last_synced_at FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = ANY(:pids)"
            ),
            {"uid": current_user.id, "pids": playlist_ids},
        )
        subs = {
            row.playlist_id: {
                "subscribed": True,
                "auto_sync": row.auto_sync,
                "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
            }
            for row in result
        }

        for item in items:
            pid = item.get("id")
            if pid in subs:
                item["_subscription"] = subs[pid]
            else:
                item["_subscription"] = {"subscribed": False}

    return data


@spotify_playlists_router.get("/{playlist_id}")
async def get_playlist_detail(
    playlist_id: str,
    track_limit: int = Query(100, ge=1, le=100),
    track_offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Get playlist metadata + track page, annotated with subscription status."""
    token = await _require_spotify(current_user)
    redis = await get_redis()
    spotify = SpotifyProvider(redis)

    playlist = await spotify.get_playlist(token, playlist_id)
    tracks = await spotify.get_playlist_tracks(token, playlist_id, limit=track_limit, offset=track_offset)
    playlist["tracks"] = tracks

    # Annotate subscription status
    result = await db.execute(
        text(
            "SELECT id, auto_sync, last_synced_at FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid"
        ),
        {"uid": current_user.id, "pid": playlist_id},
    )
    row = result.one_or_none()
    if row:
        playlist["_subscription"] = {
            "subscribed": True,
            "subscription_id": row.id,
            "auto_sync": row.auto_sync,
            "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
        }
    else:
        playlist["_subscription"] = {"subscribed": False}

    return playlist


@spotify_playlists_router.post("/{playlist_id}/subscribe")
async def subscribe_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Subscribe to a playlist and trigger initial sync."""
    token = await _require_spotify(current_user)
    redis = await get_redis()
    spotify = SpotifyProvider(redis)

    # Check if already subscribed
    result = await db.execute(
        text("SELECT id FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid"),
        {"uid": current_user.id, "pid": playlist_id},
    )
    if result.one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Already subscribed to this playlist")

    # Fetch playlist metadata
    playlist = await spotify.get_playlist(token, playlist_id, fields="name,owner,snapshot_id")
    name = playlist.get("name", "Unknown Playlist")
    owner = playlist.get("owner", {}).get("display_name") or playlist.get("owner", {}).get("id", "Unknown")
    snapshot = playlist.get("snapshot_id")

    # Create subscription
    sub_id = uuid.uuid4().hex[:16]
    await db.execute(
        text("""
            INSERT INTO spotify_playlist_subscriptions (id, user_id, playlist_id, playlist_name, playlist_owner, playlist_snapshot)
            VALUES (:id, :uid, :pid, :name, :owner, :snapshot)
        """),
        {"id": sub_id, "uid": current_user.id, "pid": playlist_id, "name": name, "owner": owner, "snapshot": snapshot},
    )
    await db.commit()

    # Trigger initial sync
    task_id = uuid.uuid4().hex[:16]
    celery_app.send_task(
        "sync.spotify.sync_playlist", args=[current_user.id, playlist_id, name], kwargs={"task_id": task_id}
    )

    return {
        "subscription_id": sub_id,
        "playlist_id": playlist_id,
        "playlist_name": name,
        "task_id": task_id,
        "message": "Playlist subscribed. Sync started.",
    }


@spotify_playlists_router.post("/{playlist_id}/unsubscribe")
async def unsubscribe_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Remove a playlist subscription."""
    await _require_spotify(current_user)

    result = await db.execute(
        text("DELETE FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid RETURNING id"),
        {"uid": current_user.id, "pid": playlist_id},
    )
    deleted = result.one_or_none()
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not subscribed to this playlist")

    await db.commit()
    return {"message": "Unsubscribed from playlist", "playlist_id": playlist_id}


@spotify_playlists_router.post("/{playlist_id}/sync")
async def sync_playlist(
    playlist_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Manually trigger a resync of a subscribed playlist."""
    await _require_spotify(current_user)

    result = await db.execute(
        text("SELECT playlist_name FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid"),
        {"uid": current_user.id, "pid": playlist_id},
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Not subscribed to this playlist. Subscribe first."
        )

    task_id = uuid.uuid4().hex[:16]
    celery_app.send_task(
        "sync.spotify.sync_playlist",
        args=[current_user.id, playlist_id, row.playlist_name],
        kwargs={"task_id": task_id},
    )

    return {"task_id": task_id, "message": "Sync started."}


@spotify_playlists_router.get("/subscriptions")
async def list_subscriptions(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[dict]:
    """List all subscribed playlists for the current user."""
    result = await db.execute(
        text("""
            SELECT id, playlist_id, playlist_name, playlist_owner, auto_sync, last_synced_at, created_at
            FROM spotify_playlist_subscriptions
            WHERE user_id = :uid
            ORDER BY created_at DESC
        """),
        {"uid": current_user.id},
    )
    rows = result.all()
    return [
        {
            "id": row.id,
            "playlist_id": row.playlist_id,
            "playlist_name": row.playlist_name,
            "playlist_owner": row.playlist_owner,
            "auto_sync": row.auto_sync,
            "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None,
            "created_at": row.created_at.isoformat() if row.created_at else None,
        }
        for row in rows
    ]


@spotify_playlists_router.put("/subscriptions/{subscription_id}")
async def update_subscription(
    subscription_id: str,
    auto_sync: bool,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    """Update subscription settings (auto_sync toggle)."""
    result = await db.execute(
        text(
            "UPDATE spotify_playlist_subscriptions SET auto_sync = :auto WHERE id = :id AND user_id = :uid RETURNING id"
        ),
        {"auto": auto_sync, "id": subscription_id, "uid": current_user.id},
    )
    if not result.one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    await db.commit()
    return {"message": "Subscription updated", "auto_sync": auto_sync}
