# Project Structure

## Directory Layout

```
otix/
├── backend/
│   ├── cmd/                       # Application entry points
│   │   ├── api/main.py            # FastAPI app factory, middleware, startup/shutdown
│   │   ├── worker/main.py         # Celery worker initialization
│   │   └── beat/main.py           # Celery beat scheduler
│   │
│   ├── otix/                      # Main Python package
│   │   ├── domain/                # SQLAlchemy ORM models
│   │   │   ├── media.py           # MediaItem, Movie, Show, Season, Episode, Game
│   │   │   ├── people.py          # Person, Credit, Crew
│   │   │   ├── user.py            # User, UserProfile, UserPreferences
│   │   │   ├── collection.py      # Collection, MediaCollection
│   │   │   ├── genre.py           # Genre, Keyword
│   │   │   ├── interaction.py     # UserMediaInteraction
│   │   │   ├── asset.py           # MediaAsset, MediaVideo, ExternalRating
│   │   │   └── sync.py            # SyncJob, SyncLog, ProviderState
│   │   │
│   │   ├── api/                   # FastAPI route handlers + Pydantic schemas
│   │   │   ├── router.py          # Main router aggregation
│   │   │   ├── media.py           # /media/* endpoints
│   │   │   ├── auth.py            # /auth/* endpoints
│   │   │   ├── user.py            # /user/* endpoints
│   │   │   ├── discover.py        # /discover/* endpoints
│   │   │   ├── search.py          # /search/* endpoints
│   │   │   ├── sync.py            # /sync/* endpoints
│   │   │   └── schemas/           # Pydantic request/response models
│   │   │       ├── media.py
│   │   │       ├── auth.py
│   │   │       ├── user.py
│   │   │       ├── discover.py
│   │   │       └── common.py      # Pagination, error responses, etc.
│   │   │
│   │   ├── services/              # Business logic layer
│   │   │   ├── media_service.py   # CRUD, relations, completeness scoring
│   │   │   ├── auth_service.py    # Registration, login, token refresh, logout
│   │   │   ├── sync_service.py    # Sync orchestration, job management
│   │   │   ├── discovery_service.py  # Feed generation, recommendations
│   │   │   ├── search_service.py  # Full-text search, filtering
│   │   │   └── user_service.py    # Profile, preferences, interactions
│   │   │
│   │   ├── providers/             # External API integrations
│   │   │   ├── base.py            # BaseProvider, BaseTransformer, BaseHydrator
│   │   │   ├── tmdb/
│   │   │   │   ├── client.py      # HTTP client, auth, retries
│   │   │   │   ├── transformer.py # TMDB → internal model mapping
│   │   │   │   └── hydrator.py    # Relation hydration (credits, images, etc.)
│   │   │   ├── steam/
│   │   │   │   ├── client.py
│   │   │   │   ├── transformer.py
│   │   │   │   └── ccu.py         # Concurrent user polling
│   │   │   ├── igdb/
│   │   │   ├── fanart/
│   │   │   ├── omdb/
│   │   │   └── plex/
│   │   │
│   │   ├── tasks/                 # Celery task definitions
│   │   │   ├── sync.py            # Entity sync, fanout, enrichment
│   │   │   ├── catalog.py         # Catalog hydration, completeness scoring
│   │   │   ├── discover.py        # Feed generation, recommendation compute
│   │   │   └── maintenance.py     # Cleanup, reindexing, health checks
│   │   │
│   │   ├── infrastructure/        # Cross-cutting concerns
│   │   │   ├── database.py        # AsyncEngine, AsyncSession factory
│   │   │   ├── redis.py           # Redis connection pool
│   │   │   ├── config.py          # Pydantic-settings configuration
│   │   │   └── logging.py         # Structured logging setup
│   │   │
│   │   └── lib/                   # Shared utilities
│   │       ├── rate_limiter.py    # Redis-backed token bucket
│   │       ├── circuit_breaker.py # Failure-counting breaker with half-open
│   │       ├── metrics.py         # Prometheus counters, histograms, gauges
│   │       └── pagination.py      # Cursor-based pagination helper
│   │
│   ├── alembic/                   # Database migrations
│   │   ├── versions/
│   │   └── env.py
│   │
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── conftest.py
│   │
│   ├── pyproject.toml
│   └── Dockerfile
│
├── frontend/                      # React 19 + Vite + TanStack
│   ├── src/
│   │   ├── features/              # Feature modules
│   │   │   ├── media/             # Media detail, lists, grids
│   │   │   ├── discover/          # Discover feed, filters
│   │   │   ├── auth/              # Login, register, profile
│   │   │   ├── sync/              # Sync status, job management
│   │   │   └── search/            # Search interface
│   │   │
│   │   ├── components/            # Shared UI components
│   │   │   ├── atoms/             # Button, Card, Badge, Input, etc.
│   │   │   ├── molecules/         # MediaGrid, PersonCard, etc.
│   │   │   └── templates/         # Layout, Footer, Navbar
│   │   │
│   │   ├── routes/                # TanStack Router definitions
│   │   │   ├── __root.tsx
│   │   │   ├── index.tsx
│   │   │   ├── auth.tsx
│   │   │   ├── media.tsx
│   │   │   └── discover.tsx
│   │   │
│   │   └── lib/
│   │       ├── api-client.ts      # Generated by openapi-typescript
│   │       ├── query-client.ts    # TanStack Query client + defaults
│   │       ├── auth.ts            # Token management, refresh interceptor
│   │       └── persistence.ts     # IndexedDB for discover caching
│   │
│   ├── index.html
│   ├── vite.config.ts
│   ├── tailwind.config.ts
│   └── package.json
│
├── packages/
│   ├── @otix/api-client/          # Generated TypeScript API client
│   │   ├── src/
│   │   │   └── index.ts           # openapi-typescript output
│   │   └── package.json
│   │
│   └── @otix/config/              # Shared configuration
│       ├── eslint.config.js
│       ├── tsconfig.base.json
│       └── package.json
│
├── docker-compose.yml
├── Makefile
└── pnpm-workspace.yaml
```

## Domain Boundaries

The current 22 Django apps consolidate into 8 domains. Each domain is a self-contained module with its own models, services, and API routes.

```
┌──────────────────────────────────────────────────────────┐
│                        Otix                              │
├──────────┬──────────┬──────────┬──────────┬─────────────┤
│  media   │  people  │   user   │   sync   │   catalog   │
│          │          │          │          │             │
│ Movies   │ Cast     │ Profiles │ TMDB     │ Collections │
│ Shows    │ Crew     │ Prefs    │ Steam    │ Discovery   │
│ Games    │ Credits  │ Interact │ IGDB     │ Recommend   │
│ Collect. │          │          │ Fanart   │             │
│          │          │          │ OMDB     │             │
│          │          │          │ Plex     │             │
├──────────┴──────────┼──────────┼──────────┼─────────────┤
│                     │   auth   │  search  │  analytics  │
│                     │          │          │             │
│                     │ Register │ FTS      │ Usage stats │
│                     │ Login    │ Filters  │ Sync health │
│                     │ Tokens   │          │ Provider    │
│                     │          │          │ metrics     │
└─────────────────────┴──────────┴──────────┴─────────────┘
```

### Domain Responsibilities

**media** — The core entity. Movies, Shows (with Seasons, Episodes), Games. All media types share `media_items` as a base table. Owns relations to genres, keywords, assets, videos, releases, external ratings.

**people** — Cast and crew. Person records linked to media_items via `media_credits` with role and character information.

**user** — User profiles, preferences, and media interactions (rated, watched, liked, watchlisted, played). Owns the `user_media_interactions` table.

**sync** — Provider integration orchestration. SyncJob tracking, pipeline phases, provider state. Owns all provider clients and transformers.

**catalog** — Collections, discovery feeds, recommendation computation. Read-heavy, depends on media + user domains.

**auth** — Registration, email verification, login, JWT issuance, token refresh, logout, session revocation.

**search** — Full-text search across media_items. Filtering by type, genre, year, rating. Initially PostgreSQL tsvector, swappable to Meilisearch.

**analytics** — Usage statistics, sync health, provider API metrics. Internal domain, consumed by monitoring.

## Module Dependency Rules

```
services/   → depends on → domain/
api/        → depends on → services/ + schemas/
tasks/      → depends on → services/ + providers/
providers/  → depends on → domain/ + lib/
infrastructure/ → no internal dependencies
lib/        → no internal dependencies
```

- **domain/** never imports from services, api, tasks, or providers
- **services/** never imports from api/ or tasks/
- **api/** never imports from tasks/
- **providers/** are independent of each other
