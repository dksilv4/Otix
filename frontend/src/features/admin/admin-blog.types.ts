// TODO: Review this file
export interface AdminBlogPost {
  slug: string
  title: string
  date: string // ISO date
  author: string
  tags: string[]
  summary: string
  body: string // markdown-like text, rendered as paragraphs
}

export const ADMIN_BLOG_POSTS: AdminBlogPost[] = [
  {
    slug: 'external-id-system',
    title: 'External ID System: Polymorphic Identity Mapping',
    date: '2026-05-29',
    author: 'DK',
    tags: ['architecture', 'backend', 'database', 'providers'],
    summary:
      'How the ExternalID table maps any provider ID to any entity type — the polymorphic glue that powers cross-provider identity resolution across 15+ APIs.',
    body: `## The Problem

Otix integrates with 15+ external APIs. Every provider has its own ID system:

- TMDB uses integers for movies (550), shows (1399), people (6193)
- IGDB uses integers for games (1942), companies (123)
- Spotify uses base-62 strings for tracks and albums
- Steam uses integers for app IDs (730 for CS2)
- MusicBrainz uses UUIDs for releases and recordings
- Deezer uses integers for albums and tracks

We need one table that maps any of these to any internal entity — so a single album can carry IDs from Spotify, MusicBrainz, Deezer, and a dozen other sources without needing a separate column for each.

## The Solution: One Polymorphic Table

\`\`\`sql
external_ids
  id              PK (String 16)
  provider        e.g. 'tmdb', 'spotify', 'steam', 'igdb', 'musicbrainz'
  external_id     the provider's native ID (String 100)
  entity_type     what kind of thing this ID belongs to
  entity_id       the PK of that thing in its table (String 16)
  content_hash    SHA-256 of last-seen raw API data (change detection)
  hash_match_count how many times the hash matched (escalation backoff)

UNIQUE (provider, external_id)
INDEX  (entity_type, entity_id)
\`\`\`

The UNIQUE constraint ensures each provider+external_id pair maps to exactly one entity. Two providers can both reference the same entity — for example, both IGDB (game ID 1942) and Steam (app ID 292030) can point to the same MediaItem for The Witcher 3.

## Entity Types

The \`entity_type\` column makes this polymorphic. Currently ten entity types are registered:

| entity_type | Domain Model | Example providers |
|---|---|---|
| media_item | MediaItem | tmdb, igdb, spotify, steam, musicbrainz, deezer, imdb, tvdb |
| person | Person | tmdb, wikidata, musicbrainz |
| track | Track | spotify, musicbrainz_recording, isrc |
| company | Company | tmdb, igdb |
| platform | Platform | igdb |
| franchise | Franchise | igdb_franchise, tmdb_collection |
| collection | Collection | tmdb |
| keyword | Keyword | tmdb |
| watch_provider | WatchProvider | tmdb |

Each domain model declares its type via \`__external_id_entity_type__\`:

\`\`\`python
class Franchise(Base, HasExternalIDs):
    __external_id_entity_type__ = "franchise"

    igdb_franchise_id = ExternalIDDescriptor("igdb_franchise", cast_type=int)
    tmdb_collection_id = ExternalIDDescriptor("tmdb_collection", cast_type=int)
\`\`\`

## ExternalIDService

All ExternalID CRUD goes through \`ExternalIDService\`. Never construct \`ExternalID()\` directly.

**Idempotent upsert** (PostgreSQL ON CONFLICT DO UPDATE):

\`\`\`python
svc = ExternalIDService(session)
ext_id = await svc.upsert("igdb", "1942", "media_item", item.id)
\`\`\`

**Batch lookups** for resolving hundreds of external IDs at once:

\`\`\`python
# Forward: provider IDs → entity IDs
result = await svc.batch_find_entity_ids("tmdb", ["550", "1399", "680"])

# Reverse: entity IDs → all their provider IDs
result = await svc.batch_find_by_entity_ids("media_item", [item1.id, item2.id])
\`\`\`

**Entity resolution** with type safety:

\`\`\`python
person_id = await svc.find_entity_id_by_type("tmdb", "6193", "person")
\`\`\`

## Descriptor Pattern

Models can expose external IDs as Python attributes using \`ExternalIDDescriptor\`:

\`\`\`python
class Game(Base, HasExternalIDs):
    __external_id_entity_type__ = "media_item"
    steam_app_id = ExternalIDDescriptor("steam", cast_type=int)

# Read/write like a normal attribute
game.steam_app_id = 730          # persists on flush
print(game.steam_app_id)         # → 730
\`\`\`

Descriptors handle flush-time upsert via SQLAlchemy's before_flush event. You can assign IDs to detached objects and they persist automatically when attached.

## Content Hash Change Detection

Each ExternalID row stores a \`content_hash\` (SHA-256 of the last-seen raw API response) and a \`hash_match_count\` (how many consecutive syncs returned identical data). This powers adaptive re-sync scheduling:

- 1st consecutive match: re-sync in 12–24 hours
- 2nd consecutive match: double the interval
- 3rd consecutive match: double again
- Caps at \`tmdb_sync_max_escalation_days\` (configurable)

When the hash changes, the counter resets to 0. This means stable content syncs less often, while actively changing content stays fresh.

## Cross-Provider Identity Resolution

The system's real power is cross-provider linking. For example, in game sync:

1. IGDB game 1942 is synced, creating MediaItem with embedding and metadata
2. The raw IGDB data includes \`steam_app_id: 292030\` in its websites array
3. \`ExternalIDService.upsert("steam", "292030", "media_item", item.id)\` links the Steam ID
4. Later, when Steam library sync finds app 292030, it finds the existing MediaItem via ExternalID lookup
5. The same entity now has IGDB metadata AND Steam store data without duplication

Same pattern for music: Deezer seed creates an album → ISRCs resolve to MusicBrainz release IDs → 15+ cross-platform IDs get backfilled from MB url-rels → all pointing to the same MediaItem.

## Migration Status

The \`entity_type\`/\`entity_id\` columns are the current standard. The legacy \`media_item_id\`/\`media_type\` columns still exist for backward compatibility but should not be used in new code.

**Completed migration:**
- ExternalIDService (upsert, batch ops, type-safe lookups)
- ExternalIDDescriptor (attribute accessors for domain models)
- All hydrators updated to use upsert()
- IGDB and TMDB sync tasks use entity_id reads with fallback
- All ten domain models registered with entity types

**Remaining:**
- Backfill entity_type/entity_id for existing rows where media_item_id is set
- Update maintenance task joins to use entity_type filters
- Update admin dashboard queries to use entity_type
- Remove media_item_id/media_type columns once all read paths migrate

## Why This Matters

Before this system, adding a new cross-provider ID meant adding a new column to a domain table (or worse, duplicating media items). Now adding a new provider ID is zero-schema-change — just call \`upsert()\` with a new provider string.

For the franchise feature specifically: \`igdb_franchise_id\` and \`tmdb_collection_id\` are just ExternalID entries with \`entity_type="franchise"\`. The same name-matching logic could link any future provider without schema changes.`,
  },
  {
    slug: 'seeding-architecture',
    title: 'Seeding Architecture & Pipeline Efficiency',
    date: '2026-05-28',
    author: 'DK',
    tags: ['pipeline', 'seeding', 'providers', 'infrastructure'],
    summary:
      'How each media type discovers and enriches content: seeding strategies, provider chains, Celery schedules, and known gaps.',
    body: `## Overview

Each media type has its own seeding and enrichment pipeline. Seeding is how new content enters the system (via external APIs, user libraries, or daily exports). Enrichment is the chain of providers that add metadata after seeding.

## Movie Pipeline

Seeding: TMDB daily exports (3:07am) create ExternalID stubs for movies and people. A people seed cycle runs every 5 min to hydrate cast/crew. Catalog hydration drains stubs into full MediaItems when enough metadata is available (every 30 min at :17/:47).

Enrichment chain: TMDb (credits, genres, external IDs, images, trailers, releases, collections, watch providers, involved companies with production flag, revenue/budget) → Fanart (HD posters, textless posters, backgrounds, logos, every 15 min at :07/:22/:37/:52) → OMDb (IMDb/Rotten Tomatoes/Metacritic ratings, runtime, awards, plot — every 30 min at :13/:43) → Involved Companies (production companies with production flag, every 5 min) → Production Companies (every 5 min) → Content Ratings (every 5 min) → Embedding (pgvector cosine distance in search ranking, backfill every 3 min)

Celery schedule: TMDB import daily at 3:07am, people seed every 5 min, catalog hydration every 30 min at :17/:47, Fanart every 15 min at :07/:22/:37/:52, OMDb every 30 min at :13/:43, production companies every 5 min, content ratings every 5 min, embedding backfill every 3 min.

Key gap: TMDB seeding env-gated — entire TMDB pipeline (seed + backlog + daily import) disabled in local dev via app_env check. Revenue/budget fields used for ranking (revenue percentile, profit $, ROI %) but never re-enriched from non-TMDB sources. No dedicated recommendation engine (embeddings used only for search ranking).

## Show (TV) Pipeline

Seeding: Shares the TMDB daily export with movies. Episode data comes from Plex watch history sync rather than independent seeding — no TVDB or TVmaze integration exists.

Enrichment chain: TMDb (season/episode structure, credits, genres, images, TV content ratings (TV-G/TV-14/etc.), involved companies (networks + production)) → Fanart (HD posters, textless posters, backgrounds, logos, every 15 min at :07/:22/:37/:52) → OMDb (IMDb/Rotten Tomatoes/Metacritic ratings, runtime, awards — every 30 min at :13/:43) → Involved Companies (networks + production companies, every 5 min) → Content Ratings (every 5 min) → Embedding (pgvector cosine distance, backfill every 3 min)

Celery schedule: Same as movies for TMDB/Fanart/OMDb providers. Content ratings every 5 min. Plex account sync every 11 and 41 minutes past the hour (iterates all users with plex_auth_token). Catalog hydration every 30 min at :17/:47.

Key gap: Episode-level metadata is not independently seeded — no TVDB or TVmaze integration. Season-level enrichment ends at TMDb (no deep season metadata). No network/streaming platform availability tracking. Networks are tracked via involved companies but not enriched from external sources.

## Music Pipeline

Music has a 3-tier enrichment architecture — the most complex of the four types.

**Tier 1 — Seeding (entry points):**
- MusicBrainz release cycle: every 5 min. Walks catalog by decade using date-range search queries for incremental coverage of recently added releases. Top-to-bottom coverage from present to 1900.
- Deezer chart discovery: every 30 min at :14/:44. Pulls top 50 chart albums and enqueues new ones for seeding. Free tier, ~10 rps. Client + hydrator + transformer fully built with full auto-chain to MB→TADB→LRCLIB→Last.fm→Fanart→embedding.
- Spotify seed: recently played tracks synced every 7 min. Creates minimal entries with ISRCs/UPCs. No catalog enrichment (hydrator removed — Otix is the source of truth for music metadata). Audio features client+transformer exist but NO enrichment task wires them into the DB.
- YouTube sync: liked videos synced every 15 min with heuristic title-to-album matching (0.3 confidence threshold, 3 fallback strategies).

**Tier 2 — Cross-Platform Resolution (MusicBrainz):**
After Deezer or Spotify seed, ISRCs (and UPCs) are resolved to MusicBrainz release IDs (MBIDs). Two matching paths: ISRC→MBID (up to 5 ISRCs, 3 recordings each) and barcode→MBID (UPC search). Both rank Album > EP > Single > other. Full album sync pulls tracks, artists, labels, genres, cover art, and 15+ cross-platform external IDs (Spotify, YouTube Music, Apple Music, Deezer, Tidal, Amazon, Discogs, SoundCloud, Bandcamp, Wikidata, Genius, RateYourMusic, Qobuz, Napster, AllMusic).

**Tier 3 — Supplementary Enrichment:**
- Deezer Cover Art: chained from MB sync. Finds and stores cover art from Deezer for albums without poster URLs (searches by artist+title with fuzzy matching).
- TheAudioDB: cross-platform ID backfill, artwork (thumb, backdrop, CD art, logo), description, release year. Chained automatically after Deezer seed and MB full sync.
- LRCLIB: synced and plain lyrics for album tracks via the free lrclib.net API. Chained from both Deezer seed and MB sync. Fills the previously open lyrics gap.
- Last.fm: wiki summaries, genre tags, playcount and listeners stored as ExternalRatings. Runs every 30 min at :29/:59 and also chained from Deezer/MB sync.
- Fanart: artist logos on Person records, album covers by release group MBID. Every 15 min at :07/:22/:37/:52.
- Embedding: pgvector backfill every 3 min.

Key gap: Spotify audio features (tempo, key, mode, energy, danceability, valence, acousticness, instrumentalness, liveness, speechiness, loudness) exist in client+transformer+DB schema but NO enrichment task hydrates them. Spotify has no hydrator (seed-only, no catalog enrichment). YouTube title matching is heuristic (0.3 confidence). No genre-based radio, autoplay discovery, or similar-artist traversal.

## Game Pipeline

Seeding: Steam store app list and IGDB game database. Steam library sync pulls owned games. Dual-seed from both providers with fuzzy name matching for cross-provider resolution (every 30 min at :23/:53 — searches Steam store by title to backfill steam_app_id).

Enrichment chain: Steam (seed every 5 min + enrich every 15 min at :03/:18/:33/:48 — store page data: price, developers, publishers, screenshots, trailer movies, user reviews + Metacritic) → IGDB (seed every 5 min — metadata, genres, platforms, game modes, screenshots, critic/user ratings, age ratings (ESRB/PEGI/CERO/USK/GRAC/ClassInd/ACB)) → SteamGrid (every 30 min at :27/:57 — grid images, hero backdrops, logos, icons) → Fanart (every 15 min at :07/:22/:37/:52) → Game Age Ratings (every 5 min) → CCU Batch (every 5 min, up to 250 games/cycle) → Embedding (pgvector, every 3 min backfill)

Celery schedule: Steam seed every 5 min, IGDB seed every 5 min, Steam enrichment every 15 min at :03/:18/:33/:48, SteamGrid every 30 min at :27/:57, CCU batch every 5 min (250 games/cycle), name match every 30 min at :23/:53, age ratings every 5 min, embedding backfill every 3 min.

Key gap: Most complete pipeline of the four types (94% efficiency score). Age ratings now fully mapped from IGDB (7 systems, 38 labels). No non-Steam storefront data (Epic Games Store, GOG, PlayStation, Xbox, Nintendo). No achievement/trophy integration. No playtime tracking beyond Steam library.

## Shared Infrastructure

All four types share the embedding backfill (runs every 3 min until all items have pgvector embeddings, queried via cosine distance in search ranking) and the catalog hydration task (re-syncs stale items every 30 min at :17/:47). A provider health check runs every 5 min to detect API outages. A progress summary logs pipeline throughput every 60 seconds. Two additional shared tasks: discover feed refresh (daily at 3:17am), search gap report (every 6 hours at :19). Game feed refresh runs daily at 3:53am. Expired token cleanup runs daily at 3:23am.

All enrichment tasks use Celery's app.send_task() for chaining — providers trigger downstream enrichment automatically. For example, when MusicBrainz completes a full album sync, it chains to TheAudioDB → Last.fm → Fanart → embedding without waiting for the beat schedule.`,
  },
  {
    slug: 'media-types',
    title: 'Media Types: Current Support & Future Roadmap',
    date: '2026-05-28',
    author: 'DK',
    tags: ['media', 'roadmap', 'providers'],
    summary:
      'Currently supported media types (movies, shows, music, games), their enrichment providers, and long-term candidates for integration.',
    body: `## Currently Supported

Four media types are live, enforced by a database check constraint on the media_items table.

### Movies
- Enrichment providers: TMDb (primary metadata), Fanart (artwork), OMDb (ratings, runtime, awards), Production Companies, Involved Companies (production flag), Content Ratings, Embedding (vector search)
- User libraries: Plex movie sync
- External IDs: TMDb, IMDb
- Revenue & budget tracking with ranking (revenue percentile, profit $, ROI %)
- Country-specific release dates and certifications
- Adult content detection via TMDB stubs

### Shows (TV)
- Enrichment providers: TMDb (season/episode structure), Fanart (artwork), OMDb (ratings), Involved Companies (networks + production), Content Ratings (TV-G/TV-14/etc.), Embedding (vector search)
- User libraries: Plex episode sync with watch progress
- External IDs: TMDb
- Episode-level tracking and watch history
- Network tracking via involved companies

### Music
- Enrichment providers: Deezer (chart discovery every 30 min + seed + cover art), Spotify (seed-only, NO catalog enrichment), MusicBrainz (ISRC+barcode resolution, 15+ cross-platform external IDs), TheAudioDB (artwork, description), LRCLIB (synced + plain lyrics), Last.fm (tags, wiki, playcount), Fanart (artist logos, album covers), Embedding (vector search)
- User libraries: Spotify saved tracks, Plex music playback (album art, Part-level resolution), YouTube liked video sync, Google account connection
- External IDs: MusicBrainz (recording, release group), Spotify, Deezer, plus 15+ cross-platform IDs from MB url-rels
- Audio features: 11 features (tempo, key, mode, energy, danceability, valence, acousticness, instrumentalness, liveness, speechiness, loudness) in DB schema but NOT hydrated — client+transformer exist with no enrichment wiring
- 3-tier enrichment: Seed (Deezer/Spotify/MB/YouTube) → MusicBrainz cross-platform resolution (ISRC + barcode) → TADB/LRCLIB/Last.fm/Fanart supplementary

### Games
- Enrichment providers: Steam (store page, reviews, CCU, library), IGDB (metadata, genres, platforms, game modes, age ratings), SteamGrid (grid images, heroes, logos), Fanart (artwork), Name Match (cross-provider resolution), Age Ratings (7 systems: ESRB, PEGI, CERO, USK, GRAC, ClassInd, ACB — 38 labels), CCU Batch, Embedding (vector search)
- User libraries: Steam owned games sync
- External IDs: Steam App ID, IGDB
- Game modes, platform tracking, and concurrent player counts
- Steam review data (user score + Metacritic)

## Enrichment Pipeline

All four types share the embedding pipeline (pgvector with cosine distance — used for search ranking, not just storage). Each type has a dedicated enrichment chain that hydrates metadata from external APIs. The pipeline runs via Celery tasks — TMDB stubs are seeded from daily exports, MusicBrainz releases are discovered via Spotify ISRC chains, Steam games are pulled from user libraries, and so on. All enrichment tasks use Celery's app.send_task() for chaining, so providers trigger downstream enrichment automatically without waiting for the beat schedule.

## Future Candidates

These are long-term possibilities — no active development, but the data model and provider pattern are designed to accommodate them.

### Books & Audiobooks
- Potential providers: Open Library, Google Books, Audible, Goodreads
- Natural fit: reading progress tracking, reviews, lists
- Challenges: no dominant open API with good music/movie-level metadata depth

### Podcasts
- Potential providers: Podcast Index, Apple Podcasts, Spotify podcast API
- Natural fit: episode tracking, audio playback
- Challenges: highly fragmented, inconsistent metadata, short-lived vs. evergreen content

### Anime
- Could be a first-class type or a subtype of Shows
- Potential providers: AniList, MyAnimeList, Kitsu
- Already partially covered: TMDB has anime entries, K-Drama and Anime cultural signals exist in the personalization service

### Comics & Manga
- Potential providers: Comic Vine, MangaDex, AniList (manga)
- Natural fit: volume/chapter tracking, similar to episode tracking for shows

### Board Games
- Potential providers: BoardGameGeek
- Natural fit: collection tracking, play session logging
- Challenges: very different data model (no "watching" or "listening" — more like "played")

### Live Sports & Events
- Potential providers: Sportradar, TheSportsDB
- Could be event-based rather than media-based — different interaction model
- Challenges: temporal (live events expire), fundamentally different from persistent media

## Adding a New Media Type

1. Add the type to the database check constraint via Alembic migration
2. Create a MediaItem subclass if the type needs unique fields (like Game has game modes, Music has audio features)
3. Register at least one enrichment provider chain
4. Add the type to frontend media type constants and UI filters
5. Add discover and search support
6. Wire into library platform sync if applicable (e.g., a new OAuth integration)`,
  },
  {
    slug: 'feature-experiments-system',
    title: 'Feature Experiments & Maturity Tracking',
    date: '2026-05-28',
    author: 'DK',
    tags: ['features', 'experiments', 'dx'],
    summary:
      'How the experiments system works, how to gate a new feature behind a flag, and how maturity levels are assigned.',
    body: `The experiments system lets us ship features before they're fully production-ready. Each feature gets a maturity level (alpha, beta, production) and can be toggled on/off by users from Settings → Experiments.

## Adding a new experiment

- Add an entry to the EXPERIMENTS array in experiments.types.ts
- Choose the right maturity level: alpha (very experimental, off by default), beta (mostly works, off by default), or production (feature-complete, on by default)
- Wrap feature UI with ExperimentGuard to conditionally render gated components
- Add readiness criteria in experiments-admin.types.ts so the admin dashboard tracks progress
- Use useExperiment('key') for programmatic checks in components and hooks

## Maturity criteria

A feature moves from alpha → beta when all core functionality works end-to-end. A feature moves from beta → production when it has tests, error handling, empty/loading states, and all integration points are wired.`,
  },
  {
    slug: 'architecture-overview',
    title: 'Architecture Overview',
    date: '2026-05-20',
    author: 'DK',
    tags: ['architecture', 'backend', 'frontend'],
    summary:
      'High-level overview of the Otix stack: FastAPI backend, React frontend, PostgreSQL + Redis, and Celery task workers.',
    body: `## Backend (Python/FastAPI)

- API layer: FastAPI with Pydantic schemas, JWT auth with refresh tokens
- Domain layer: SQLAlchemy ORM models with repository pattern
- Services: Business logic separated from API handlers
- Tasks: Celery workers for async processing (media sync, enrichment, XP awards)
- Providers: External API integrations (TMDb, MusicBrainz, Spotify, Steam, IGDB, YouTube)

## Frontend (React/TypeScript)

- UI: React 19 with custom DK UI design system (Tailwind CSS 4)
- State: TanStack React Query for server state, React Context for client preferences
- Routing: TanStack Router with lazy-loaded pages
- Realtime: SSE for notifications and sync progress

## Infrastructure

- PostgreSQL with pgvector extension for embeddings
- Redis for Celery broker and SSE pub/sub
- Docker Compose for local dev
- Alembic for database migrations`,
  },
  {
    slug: 'adding-media-provider',
    title: 'Adding a New Media Provider',
    date: '2026-05-15',
    author: 'DK',
    tags: ['providers', 'backend', 'integration'],
    summary:
      'Step-by-step guide to adding a new enrichment provider: client, hydrator, transformer, and Celery task wiring.',
    body: `## Provider structure

Each enrichment provider lives in otix/providers/<name>/ and has three files:

1. client.py — API client with rate limiting and error handling
2. transformer.py — Maps external API responses to our internal models
3. hydrator.py — Orchestrates fetching + transforming + saving to DB

## Steps to add a provider

1. Create the provider package with client, transformer, and hydrator
2. Register the hydrator in the enrichment pipeline (media_service.py)
3. Add a Celery task for periodic seeding if needed
4. Add a sync task for user-triggered enrichment
5. Wire into the celery beat schedule if it runs on a timer

## Example: Deezer provider

The Deezer provider is fully built (client, transformer, hydrator) and chains into MusicBrainz via ISRC matching. The only missing piece is the scheduled discovery cycle — there's a TODO in the celery beat schedule.`,
  },
]
