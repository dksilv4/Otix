# Spotify Playlist Sync — Design Spec

## Overview

Add full Spotify playlist support to Otix: browse playlists, subscribe to them, sync tracks/albums into the media library, and auto-refresh on schedule. Follows existing patterns from `spotify_library_service.py` (liked tracks, recently played).

## New Scopes

Add to `SCOPES` in `backend/otix/services/spotify_auth_service.py`:

```
"playlist-read-private",
"playlist-read-collaborative",
```

Users with existing Spotify links must re-link to grant new scopes.

## Database

### `spotify_playlist_subscriptions`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | `gen_random_uuid()` |
| user_id | UUID FK → users(id) | CASCADE delete |
| playlist_id | VARCHAR(255) | Spotify playlist ID |
| playlist_name | VARCHAR(512) | Cached at subscribe time |
| playlist_owner | VARCHAR(255) | Cached at subscribe time |
| playlist_snapshot | VARCHAR(255) | Spotify `snapshot_id` — used for change detection |
| auto_sync | BOOLEAN | Default true — refresh on schedule |
| last_synced_at | TIMESTAMPTZ | Null until first sync |
| created_at | TIMESTAMPTZ | Default now() |

**UNIQUE**(user_id, playlist_id).

## Spotify Client (`client.py`)

Add to `SpotifyProvider`:

```python
async def get_user_playlists(
    self, access_token: str, limit: int = 50, offset: int = 0
) -> dict:
    """GET /me/playlists. Returns {items: [...], total, ...}"""
    return await self._user_request(
        access_token, "me/playlists",
        {"limit": limit, "offset": offset},
    )

async def get_playlist(
    self, access_token: str, playlist_id: str,
    fields: str | None = None,
) -> dict:
    """GET /playlists/{id}. Optionally filter response fields."""
    params = {}
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

Spotify max per-page for playlist tracks is 100 items.

## Service: `SpotifyPlaylistService`

File: `backend/otix/services/spotify_playlist_service.py`

Pattern mirrors `SpotifyLibraryService`:

### `fetch_all_user_playlists(access_token) -> list[dict]`

Paginated `GET /me/playlists` (limit=50). Returns all playlists the user owns or follows.

### `fetch_all_playlist_tracks(access_token, playlist_id) -> list[dict]`

Paginated `GET /playlists/{id}/tracks` (limit=100). Returns all track items.

### `sync_playlist_to_library(session, user, access_token, playlist_id, playlist_name, task_id=None) -> dict`

1. Fetch all playlist tracks
2. Extract track IDs → batch-match via `ExternalID` (entity_type="track", provider="spotify")
3. For unmatched tracks, extract album IDs → check `ExternalID` for albums
4. For missing albums → call `_seed_album_from_spotify()` (existing helper)
5. Create `listened` interactions for matched tracks
6. Store snapshot_id in subscription row for change detection
7. Return summary: `{total_tracks, matched, seeded}`

Publishes SSE progress (same `spotify_progress` module as liked-tracks sync).

### `sync_all_subscribed_playlists(session, user, access_token) -> list[dict]`

Iterate all subscriptions for user with `auto_sync=True`. Check each playlist's `snapshot_id` via `GET /playlists/{id}?fields=snapshot_id`. Skip if unchanged. Sync changed playlists.

### `check_playlist_changed(access_token, playlist_id, known_snapshot) -> bool`

Lightweight HEAD-style check — fetch just `snapshot_id` field.

## Alembic Migration

New migration: create `spotify_playlist_subscriptions` table.

## API Endpoints

File: `backend/otix/api/spotify_playlists.py` (new router)

| Method | Path | Handler | Notes |
|---|---|---|---|
| GET | `/api/library/spotify/playlists` | `list_playlists` | Proxy to Spotify, annotate subscription status |
| GET | `/api/library/spotify/playlists/{playlist_id}` | `get_playlist_detail` | Playlist metadata + first track page |
| POST | `/api/library/spotify/playlists/{playlist_id}/subscribe` | `subscribe_playlist` | Create subscription + trigger sync |
| POST | `/api/library/spotify/playlists/{playlist_id}/unsubscribe` | `unsubscribe_playlist` | Remove subscription |
| POST | `/api/library/spotify/playlists/{playlist_id}/sync` | `sync_playlist` | Manual resync, returns task_id |
| GET | `/api/library/spotify/playlists/subscriptions` | `list_subscriptions` | User's subscribed playlists |
| PUT | `/api/library/spotify/playlists/subscriptions/{sub_id}` | `update_subscription` | Toggle auto_sync |

All require authenticated user with linked Spotify. `get_user_access_token()` handles refresh.

SSE progress at existing `/api/tasks/{task_id}/progress` endpoint.

## Celery Tasks

### `sync.spotify.sync_playlist` (single task)

- Args: `user_id, playlist_id, playlist_name`
- Calls `SpotifyPlaylistService.sync_playlist_to_library()`
- Updates subscription `last_synced_at` and `playlist_snapshot`

### `sync.spotify.refresh_all_playlists` (beat task)

- Runs every 6 hours (`crontab(hour="*/6")`)
- Queries all subscriptions with `auto_sync=True`
- For each: check snapshot, sync if changed
- Rate-limits: processes N subscriptions per tick to avoid Spotify rate limits

### Redis concurrency lock

Use `SET NX` with TTL on `spotify:playlists:lock:{playlist_id}` to prevent concurrent sync of same playlist.

## Frontend

### New feature folder: `frontend/src/features/spotify/playlists/`

```
playlists/
├── pages/
│   ├── spotify-playlists-page.tsx
│   └── spotify-playlist-detail-page.tsx
├── organisms/
│   ├── playlist-list.tsx
│   ├── playlist-detail.tsx
│   └── playlist-sync-panel.tsx
├── molecules/
│   ├── playlist-card.tsx
│   └── playlist-track-row.tsx
└── api/
    └── spotify-playlists-api.ts
```

### Component tree

```
SpotifyPlaylistsPage
  └── PlaylistList
       └── PlaylistCard[]      ← cover, name, owner, track count, subscribe button

SpotifyPlaylistDetailPage
  ├── PlaylistDetail           ← metadata header + subscribe/unsubscribe + sync status
  │   └── PlaylistSyncPanel    ← "Sync now" button, last synced, loading state
  └── PlaylistTrackRow[]       ← album art, title, artist, album link, play button
```

### API hooks (`spotify-playlists-api.ts`)

- `useSpotifyPlaylists()` — `GET /playlists`
- `useSpotifyPlaylist(id)` — `GET /playlists/{id}`
- `useSubscribePlaylist()` — `POST /playlists/{id}/subscribe`
- `useUnsubscribePlaylist()` — `POST /playlists/{id}/unsubscribe`
- `useSyncPlaylist()` — `POST /playlists/{id}/sync` (triggers task)
- `usePlaylistSubscriptions()` — `GET /playlists/subscriptions`
- `useUpdateSubscription()` — `PUT /playlists/subscriptions/{id}`

### Integration

- Add "Spotify Playlists" nav link in settings or library sidebar
- Playlist tracks play via existing `playSpotify(spotifyUri)` from player context
- Sync progress shows via existing SSE-based task progress component

## Error Handling

| Scenario | Behavior |
|---|---|
| Spotify token expired | `get_user_access_token()` refreshes; if refresh fails, return 401 "re-link" |
| Playlist deleted/missing | Return 404, auto-unsubscribe |
| Concurrent sync | Redis lock prevents; return 409 "sync in progress" |
| Spotify API rate limit | Handled by existing `BaseProvider` token bucket |
| User unlinks Spotify | Cascade-delete subscriptions (DB CASCADE) |

## Data Flow: Subscribe → Sync

```
User clicks "Subscribe" on playlist
  → POST /playlists/{id}/subscribe
    → Create subscription row (snapshot_id cached)
    → Dispatch Celery task: sync.spotify.sync_playlist
    → Return {subscription, task_id}
  → Frontend polls task progress via SSE
  → Sync task:
    1. Fetch all playlist tracks (paginated)
    2. Batch-match track IDs via ExternalID
    3. For unmatched: extract album IDs → check ExternalID
    4. Seed missing albums via _seed_album_from_spotify
    5. Create "listened" interactions for matched albums
    6. Update subscription: last_synced_at, playlist_snapshot
  → SSE emits: sync_complete {total_tracks, matched, seeded}
```

## Future Considerations (out of scope)

- Collaborative playlist suggestions between friends
- Playlist creation/manipulation from within Otix
- Two-way sync (Otix → Spotify)

---

## Spec Self-Review

- **Placeholder scan:** All sections complete. No TBDs or TODOs.
- **Internal consistency:** Auth flow, client methods, service, API, frontend all align. Patterns match existing liked-tracks/recently-played sync.
- **Scope check:** Focused on one feature — Spotify playlist read + sync. No scope creep.
- **Ambiguity check:** Data flow, error handling, and scheduling are explicit. No ambiguous requirements.
