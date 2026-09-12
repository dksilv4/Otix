# TODO: Review this file
"""Celery application with queue routing and beat schedule.

Queue design — per-provider isolation (prevents starvation), 4 purpose-based workers:

  ingest-tmdb, ingest-steam, ingest-igdb, ingest-musicbrainz, ingest-deezer
      → worker-ingest (c=4): primary data sync/seed
  enrich-fanart, enrich-omdb, enrich-steamgrid, enrich-lastfm, enrich-theaudiodb, enrich-lrclib
      → worker-enrich (c=2): secondary enrichment
  reactive-fast, reactive-user
      → worker-reactive (c=2): user-initiated, search, low-latency
  maintain
      → worker-embedding (c=3): ONNX embedding generation
      → worker-maintain (c=2): background maintenance, CCU, catch-all

Rate limiting is handled in-app by BaseProvider's Redis token bucket.
"""

from __future__ import annotations

from celery import Celery
from celery.schedules import crontab
from kombu import Exchange, Queue

from otix.infrastructure.config import settings


def route_task(name: str, *args, **kwargs) -> str | None:
    """Route tasks to purpose-based queues with per-provider isolation."""
    if name.startswith("steam.ccu."):
        return "maintain"
    if name.startswith("seed."):
        return "reactive-user"
    if name.startswith("maintenance."):
        if "steam_ccu" in name:
            return "maintain"
        if "plex_sync_user" in name or "sync_plex_accounts" in name:
            return "reactive-user"
        return "maintain"
    if name == "sync.media.rehydrate":
        return "reactive-user"
    if name.startswith("sync.tmdb."):
        return "ingest-tmdb"
    if name.startswith("sync.steam."):
        return "ingest-steam"
    if name.startswith("sync.deezer."):
        return "ingest-deezer"
    if name.startswith("sync.theaudiodb."):
        return "enrich-theaudiodb"
    if name.startswith("sync.youtube."):
        return "reactive-user"
    if name.startswith("sync.igdb."):
        return "ingest-igdb"
    if name.startswith("sync.fanart."):
        return "enrich-fanart"
    if name.startswith("sync.omdb."):
        return "enrich-omdb"
    if name.startswith("sync.steamgrid."):
        return "enrich-steamgrid"
    if name.startswith("sync.musicbrainz."):
        return "ingest-musicbrainz"
    if name.startswith("sync.lrclib."):
        return "enrich-lrclib"
    if name.startswith("sync.lastfm."):
        return "enrich-lastfm"
    if name.startswith("search."):
        return "reactive-fast"
    if name.startswith("embedding."):
        return "embedding"
    if name.startswith("xp."):
        return "reactive-user"
    if name.startswith("streak."):
        return "reactive-user"
    if name.startswith("gamification."):
        return "reactive-user"
    if name.startswith("karma."):
        return "reactive-user"
    if name.startswith("promotions."):
        return "maintain"
    return "maintain"


app = Celery("otix")

# Movie/show auto-sync — TMDB daily export import + backlog drain.
# The daily import downloads all TMDB export files once/day and bulk-inserts
# ExternalID stubs; the backlog cycle drains those stubs into sync.tmdb.movie
# / sync.tmdb.show every few minutes. This is what rebuilds the movie/show
# catalog after the games/music push. Other media types (games, music) are
# still driven manually via seed.priority_seed.
_beat_schedule: dict = {
    "seed-tmdb-daily-import": {
        "task": "seed.tmdb_daily_import",
        "schedule": crontab(hour="3", minute="7"),
    },
    "seed-tmdb-backlog": {
        "task": "seed.tmdb_backlog_cycle",
        "schedule": crontab(minute="*/5"),
    },
}

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
        "worker_hijack_root_logger": False,
        "worker_prefetch_multiplier": settings.celery_worker_prefetch_multiplier,
        "task_default_queue": "maintain",
        "beat_max_loop_interval": 30,  # wake at least every 30s for minutely tasks
        "task_queues": [
            Queue(
                "ingest-tmdb",
                Exchange("ingest-tmdb", type="direct"),
                routing_key="ingest-tmdb",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "ingest-steam",
                Exchange("ingest-steam", type="direct"),
                routing_key="ingest-steam",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "ingest-igdb",
                Exchange("ingest-igdb", type="direct"),
                routing_key="ingest-igdb",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "ingest-musicbrainz",
                Exchange("ingest-musicbrainz", type="direct"),
                routing_key="ingest-musicbrainz",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "ingest-deezer",
                Exchange("ingest-deezer", type="direct"),
                routing_key="ingest-deezer",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-fanart",
                Exchange("enrich-fanart", type="direct"),
                routing_key="enrich-fanart",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-omdb",
                Exchange("enrich-omdb", type="direct"),
                routing_key="enrich-omdb",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-steamgrid",
                Exchange("enrich-steamgrid", type="direct"),
                routing_key="enrich-steamgrid",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-lastfm",
                Exchange("enrich-lastfm", type="direct"),
                routing_key="enrich-lastfm",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-theaudiodb",
                Exchange("enrich-theaudiodb", type="direct"),
                routing_key="enrich-theaudiodb",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "enrich-lrclib",
                Exchange("enrich-lrclib", type="direct"),
                routing_key="enrich-lrclib",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "reactive-fast",
                Exchange("reactive-fast", type="direct"),
                routing_key="reactive-fast",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "reactive-user",
                Exchange("reactive-user", type="direct"),
                routing_key="reactive-user",
                queue_arguments={"x-max-priority": 10},
            ),
            Queue(
                "maintain",
                Exchange("maintain", type="direct"),
                routing_key="maintain",
                queue_arguments={"x-max-priority": 10},
            ),
        ],
        "task_routes": (route_task,),
        "task_create_missing_queues": True,
        "beat_schedule": _beat_schedule,
    }
)

# worker_hijack_root_logger=False keeps Celery from overwriting our log levels.
# We call setup_logging at import time and re-apply after each fork.
import celery.signals  # noqa: E402

from otix.infrastructure.logging import setup_logging  # noqa: E402

setup_logging()


@celery.signals.worker_process_init.connect
def _on_worker_process_init(**kwargs):
    setup_logging()


# Register tasks — explicit top-level imports so all @app.task decorators fire.
# Each import guarantees the worker knows the task when it picks up a message.
import otix.tasks.gamification  # noqa: F401 — gamification.*
import otix.tasks.maintenance  # noqa: F401 — maintenance.* (via __init__ imports all submodules)
import otix.tasks.seed.catalog_seed  # noqa: F401 — seed.* IGDB/Steam/MusicBrainz/Deezer
import otix.tasks.seed.priority_seed  # noqa: F401 — seed.priority_seed
import otix.tasks.seed.tmdb_seed  # noqa: F401 — seed.* TMDB cycle
import otix.tasks.sync.deezer  # noqa: F401 — seed.deezer_cycle, sync.deezer.*
import otix.tasks.sync.embedding  # noqa: F401 — embedding.*
import otix.tasks.sync.fanart  # noqa: F401 — sync.fanart.*
import otix.tasks.sync.fully_process  # noqa: F401 — sync.media.fully_process, sync.media.drain_priority
import otix.tasks.sync.igdb  # noqa: F401 — sync.igdb.*
import otix.tasks.sync.lastfm  # noqa: F401 — sync.lastfm.*
import otix.tasks.sync.lrclib  # noqa: F401 — sync.lrclib.*
import otix.tasks.sync.media  # noqa: F401 — sync.media.*
import otix.tasks.sync.musicbrainz  # noqa: F401 — sync.musicbrainz.*
import otix.tasks.sync.omdb  # noqa: F401 — sync.omdb.*
import otix.tasks.sync.search  # noqa: F401 — search.*
import otix.tasks.sync.steam  # noqa: F401 — sync.steam.*, sync.steamgrid.*
import otix.tasks.sync.theaudiodb  # noqa: F401 — sync.theaudiodb.*
import otix.tasks.sync.tmdb  # noqa: F401 — sync.tmdb.*
import otix.tasks.sync.youtube  # noqa: F401 — sync.youtube.*
import otix.tasks.xp  # noqa: F401 — xp.*
