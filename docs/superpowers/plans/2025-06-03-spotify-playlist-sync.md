# Spotify Playlist Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Spotify playlist support to Otix — browse playlists, subscribe, sync tracks/albums into library, auto-refresh on schedule.

**Architecture:** Extends existing Spotify auth + client + service + task patterns. New DB table for subscriptions. New service mirrors `SpotifyLibraryService`. Celery tasks for sync + periodic refresh. Frontend feature folder.

**Tech Stack:** Python 3.12+ (FastAPI, SQLAlchemy 2.0 async, Celery, Alembic), TypeScript (React 19, TanStack Router, TanStack Query, Tailwind)

---

## File Map

### Backend — Create
- `backend/otix/services/spotify_playlist_service.py` — playlist sync service
- `backend/otix/api/spotify_playlists.py` — API router for playlist endpoints
- `backend/alembic/versions/k1l2m3n4o5p6_add_spotify_playlist_subscriptions.py` — migration

### Backend — Modify
- `backend/otix/providers/spotify/client.py` — add `get_user_playlists`, `get_playlist`, `get_playlist_tracks`
- `backend/otix/services/spotify_auth_service.py` — add `playlist-read-private`, `playlist-read-collaborative` scopes
- `backend/otix/tasks/sync/spotify.py` — add `sync_spotify_playlist_task` + `refresh_all_playlists_task`
- `backend/otix/infrastructure/celery.py` — register new beat schedule entry, add `route_task` entry for `sync.spotify.playlist*`
- `backend/otix/api/router.py` — register new playlist router

### Frontend — Create
- `frontend/src/features/spotify/playlists/pages/spotify-playlists-page.tsx`
- `frontend/src/features/spotify/playlists/pages/spotify-playlist-detail-page.tsx`
- `frontend/src/features/spotify/playlists/organisms/playlist-list.tsx`
- `frontend/src/features/spotify/playlists/organisms/playlist-detail.tsx`
- `frontend/src/features/spotify/playlists/organisms/playlist-sync-panel.tsx`
- `frontend/src/features/spotify/playlists/molecules/playlist-card.tsx`
- `frontend/src/features/spotify/playlists/molecules/playlist-track-row.tsx`
- `frontend/src/features/spotify/playlists/api/spotify-playlists-api.ts`

### Frontend — Modify
- `frontend/src/lib/router.tsx` — add playlist routes

---

### Task 1: Add playlist scopes to Spotify auth

**Files:**
- Modify: `backend/otix/services/spotify_auth_service.py:30-39`

- [ ] **Step 1: Add playlist scopes to SCOPES list**

Edit `SCOPES` in `spotify_auth_service.py`. Current list ends with `"user-read-recently-played"`. Add:

```python
SCOPES = [
    "user-library-read",
    "user-library-modify",
    "user-read-email",
    "user-read-private",
    "streaming",
    "user-read-playback-state",
    "user-modify-playback-state",
    "user-read-recently-played",
    "playlist-read-private",
    "playlist-read-collaborative",
]
```

- [ ] **Step 2: Commit**

```bash
git add backend/otix/services/spotify_auth_service.py
git commit -m "feat(spotify): add playlist-read-private and playlist-read-collaborative scopes"
```

---

### Task 2: Add playlist methods to Spotify client

**Files:**
- Modify: `backend/otix/providers/spotify/client.py`

- [ ] **Step 1: Add playlist methods to `SpotifyProvider`**

Add after the existing user-scoped methods (after `save_user_tracks` at line 187):

```python
    # ── Playlists ──────────────────────────────────────────────────────────

    async def get_user_playlists(
        self, access_token: str, limit: int = 50, offset: int = 0
    ) -> dict:
        """GET /me/playlists. Returns {items: [{...}], total, ...}"""
        return await self._user_request(
            access_token, "me/playlists",
            {"limit": limit, "offset": offset},
        )

    async def get_playlist(
        self, access_token: str, playlist_id: str,
        fields: str | None = None,
    ) -> dict:
        """GET /playlists/{id}. Optionally filter response fields."""
        params: dict[str, str] = {}
        if fields:
            params["fields"] = fields
        return await self._user_request(
            access_token, f"playlists/{playlist_id}", params,
        )

    async def get_playlist_tracks(
        self, access_token: str, playlist_id: str,
        limit: int = 100, offset: int = 0,
    ) -> dict:
        """GET /playlists/{id}/tracks. Returns {items: [{track: TrackObject}], total, ...}"""
        return await self._user_request(
            access_token, f"playlists/{playlist_id}/tracks",
            {"limit": limit, "offset": offset},
        )
```

- [ ] **Step 2: Commit**

```bash
git add backend/otix/providers/spotify/client.py
git commit -m "feat(spotify): add playlist API methods to SpotifyProvider"
```

---

### Task 3: Create Alembic migration for subscriptions table

**Files:**
- Create: `backend/alembic/versions/k1l2m3n4o5p6_add_spotify_playlist_subscriptions.py`

- [ ] **Step 1: Create migration file**

```python
"""add spotify_playlist_subscriptions table

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-06-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k1l2m3n4o5p6"
down_revision: str | None = "j1k2l3m4n5o6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "spotify_playlist_subscriptions",
        sa.Column("id", sa.String(16), primary_key=True),
        sa.Column("user_id", sa.String(16), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("playlist_id", sa.String(255), nullable=False),
        sa.Column("playlist_name", sa.String(512), nullable=True),
        sa.Column("playlist_owner", sa.String(255), nullable=True),
        sa.Column("playlist_snapshot", sa.String(255), nullable=True),
        sa.Column("auto_sync", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("last_synced_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("user_id", "playlist_id", name="uq_spotify_playlist_subscription"),
    )


def downgrade() -> None:
    op.drop_table("spotify_playlist_subscriptions")
```

Check the latest revision ID: `j1k2l3m4n5o6`. The migration file should use that as `down_revision`.

- [ ] **Step 2: Add domain model (optional, for type safety)**

If the project uses SQLAlchemy models for the subscriptions table, add one. Check if there's an existing pattern for domain models under `backend/otix/domain/`.

- [ ] **Step 3: Commit**

```bash
git add backend/alembic/versions/k1l2m3n4o5p6_add_spotify_playlist_subscriptions.py
git commit -m "feat(db): add spotify_playlist_subscriptions table"
```

---

### Task 4: Create SpotifyPlaylistService

**Files:**
- Create: `backend/otix/services/spotify_playlist_service.py`

- [ ] **Step 1: Create the service file**

```python
"""Sync a user's Spotify playlists into Otix.

Matches tracks by Spotify ID, seeds missing albums, creates listened interactions.
Pattern mirrors SpotifyLibraryService.
"""

from __future__ import annotations

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.media import ExternalID, Track
from otix.domain.user import User
from otix.infrastructure.redis import get_redis
from otix.providers.spotify.client import SpotifyProvider

logger = structlog.get_logger()

SPOTIFY_PAGE_LIMIT_PLAYLISTS = 50
SPOTIFY_PAGE_LIMIT_TRACKS = 100


async def _fetch_all_user_playlists(access_token: str, spotify: SpotifyProvider) -> list[dict]:
    """Fetch all playlists for the current user, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_user_playlists(access_token, limit=SPOTIFY_PAGE_LIMIT_PLAYLISTS, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        total = resp.get("total")
        if total and offset >= total:
            break
    return items


async def _fetch_all_playlist_tracks(access_token: str, spotify: SpotifyProvider, playlist_id: str) -> list[dict]:
    """Fetch all tracks in a playlist, handling pagination."""
    items: list[dict] = []
    offset = 0
    while True:
        resp = await spotify.get_playlist_tracks(access_token, playlist_id, limit=SPOTIFY_PAGE_LIMIT_TRACKS, offset=offset)
        page_items = resp.get("items", [])
        if not page_items:
            break
        items.extend(page_items)
        offset += len(page_items)
        total = resp.get("total")
        if total and offset >= total:
            break
    return items


async def sync_playlist_to_library(
    session: AsyncSession,
    user: User,
    access_token: str,
    playlist_id: str,
    playlist_name: str,
    task_id: str | None = None,
) -> dict:
    """Fetch a playlist's tracks and sync them into Otix.

    Matches tracks by Spotify ID, seeds missing albums, creates listened interactions.
    Returns summary: {total_tracks, matched, seeded}
    """
    from otix.lib.spotify_progress import publish_progress, store_result, store_progress

    async def _emit(event_type: str, **kwargs) -> None:
        if task_id:
            await publish_progress(task_id, event_type, **kwargs)
            await store_progress(task_id, event_type, **kwargs)

    redis = await get_redis()
    spotify = SpotifyProvider(redis)

    await _emit("sync_started", playlist_id=playlist_id, playlist_name=playlist_name)

    try:
        # 1. Fetch playlist metadata (for snapshot_id)
        playlist_data = await spotify.get_playlist(access_token, playlist_id, fields="snapshot_id,name,owner")
        snapshot_id = playlist_data.get("snapshot_id")

        # 2. Fetch all tracks
        await _emit("fetching_tracks")
        track_items = await _fetch_all_playlist_tracks(access_token, spotify, playlist_id)
        await _emit("tracks_fetched", count=len(track_items))

        # 3. Extract track IDs and album mappings
        track_spotify_ids: list[str] = []
        album_spotify_ids: set[str] = set()
        track_to_album: dict[str, str] = {}

        for item in track_items:
            track_data = item.get("track")
            if not track_data or not track_data.get("id"):
                continue
            track_id = track_data["id"]
            track_spotify_ids.append(track_id)

            album_data = track_data.get("album", {})
            album_id = album_data.get("id")
            if album_id:
                album_spotify_ids.add(album_id)
                track_to_album[track_id] = album_id

        total_tracks = len(track_spotify_ids)

        # 4. Batch-match existing tracks by spotify_id
        await _emit("matching_tracks", count=total_tracks)
        existing_tracks: set[str] = set()
        if track_spotify_ids:
            result = await session.execute(
                select(ExternalID.external_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )
            existing_tracks = {row[0] for row in result if row[0]}

        # 5. Find which albums already exist
        existing_albums: dict[str, str] = {}
        if album_spotify_ids:
            album_result = await session.execute(
                select(ExternalID.external_id, ExternalID.entity_id).where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "media_item",
                    ExternalID.external_id.in_(list(album_spotify_ids)),
                )
            )
            for row in album_result:
                if row.external_id:
                    existing_albums[row.external_id] = row.entity_id

        # 6. Match tracks to Otix albums
        track_media_map: dict[str, str] = {}
        if track_spotify_ids:
            tr_result = await session.execute(
                select(ExternalID.external_id, Track.album_id)
                .join(Track, Track.id == ExternalID.entity_id)
                .where(
                    ExternalID.provider == "spotify",
                    ExternalID.entity_type == "track",
                    ExternalID.external_id.in_(track_spotify_ids),
                )
            )
            for row in tr_result:
                if row.external_id:
                    track_media_map[row.external_id] = row.album_id

        # 7. Count matched
        matched = 0
        seen_album_media_ids: set[str] = set()
        for track_id in track_spotify_ids:
            media_item_id = track_media_map.get(track_id) or existing_albums.get(track_to_album.get(track_id, ""))
            if media_item_id:
                matched += 1
                seen_album_media_ids.add(media_item_id)

        await _emit("tracks_matched", matched=matched, total=total_tracks)

        # 8. Seed missing albums
        seeded = 0
        missing_albums = album_spotify_ids - set(existing_albums)
        if missing_albums:
            await _emit("seeding_albums", count=len(missing_albums))
            from otix.infrastructure.celery import app as celery_app
            for album_spotify_id in missing_albums:
                celery_app.send_task("sync.spotify.seed_album", args=[album_spotify_id])
                seeded += 1
        if missing_albums:
            await _emit("albums_seeded", count=seeded)

        # 9. Create listened interactions for matched albums
        if seen_album_media_ids:
            await _emit("creating_interactions", count=len(seen_album_media_ids))
            from otix.services.interaction_service import InteractionService
            interaction_service = InteractionService(session)
            batch = [(mid, "listened", {"source": "spotify_playlist", "playlist_id": playlist_id}) for mid in seen_album_media_ids]
            await interaction_service.set_interactions_batch(user.id, batch)

        result = {
            "total_tracks": total_tracks,
            "matched": matched,
            "seeded": seeded,
            "snapshot_id": snapshot_id,
        }

        logger.info(
            "spotify playlist synced",
            user_id=user.id,
            playlist_id=playlist_id,
            playlist_name=playlist_name,
            total_tracks=total_tracks,
            matched=matched,
            seeded=seeded,
        )

        await _emit("sync_complete", **result)
        if task_id:
            await store_result(task_id, result)
        return result

    except Exception:
        logger.exception("spotify playlist sync failed", user_id=user.id, playlist_id=playlist_id)
        await _emit("error", message="Spotify playlist sync failed. Please try again.")
        if task_id:
            await store_result(task_id, {"error": "Sync failed"})
        raise
```

- [ ] **Step 2: Commit**

```bash
git add backend/otix/services/spotify_playlist_service.py
git commit -m "feat(spotify): add SpotifyPlaylistService for syncing playlists to library"
```

---

### Task 5: Add Celery tasks for playlist sync

**Files:**
- Modify: `backend/otix/tasks/sync/spotify.py`

- [ ] **Step 1: Add playlist sync task and refresh-all task**

Append to the end of `spotify.py`:

```python
# ── Playlist sync ──────────────────────────────────────────────────


@app.task(
    name="sync.spotify.sync_playlist",
    bind=True,
    max_retries=1,
)
def sync_spotify_playlist_task(self, user_id: str, playlist_id: str, playlist_name: str, task_id: str | None = None) -> dict | None:
    """Sync a single Spotify playlist for a user into Otix."""
    try:
        return run_async(_sync_spotify_playlist(user_id, playlist_id, playlist_name, task_id))
    except RateLimitError as e:
        raise self.retry(countdown=e.retry_after or 120)


async def _sync_spotify_playlist(user_id: str, playlist_id: str, playlist_name: str, task_id: str | None = None) -> dict | None:
    from otix.services.spotify_auth_service import get_user_access_token
    from otix.services.spotify_playlist_service import sync_playlist_to_library

    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None or user.spotify_id is None:
            return None

        token = await get_user_access_token(user)
        if token is None:
            logger.warning("spotify playlist sync failed, no valid token", user_id=user_id, playlist_id=playlist_id)
            return None

        result = await sync_playlist_to_library(
            session, user, token,
            playlist_id=playlist_id,
            playlist_name=playlist_name,
            task_id=task_id,
        )

        # Update subscription snapshot_id and last_synced_at
        from datetime import datetime, timezone
        from sqlalchemy import text
        snapshot = result.get("snapshot_id")
        if snapshot:
            await session.execute(
                text("""
                    UPDATE spotify_playlist_subscriptions
                    SET playlist_snapshot = :snapshot,
                        last_synced_at = :now
                    WHERE user_id = :user_id AND playlist_id = :playlist_id
                """),
                {"snapshot": snapshot, "now": datetime.now(timezone.utc), "user_id": user_id, "playlist_id": playlist_id},
            )

        await session.commit()
        return result


@app.task(
    name="sync.spotify.refresh_all_playlists",
    bind=True,
    max_retries=0,
)
def refresh_all_playlists_task(self) -> dict:
    """Refresh all subscribed playlists across all users.

    Queries subscriptions with auto_sync=True, checks snapshot_id,
    only syncs playlists that have changed.
    """
    try:
        return run_async(_refresh_all_playlists())
    except Exception:
        logger.exception("refresh all playlists failed")
        return {"error": "Refresh failed"}


async def _refresh_all_playlists() -> dict:
    from otix.services.spotify_auth_service import get_user_access_token

    async with async_session() as session:
        from sqlalchemy import text
        result = await session.execute(
            text("""
                SELECT sps.user_id, sps.playlist_id, sps.playlist_name, sps.playlist_snapshot,
                       u.spotify_id, u.spotify_access_token, u.spotify_refresh_token, u.spotify_token_expires_at
                FROM spotify_playlist_subscriptions sps
                JOIN users u ON u.id = sps.user_id
                WHERE sps.auto_sync = true
                ORDER BY sps.last_synced_at ASC NULLS FIRST
                LIMIT 50
            """)
        )
        rows = result.all()

        total = 0
        synced = 0
        skipped = 0

        for row in rows:
            import uuid
            user_id = str(row.user_id) if not isinstance(row.user_id, str) else row.user_id

            # Build user object with enough data for get_user_access_token
            user = User(
                id=user_id,
                spotify_id=row.spotify_id,
                spotify_access_token=row.spotify_access_token,
                spotify_refresh_token=row.spotify_refresh_token,
                spotify_token_expires_at=row.spotify_token_expires_at,
            )

            token = await get_user_access_token(user)
            if token is None:
                skipped += 1
                continue

            total += 1
            redis = await get_redis()

            # Check if playlist has changed
            from otix.providers.spotify.client import SpotifyProvider
            spotify = SpotifyProvider(redis)
            current_snapshot = row.playlist_snapshot

            try:
                playlist_info = await spotify.get_playlist(token, row.playlist_id, fields="snapshot_id")
                new_snapshot = playlist_info.get("snapshot_id")
                if new_snapshot and new_snapshot == current_snapshot:
                    skipped += 1
                    continue
            except Exception:
                skipped += 1
                continue

            # Playlist changed — sync it
            task_id = uuid.uuid4().hex[:16]
            await sync_playlist_to_library(
                session, user, token,
                playlist_id=row.playlist_id,
                playlist_name=row.playlist_name or "Unknown",
                task_id=task_id,
            )

            # Update snapshot
            await session.execute(
                text("""
                    UPDATE spotify_playlist_subscriptions
                    SET playlist_snapshot = :snapshot,
                        last_synced_at = :now
                    WHERE user_id = :user_id AND playlist_id = :playlist_id
                """),
                {"snapshot": new_snapshot, "now": datetime.now(timezone.utc), "user_id": user_id, "playlist_id": row.playlist_id},
            )

            synced += 1

        await session.commit()
        logger.info("spotify playlists refresh completed", total=total, synced=synced, skipped=skipped)
        return {"total": total, "synced": synced, "skipped": skipped}
```

Make sure to add `from datetime import datetime, timezone` at the top of the file if not already present.

- [ ] **Step 2: Commit**

```bash
git add backend/otix/tasks/sync/spotify.py
git commit -m "feat(spotify): add Celery tasks for playlist sync and periodic refresh"
```

---

### Task 6: Register beat schedule and routing

**Files:**
- Modify: `backend/otix/infrastructure/celery.py`

- [ ] **Step 1: Add beat schedule entry**

Add to `_beat_schedule` dict (before the `app.config_from_object` call), after the existing "sync-spotify-recently-played" entry (~line 181):

```python
    # Spotify playlist refresh (every 6 hours at off-peak minute)
    "refresh-spotify-playlists": {
        "task": "sync.spotify.refresh_all_playlists",
        "schedule": crontab(hour="*/6", minute="37"),
    },
```

- [ ] **Step 2: Update routing**

The `route_task` function already routes `sync.spotify.*` to `reactive-user` queue (line 45-46). No routing change needed — playlist sync tasks start with `sync.spotify.*` and will match this route.

- [ ] **Step 3: Commit**

```bash
git add backend/otix/infrastructure/celery.py
git commit -m "feat(spotify): add beat schedule for playlist refresh every 6h"
```

---

### Task 7: Create API router for playlists

**Files:**
- Create: `backend/otix/api/spotify_playlists.py`
- Modify: `backend/otix/api/router.py`

- [ ] **Step 1: Create the API router**

```python
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
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Spotify session expired. Please reconnect.")
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
            text("SELECT playlist_id, auto_sync, last_synced_at FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = ANY(:pids)"),
            {"uid": current_user.id, "pids": playlist_ids},
        )
        subs = {row.playlist_id: {"subscribed": True, "auto_sync": row.auto_sync, "last_synced_at": row.last_synced_at.isoformat() if row.last_synced_at else None} for row in result}

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
        text("SELECT id, auto_sync, last_synced_at FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid"),
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
    celery_app.send_task("sync.spotify.sync_playlist", args=[current_user.id, playlist_id, name], kwargs={"task_id": task_id})

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
    token = await _require_spotify(current_user)

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
    token = await _require_spotify(current_user)

    result = await db.execute(
        text("SELECT playlist_name FROM spotify_playlist_subscriptions WHERE user_id = :uid AND playlist_id = :pid"),
        {"uid": current_user.id, "pid": playlist_id},
    )
    row = result.one_or_none()
    if not row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not subscribed to this playlist. Subscribe first.")

    task_id = uuid.uuid4().hex[:16]
    celery_app.send_task("sync.spotify.sync_playlist", args=[current_user.id, playlist_id, row.playlist_name], kwargs={"task_id": task_id})

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
        text("UPDATE spotify_playlist_subscriptions SET auto_sync = :auto WHERE id = :id AND user_id = :uid RETURNING id"),
        {"auto": auto_sync, "id": subscription_id, "uid": current_user.id},
    )
    if not result.one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Subscription not found")

    await db.commit()
    return {"message": "Subscription updated", "auto_sync": auto_sync}
```

- [ ] **Step 2: Register router in `router.py`**

Add import:
```python
from otix.api.spotify_playlists import spotify_playlists_router
```

Add to router tree (after the existing `library_router` line):
```python
api_router.include_router(spotify_playlists_router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/otix/api/spotify_playlists.py backend/otix/api/router.py
git commit -m "feat(spotify): add playlist API endpoints with subscribe/sync/unsubscribe"
```

---

### Task 8: Frontend — API hooks

**Files:**
- Create: `frontend/src/features/spotify/playlists/api/spotify-playlists-api.ts`

- [ ] **Step 1: Create API hooks file**

```typescript
import { queryOptions, useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { apiClient } from "@/lib/api-client"
import type { SpotifyPlaylist, SpotifyPlaylistDetail, PlaylistSubscription, PlaylistTrackItem } from "../types"

// ── Query keys ──

export const playlistKeys = {
  all: ["spotify-playlists"] as const,
  list: (params?: { limit?: number; offset?: number }) => ["spotify-playlists", "list", params] as const,
  detail: (id: string) => ["spotify-playlists", "detail", id] as const,
  subscriptions: () => ["spotify-playlists", "subscriptions"] as const,
}

// ── Queries ──

export function useSpotifyPlaylists(limit?: number, offset?: number) {
  return useQuery({
    queryKey: playlistKeys.list({ limit, offset }),
    queryFn: async () => {
      const params = new URLSearchParams()
      if (limit) params.set("limit", String(limit))
      if (offset) params.set("offset", String(offset))
      const res = await apiClient.get(`/library/spotify/playlists?${params.toString()}`)
      return res.data as { items: SpotifyPlaylist[]; total?: number }
    },
  })
}

export function useSpotifyPlaylist(id: string) {
  return useQuery({
    queryKey: playlistKeys.detail(id),
    queryFn: async () => {
      const res = await apiClient.get(`/library/spotify/playlists/${id}`)
      return res.data as SpotifyPlaylistDetail
    },
    enabled: !!id,
  })
}

export function usePlaylistSubscriptions() {
  return useQuery({
    queryKey: playlistKeys.subscriptions(),
    queryFn: async () => {
      const res = await apiClient.get("/library/spotify/playlists/subscriptions")
      return res.data as PlaylistSubscription[]
    },
  })
}

// ── Mutations ──

export function useSubscribePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/subscribe`)
      return res.data as { subscription_id: string; task_id: string; message: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
    },
  })
}

export function useUnsubscribePlaylist() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/unsubscribe`)
      return res.data as { message: string }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.all })
    },
  })
}

export function useSyncPlaylist() {
  return useMutation({
    mutationFn: async (playlistId: string) => {
      const res = await apiClient.post(`/library/spotify/playlists/${playlistId}/sync`)
      return res.data as { task_id: string; message: string }
    },
  })
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ subscriptionId, autoSync }: { subscriptionId: string; autoSync: boolean }) => {
      const res = await apiClient.put(
        `/library/spotify/playlists/subscriptions/${subscriptionId}?auto_sync=${autoSync}`
      )
      return res.data as { message: string; auto_sync: boolean }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: playlistKeys.subscriptions() })
    },
  })
}
```

- [ ] **Step 2: Create types file for playlists**

Create `frontend/src/features/spotify/playlists/types.ts`:

```typescript
export interface SpotifyPlaylistImage {
  url: string
  height?: number
  width?: number
}

export interface SpotifyPlaylistOwner {
  id: string
  display_name?: string
  uri?: string
}

export interface PlaylistSubscriptionInfo {
  subscribed: boolean
  subscription_id?: string
  auto_sync?: boolean
  last_synced_at?: string | null
}

export interface SpotifyPlaylist {
  id: string
  name: string
  description?: string
  images?: SpotifyPlaylistImage[]
  owner?: SpotifyPlaylistOwner
  tracks?: { total: number }
  public?: boolean
  collaborative?: boolean
  uri?: string
  snapshot_id?: string
  _subscription?: PlaylistSubscriptionInfo
}

export interface SpotifyPlaylistTrack {
  added_at: string
  track: {
    id: string
    name: string
    uri: string
    duration_ms: number
    artists: Array<{ id: string; name: string; uri: string }>
    album: {
      id: string
      name: string
      images?: SpotifyPlaylistImage[]
      uri?: string
    }
    track_number?: number
    disc_number?: number
  } | null
}

export interface SpotifyPlaylistDetail extends SpotifyPlaylist {
  tracks: {
    items: SpotifyPlaylistTrack[]
    total: number
    limit: number
    offset: number
  }
  _subscription?: PlaylistSubscriptionInfo
}

export interface PlaylistSubscription {
  id: string
  playlist_id: string
  playlist_name: string | null
  playlist_owner: string | null
  auto_sync: boolean
  last_synced_at: string | null
  created_at: string
}
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/spotify/playlists/api/spotify-playlists-api.ts frontend/src/features/spotify/playlists/types.ts
git commit -m "feat(spotify): add playlist API hooks and types"
```

---

### Task 9: Frontend — UI components

**Files:**
- Create: `frontend/src/features/spotify/playlists/molecules/playlist-card.tsx`
- Create: `frontend/src/features/spotify/playlists/molecules/playlist-track-row.tsx`
- Create: `frontend/src/features/spotify/playlists/organisms/playlist-list.tsx`
- Create: `frontend/src/features/spotify/playlists/organisms/playlist-detail.tsx`
- Create: `frontend/src/features/spotify/playlists/organisms/playlist-sync-panel.tsx`

- [ ] **Step 1: Create `playlist-card.tsx`**

```tsx
import { useNavigate } from "@tanstack/react-router"
import { cn } from "@/lib/utils"
import type { SpotifyPlaylist } from "../types"

interface PlaylistCardProps {
  playlist: SpotifyPlaylist
  className?: string
}

export function PlaylistCard({ playlist, className }: PlaylistCardProps) {
  const navigate = useNavigate()
  const image = playlist.images?.[0]?.url
  const trackCount = playlist.tracks?.total ?? 0
  const isSubscribed = playlist._subscription?.subscribed ?? false

  return (
    <button
      onClick={() => navigate({ to: "/library/spotify/playlists/$id", params: { id: playlist.id } })}
      className={cn(
        "group relative flex flex-col rounded-xl overflow-hidden transition-all duration-200",
        "bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-hover)]",
        "border border-transparent hover:border-primary/20",
        "text-left",
        className,
      )}
    >
      <div className="aspect-square overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={playlist.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center bg-muted text-muted-foreground">
            <MusicIcon className="h-12 w-12" />
          </div>
        )}
      </div>
      <div className="p-3 space-y-1">
        <h3 className="font-semibold text-sm truncate">{playlist.name}</h3>
        <p className="text-xs text-muted-foreground truncate">
          {trackCount} track{trackCount !== 1 ? "s" : ""}
          {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
        </p>
        {isSubscribed && (
          <span className="inline-flex items-center gap-1 text-xs text-primary">
            <CheckCircle2Icon className="h-3 w-3" />
            Subscribed
          </span>
        )}
      </div>
    </button>
  )
}

import { CheckCircle2Icon, MusicIcon } from "lucide-react"
```

- [ ] **Step 2: Create `playlist-track-row.tsx`**

```tsx
import { PauseIcon, PlayIcon } from "lucide-react"
import { cn, formatDuration } from "@/lib/utils"
import type { SpotifyPlaylistTrack } from "../types"

interface PlaylistTrackRowProps {
  track: SpotifyPlaylistTrack
  index: number
  isPlaying?: boolean
  onPlay: (uri: string) => void
  className?: string
}

export function PlaylistTrackRow({ track, index, isPlaying, onPlay, className }: PlaylistTrackRowProps) {
  const t = track.track
  if (!t) return null

  const image = t.album?.images?.[2]?.url ?? t.album?.images?.[0]?.url
  const artists = t.artists?.map(a => a.name).join(", ") ?? "Unknown Artist"

  return (
    <div
      className={cn(
        "group grid grid-cols-[auto_1fr_auto] gap-3 items-center px-3 py-2 rounded-lg transition-colors",
        "hover:bg-[var(--dk-surface-glass)]",
        isPlaying && "bg-primary/5",
        className,
      )}
    >
      <button
        onClick={() => onPlay(t.uri)}
        className="relative flex items-center justify-center w-8 h-8 shrink-0"
        title={`Play ${t.name}`}
      >
        <span className="group-hover:hidden text-sm text-muted-foreground w-4 text-right">
          {index + 1}
        </span>
        <span className="hidden group-hover:flex items-center justify-center w-full h-full text-foreground">
          {isPlaying ? <PauseIcon className="h-4 w-4" /> : <PlayIcon className="h-4 w-4" />}
        </span>
      </button>

      <div className="flex items-center gap-3 min-w-0">
        {image && (
          <img src={image} alt="" className="h-10 w-10 rounded object-cover shrink-0" />
        )}
        <div className="min-w-0">
          <p className={cn("text-sm font-medium truncate", isPlaying && "text-primary")}>
            {t.name}
          </p>
          <p className="text-xs text-muted-foreground truncate">{artists}</p>
        </div>
      </div>

      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {t.duration_ms ? formatDuration(t.duration_ms) : "—"}
      </span>
    </div>
  )
}
```

- [ ] **Step 3: Create `playlist-list.tsx`**

```tsx
import type { SpotifyPlaylist } from "../types"
import { PlaylistCard } from "../molecules/playlist-card"

interface PlaylistListProps {
  playlists: SpotifyPlaylist[]
  isLoading?: boolean
}

export function PlaylistList({ playlists, isLoading }: PlaylistListProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[3/4] rounded-xl bg-[var(--dk-surface-glass)] animate-pulse" />
        ))}
      </div>
    )
  }

  if (!playlists.length) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
        <MusicIcon className="h-12 w-12 mb-4 opacity-40" />
        <p className="text-lg font-medium">No playlists found</p>
        <p className="text-sm">Create a playlist on Spotify to see it here.</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {playlists.map((playlist) => (
        <PlaylistCard key={playlist.id} playlist={playlist} />
      ))}
    </div>
  )
}

import { MusicIcon } from "lucide-react"
```

- [ ] **Step 4: Create `playlist-detail.tsx`**

```tsx
import { useState } from "react"
import { PlayIcon } from "lucide-react"
import type { SpotifyPlaylistDetail, SpotifyPlaylistTrack } from "../types"
import { PlaylistTrackRow } from "../molecules/playlist-track-row"
import { PlaylistSyncPanel } from "./playlist-sync-panel"
import { usePlayer } from "@/features/spotify/use-player"

interface PlaylistDetailProps {
  playlist: SpotifyPlaylistDetail
  onSubscribe: () => void
  onUnsubscribe: () => void
  onSync: () => void
  isSubscribed: boolean
  isSyncing?: boolean
}

export function PlaylistDetail({ playlist, onSubscribe, onUnsubscribe, onSync, isSubscribed, isSyncing }: PlaylistDetailProps) {
  const { playSpotify, currentTrack } = usePlayer()
  const image = playlist.images?.[0]?.url
  const trackCount = playlist.tracks?.total ?? 0
  const tracks: SpotifyPlaylistTrack[] = playlist.tracks?.items ?? []

  const handlePlayTrack = (uri: string) => {
    playSpotify(uri)
  }

  const handlePlayAll = () => {
    const uris = tracks.map(t => t.track?.uri).filter(Boolean) as string[]
    if (uris.length > 0) {
      playSpotify(uris[0])
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-6 items-end">
        {image ? (
          <img src={image} alt={playlist.name} className="h-48 w-48 rounded-xl object-cover shadow-lg" />
        ) : (
          <div className="h-48 w-48 rounded-xl bg-muted flex items-center justify-center">
            <MusicIcon className="h-16 w-16 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Playlist</p>
          <h1 className="text-3xl font-bold truncate mt-1">{playlist.name}</h1>
          {playlist.description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{playlist.description}</p>
          )}
          <p className="text-sm text-muted-foreground mt-2">
            {trackCount} track{trackCount !== 1 ? "s" : ""}
            {playlist.owner?.display_name ? ` · ${playlist.owner.display_name}` : ""}
          </p>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handlePlayAll}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <PlayIcon className="h-4 w-4" />
              Play all
            </button>
            <PlaylistSyncPanel
              isSubscribed={isSubscribed}
              isSyncing={isSyncing}
              onSubscribe={onSubscribe}
              onUnsubscribe={onUnsubscribe}
              onSync={onSync}
              lastSyncedAt={playlist._subscription?.last_synced_at ?? null}
            />
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className="space-y-1">
        {tracks.map((track, i) => (
          <PlaylistTrackRow
            key={`${track.track?.id}-${i}`}
            track={track}
            index={i}
            isPlaying={currentTrack?.id === track.track?.id}
            onPlay={handlePlayTrack}
          />
        ))}
      </div>
    </div>
  )
}

import { MusicIcon } from "lucide-react"
```

- [ ] **Step 5: Create `playlist-sync-panel.tsx`**

```tsx
import { RefreshCw, CheckCircle2, Loader2, Bell, BellOff } from "lucide-react"
import { cn } from "@/lib/utils"

interface PlaylistSyncPanelProps {
  isSubscribed: boolean
  isSyncing?: boolean
  onSubscribe: () => void
  onUnsubscribe: () => void
  onSync: () => void
  lastSyncedAt: string | null
}

export function PlaylistSyncPanel({ isSubscribed, isSyncing, onSubscribe, onUnsubscribe, onSync, lastSyncedAt }: PlaylistSyncPanelProps) {
  if (isSubscribed) {
    return (
      <div className="inline-flex items-center gap-2">
        <button
          onClick={onSync}
          disabled={isSyncing}
          className={cn(
            "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
            "border border-border hover:bg-[var(--dk-surface-glass)]",
            isSyncing && "opacity-50 cursor-not-allowed",
          )}
          title="Sync now"
        >
          <RefreshCw className={cn("h-4 w-4", isSyncing && "animate-spin")} />
          {isSyncing ? "Syncing..." : "Sync"}
        </button>
        <button
          onClick={onUnsubscribe}
          className="inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors text-muted-foreground hover:text-destructive hover:bg-destructive/10"
          title="Unsubscribe"
        >
          <BellOff className="h-4 w-4" />
          Unsubscribe
        </button>
        {lastSyncedAt && !isSyncing && (
          <span className="text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3 inline mr-1" />
            Synced
          </span>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={onSubscribe}
      disabled={isSyncing}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
        "border border-primary/30 text-primary hover:bg-primary/10",
      )}
    >
      <Bell className="h-4 w-4" />
      Subscribe
    </button>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/features/spotify/playlists/molecules/ frontend/src/features/spotify/playlists/organisms/
git commit -m "feat(spotify): add playlist UI components"
```

---

### Task 10: Frontend — Pages and routing

**Files:**
- Create: `frontend/src/features/spotify/playlists/pages/spotify-playlists-page.tsx`
- Create: `frontend/src/features/spotify/playlists/pages/spotify-playlist-detail-page.tsx`
- Modify: `frontend/src/lib/router.tsx`

- [ ] **Step 1: Create playlists list page**

```tsx
import { Helmet } from "react-helmet-async"
import { useSpotifyPlaylists } from "../api/spotify-playlists-api"
import { PlaylistList } from "../organisms/playlist-list"

export function SpotifyPlaylistsPage() {
  const { data, isLoading, error } = useSpotifyPlaylists()

  return (
    <div className="container mx-auto py-8 px-4">
      <Helmet>
        <title>Spotify Playlists — Otix</title>
      </Helmet>

      <div className="mb-8">
        <h1 className="text-2xl font-bold">Spotify Playlists</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Browse your Spotify playlists and import them into Otix
        </p>
      </div>

      {error ? (
        <div className="rounded-xl bg-destructive/10 p-6 text-destructive text-center">
          <p className="font-medium">Failed to load playlists</p>
          <p className="text-sm mt-1">Make sure your Spotify account is linked in Settings.</p>
        </div>
      ) : (
        <PlaylistList
          playlists={data?.items ?? []}
          isLoading={isLoading}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create playlist detail page**

```tsx
import { useState } from "react"
import { Helmet } from "react-helmet-async"
import { useParams, useNavigate } from "@tanstack/react-router"
import { ArrowLeft } from "lucide-react"
import { useSpotifyPlaylist, useSubscribePlaylist, useUnsubscribePlaylist, useSyncPlaylist } from "../api/spotify-playlists-api"
import { PlaylistDetail } from "../organisms/playlist-detail"
import { LoadingPage } from "@ui/organisms/loading-page"

export function SpotifyPlaylistDetailPage() {
  const { id } = useParams({ from: "/library/spotify/playlists/$id" })
  const navigate = useNavigate()
  const { data: playlist, isLoading, error } = useSpotifyPlaylist(id)
  const subscribeMutation = useSubscribePlaylist()
  const unsubscribeMutation = useUnsubscribePlaylist()
  const syncMutation = useSyncPlaylist()

  const [isSyncing, setIsSyncing] = useState(false)

  if (isLoading) return <LoadingPage />

  if (error || !playlist) {
    return (
      <div className="container mx-auto py-8 px-4">
        <div className="rounded-xl bg-destructive/10 p-6 text-destructive text-center">
          <p className="font-medium">Failed to load playlist</p>
        </div>
      </div>
    )
  }

  const isSubscribed = playlist._subscription?.subscribed ?? false

  const handleSubscribe = async () => {
    await subscribeMutation.mutateAsync(id)
  }

  const handleUnsubscribe = async () => {
    await unsubscribeMutation.mutateAsync(id)
  }

  const handleSync = async () => {
    setIsSyncing(true)
    try {
      await syncMutation.mutateAsync(id)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <Helmet>
        <title>{playlist.name} — Spotify Playlists — Otix</title>
      </Helmet>

      <button
        onClick={() => navigate({ to: "/library/spotify/playlists" })}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to playlists
      </button>

      <PlaylistDetail
        playlist={playlist}
        isSubscribed={isSubscribed}
        isSyncing={isSyncing || subscribeMutation.isPending}
        onSubscribe={handleSubscribe}
        onUnsubscribe={handleUnsubscribe}
        onSync={handleSync}
      />
    </div>
  )
}
```

- [ ] **Step 3: Add routes**

Add to `router.tsx`:

```typescript
// Add lazy imports
const SpotifyPlaylistsPage = lazy(() => import("@/features/spotify/playlists/pages/spotify-playlists-page").then(m => ({ default: m.SpotifyPlaylistsPage })))
const SpotifyPlaylistDetailPage = lazy(() => import("@/features/spotify/playlists/pages/spotify-playlist-detail-page").then(m => ({ default: m.SpotifyPlaylistDetailPage })))

// Add routes
const spotifyPlaylistsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/spotify/playlists",
  component: SpotifyPlaylistsPage,
})

const spotifyPlaylistDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library/spotify/playlists/$id",
  component: SpotifyPlaylistDetailPage,
})

// Add to routeTree
// Add spotifyPlaylistsRoute, spotifyPlaylistDetailRoute to the addChildren array
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/features/spotify/playlists/pages/ frontend/src/lib/router.tsx
git commit -m "feat(spotify): add playlist pages and routing"
```

---

### Task 11: Re-link flow for existing Spotify users

**Files:**
- Review: `backend/otix/services/spotify_auth_service.py`
- No code change needed — scopes were updated in Task 1

When users who already linked Spotify visit settings, detect that their current token lacks playlist scopes. Optionally show a "Re-link Spotify" prompt.

- [ ] **Step 1: Add scope verification (optional enhancement)**

In the settings page frontend or `spotify_auth_service`, add a check: after token refresh, call `GET /me` and check if the token has playlist scopes. If not, prompt re-link.

This is a nice-to-have enhancement. The basic flow works: existing users can unlink/re-link to get new scopes.

---

## Spec Coverage Check

- **Playlist scopes** → Task 1 ✓
- **Client methods** (get_user_playlists, get_playlist, get_playlist_tracks) → Task 2 ✓
- **DB table** (spotify_playlist_subscriptions) → Task 3 ✓
- **SpotifyPlaylistService** (fetch playlists, fetch tracks, sync to library) → Task 4 ✓
- **Celery tasks** (sync_playlist + refresh_all_playlists) → Task 5 ✓
- **Beat schedule** (every 6h) + routing → Task 6 ✓
- **API endpoints** (7 endpoints: list, detail, subscribe, unsubscribe, sync, subscriptions, update) → Task 7 ✓
- **Frontend API hooks** → Task 8 ✓
- **Frontend UI components** (card, track row, list, detail, sync panel) → Task 9 ✓
- **Frontend pages + routing** → Task 10 ✓
- **Re-link flow** → Task 11 ✓

All spec requirements covered. No placeholders.

---

## Execution Handoff

Plan complete and saved. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — execute tasks in this session with checkpoints

Which approach?
