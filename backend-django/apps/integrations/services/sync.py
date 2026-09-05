"""Provider background-sync: enqueue, job lifecycle, engine orchestration.

``POST /{provider}/sync`` enqueues a ``SyncJob`` row whose pk doubles as the SSE
``task_id``; ``GET .../{task_id}/stream`` reads the same keys back. Executing the
engine is orchestrated here: a worker claims the pending row, publishes
``sync_started``, runs the provider's registered engine, then publishes
``sync_complete`` (or ``error``) and stores the finished result for late-joining
SSE clients. Provider engines register under their ``provider`` via
``register_sync_engine`` and publish intermediate ``sync_progress`` frames on
their own ``{provider}:sync`` namespace as they work.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from typing import Any

from django.utils import timezone

from apps.integrations.models import SyncJob
from core import progress as progress_lib

logger = logging.getLogger(__name__)

SyncEngine = Callable[[SyncJob], dict[str, Any]]

_ENGINES: dict[str, SyncEngine] = {}

_ERROR_MESSAGE = "Sync failed unexpectedly"


def register_sync_engine(provider: str) -> Callable[[SyncEngine], SyncEngine]:
    """Decorator registering a provider's sync engine under its ``provider``."""

    def decorator(func: SyncEngine) -> SyncEngine:
        _ENGINES[provider] = func
        return func

    return decorator


def get_sync_engine(provider: str) -> SyncEngine | None:
    """Return the engine registered for *provider* (``None`` if unregistered)."""
    return _ENGINES.get(provider)


def enqueue_sync_job(*, provider: str, entity_type: str, external_id: str) -> SyncJob:
    """Persist a pending provider sync job and hand back the row.

    The returned job's integer pk doubles as the SSE ``task_id``: progress
    publishers address channel/result/progress keys by ``{provider}:sync:{pk}``,
    so the POST (enqueue) and GET (stream) routes agree on the id without a
    separate task-uuid column.
    """
    return SyncJob.objects.create(
        provider=provider,
        entity_type=entity_type,
        external_id=external_id,
        status="pending",
        phase="core",
    )


def claim_job(pk: int) -> SyncJob | None:
    """Atomically transition a pending job to running; ``None`` if not claimable.

    The conditional ``UPDATE ... WHERE status='pending'`` guarantees exactly one
    worker wins the row even if several pick up the same task id.
    """
    claimed = SyncJob.objects.filter(pk=pk, status="pending").update(
        status="running", started_at=timezone.now()
    )
    if not claimed:
        return None
    return SyncJob.objects.get(pk=pk)


def complete_job(job: SyncJob) -> SyncJob:
    job.status = "completed"
    job.completed_at = timezone.now()
    job.save(update_fields=("status", "completed_at"))
    return job


def fail_job(job: SyncJob, *, error: str) -> SyncJob:
    job.status = "failed"
    job.error_message = error
    job.completed_at = timezone.now()
    job.save(update_fields=("status", "error_message", "completed_at"))
    return job


def _job_context(job: SyncJob) -> dict[str, str]:
    return {
        "provider": job.provider,
        "entity_type": job.entity_type,
        "external_id": job.external_id,
    }


def _abort(
    job: SyncJob, task_id: str, *, message: str, detail: str | None = None
) -> dict[str, Any]:
    """Publish + store an ``error`` terminal state and mark the job failed."""
    progress = progress_lib.RedisProgress(f"{job.provider}:sync")
    result = {"error": message, "task_id": task_id, **_job_context(job)}
    progress.store_result(task_id, result)
    progress.publish(task_id, "error", message=message)
    fail_job(job, error=detail or message)
    logger.error("sync job %s failed: %s", task_id, detail or message)
    return {"status": "failed", "task_id": task_id, "error": message}


def execute_sync_job(job_pk: int) -> dict[str, Any]:
    """Run a claimed provider sync job end to end, returning its outcome.

    Claim → publish ``sync_started`` → run the provider engine → store + publish
    ``sync_complete`` and mark the job completed. Failure paths (no engine
    registered, engine exception) store + publish an ``error`` terminal state and
    mark the job failed; the outcome dict is returned without raising so the
    caller (a Celery task) never sees an unhandled error. Live frames carry the
    provider context but not ``task_id`` (the client already holds it from the
    channel); the stored result adds ``task_id`` so a replay is self-describing.
    """
    job = claim_job(job_pk)
    if job is None:
        return {"status": "skipped", "task_id": str(job_pk)}

    task_id = str(job.pk)
    progress = progress_lib.RedisProgress(f"{job.provider}:sync")
    context = _job_context(job)
    progress.publish(task_id, "sync_started", **context)

    engine = get_sync_engine(job.provider)
    if engine is None:
        return _abort(
            job,
            task_id,
            message=f"No sync engine registered for provider '{job.provider}'",
        )

    try:
        summary = engine(job)
    except Exception as exc:  # noqa: BLE001 - any engine failure is a user-facing "error" frame
        logger.exception("sync job %s engine raised", task_id)
        return _abort(job, task_id, message=_ERROR_MESSAGE, detail=str(exc))

    frame = {**context, **summary}
    result = {**frame, "task_id": task_id}
    progress.store_result(task_id, result)
    progress.publish(task_id, "sync_complete", **frame)
    complete_job(job)
    logger.info("sync job %s completed (%s)", task_id, job.provider)
    return {**result, "status": "success"}
