"""Full-hydration orchestrator and priority-queue drain.

``sync.media.fully_process`` is the single entry point that fully processes
one media item (all providers, all enrichment, embedding) before returning.
``sync.media.drain_priority`` feeds it from the priority queue (related media
discovered while processing) and, when that is empty, from the TMDB stub
backlog so everything is eventually hydrated.
"""

from __future__ import annotations

import structlog

from otix.hydration import get_hydrator
from otix.hydration.queue import (
    claim_backlog,
    clear_drain_needed,
    drain_needed,
    enqueue_candidate,
    fetch_backlog,
    pop_candidates,
    priority_size,
)
from otix.infrastructure.celery import app
from otix.lib.concurrency import run_async

logger = structlog.get_logger()

DRAIN_COUNTDOWN = 30  # seconds between drain cycles while work is pending
DRAIN_LINGER = 60  # one trailing cycle after the queue looks empty


@app.task(
    name="sync.media.fully_process",
    bind=True,
    acks_late=True,
    reject_on_worker_lost=True,
    max_retries=3,
    default_retry_delay=60,
)
def fully_process(self, media_type: str, external_id: int | str, force: bool = False) -> dict | None:
    return run_async(_fully_process(media_type, external_id, force=force, task=self))


async def _fully_process(media_type: str, external_id: int | str, *, force: bool, task=None) -> dict | None:
    hydrator = get_hydrator(media_type)
    try:
        result = await hydrator.hydrate_complete(media_type, external_id, force=force)
    except Exception as exc:  # noqa: BLE001
        if task is not None:
            raise task.retry(exc=exc)  # noqa: B904
        raise
    if result is None:
        return None

    item_id = result.get("otix_id")
    if item_id:
        candidates = await hydrator.related_candidates(item_id)
        added = 0
        for c in candidates:
            if await enqueue_candidate(c.media_type, c.external_id, priority=c.priority):
                added += 1
        if added:
            logger.info("related candidates enqueued", media_type=media_type, item_id=item_id, added=added)
    return result


@app.task(name="sync.media.drain_priority", bind=True)
def drain_priority(self) -> dict:
    return run_async(_drain_priority(self))


async def _drain_priority(self) -> dict:
    # 1. Priority queue first (related media is the most-likely-to-be-used).
    candidates = await pop_candidates()
    if candidates:
        for media_type, ext in candidates:
            app.send_task("sync.media.fully_process", args=[media_type, ext])
        _reschedule_drain(self, DRAIN_COUNTDOWN)
        return {"source": "priority", "dispatched": len(candidates), "remaining": await priority_size()}

    # 2. Fallback to the TMDB stub backlog so everything is eventually hydrated.
    backlog = await fetch_backlog()
    if not backlog:
        # Nothing unclaimed right now. Linger once in case in-flight items are
        # still enqueueing related candidates, then let the pipeline go quiet.
        if await drain_needed():
            await clear_drain_needed()
            _reschedule_drain(self, DRAIN_LINGER)
        return {"source": "empty", "dispatched": 0, "remaining": 0}

    await claim_backlog(backlog)
    for media_type, ext in backlog:
        app.send_task("sync.media.fully_process", args=[media_type, ext])
    _reschedule_drain(self, DRAIN_COUNTDOWN)
    return {"source": "backlog", "dispatched": len(backlog), "remaining": await priority_size()}


def _reschedule_drain(task, countdown: int) -> None:
    task.apply_async(countdown=countdown)
