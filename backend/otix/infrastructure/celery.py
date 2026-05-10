"""Celery application with queue routing and beat schedule.

Queue design (3 queues, prefix-based routing):

  fast — tmdb, steam (high throughput), plus slow-task overflow when idle
  slow — igdb, fanart, omdb, control, default (rate-limited providers)
  ccu  — steam_ccu (dedicated low-concurrency)

When the fast queue is nearly empty (< 100 tasks), slow-bound sync tasks
are routed to fast instead so idle fast workers help drain the backlog.

Rate limiting is handled in-app by BaseProvider's Redis token bucket.
"""

from __future__ import annotations

import redis

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from otix.infrastructure.config import settings

_redis: redis.Redis | None = None


def _get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _redis


def _fast_queue_idle() -> bool:
    """True when the fast queue has fewer than 100 tasks — workers are idle."""
    try:
        return _get_redis().llen("fast") < 100
    except Exception:
        return False


def route_task(name: str, *args, **kwargs) -> str | None:
    """Route tasks to queues based on name prefix.

    When the fast queue is idle, sync.* tasks that would normally go to slow
    are routed to fast instead so the backlog drains faster.
    """
    if name.startswith("steam.ccu."):
        return "ccu"
    if name.startswith("seed."):
        return "default"
    if name.startswith("sync.") and _fast_queue_idle():
        return "fast"
    return "slow"


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
        "task_default_queue": "slow",
        "task_queues": [
            Queue("fast", queue_arguments={"x-max-priority": 10}),
            Queue("slow", queue_arguments={"x-max-priority": 10}),
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
            # Fanart enrichment scan (every 30 min at off-peak minutes)
            "enrich-fanart": {
                "task": "maintenance.enrich_fanart",
                "schedule": crontab(minute="7,37"),
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
