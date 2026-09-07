"""Complete a parked proxy-fetch job from a raw payload a client returns.

When ``execute_sync_job`` parks a ``SyncJob`` as ``awaiting_client``, the
external client fetches the provider payload with the user's own key and POSTs
the raw dict to ``POST /api/v1/fetch/result``. This module seeds that raw into
the catalog through the same synchronous seed entry points the server-side
``fetch_and_seed_*`` engines use, then completes the job and publishes the
``sync_complete`` terminal frame so the original requester's SSE stream closes.

Seeders are keyed by ``(provider, entity_type)`` — the same pair that drives
the sync engines. Importing media seed services is deferred until call time so
this module stays lightweight and never participates in an import cycle.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from apps.integrations.models import SyncJob
from apps.integrations.services.fetch_proxy import AWAITING_CLIENT
from apps.integrations.services.sync import complete_job, fail_job
from core import progress as progress_lib

logger = logging.getLogger(__name__)

# A seeder turns a client-fetched raw dict into catalog rows and returns the
# seeded MediaItem id. It mirrors the seed half of ``fetch_and_seed_*``.
Seeder = Callable[[SyncJob, dict[str, Any]], int]

_SEEDERS: dict[tuple[str, str], Seeder] = {}


def _seed_tmdb_movie(job: SyncJob, raw: dict[str, Any]) -> int:
    from apps.media.services.tmdb_ingest import seed_movie_from_tmdb

    return seed_movie_from_tmdb(raw)


def _seed_tmdb_show(job: SyncJob, raw: dict[str, Any]) -> int:
    from apps.media.services.tmdb_ingest import seed_show_from_tmdb

    return seed_show_from_tmdb(raw)


def _seed_igdb_game(job: SyncJob, raw: dict[str, Any]) -> int:
    from apps.media.services.igdb_ingest import seed_game_from_igdb

    return seed_game_from_igdb(raw, int(job.external_id))


def _seed_mb_album(job: SyncJob, raw: dict[str, Any]) -> int:
    from apps.media.services.musicbrainz_ingest import seed_album_from_musicbrainz

    return seed_album_from_musicbrainz(raw)


def register_seeder(provider: str, entity_type: str) -> Callable[[Seeder], Seeder]:
    """Decorator registering the seeder for a ``(provider, entity_type)`` pair."""

    def decorator(func: Seeder) -> Seeder:
        _SEEDERS[(provider, entity_type)] = func
        return func

    return decorator


def get_seeder(provider: str, entity_type: str) -> Seeder | None:
    return _SEEDERS.get((provider, entity_type))


# Wire the built-in seeders the proxy path supports. IGDB's game seeder needs
# the external id from the job, so its raw payload is the IGDB game detail dict.
for _pair, _seeder in (
    (("tmdb", "movie"), _seed_tmdb_movie),
    (("tmdb", "show"), _seed_tmdb_show),
    (("igdb", "game"), _seed_igdb_game),
    (("musicbrainz", "album"), _seed_mb_album),
):
    _SEEDERS[_pair] = _seeder


def complete_from_client(job: SyncJob, raw: dict[str, Any]) -> dict[str, Any]:
    """Seed *job* from a client-returned raw dict and finish it.

    Adopts the parked job (``awaiting_client`` → ``running``) so a racing
    duplicate result POST cannot double-seed, then runs the registered seeder
    and completes the job: ``sync_complete`` terminal frame + stored result on
    ``{provider}:sync``. Returns an outcome dict; an unsupported entity returns
    ``{"error": ...}`` without touching the job so the view can 400.
    """
    seeder = get_seeder(job.provider, job.entity_type)
    if seeder is None:
        return {
            "error": (
                f"Proxy-fetch has no seeder for "
                f"'{job.provider}'/'{job.entity_type}'"
            )
        }

    adopted = SyncJob.objects.filter(pk=job.pk, status=AWAITING_CLIENT).update(
        status="running"
    )
    if not adopted:
        return {"error": "Fetch job is no longer awaiting a client result"}

    job.refresh_from_db(fields=("status",))
    task_id = str(job.pk)
    try:
        media_id = seeder(job, raw)
    except Exception as exc:  # noqa: BLE001 - a bad raw dict is a user error frame
        logger.warning("fetch result %s failed to seed: %s", task_id, exc)
        fail_job(job, error=str(exc))
        return {"error": f"Seeding failed: {exc}"}

    context = {
        "provider": job.provider,
        "entity_type": job.entity_type,
        "external_id": job.external_id,
    }
    summary = {"media_id": media_id, "resolved_by": "client"}
    frame = {**context, **summary}
    result = {**frame, "task_id": task_id}
    progress = progress_lib.RedisProgress(f"{job.provider}:sync")
    progress.store_result(task_id, result)
    progress.publish(task_id, "sync_complete", **frame)
    complete_job(job)
    logger.info("fetch job %s seeded media %s from client", task_id, media_id)
    return {"status": "success", "task_id": task_id, **summary}
