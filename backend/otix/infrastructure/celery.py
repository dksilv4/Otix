"""Celery application with queue routing and beat schedule.

Queue design (7 queues, prefix-based routing):

  Fast worker (high throughput, prefetch=1):
    tmdb        — sync.tmdb.* tasks
    steam       — sync.steam.* tasks

  Slow worker (low throughput, for rate-limited providers):
    igdb        — sync.igdb.* tasks
    fanart      — sync.fanart.* tasks
    control     — maintenance.* tasks
    default     — catch-all

  CCU worker (dedicated low-concurrency):
    steam_ccu   — steam.ccu.* tasks
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Queue

from otix.infrastructure.config import settings


def _parse_concurrency(raw: str) -> int | None:
    if not raw:
        return None
    try:
        return int(raw)
    except ValueError:
        return None


def route_task(name: str, *args, **kwargs) -> str | None:
    """Route tasks to queues based on name prefix."""
    if name.startswith("sync.tmdb."):
        return "tmdb"
    if name.startswith("sync.steam."):
        return "steam"
    if name.startswith("steam.ccu."):
        return "steam_ccu"
    if name.startswith("sync.igdb."):
        return "igdb"
    if name.startswith("sync.fanart."):
        return "fanart"
    if name.startswith("maintenance."):
        return "control"
    return "default"


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
        "task_default_queue": "default",
        "task_queues": [
            Queue("tmdb", queue_arguments={"x-max-priority": 10}),
            Queue("steam", queue_arguments={"x-max-priority": 10}),
            Queue("igdb", queue_arguments={"x-max-priority": 10}),
            Queue("fanart", queue_arguments={"x-max-priority": 10}),
            Queue("control", queue_arguments={"x-max-priority": 10}),
            Queue("default", queue_arguments={"x-max-priority": 10}),
            Queue("steam_ccu", queue_arguments={"x-max-priority": 10}),
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
        },
    }
)

# Register tasks — explicit imports so tasks are guaranteed to be discovered.
import otix.tasks.sync  # noqa: E402, F811
import otix.tasks.maintenance  # noqa: E402, F811
