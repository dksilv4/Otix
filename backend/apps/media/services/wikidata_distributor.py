"""Wikidata distributor enrichment — attach a title's distributors as companies.

TMDB models *production* companies only, so studios that predominantly
*distribute* (A24 being the motivating case) never appear on a title's company
list from the TMDB seed alone. Wikidata models the relationship explicitly as
``P750`` ("distributed by"), so a TMDB-synced movie/show with an IMDb (``P345``)
or TMDB (``P4947``) id is looked up on the Wikidata Query Service and each
``P750`` value is resolved to a ``Company`` + ``InvolvedCompany`` row with the
new ``distributor`` role flag set.

Enrichment is best-effort + media-first: a row with neither an IMDb nor a TMDB
``ExternalID``, a WDQS miss, or an unset ``WIKIDATA_DISTRIBUTOR_ENRICH`` are all
benign no-ops. Company resolution prefers the distributor's TMDB company id
(``P4985``) to match an existing ``Company`` ``tmdb`` ``ExternalID``, falling
back to a slugified name match so keyless Wikidata entities still resolve.
"""

from __future__ import annotations

import re
from typing import Any

import httpx
from asgiref.sync import sync_to_async
from django.conf import settings
from django.contrib.contenttypes.models import ContentType
from django.utils.text import slugify

from apps.company.models import Company, InvolvedCompany
from apps.media.models import ExternalID, MediaItem
from apps.media.services.completeness import recompute_completeness

SPARQL_ENDPOINT = "https://query.wikidata.org/sparql"
# WDQS rejects anonymous clients without a descriptive User-Agent.
_USER_AGENT = "Otix/0.1 (media enrichment; https://github.com/otix)"
_DEFAULT_TIMEOUT = 20.0

_IMDB_RE = re.compile(r"^tt\d+$")

# ``%(selector)s`` binds the film either by IMDb id (P345) or TMDB id (P4947);
# only one is used per call. P750 = distributed by, P4985 = TMDB company id.
_SPARQL = """
SELECT ?dist ?distLabel ?tmdbCompany WHERE {
  %(selector)s
  ?film wdt:P750 ?dist .
  OPTIONAL { ?dist wdt:P4985 ?tmdbCompany }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en". }
}
"""


def _selector(imdb_id: str | None, tmdb_id: int | None) -> str | None:
    """The SPARQL triple pattern binding the film, or ``None`` with no usable id."""
    if imdb_id and _IMDB_RE.match(imdb_id):
        return f'VALUES ?imdb {{ "{imdb_id}" }} ?film wdt:P345 ?imdb .'
    if tmdb_id:
        return f'VALUES ?tmdbId {{ "{int(tmdb_id)}" }} ?film wdt:P4947 ?tmdbId .'
    return None


def _parse_bindings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    """Dedupe WDQS bindings into ``{name, tmdb_company_id}`` distributor specs."""
    specs: list[dict[str, Any]] = []
    seen: set[tuple[str, int | None]] = set()
    for binding in payload.get("results", {}).get("bindings", []):
        name = (binding.get("distLabel") or {}).get("value")
        if not name:
            continue
        raw_tmdb = (binding.get("tmdbCompany") or {}).get("value")
        try:
            tmdb_company_id = int(raw_tmdb) if raw_tmdb else None
        except (TypeError, ValueError):
            tmdb_company_id = None
        key = (name, tmdb_company_id)
        if key in seen:
            continue
        seen.add(key)
        specs.append({"name": name, "tmdb_company_id": tmdb_company_id})
    return specs


async def fetch_distributors(
    *,
    imdb_id: str | None = None,
    tmdb_id: int | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict[str, Any]]:
    """Query WDQS for the title's ``P750`` distributors; ``[]`` when unresolvable."""
    selector = _selector(imdb_id, tmdb_id)
    if selector is None:
        return []
    query = _SPARQL % {"selector": selector}
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(
            timeout=_DEFAULT_TIMEOUT, headers={"User-Agent": _USER_AGENT}
        )
    try:
        response = await client.get(
            SPARQL_ENDPOINT, params={"query": query, "format": "json"}
        )
        response.raise_for_status()
        return _parse_bindings(response.json())
    finally:
        if owns_client:
            await client.aclose()


def _stored_ids(media_item_id: int) -> tuple[str | None, int | None]:
    """The media row's (IMDb id, TMDB id) from its ``ExternalID`` rows."""
    rows = ExternalID.objects.filter(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media_item_id,
        provider__in=("imdb", "tmdb"),
    ).values_list("provider", "external_id")
    imdb_id: str | None = None
    tmdb_id: int | None = None
    for provider, external_id in rows:
        if provider == "imdb" and imdb_id is None:
            imdb_id = external_id
        elif provider == "tmdb" and tmdb_id is None:
            try:
                tmdb_id = int(external_id)
            except (TypeError, ValueError):
                continue
    return imdb_id, tmdb_id


def _resolve_company(spec: dict[str, Any]) -> Company | None:
    """Match a Wikidata distributor to a ``Company`` (TMDB id, else slug/name)."""
    name = str(spec.get("name") or "").strip()
    tmdb_company_id = spec.get("tmdb_company_id")
    if tmdb_company_id:
        mapped = ExternalID.objects.filter(
            content_type=ContentType.objects.get_for_model(Company),
            provider="tmdb",
            external_id=str(tmdb_company_id),
        ).values_list("object_id", flat=True).first()
        if mapped is not None:
            company = Company.objects.filter(pk=mapped).first()
            if company is not None:
                return company
    if not name:
        return None
    slug = slugify(name)
    company = Company.objects.filter(slug=slug).first()
    if company is not None:
        return company
    company = Company.objects.filter(name__iexact=name).first()
    if company is not None:
        return company
    return Company.objects.create(slug=slug or f"wikidata-{name.lower()}", name=name)


def attach_distributors(media_item_id: int, distributors: list[dict[str, Any]]) -> int:
    """Upsert each distributor as an ``InvolvedCompany`` with ``distributor=True``.

    Returns the number of rows newly created or flipped to distributor. Recomputes
    the title's completeness when anything changed.
    """
    if not distributors:
        return 0
    media = MediaItem.objects.get(pk=media_item_id)
    linked = 0
    changed = False
    for spec in distributors:
        company = _resolve_company(spec)
        if company is None:
            continue
        row, created = InvolvedCompany.objects.get_or_create(
            media_item=media, company=company, defaults={"distributor": True}
        )
        if created:
            linked += 1
            changed = True
        elif not row.distributor:
            row.distributor = True
            row.save(update_fields=("distributor",))
            linked += 1
            changed = True
    if changed:
        recompute_completeness(media)
    return linked


async def wikidata_enrich_distributors(
    media_item_id: int,
    *,
    client: httpx.AsyncClient | None = None,
) -> dict[str, Any]:
    """Fetch + attach a title's Wikidata distributors; a benign no-op when inapplicable.

    Media-first: a row with neither an IMDb nor a TMDB ``ExternalID`` (or an
    unset ``WIKIDATA_DISTRIBUTOR_ENRICH``) returns immediately without a fetch.
    """
    if not settings.WIKIDATA_DISTRIBUTOR_ENRICH:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "distributors": 0,
            "reason": "disabled",
        }
    imdb_id, tmdb_id = await sync_to_async(_stored_ids)(media_item_id)
    if imdb_id is None and tmdb_id is None:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "distributors": 0,
            "reason": "no provider id",
        }
    distributors = await fetch_distributors(
        imdb_id=imdb_id, tmdb_id=tmdb_id, client=client
    )
    if not distributors:
        return {
            "media_item_id": media_item_id,
            "enriched": False,
            "distributors": 0,
            "reason": "no distributors",
        }
    linked = await sync_to_async(attach_distributors)(media_item_id, distributors)
    return {
        "media_item_id": media_item_id,
        "enriched": linked > 0,
        "distributors": len(distributors),
        "linked": linked,
        "reason": None,
    }
