# Music Implementation Plan for Otix

## Context

Otix currently supports three media types — `movie`, `show`, `game` — each with a full feature surface: detail pages, reviews, ratings, interactions, lists, library tabs, provider integrations (OAuth), external ratings, cast/crew, and Celery-based catalog seeding/enrichment. The goal is to add music with the same feature depth and the same architectural patterns.

The existing pipeline for every media type is: **Provider Client (HTTP) → Transformer (pure functions) → Hydrator (DB persistence)**, with multi-stage enrichment cascades (e.g., IGDB → Steam → SteamGridDB for games). We replicate this for music.

---

## Phase 1: Domain Model (Backend)

### 1a. Update `media_type` CHECK constraint
**File:** `backend/otix/domain/media.py`
- Change `media_type IN ('movie', 'show', 'game')` → `media_type IN ('movie', 'show', 'game', 'music')`

### 1b. Add `Album` model (1:1 with MediaItem, like Movie/Show/Game)
**File:** `backend/otix/domain/media.py`

```python
class Album(Base, TimestampMixin):
    __tablename__ = "albums"
    media_item_id = Column(otix_fk, ForeignKey("media_items.id"), primary_key=True)
    release_type = Column(String(20))          # album, single, ep, compilation, live, soundtrack, remix
    format = Column(String(50), nullable=True)  # Digital, CD, Vinyl, Cassette, etc.
    catalog_number = Column(String(100), nullable=True)
    barcode = Column(String(50), nullable=True)
    track_count = Column(Integer, default=0)
    disc_count = Column(Integer, default=0)
    duration_ms = Column(Integer, nullable=True)
    spotify_id = Column(String(50), unique=True, nullable=True)
    musicbrainz_id = Column(String(36), unique=True, nullable=True)  # UUID
    spotify_url = Column(String(500), nullable=True)
    spotify_popularity = Column(Integer, nullable=True)
    preview_url = Column(String(500), nullable=True)
    # Audio features (JSON blob - mirrors game.price_json pattern)
    audio_features = Column(JSONB, nullable=True)
```

### 1c. Add `Track` model
**File:** `backend/otix/domain/media.py`

```python
class Track(Base, TimestampMixin):
    __tablename__ = "tracks"
    id = Column(otix_pk, primary_key=True)
    album_id = Column(otix_fk, ForeignKey("albums.media_item_id"), nullable=False)
    track_number = Column(Integer, nullable=False)
    disc_number = Column(Integer, default=1)
    title = Column(String(500), nullable=False)
    duration_ms = Column(Integer, nullable=True)
    preview_url = Column(String(500), nullable=True)
    spotify_id = Column(String(50), unique=True, nullable=True)
    musicbrainz_recording_id = Column(String(36), unique=True, nullable=True)
    # Per-track audio features (nullable - populated from Spotify)
    audio_features = Column(JSONB, nullable=True)
```

### 1d. Add artist linkage (reuse + extend)
- Reuse `people` table — add `musicbrainz_artist_id` and `spotify_artist_id` columns
- Reuse `media_credits` junction — the `role` field already supports arbitrary strings (we'd use `'primary'` for the main artist, `'featured'` for features, `'producer'`, etc.)
- Reuse `companies` table for record labels (linked via `involved_companies`)

### 1e. Add interaction types
**File:** `backend/otix/domain/interaction.py`
- Add `'listened'` to the CHECK constraint: `IN ('rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed', 'started', 'listened')`

### 1f. Create Alembic migration
- New migration for all schema changes above

---

## Phase 2: Music Providers (Backend)

### Provider A: MusicBrainz (Primary — like IGDB for games)

**Directory:** `backend/otix/providers/musicbrainz/`

**Why MusicBrainz:** Free/open, no API key required, comprehensive metadata, database dumps available for seeding (like TMDb person_ids export), Cover Art Archive for images.

**client.py:**
- REST API to `musicbrainz.org/ws/2/`
- Endpoints: `get_release(mbid)`, `get_artist(mbid)`, `get_recording(mbid)`, `search_release(query)`, `search_artist(query)`, `browse_releases_by_artist(mbid)`, `browse_recordings_by_release(mbid)`
- Rate limit: 1 rps (MusicBrainz limit), extend `BaseProvider`
- Cover Art Archive client for album artwork (`coverartarchive.org`)

**transformer.py:**
- `to_album(raw)` → Album + MediaItem (title, release_date, release_type from `release-group` type, track_count, musicbrainz_id)
- `to_tracks(raw)` → list of Track (from `mediums[].tracks[]`)
- `to_artist(raw)` → Person (name, musicbrainz_artist_id, bio from tags, disambiguation)
- `_release_type_map` — maps MusicBrainz `release-group` primary types to our enum

**hydrator.py:**
- `hydrate_all(item, raw)` — tracks, artists, label, genres, cover art, external IDs
- `hydrate_tracks(item, raw)` — upsert tracks with MusicBrainz recording IDs
- `hydrate_artists(item, raw)` — upsert Person + MediaCredit links with role='primary' or 'featured'
- `hydrate_label(item, raw)` — upsert Company + InvolvedCompany for the record label
- `hydrate_genres(item, raw)` — MusicBrainz tags → Genre rows
- `hydrate_cover_art(item, mbid)` — Cover Art Archive images → MediaAsset (front/back covers)

### Provider B: Spotify (Enrichment — like Steam for games)

**Directory:** `backend/otix/providers/spotify/`

**Why Spotify:** Audio features (tempo, energy, danceability — unique differentiator), high-quality album art, popularity metrics, preview URLs, user library OAuth (like Steam library scan), massive catalog.

**client.py:**
- OAuth2 Client Credentials (server-to-server) for catalog access
- OAuth2 Authorization Code (user) for library access
- Endpoints: `get_album(id)`, `get_artist(id)`, `get_track(id)`, `search()`, `get_album_tracks(id)`, `get_audio_features(id)`, `get_user_saved_albums()`, `get_user_top_tracks()`
- Token management with Redis caching (pattern from IGDB client)

**transformer.py:**
- `extract_audio_features(raw)` → dict of tempo, key, mode, energy, danceability, valence, acousticness, instrumentalness, liveness, speechiness, loudness
- `extract_artist_ids(raw)` → list of Spotify artist IDs
- `extract_popularity(raw)` → int 0-100

**hydrator.py:**
- `hydrate(game)` pattern — fetches Spotify data for an album already saved from MusicBrainz
- Hydrates: `spotify_id`, `spotify_url`, `spotify_popularity`, `preview_url`, `audio_features` on Album
- Updates track `spotify_id` and per-track `audio_features`
- Cross-reference: search Spotify by MusicBrainz ID or artist+album name

### Provider C: Last.fm (Social/Discovery — like TMDb ratings for movies)

**Directory:** `backend/otix/providers/lastfm/`

**Why Last.fm:** Similar artists, top tracks/albums, user scrobbling history (listening tracking), community tags/genres, wiki summaries.

**client.py:**
- API key auth (query param)
- Endpoints: `album.getInfo()`, `artist.getInfo()`, `artist.getSimilar()`, `album.getTopTags()`, `user.getRecentTracks()`, `user.getTopAlbums()`
- Rate limit: 5 rps

**transformer.py:**
- `extract_wiki_summary(raw)` → overview text
- `extract_similar_artists(raw)` → list of names + match scores
- `extract_tags(raw)` → genre/style tags

**hydrator.py:**
- `hydrate_album(item)` — updates overview from Last.fm wiki, stores tags as genres, stores Last.fm playcount + listeners as ExternalRating

---

## Phase 3: Celery Tasks & Seeding (Backend)

### 3a. Sync tasks
**File:** `backend/otix/tasks/sync.py`

- `sync.musicbrainz.album(otix_id, mbid)` — fetch → hash check → transform → upsert → hydrate (tracks, artists, label, genres, cover art) → enqueue Spotify enrichment + Last.fm enrichment
- `sync.spotify.enrich_album(otix_id, spotify_id)` — fetch audio features, popularity, preview URLs, album art
- `sync.lastfm.enrich_album(otix_id, artist_name, album_name)` — fetch wiki, tags, similar artists

### 3b. Beat schedule additions
**File:** `backend/otix/infrastructure/celery.py`

- Every 5 min: `seed.musicbrainz_releases` (new releases)
- Every 30 min: `enrich_spotify`, `enrich_lastfm`
- Daily at 4am: `seed.musicbrainz_full` (database dump import — like TMDB daily people export)

### 3c. Catalog seeding
**File:** `backend/otix/tasks/catalog_seed.py`

- `seed.musicbrainz_releases` — incrementally fetch recently added/updated releases via MusicBrainz `replication` endpoint
- `seed.musicbrainz_full` — download MusicBrainz data dumps (or use their Live Data Feed / replication packets)

### 3d. Spotify library sync (user-facing)
**File:** `backend/otix/services/spotify_library_service.py` (mirrors `steam_library_service.py`)

- `scan_spotify_library(db, user)` — fetch saved albums via Spotify API, match by spotify_id, sync new albums from Spotify → MusicBrainz for any unmatched
- `get_spotify_library(db, user_id)` — return user's saved albums with listen data
- Library tab: `GET /library/spotify`

### 3e. Search backfill
- Add MusicBrainz + Spotify search to `search.backfill` task

---

## Phase 4: API Endpoints (Backend)

### 4a. Media API updates
**File:** `backend/otix/api/media.py`
- `GET /media` — add `'music'` to media_type filter
- `GET /media/search` — already works cross-type via `search_vector`
- `GET /media/{id}` — add Album joined load with tracks, audio features

### 4b. Library API
**File:** `backend/otix/api/library.py`
- Add `GET /library/listened` tab
- Add `GET /library/spotify` with saved albums
- Add `GET /library/spotify/status` with item count + last scan

### 4c. Auth / OAuth
**File:** `backend/otix/api/auth.py`
- Add Spotify OAuth callback: `/auth/spotify/connect/callback` (pattern from Steam/Plex/TMDb)

### 4d. Pydantic schemas
**File:** `backend/otix/api/schemas/`
- `AlbumDetail` — extend `MediaItemDetail` with album fields + tracks + audio_features
- `TrackOut` — track summary for API responses
- `AlbumSummary` — list view

---

## Phase 5: Frontend

### 5a. Type registration (pervasive)
Add `'music'` to the `mediaType` union across:
- `frontend/src/features/media/media-queries.ts` (types)
- Route params (`$mediaType`)
- InteractionButtons (`showFor` field)
- `mediaTypeColor` maps
- Browse type tabs
- Discover query filters
- Library tabs

### 5b. MusicSection (type-specific detail section)
**New file:** `frontend/src/features/media/organisms/music-section.tsx`

Mirrors `GameSection`/`MovieSection`/`ShowSection` (naming follows the `[mediaType]-section.tsx` convention):
- Track listing table with: track #, title, duration, audio preview button, popularity bar
- Release info: type, format, label, catalog number, barcode
- Audio features visualization (like episode heatmap): tempo, energy, danceability, valence as colored bars or radar chart
- Spotify link, MusicBrainz link
- Artist credits with photos (reuse cast/crew pattern)

### 5c. MediaCard adaptation
**File:** `frontend/src/features/ui/molecules/media-card.tsx`
- Music media uses square aspect ratio (`aspect-square` instead of `aspect-[2/3]`)
- Use album cover art (square) instead of poster
- Add music-specific badge: "MUSIC" in a music-themed color (e.g., indigo/amber)

### 5d. MediaHero adaptation
**File:** `frontend/src/features/media/organisms/media-hero.tsx`
- Music: use album art as the hero image (or large backdrop from Spotify)
- Show artist name(s) prominently
- External ratings: add MusicBrainz rating, Spotify popularity, Last.fm listeners
- Provider themes: Spotify green, MusicBrainz orange, Last.fm red

### 5e. External ratings system
**File:** `frontend/src/features/review/organisms/ratings-section.tsx`
- Add `providerTheme()` entries for: Spotify (green), MusicBrainz (orange), Last.fm (red)

### 5f. Interactions
**File:** `frontend/src/features/interaction/molecules/interaction-buttons.tsx`
- Music: Like (10 XP), Listened (30 XP), Wishlist (10 XP), Review
- Use existing button patterns, add `'listened'` as a new interaction type

### 5g. Settings — Spotify Integration
**File:** `frontend/src/features/settings/organisms/settings-page.tsx`
- New integration card in the Integrations section
- Connect/Disconnect via OAuth (pattern from Steam/Plex/TMDb)
- Display Spotify profile: avatar, display name, follower count, subscription tier
- Actions: Sync Library (saved albums)
- Status messages, progress indicators

### 5h. Spotify OAuth callback page
**New file:** `frontend/src/features/auth/spotify-callback.tsx` (pattern from steam-callback, plex-callback, tmdb-callback)

### 5i. Library tabs
**File:** `frontend/src/features/library/library-page.tsx`
- Add "Listened" tab (user listened interactions)
- Add "Spotify" tab (saved albums from Spotify, mirrored from Steam/Plex tabs)

### 5j. Browse page
**File:** `frontend/src/features/browse/organisms/browse-page.tsx`
- Add "Music" type tab
- Music-specific genre filters (pop, rock, hip-hop, electronic, jazz, classical, etc.)

### 5k. Discover
**File:** `frontend/src/features/discover/organisms/home-page.tsx`
- Add "Music" to type filter pills
- Add music carousel with MediaSection
- Hero can feature new releases

### 5l. Navigation sidebar
**File:** `frontend/src/features/navigation/organisms/sidebar.tsx`
- Add music icon / indicator (already generic - just needs type added)

---

## Phase 6: Configuration

### 6a. Settings
**File:** `backend/otix/infrastructure/config.py`
```python
musicbrainz_request_timeout_seconds: int = 15
musicbrainz_global_rps_limit: int = 1
spotify_client_id: str = ""
spotify_client_secret: str = ""
spotify_request_timeout_seconds: int = 15
spotify_global_rps_limit: int = 20
lastfm_api_key: str = ""
lastfm_request_timeout_seconds: int = 15
lastfm_global_rps_limit: int = 5
```

### 6b. `.env` additions
```
MUSICBRAINZ_RPS_LIMIT=1
SPOTIFY_CLIENT_ID=xxx
SPOTIFY_CLIENT_SECRET=xxx
SPOTIFY_REDIRECT_URI=http://localhost:5173/auth/spotify/connect/callback
LASTFM_API_KEY=xxx
```

---

## Verification Plan

1. **Domain**: Run Alembic migration, verify tables created with correct constraints
2. **MusicBrainz Provider**: Run `sync.musicbrainz.album` task directly with a known MBID, verify album + tracks + artist credits + cover art stored in DB
3. **Spotify Enrichment**: Run `sync.spotify.enrich_album`, verify audio_features, popularity, preview_url populated
4. **Last.fm Enrichment**: Run `sync.lastfm.enrich_album`, verify wiki summary, tags, similar artists
5. **Search**: `GET /media/search?media_type=music&q=dark+side` returns results
6. **Detail page**: Visit `/media/music/<id>`, verify full detail with tracks, audio features, artists, external ratings
7. **Interactions**: Click Like/Listened/Wishlist, verify XP toast and counter updates
8. **Library**: Visit `/library/listened`, `/library/spotify`, verify tabs work
9. **Settings**: Connect Spotify account, verify OAuth flow, scan library, verify saved albums appear
10. **Discover/Browse**: Verify albums appear in discover feed and browse page

---

## Summary

| Layer | Primary (Core Data) | Enrichment | Social/Discovery | User Library |
|-------|-------------------|------------|------------------|--------------|
| **Game** (reference) | IGDB | Steam + SteamGridDB + Fanart | — | Steam library |
| **Music** (new) | MusicBrainz + Cover Art Archive | Spotify (audio features, popularity, previews) | Last.fm (tags, wiki, similar) | Spotify saved albums |

The architecture mirrors the proven game pipeline exactly: open database for core catalog → commercial API for rich enrichment → community API for social data → OAuth for user library sync.
