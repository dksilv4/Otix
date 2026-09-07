"""Central registry of every TTL (time-to-live) value, in seconds.

Cache/expiry policy is consolidated here instead of scattered as per-module
constants, so a value and the feature it belongs to are auditable in one
place. All entries are plain integers (or integer expressions). Keep this
module free of imports so any part of the backend can import it without
pulling in the API package.

Access pattern: ``TTL["DOMAIN"]["KEY"]`` (or ``TTL["DOMAIN"]`` for a flat
entry). Each entry notes the file/feature it belongs to; keep this in sync
when adding or tuning a TTL.
"""

TTL = {
    # ── API response caches (Redis `ex=`) ──────────────────────────────
    "PERSON": {
        # people/detail/router.py · 5 minutes
        "DETAIL": 300,
    },
    "DISCOVER": {
        "HERO": 120,      # discover/hero/router.py
        "SECTIONS": 30,   # discover/sections/router.py
        "LIST_TYPE": {    # discover/media_type/list_type/router.py
            "PERSONALIZED": 15,
            "DISCOVER": 120,
        },
    },
    "MEDIA": {
        "DETAIL": 30,             # media/detail.py
        "SIMILAR": 60,            # media/browse.py
        "RECOMMENDATIONS": 60,    # media/browse.py
    },
    "SEARCH": {
        "CACHE": 120,       # api/search/embedding.py
        "EMBEDDING": 900,   # api/search/embedding.py
    },
    "MEDIA_EMBEDDING": {
        "EMBEDDING": 300,   # api/media/embedding.py
    },

    # ── Auth / service state TTLs ──────────────────────────────────────
    "AUTH": {
        "GOOGLE_STATE": 600,        # google_auth_service.py · 10 minutes
        "STEAM_STATE": 600,         # steam_auth_service.py · 10 minutes
        "PLEX_PIN": 900,            # plex_auth_service.py
        "TMDB_REQUEST_TOKEN": 600,  # tmdb_auth_service.py
    },
    "ASSET_SELECTION": 3600,  # services/asset_selection.py · 1 hour

    # ── Provider caches ────────────────────────────────────────────────
    "IGDB": {
        "TOKEN": 50 * 24 * 3600,        # igdb/client.py · 50 days
        "SEARCH_CACHE": 7 * 24 * 3600,  # igdb/client.py · 7 days
    },

    # ── Lib / infra ────────────────────────────────────────────────────
    "GEOIP_CACHE": 60 * 60 * 24,   # lib/geoip.py · 24 hours
    "REDIS_PROGRESS_DEFAULT": 300,  # lib/redis_progress.py · 5 minutes
    "TASK_GUARD": {
        "DEDUP": 86400,    # lib/task_guard.py · 24 hours
        "FAILURE": 604800,  # lib/task_guard.py · 7 days
    },

    # ── Tasks / hydration ──────────────────────────────────────────────
    "SEED": {
        "EXPORT_LOCK": 7200,      # tasks/seed/tmdb_seed.py · 2 hours daily import
        "BACKLOG_LOCK": 120,      # tasks/seed/tmdb_seed.py
        "CATALOG_LOCK": 300,      # tasks/seed/catalog_seed.py
        "SEEN": 30 * 86400,       # tasks/seed/catalog_seed.py · 30 days
    },
    "FEED": {
        "DISCOVER": 7200,  # tasks/maintenance/feed.py · 2 hours
    },
    "SYNC": {
        "BACKFILL_REDIS": 300,  # tasks/sync/search.py
    },
    "HYDRATION": {
        "DRAIN": 300,  # hydration/queue.py · 5 minutes
    },
}
