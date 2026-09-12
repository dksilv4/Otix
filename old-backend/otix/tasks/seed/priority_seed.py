"""Curated top-N seeding for the full-hydration pipeline.

``seed.priority_seed`` enqueues a provider's top-N candidates into the
priority queue, hydrates side data (genres with media-type support), then
kicks off the priority drain so items start fully processing immediately.
Related media discovered while processing is enqueued with higher priority
by ``sync.media.fully_process``, so the most-likely-to-be-used titles get
processed first and the backlog is only a fallback.
"""

from __future__ import annotations

import structlog

from otix.hydration import get_hydrator
from otix.hydration.queue import enqueue_candidate
from otix.infrastructure.celery import app
from otix.lib.concurrency import run_async

logger = structlog.get_logger()


@app.task(name="seed.priority_seed")
def priority_seed(media_type: str, limit: int = 50) -> dict:
    return run_async(_priority_seed(media_type, limit))


async def _priority_seed(media_type: str, limit: int) -> dict:
    hydrator = get_hydrator(media_type)

    side = await hydrator.hydrate_side_data(media_type)
    if side.get("updated", 0):
        logger.info("side data hydrated", media_type=media_type, updated=side["updated"])

    ids = await hydrator.discover_seed(media_type, limit)
    enqueued = 0
    for ext_id in ids:
        if await enqueue_candidate(media_type, int(ext_id), priority=1.0):
            enqueued += 1

    if enqueued:
        app.send_task("sync.media.drain_priority")
        logger.info("priority seed enqueued", media_type=media_type, limit=limit, enqueued=enqueued)
    else:
        logger.info("priority seed empty", media_type=media_type, limit=limit)

    return {"media_type": media_type, "limit": limit, "enqueued": enqueued}
