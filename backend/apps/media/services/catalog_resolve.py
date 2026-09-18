"""Resolve a source to a canonical TMDB/IGDB id without creating a MediaItem.

Title is only a search that returns an id. Identity is never a slug or year.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from dataclasses import dataclass
from difflib import SequenceMatcher
from typing import Any

from django.conf import settings

from apps.media.services.game_matcher import _comparison_key, _igdb_search_query
from apps.media.services.identity import CANONICAL_PROVIDER, find_media_id_any

logger = logging.getLogger(__name__)

AUTO_MATCH_HIGH = 0.95
AUTO_MATCH_GAP = 0.85
AUTO_MATCH_GAP_DELTA = 0.10


@dataclass(frozen=True)
class CanonicalRef:
    """A catalog-provider identity. Never a plex/steam-only id."""

    provider: str
    entity_type: str
    external_id: str


TitleSearcher = Callable[[str, int | None], list[tuple[str, str, int | None]]]


def pick_high_confidence_id(scored: list[tuple[str, float]]) -> str | None:
    """Auto-accept a single high-confidence hit (GameMatcher thresholds + gap)."""
    if not scored:
        return None
    ranked = sorted(scored, key=lambda row: row[1], reverse=True)
    best_id, best = ranked[0]
    second = ranked[1][1] if len(ranked) > 1 else None
    unique = second is None or best - second >= AUTO_MATCH_GAP_DELTA
    if not unique:
        return None
    if best >= AUTO_MATCH_HIGH or best >= AUTO_MATCH_GAP:
        return best_id
    return None


def title_confidence(query: str, candidate: str, *, year_match: bool = False) -> float:
    q = _comparison_key(query or "")
    c = _comparison_key(candidate or "")
    if not q or not c:
        return 0.0
    if q == c:
        return 0.98 if year_match else 0.95
    ratio = SequenceMatcher(None, q, c).ratio()
    if year_match:
        ratio = min(1.0, ratio + 0.05)
    return round(ratio, 3)


def resolve_canonical_id(
    media_type: str,
    *,
    ids: dict[str, str] | None = None,
    title: str | None = None,
    year: int | None = None,
    tmdb_search: TitleSearcher | None = None,
    igdb_lookup_steam: Callable[[list[int]], dict[int, int]] | None = None,
    igdb_lookup_epic: Callable[[list[str]], dict[str, int]] | None = None,
    igdb_search: TitleSearcher | None = None,
    tmdb_find: Callable[[str, str], dict[str, Any]] | None = None,
) -> CanonicalRef | None:
    """Return the canonical tmdb/igdb id for this source, or ``None``.

    Order: already-canonical id → existing ExternalID map → id-only crosswalk
    → high-confidence title search. Never creates a hub row.
    """
    if media_type not in CANONICAL_PROVIDER:
        return None
    ids = {k: str(v) for k, v in (ids or {}).items() if v not in (None, "")}
    canonical = CANONICAL_PROVIDER[media_type]
    if canonical in ids:
        return CanonicalRef(canonical, media_type, ids[canonical])

    mapped = find_media_id_any(ids, media_type)
    if mapped is not None:
        from django.contrib.contenttypes.models import ContentType

        from apps.media.models import ExternalID, MediaItem

        row = (
            ExternalID.objects.filter(
                content_type=ContentType.objects.get_for_model(MediaItem),
                object_id=mapped,
                provider=canonical,
                media_type=media_type,
            )
            .values_list("external_id", flat=True)
            .first()
        )
        if row:
            return CanonicalRef(canonical, media_type, row)

    crossed = _crosswalk(
        media_type,
        ids,
        igdb_lookup_steam=igdb_lookup_steam,
        igdb_lookup_epic=igdb_lookup_epic,
        tmdb_find=tmdb_find,
    )
    if crossed is not None:
        return crossed

    if not title:
        return None
    return _title_search(
        media_type,
        title,
        year,
        tmdb_search=tmdb_search,
        igdb_search=igdb_search,
    )


def _crosswalk(
    media_type: str,
    ids: dict[str, str],
    *,
    igdb_lookup_steam,
    igdb_lookup_epic,
    tmdb_find,
) -> CanonicalRef | None:
    if media_type == "game":
        steam = ids.get("steam")
        if steam and steam.isdigit():
            lookup = igdb_lookup_steam or _default_steam_lookup
            try:
                mapped = lookup([int(steam)])
            except Exception:
                logger.exception("steam→igdb crosswalk failed steam=%s", steam)
                mapped = {}
            igdb_id = mapped.get(int(steam))
            if igdb_id is not None:
                return CanonicalRef("igdb", "game", str(igdb_id))
        epic = ids.get("epic") or ids.get("egs")
        if epic:
            lookup = igdb_lookup_epic or _default_epic_lookup
            try:
                mapped = lookup([epic])
            except Exception:
                logger.exception("epic→igdb crosswalk failed epic=%s", epic)
                mapped = {}
            igdb_id = mapped.get(epic)
            if igdb_id is not None:
                return CanonicalRef("igdb", "game", str(igdb_id))
        return None

    finder = tmdb_find or _default_tmdb_find
    for provider, source in (("imdb", "imdb_id"), ("tvdb", "tvdb_id")):
        ext = ids.get(provider)
        if not ext:
            continue
        try:
            payload = finder(ext, source) or {}
        except Exception:
            logger.exception("tmdb find failed provider=%s id=%s", provider, ext)
            continue
        key = "movie_results" if media_type == "movie" else "tv_results"
        results = payload.get(key) or []
        if len(results) == 1 and results[0].get("id") is not None:
            return CanonicalRef("tmdb", media_type, str(results[0]["id"]))
    return None


def _title_search(
    media_type: str,
    title: str,
    year: int | None,
    *,
    tmdb_search,
    igdb_search,
) -> CanonicalRef | None:
    if media_type == "game":
        searcher = igdb_search or _default_igdb_search
        provider = "igdb"
    else:
        searcher = tmdb_search or _default_tmdb_search(media_type)
        provider = "tmdb"
    try:
        hits = searcher(title, year) or []
    except Exception:
        logger.exception("canonical title search failed type=%s title=%s", media_type, title)
        return None
    scored: list[tuple[str, float]] = []
    for ext_id, hit_title, hit_year in hits:
        year_match = (
            year is not None and hit_year is not None and abs(int(hit_year) - int(year)) <= 1
        )
        scored.append((str(ext_id), title_confidence(title, hit_title, year_match=year_match)))
    chosen = pick_high_confidence_id(scored)
    if chosen is None:
        return None
    return CanonicalRef(provider, media_type, chosen)


def resolve_or_enqueue(
    media_type: str,
    *,
    ids: dict[str, str] | None = None,
    title: str | None = None,
    year: int | None = None,
    priority: int = 1,
    **resolve_kwargs,
) -> int | None:
    """Return an existing hub pk, or enqueue a seed job and return ``None``."""
    from apps.integrations.services.catalog_seed import ensure_catalog_job
    from apps.media.services.identity import attach_external_ids, find_media_id, find_media_id_any

    ids = {k: str(v) for k, v in (ids or {}).items() if v not in (None, "")}
    found = find_media_id_any(ids, media_type) if ids else None
    if found is not None:
        attach_external_ids(found, ids, media_type)
        return found
    ref = resolve_canonical_id(media_type, ids=ids, title=title, year=year, **resolve_kwargs)
    if ref is None:
        return None
    mapped = find_media_id(ref.provider, ref.external_id, ref.entity_type)
    if mapped is not None:
        if ids:
            attach_external_ids(mapped, ids, media_type)
        return mapped
    ensure_catalog_job(ref.provider, ref.entity_type, ref.external_id, priority=priority)
    return None


def _default_steam_lookup(app_ids: list[int]) -> dict[int, int]:
    from apps.media.services.igdb import IGDBProvider, configured

    if not configured():
        return {}
    return IGDBProvider().lookup_steam_app_ids(app_ids)


def _default_epic_lookup(epic_ids: list[str]) -> dict[str, int]:
    from apps.media.services.igdb import IGDBProvider, configured

    if not configured():
        return {}
    return IGDBProvider().lookup_epic_ids(epic_ids)


def _default_igdb_search(title: str, year: int | None) -> list[tuple[str, str, int | None]]:
    from apps.media.services.igdb import IGDBProvider, configured, release_year_from_ts

    if not configured():
        return []
    rows = IGDBProvider().search_games(
        _igdb_search_query(title), limit=8, fields="id,name,first_release_date"
    )
    out: list[tuple[str, str, int | None]] = []
    for row in rows:
        if row.get("id") is None:
            continue
        hit_year = release_year_from_ts(row.get("first_release_date")) if year is not None else None
        out.append((str(row["id"]), str(row.get("name") or ""), hit_year))
    return out


def _default_tmdb_find(external_id: str, source: str) -> dict[str, Any]:
    if not getattr(settings, "TMDB_RAT", None) and not getattr(settings, "TMDB_API_KEY", None):
        return {}
    return _run_async(lambda: _tmdb().find_by_external_id(external_id, external_source=source))


def _default_tmdb_search(media_type: str) -> TitleSearcher:
    def search(title: str, year: int | None) -> list[tuple[str, str, int | None]]:
        if not getattr(settings, "TMDB_RAT", None) and not getattr(settings, "TMDB_API_KEY", None):
            return []
        return _run_async(lambda: _tmdb_title_hits(media_type, title, year))

    return search


async def _tmdb_title_hits(media_type: str, title: str, year: int | None):
    provider = _tmdb()
    if media_type == "movie":
        payload = await provider.search_movie(title, year=year)
        title_key, date_key = "title", "release_date"
    else:
        payload = await provider.search_tv(title, first_air_date_year=year)
        title_key, date_key = "name", "first_air_date"
    out: list[tuple[str, str, int | None]] = []
    for row in payload.get("results") or []:
        if row.get("id") is None:
            continue
        date_val = row.get(date_key) or ""
        hit_year = int(str(date_val)[:4]) if str(date_val)[:4].isdigit() else None
        out.append((str(row["id"]), str(row.get(title_key) or ""), hit_year))
    return out


def _tmdb():
    from core.providers.tmdb import TMDBProvider

    return TMDBProvider()


def _run_async(factory):
    import asyncio

    coro = factory()
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        raise RuntimeError("catalog resolve cannot nest a TMDB call on a live event loop")
    return asyncio.run(coro)
