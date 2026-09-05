"""Provider background-sync enqueue helpers (SSE progress streams)."""

from __future__ import annotations

from apps.integrations.models import SyncJob


def enqueue_sync_job(*, provider: str, entity_type: str, external_id: str) -> SyncJob:
    """Persist a pending provider sync job and hand back the row.

    The returned job's integer pk doubles as the SSE ``task_id``: progress
    publishers address channel/result/progress keys by ``{provider}:sync:{pk}``,
    so the POST (enqueue) and GET (stream) routes agree on the id without a
    separate task-uuid column. Executing the sync engine is deferred platform
    work; rows stay ``pending`` until a worker picks them up.
    """
    return SyncJob.objects.create(
        provider=provider,
        entity_type=entity_type,
        external_id=external_id,
        status="pending",
        phase="core",
    )
