# Database Schema

## Design Principles

1. **Single shared base table** — `media_items` holds common fields. Type-specific tables (movies, shows, games) extend it via FK.
2. **No GenericForeignKey** — every relation uses a direct FK column. No `content_type_id` + `object_id` anywhere.
3. **UUID primary keys** — all user-facing entities use UUIDs. No sequential ID enumeration.
4. **JSONB for flexible metadata** — provider-specific data and interaction metadata use JSONB instead of EAV tables.
5. **tsvector for search** — GIN-indexed `search_vector` column on media_items, updated via trigger.

---

## Core Schema

### media_items (base table)

```sql
CREATE TABLE media_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_type      VARCHAR(10) NOT NULL CHECK (media_type IN ('movie', 'show', 'game')),
    title           VARCHAR(1000) NOT NULL,
    overview        TEXT,
    slug            VARCHAR(1000) NOT NULL UNIQUE,
    poster_url      VARCHAR(2000),
    backdrop_url    VARCHAR(2000),
    release_date    DATE,
    popularity      FLOAT DEFAULT 0,
    original_language VARCHAR(10),
    completeness_score FLOAT DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 1),
    search_vector   TSVECTOR,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_media_items_type ON media_items(media_type);
CREATE INDEX idx_media_items_popularity ON media_items(popularity DESC);
CREATE INDEX idx_media_items_search ON media_items USING GIN(search_vector);
CREATE INDEX idx_media_items_updated ON media_items(updated_at DESC);
```

### movies

```sql
CREATE TABLE movies (
    media_item_id   UUID PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
    runtime         INTEGER,                    -- minutes
    budget          BIGINT,
    revenue         BIGINT,
    tagline         VARCHAR(1000),
    is_anime        BOOLEAN DEFAULT FALSE,
    collection_id   UUID REFERENCES collections(id)
);
```

### shows

```sql
CREATE TABLE shows (
    media_item_id       UUID PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
    status              VARCHAR(50),              -- 'returning', 'ended', 'canceled'
    first_air_date      DATE,
    last_air_date       DATE,
    number_of_seasons   INTEGER,
    number_of_episodes  INTEGER
);

CREATE TABLE seasons (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    show_id         UUID NOT NULL REFERENCES shows(media_item_id) ON DELETE CASCADE,
    season_number   INTEGER NOT NULL,
    name            VARCHAR(1000),
    overview        TEXT,
    poster_url      VARCHAR(2000),
    UNIQUE(show_id, season_number)
);

CREATE TABLE episodes (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    season_id       UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
    episode_number  INTEGER NOT NULL,
    name            VARCHAR(1000),
    overview        TEXT,
    runtime         INTEGER,
    air_date        DATE,
    UNIQUE(season_id, episode_number)
);
```

### games

```sql
CREATE TABLE games (
    media_item_id   UUID PRIMARY KEY REFERENCES media_items(id) ON DELETE CASCADE,
    release_status  VARCHAR(50),              -- 'released', 'early_access', 'announced'
    website         VARCHAR(2000),
    steam_app_id    INTEGER UNIQUE,
    platforms       JSONB,                    -- ['windows', 'mac', 'linux', 'playstation_5']
    modes           JSONB,                    -- ['single_player', 'multiplayer', 'coop']
    is_free         BOOLEAN DEFAULT FALSE,
    has_multiplayer BOOLEAN DEFAULT FALSE
);
```

### collections

```sql
CREATE TABLE collections (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tmdb_id         INTEGER UNIQUE,
    name            VARCHAR(1000) NOT NULL,
    overview        TEXT,
    poster_url      VARCHAR(2000),
    backdrop_url    VARCHAR(2000)
);

CREATE TABLE collection_items (
    collection_id   UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    sort_order      INTEGER DEFAULT 0,
    PRIMARY KEY (collection_id, media_item_id)
);
```

---

## External IDs (replaces GenericForeignKey)

```sql
CREATE TABLE external_ids (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(20) NOT NULL,       -- 'tmdb', 'steam', 'igdb', 'imdb', 'tvdb'
    external_id     VARCHAR(100) NOT NULL,
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(provider, external_id)
);

CREATE INDEX idx_external_ids_media ON external_ids(media_item_id);
CREATE INDEX idx_external_ids_lookup ON external_ids(provider, external_id);
```

This single table replaces `django_content_type` + GenericForeignKey across the entire schema. Given a provider and external ID, find the media_item in one index lookup.

---

## User Interactions (replaces ContentType framework)

```sql
CREATE TABLE user_media_interactions (
    user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    media_item_id    UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    interaction_type VARCHAR(20) NOT NULL CHECK (
        interaction_type IN ('rated', 'watched', 'liked', 'watchlisted', 'played', 'reviewed')
    ),
    metadata         JSONB DEFAULT '{}',       -- {'rating': 8, 'playtime_minutes': 120}
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, media_item_id, interaction_type)
);
```

No separate Rating, Watchlist, Played, Liked tables. One interaction table with a type discriminator and JSONB metadata.

---

## Relation Tables

```sql
-- Genres
CREATE TABLE genres (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    VARCHAR(200) NOT NULL UNIQUE,
    slug    VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE media_genres (
    media_item_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    genre_id      UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
    PRIMARY KEY (media_item_id, genre_id)
);

-- Keywords
CREATE TABLE keywords (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    VARCHAR(200) NOT NULL UNIQUE
);

CREATE TABLE media_keywords (
    media_item_id UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    keyword_id    UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
    PRIMARY KEY (media_item_id, keyword_id)
);

-- Credits (cast + crew)
CREATE TABLE people (
    id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name    VARCHAR(500) NOT NULL,
    tmdb_id INTEGER UNIQUE,
    imdb_id VARCHAR(20) UNIQUE,
    photo_url VARCHAR(2000)
);

CREATE TABLE media_credits (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    person_id       UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    role            VARCHAR(50) NOT NULL,       -- 'cast', 'director', 'writer', 'producer'
    character_name  VARCHAR(500),
    sort_order      INTEGER DEFAULT 0,
    UNIQUE(media_item_id, person_id, role)
);

-- Assets
CREATE TABLE media_assets (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    asset_type      VARCHAR(20) NOT NULL,       -- 'poster', 'backdrop', 'logo', 'screenshot'
    url             VARCHAR(2000) NOT NULL,
    width           INTEGER,
    height          INTEGER,
    provider        VARCHAR(20)
);

-- Videos
CREATE TABLE media_videos (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    video_type      VARCHAR(50),                -- 'trailer', 'teaser', 'clip', 'opening_credits'
    url             VARCHAR(2000) NOT NULL,
    provider        VARCHAR(20),                -- 'youtube', 'vimeo'
    provider_id     VARCHAR(100)
);

-- Releases (per-country release dates + certification)
CREATE TABLE media_releases (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    country_code    CHAR(2) NOT NULL,
    release_date    DATE,
    certification   VARCHAR(20)
);

-- External ratings (IMDB, TMDB, Metacritic, etc.)
CREATE TABLE external_ratings (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    media_item_id   UUID NOT NULL REFERENCES media_items(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL,       -- 'tmdb', 'imdb', 'metacritic', 'igdb'
    score           FLOAT NOT NULL,
    max_score       FLOAT NOT NULL DEFAULT 10,
    vote_count      INTEGER,
    UNIQUE(media_item_id, provider)
);
```

---

## Sync Tracking

```sql
CREATE TYPE sync_status AS ENUM (
    'pending', 'queued', 'running', 'completed', 'failed', 'skipped', 'cancelled'
);

CREATE TYPE sync_phase AS ENUM (
    'core', 'fanout', 'enrichment', 'cleanup'
);

CREATE TABLE sync_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider        VARCHAR(20) NOT NULL,
    entity_type     VARCHAR(20) NOT NULL,        -- 'movie', 'show', 'game', 'person'
    external_id     VARCHAR(100) NOT NULL,
    status          sync_status NOT NULL DEFAULT 'pending',
    priority        INTEGER NOT NULL DEFAULT 5,
    phase           sync_phase NOT NULL DEFAULT 'core',
    parent_id       UUID REFERENCES sync_jobs(id),
    error_message   TEXT,
    retry_count     INTEGER DEFAULT 0,
    started_at      TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sync_jobs_status ON sync_jobs(status, priority);
CREATE INDEX idx_sync_jobs_provider ON sync_jobs(provider, external_id);
CREATE INDEX idx_sync_jobs_parent ON sync_jobs(parent_id);

CREATE TABLE provider_state (
    provider        VARCHAR(20) PRIMARY KEY,
    last_sync_at    TIMESTAMPTZ,
    cursor_value    VARCHAR(500),
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMPTZ
);
```

---

## Search Vector Trigger

```sql
CREATE FUNCTION update_search_vector() RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.overview, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_search_vector
    BEFORE INSERT OR UPDATE OF title, overview ON media_items
    FOR EACH ROW EXECUTE FUNCTION update_search_vector();
```

---

## Migration From Django Schema

### What disappears

- `django_content_type` table
- All `content_type_id` + `object_id` columns
- Django's `auth_user` (replaced with simpler `users` table)
- Django sessions, Django admin tables
- Multi-table inheritance children (Django creates parent JOINs implicitly)

### Migration strategy

1. Write a migration script that reads Django models and writes to the new schema
2. Run it iteratively against a copy of production data
3. Verify row counts, spot-check 100 random entities, compare checksums
4. The script is idempotent — run it multiple times, last write wins
5. On cutover day: set Django to read-only, run final migration, switch DNS
