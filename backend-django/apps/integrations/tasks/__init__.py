"""Celery tasks for integrations background sync.

Autodiscovered by ``config.celery`` (``app.autodiscover_tasks()`` scans each
installed app's ``tasks`` module). ``run_sync_job`` is the generic executor: it
looks up a ``SyncJob`` row and hands it to the provider-agnostic orchestrator
(``apps.integrations.services.sync.execute_sync_job``), which claims the job,
runs the provider's registered engine, and publishes the SSE terminal frame.
"""

from __future__ import annotations

from celery import shared_task

from apps.integrations.models import SyncJob

# Importing the engine services runs their register_sync_engine decorators so
# the worker (and the eager-mode task path) can resolve provider engines by name.
from apps.integrations.services import (
    plex_sync,  # noqa: F401
    youtube_sync,  # noqa: F401
)
from apps.integrations.services.sync import execute_sync_job


@shared_task(name="integrations.run_sync_job")
def run_sync_job(sync_job_pk: int) -> dict:
    """Execute the pending sync job with pk *sync_job_pk* and report its outcome."""
    job = SyncJob.objects.filter(pk=sync_job_pk).first()
    if job is None:
        return {"status": "missing", "task_id": str(sync_job_pk)}
    return execute_sync_job(sync_job_pk)
