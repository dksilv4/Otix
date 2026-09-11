"""Full company sync: TMDB metadata upsert + discover-all-titles + seed fan-out.

Following a company triggers this: fetch ``/company/{id}`` (name, logo, country,
description, homepage), page TMDB ``discover`` for *every* movie and TV title the
company is involved in, then enqueue one ``SyncJob`` per unseen title so the
existing TMDB engine runs its full hydration on each (credits, releases, videos,
images, ratings, watch providers, OMDb/Fanart/Wikidata-distributor tails).

``enqueue_company_sync`` is the worker-side entrypoint (called by the
``integrations.sync_company`` task): it resolves the company's TMDB id (stored
``ExternalID``, else a name search), dedupes against a live company job, creates
the ``company`` ``SyncJob`` and dispatches it. The engine branch in
``apps.integrations.services.tmdb_sync`` runs ``fetch_and_seed_company`` and then
dispatches the child title jobs so they seed immediately.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from asgiref.sync import sync_to_async
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.company.models import Company
from apps.integrations.models import SyncJob
from apps.integrations.services.catalog_seed import enqueue_seed_jobs
from apps.media.models import ExternalID
from apps.media.services.tmdb_ingest import _image_url, _upsert_external
from core.providers.tmdb import TMDBProvider

logger = logging.getLogger(__name__)

# TMDB ``discover`` caps at page 500 (20 results/page) upstream, so this is the
# real ceiling on "all titles" for a single company/media type.
_MAX_DISCOVER_PAGES = 500
# TMDB media kind → the SyncJob ``entity_type`` the tmdb engine dispatches on.
_DISCOVER_ENTITIES: tuple[tuple[str, str], ...] = (("movie", "movie"), ("tv", "show"))


def _company_content_type() -> ContentType:
    return ContentType.objects.get_for_model(Company)


def _stored_tmdb_id(company: Company) -> int | None:
    """The company's TMDB company id from its ``ExternalID`` row, if any."""
    raw = (
        ExternalID.objects.filter(
            content_type=_company_content_type(),
            provider="tmdb",
            object_id=company.pk,
        )
        .values_list("external_id", flat=True)
        .first()
    )
    if raw is None:
        return None
    try:
        return int(raw)
    except (TypeError, ValueError):
        return None


def _link_company_tmdb_id(company: Company, tmdb_company_id: int) -> None:
    """Persist the company's TMDB id as an ``ExternalID`` (media_type=None)."""
    _upsert_external(
        _company_content_type(),
        company.pk,
        "tmdb",
        str(tmdb_company_id),
        media_type=None,
    )


def upsert_company_from_tmdb(company: Company, raw: dict[str, Any]) -> Company:
    """Refresh the ``Company`` row from a TMDB ``/company/{id}`` payload.

    Only fields TMDB actually returns are overwritten; a missing value keeps the
    existing one rather than blanking a previously-good logo/country.
    """
    updates: dict[str, Any] = {
        "name": str(raw.get("name") or company.name).strip() or company.name,
        "logo_url": _image_url(raw.get("logo_path"), size="w185") or company.logo_url,
        "origin_country": raw.get("origin_country") or company.origin_country,
        "description": (raw.get("description") or "").strip() or company.description,
        "homepage": (raw.get("homepage") or "").strip() or company.homepage,
    }
    changed = [field for field, value in updates.items() if getattr(company, field) != value]
    for field in changed:
        setattr(company, field, updates[field])
    if changed:
        company.save(update_fields=changed)
    return company


def _find_company_by_tmdb_id(tmdb_company_id: int) -> Company | None:
    mapped = (
        ExternalID.objects.filter(
            content_type=_company_content_type(),
            provider="tmdb",
            external_id=str(tmdb_company_id),
        )
        .values_list("object_id", flat=True)
        .first()
    )
    if mapped is None:
        return None
    return Company.objects.filter(pk=mapped).first()


def _get_or_create_company(tmdb_company_id: int, raw: dict[str, Any]) -> Company:
    """Resolve the ``Company`` for a TMDB company id, creating/matching by slug."""
    existing = _find_company_by_tmdb_id(tmdb_company_id)
    if existing is not None:
        return existing
    name = str(raw.get("name") or "").strip() or f"tmdb-company-{tmdb_company_id}"
    slug = slugify(name) or f"tmdb-company-{tmdb_company_id}"
    company, _ = Company.objects.get_or_create(slug=slug, defaults={"name": name})
    return company


async def resolve_company_tmdb_id(
    company: Company, *, provider: TMDBProvider | None = None
) -> int | None:
    """Return the company's TMDB id, falling back to a name search.

    The stored ``ExternalID`` is authoritative; only when it is absent do we hit
    ``/search/company`` and accept an exact (case-insensitive) name match — or a
    lone result — so a lookalike studio is never linked by a loose search.
    """
    stored = await sync_to_async(_stored_tmdb_id)(company)
    if stored is not None:
        return stored
    if provider is None:
        provider = TMDBProvider()
    payload = await provider.search_company(company.name)
    results = payload.get("results") or []
    wanted = company.name.strip().lower()
    match: int | None = None
    for entry in results:
        raw_id = entry.get("id")
        if raw_id is None:
            continue
        if str(entry.get("name") or "").strip().lower() == wanted:
            match = int(raw_id)
            break
    if match is None and len(results) == 1:
        match = int(results[0]["id"])
    if match is None:
        return None
    await sync_to_async(_link_company_tmdb_id)(company, match)
    return match


async def discover_company_titles(
    tmdb_company_id: int, *, provider: TMDBProvider | None = None
) -> dict[str, list[str]]:
    """Page TMDB discover for every movie/tv id the company is involved in.

    Returns ``{"movie": [...], "show": [...]}`` keyed by the engine entity_type.
    Paging stops on an empty page, when ``total_pages`` is reached, or at TMDB's
    500-page ceiling.
    """
    if provider is None:
        provider = TMDBProvider()
    titles: dict[str, list[str]] = {"movie": [], "show": []}
    for media_type, entity_type in _DISCOVER_ENTITIES:
        ids: list[str] = []
        seen: set[int] = set()
        page = 1
        while page <= _MAX_DISCOVER_PAGES:
            payload = await provider.discover(
                media_type,
                {"with_companies": str(tmdb_company_id), "page": str(page)},
            )
            results = payload.get("results") or []
            if not results:
                break
            for item in results:
                raw_id = item.get("id")
                if raw_id is None or raw_id in seen:
                    continue
                seen.add(raw_id)
                ids.append(str(raw_id))
            total_pages = payload.get("total_pages") or 1
            if page >= total_pages:
                break
            page += 1
        titles[entity_type] = ids
    return titles


async def fetch_and_seed_company(
    tmdb_company_id: int,
    *,
    parent_job: SyncJob | None = None,
    provider: TMDBProvider | None = None,
) -> dict[str, Any]:
    """Fetch a company, refresh its row, and enqueue its unseen titles.

    Returns a summary including ``child_job_ids`` — the pending movie/show jobs
    the caller (the tmdb engine) dispatches so the titles seed immediately.
    """
    if provider is None:
        provider = TMDBProvider()
    raw = await provider.get_company(tmdb_company_id)
    company = await sync_to_async(_get_or_create_company)(tmdb_company_id, raw)
    await sync_to_async(upsert_company_from_tmdb)(company, raw)
    await sync_to_async(_link_company_tmdb_id)(company, tmdb_company_id)

    titles = await discover_company_titles(tmdb_company_id, provider=provider)

    child_jobs: list[SyncJob] = []
    for entity_type in ("movie", "show"):
        external_ids = titles.get(entity_type) or []
        if not external_ids:
            continue
        jobs = await sync_to_async(enqueue_seed_jobs)(
            provider="tmdb",
            entity_type=entity_type,
            external_ids=external_ids,
            is_bulk=False,
            parent=parent_job,
        )
        child_jobs.extend(jobs)

    return {
        "company_id": company.pk,
        "tmdb_id": tmdb_company_id,
        "name": company.name,
        "discovered": {k: len(v) for k, v in titles.items()},
        "enqueued": len(child_jobs),
        "child_job_ids": [job.pk for job in child_jobs],
    }


def enqueue_company_sync(company: Company, *, dispatch: bool = True) -> SyncJob | None:
    """Create + dispatch a full company sync job (worker-side entrypoint).

    Idempotent against a live (pending/running) company job for the same id and
    a no-op (``None``) when the company has no resolvable TMDB id. The heavy
    discovery work happens in the engine, not here.
    """
    try:
        tmdb_id = asyncio.run(resolve_company_tmdb_id(company))
    except Exception:  # noqa: BLE001 - a lookup failure must not break the follow
        logger.exception("company tmdb id resolution failed for company %s", company.pk)
        return None
    if tmdb_id is None:
        logger.info("company %s has no resolvable TMDB id; skipping sync", company.pk)
        return None

    external_id = str(tmdb_id)
    if SyncJob.objects.filter(
        provider="tmdb",
        entity_type="company",
        external_id=external_id,
        status__in=("pending", "running"),
    ).exists():
        return None

    job = SyncJob.objects.create(
        provider="tmdb",
        entity_type="company",
        external_id=external_id,
        status="pending",
        phase="core",
        is_bulk=False,
        priority=3,
    )
    if dispatch:
        from apps.integrations.tasks import run_sync_job

        run_sync_job.delay(job.pk)
    return job
