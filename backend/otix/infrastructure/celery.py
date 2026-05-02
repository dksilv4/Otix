"""Celery application with queue routing and beat schedule.

Queue design (3 queues, prefix-based routing):

  fast — tmdb, steam (high throughput)
  slow — igdb, fanart, omdb, control, default (rate-limited providers)
  ccu  — steam_ccu (dedicated low-concurrency)

Rate limiting is handled in-app by BaseProvider's Redis token bucket.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from otix.infrastructure.config import settings


def route_task(name: str, *args, **kwargs) -> str | None:
    """Route tasks to queues based on name prefix."""
    if name.startswith("steam.ccu."):
        return "ccu"
    if name.startswith(("sync.tmdb.", "sync.steam.")):
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
            # Discovery feeds (hourly at off-peak minutes)
            "refresh-discover-feed": {
                "task": "maintenance.refresh_discover_feed",
                "schedule": crontab(minute="17"),
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
            # Game feed refresh (every 6 hours at off-peak minute)
            "refresh-game-feed": {
                "task": "maintenance.refresh_game_feed",
                "schedule": crontab(minute="53", hour="*/6"),
            },
            # Steam enrichment scan (every 15 min at off-peak minute)
            "enrich-steam": {
                "task": "maintenance.enrich_steam",
                "schedule": crontab(minute="3,18,33,48"),
            },
            # Steam CCU batch update (every 5 min)
            "steam-ccu-batch": {
                "task": "maintenance.steam_ccu_batch",
                "schedule": crontab(minute="*/5"),
            },
        },
    }
)

# Register tasks — explicit imports so tasks are guaranteed to be discovered.
import otix.tasks.sync  # noqa: E402, F811
import otix.tasks.maintenance  # noqa: E402, F811
