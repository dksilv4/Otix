"""Celery application with queue routing and beat schedule.

Queue design (9 queues, per-provider isolation):

  fast       — tmdb, steam, spotify catalog (6 workers)
  igdb       — IGDB provider, 4 rps (shared provider worker)
  fanart     — Fanart provider, 1 rps (shared provider worker)
  omdb       — OMDb provider, 5 rps (shared provider worker)
  steamgrid  — SteamGridDB provider, 2 rps (shared provider worker)
  musicbrainz — MusicBrainz provider, 1 rps (shared provider worker)
  lastfm     — Last.fm provider, 5 rps (shared provider worker)
  user       — user-initiated syncs, XP (2 workers)
  control    — maintenance, seed cycles, embedding, catch-all (2 workers)
  ccu        — Steam CCU (1 worker)

Rate limiting is handled in-app by BaseProvider's Redis token bucket.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from otix.infrastructure.config import settings


def route_task(name: str, *args, **kwargs) -> str | None:
    """Route tasks to provider-isolated queues based on name prefix."""
    if name.startswith("steam.ccu."):
        return "ccu"
    if name.startswith("seed."):
        return "control"
    if name.startswith("maintenance."):
        if "steam_ccu" in name:
            return "ccu"
        if "plex_sync_user" in name or "sync_plex_accounts" in name:
            return "user"
        return "control"
    if name.startswith("sync.tmdb.") or name.startswith("sync.steam."):
        return "fast"
    if name.startswith("sync.spotify."):
        if "user_library" in name or "seed_album" in name:
            return "user"
        return "fast"  # match_album, enrich_album
    if name.startswith("sync.igdb."):
        return "igdb"
    if name.startswith("sync.fanart."):
        return "fanart"
    if name.startswith("sync.omdb."):
        return "omdb"
    if name.startswith("sync.steamgrid."):
        return "steamgrid"
    if name.startswith("sync.musicbrainz."):
        return "musicbrainz"
    if name.startswith("sync.lastfm."):
        return "lastfm"
    if name.startswith("search."):
        return "fast"
    if name.startswith("embedding."):
        return "control"
    if name.startswith("xp."):
        return "user"
    return "control"


app = Celery("otix")
app.config_from_object(
    {
        "broker_url": settings.celery_broker,
        "broker_connection_retry_on_startup": True,
        "task_serializer": "json",
        "accept_content": ["json"],
        "result_serializer": "json",
        "result_expires": 3600,
        "task_acks_late": True,
        "task_reject_on_worker_lost": True,
        "worker_prefetch_multiplier": settings.celery_worker_prefetch_multiplier,
        "task_default_queue": "control",
        "task_queues": [
            Queue("fast", queue_arguments={"x-max-priority": 10}),
            Queue("igdb", queue_arguments={"x-max-priority": 10}),
            Queue("fanart", queue_arguments={"x-max-priority": 10}),
            Queue("omdb", queue_arguments={"x-max-priority": 10}),
            Queue("steamgrid", queue_arguments={"x-max-priority": 10}),
            Queue("musicbrainz", queue_arguments={"x-max-priority": 10}),
            Queue("lastfm", queue_arguments={"x-max-priority": 10}),
            Queue("user", queue_arguments={"x-max-priority": 10}),
            Queue("control", queue_arguments={"x-max-priority": 10}),
            Queue("ccu", queue_arguments={"x-max-priority": 10}),
        ],
        "task_routes": (route_task,),
        "task_create_missing_queues": True,
        "beat_schedule": {
            # Discovery feeds (daily at 3am)
            "refresh-discover-feed": {
                "task": "maintenance.refresh_discover_feed",
                "schedule": crontab(hour="3", minute="17"),
            },
            # Provider health check (every 5 min)
            "provider-health-check": {
                "task": "maintenance.provider_health_check",
                "schedule": crontab(minute="*/5"),
            },
            # Cleanup expired refresh tokens (daily at 3am)
            "cleanup-expired-tokens": {
                "task": "maintenance.cleanup_expired_tokens",
                "schedule": crontab(hour="3", minute="23"),
            },
            # Fanart enrichment scan (every 15 min as safety net; inline enqueue from
            # TMDB sync is the primary Fanart trigger now)
            "enrich-fanart": {
                "task": "maintenance.enrich_fanart",
                "schedule": crontab(minute="7,22,37,52"),
            },
            # OMDb enrichment scan (every 30 min at off-peak minutes)
            "enrich-omdb": {
                "task": "maintenance.enrich_omdb",
                "schedule": crontab(minute="13,43"),
            },
            # Game feed refresh (daily at 3am)
            "refresh-game-feed": {
                "task": "maintenance.refresh_game_feed",
                "schedule": crontab(hour="3", minute="53"),
            },
            # Catalog hydration — continuous background re-sync of stale items (every 30 min)
            "catalog-hydration": {
                "task": "maintenance.catalog_hydration",
                "schedule": crontab(minute="17,47"),
            },
            # Catalog seeding — three independent seeders run concurrently.
            # People cascade to movies/shows via combined_credits filmography.
            "seed-people": {
                "task": "seed.people_cycle",
                "schedule": crontab(minute="*/5"),
            },
            "seed-steam": {
                "task": "seed.steam_cycle",
                "schedule": crontab(minute="*/5"),
            },
            "seed-igdb": {
                "task": "seed.igdb_cycle",
                "schedule": crontab(minute="*/5"),
            },
            "seed-musicbrainz": {
                "task": "seed.musicbrainz_cycle",
                "schedule": crontab(minute="*/5"),
            },
            # Steam enrichment scan (every 15 min at off-peak minute)
            "enrich-steam": {
                "task": "maintenance.enrich_steam",
                "schedule": crontab(minute="3,18,33,48"),
            },
            # Steam name matching scan (every 30 min at off-peak minutes)
            "steam-name-match": {
                "task": "maintenance.steam_name_match",
                "schedule": crontab(minute="23,53"),
            },
            # SteamGridDB enrichment scan (every 30 min at off-peak minutes)
            "enrich-steamgrid": {
                "task": "maintenance.enrich_steamgrid",
                "schedule": crontab(minute="27,57"),
            },
            # Steam CCU batch update (every 5 min)
            "steam-ccu-batch": {
                "task": "maintenance.steam_ccu_batch",
                "schedule": crontab(minute="*/5"),
            },
            "sync-plex-accounts": {
                "task": "maintenance.sync_plex_accounts",
                "schedule": crontab(minute="11,41"),
            },
            # Spotify enrichment scan (every 30 min)
            "enrich-spotify": {
                "task": "maintenance.enrich_spotify",
                "schedule": crontab(minute="19,49"),
            },
            # Last.fm enrichment scan (every 30 min)
            "enrich-lastfm": {
                "task": "maintenance.enrich_lastfm",
                "schedule": crontab(minute="29,59"),
            },
            # Progress summary log (every 60s at off-peak second)
            "progress-summary": {
                "task": "maintenance.progress_summary",
                "schedule": crontab(minute="*"),
            },
        },
    }
)

# Suppress SQLAlchemy engine INFO logs. We set the level both here (module
# import time, catches most cases) and again via worker_process_init (after
# Celery reconfigures logging post-fork).
import logging as _logging
_logging.getLogger("sqlalchemy.engine").setLevel(_logging.WARNING)

import celery.signals

@celery.signals.worker_process_init.connect
def _suppress_sqlalchemy_logs(**kwargs):
    _logging.getLogger("sqlalchemy.engine").setLevel(_logging.WARNING)


# Register tasks — explicit imports so tasks are guaranteed to be discovered.
import otix.tasks.sync  # noqa: E402, F811
import otix.tasks.maintenance  # noqa: E402, F811
import otix.tasks.catalog_seed  # noqa: E402, F811
import otix.tasks.xp  # noqa: E402, F811
