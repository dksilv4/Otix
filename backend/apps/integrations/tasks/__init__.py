"""Celery tasks for integrations background sync.

Autodiscovered by ``config.celery`` (``app.autodiscover_tasks()`` scans each
installed app's ``tasks`` module). ``run_sync_job`` is the generic executor: it
looks up a ``SyncJob`` row and hands it to the provider-agnostic orchestrator
(``apps.integrations.services.sync.execute_sync_job``), which claims the job,
runs the provider's registered engine, and publishes the SSE terminal frame.
"""

from __future__ import annotations

from celery import shared_task
from django.conf import settings

from apps.integrations.models import SyncJob

# Importing the engine services runs their register_sync_engine decorators so
# the worker (and the eager-mode task path) can resolve provider engines by name.
# catalog_seed is imported for its beat bodies (the tasks reference the module
# attributes at call time so tests patch them).
from apps.integrations.services import (
    catalog_seed,  # noqa: F401
    igdb_sync,  # noqa: F401
    musicbrainz_sync,  # noqa: F401
    plex_sync,  # noqa: F401
    steamgrid_sync,  # noqa: F401
    tmdb_sync,  # noqa: F401
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


@shared_task(name="integrations.sync_company")
def sync_company(company_pk: int) -> dict:
    """Full-sync a followed company: resolve its TMDB id and enqueue its titles.

    Runs worker-side so the TMDB id lookup (which may hit ``/search/company``)
    never blocks the follow request. Resolved via the service module attribute
    at call time so tests patch the body.
    """
    from apps.company.models import Company
    from apps.media.services.tmdb_company import enqueue_company_sync

    company = Company.objects.filter(pk=company_pk).first()
    if company is None:
        return {"status": "missing", "company_id": company_pk}
    job = enqueue_company_sync(company)
    if job is None:
        return {"status": "skipped", "company_id": company_pk}
    return {"status": "enqueued", "company_id": company_pk, "sync_job_id": job.pk}


@shared_task(name="integrations.catalog_daily_tmdb")
def catalog_daily_tmdb() -> dict:
    """Daily catalog refresh — enqueue the unseen movie/show ids from the TMDB
    ID exports. No-ops (``unconfigured``) without a TMDB API key so a beat
    process that has none does not error every night; the per-kind walk is
    bounded by ``CATALOG_DAILY_TMDB_LIMIT`` (None = whole file). Resolved via the
    service module attribute at call time so tests patch the body."""
    if not settings.TMDB_API_KEY:
        return {"status": "unconfigured"}
    return catalog_seed.run_daily_tmdb_import(limit=settings.CATALOG_DAILY_TMDB_LIMIT)


@shared_task(name="integrations.catalog_drain")
def catalog_drain() -> dict:
    """Backlog drain — run the oldest pending sync jobs through the engines,
    bounded by ``CATALOG_DRAIN_LIMIT``. Doubles as the periodic beat body the
    catalog-seed driver was designed for (inc 44)."""
    return catalog_seed.run_pending_jobs(limit=settings.CATALOG_DRAIN_LIMIT)
