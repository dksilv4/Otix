"""Search domain logic as plain callables over the models.

Port of the legacy ``old-backend/otix/api/search/search.py`` endpoint functions.
Embeddings/pgvector are DEFERRED in this migration (ARCHITECTURE §9): every media
query is a plain relational ``title__icontains`` stand-in and returns the legacy
response envelope. Sparse game searches backfill from IGDB: already-imported
hits are merged in as catalog rows, missing ids are enqueued for ingest, and
typeahead may include ``igdb:{id}`` placeholders until that ingest lands.
"""

from __future__ import annotations

import asyncio
import concurrent.futures
import logging
import re

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Case, IntegerField, QuerySet, Value, When
from django.utils.text import slugify

from apps.company.models import Company
from apps.media.models import ExternalID, MediaItem, Track
from apps.people.models import Person
from apps.search.models import SearchLog
from apps.search.serializers import (
    CompanySearchSerializer,
    MediaSummarySerializer,
    PersonSearchResultSerializer,
    ProviderResultSerializer,
)

logger = logging.getLogger(__name__)

# Adult-content rows are hidden for every caller until per-user date-of-birth /
# ``show_adult_content`` preferences land on the accounts.User model.
EXCLUDE_ADULT = True

_SORT_ORDERS = {
    "popularity": "-popularity",
    "rating": "-avg_rating",
    "release_date": "-release_date",
    "title": "title",
}

BACKFILL_THRESHOLD = 20
SUGGESTIONS_BACKFILL_THRESHOLD = 5
IGDB_ID_PREFIX = "igdb:"
PREHYDRATE_TITLE_LIMIT = 100
PREHYDRATE_CACHE_TTL = 6 * 60 * 60


def _media_base(q: str, media_type: str | None) -> QuerySet[MediaItem]:
    """Filtered hub rows for a title search (vector search lands later)."""
    qs = MediaItem.objects.filter(title__icontains=q).exclude(media_type="music")
    if media_type:
        qs = qs.filter(media_type=media_type)
    if EXCLUDE_ADULT:
        qs = qs.filter(is_adult=False)
    return qs.prefetch_related("assets", "external_ids")


def _ordered_media(base: QuerySet[MediaItem], q: str, sort_by: str | None) -> QuerySet[MediaItem]:
    """Apply a prefix boost then the requested legacy ``sort_by`` (if any)."""
    prefix_boost = Case(
        When(title__istartswith=q, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    base = base.annotate(_prefix_boost=prefix_boost)
    if sort_by in _SORT_ORDERS:
        return base.order_by(_SORT_ORDERS[sort_by], "_prefix_boost", "title", "id")
    return base.order_by("_prefix_boost", "-popularity", "title", "id")


def _search_media_rows(
    q: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
) -> tuple[list[MediaItem], int | None, bool]:
    """Paginated media matches: ``(rows, total, has_more)``.

    ``total`` mirrors the legacy service and is only populated for page 1 (it is
    ``None`` on later pages).
    """
    base = _media_base(q, media_type)
    total = base.count() if page == 1 else None
    offset = (page - 1) * page_size
    rows = list(_ordered_media(base, q, sort_by)[offset : offset + page_size + 1])
    has_more = len(rows) > page_size
    return rows[:page_size], total, has_more


def _search_track_rows(q: str, limit: int = 20) -> list[Track]:
    """Music is excluded from search."""
    return []


def _search_people(q: str, limit: int = 10) -> list[Person]:
    """Name-substring people matches with a prefix boost."""
    prefix_boost = Case(
        When(name__istartswith=q, then=Value(0)),
        default=Value(1),
        output_field=IntegerField(),
    )
    return list(
        Person.objects.filter(name__icontains=q)
        .annotate(_prefix_boost=prefix_boost)
        .order_by("_prefix_boost", "name", "id")[:limit]
    )


def _should_backfill(q: str) -> bool:
    """Skip digits / tiny strings / scene-release consonants, matching legacy."""
    stripped = q.strip()
    if len(stripped) < 2 or stripped.isdigit():
        return False
    if re.search(r"[^aeiou\s]{8,}", stripped, re.IGNORECASE):
        return False
    return True


TMDB_POSTER_BASE = "https://image.tmdb.org/t/p/w500"
TMDB_BACKDROP_BASE = "https://image.tmdb.org/t/p/original"


def _run_async(coro_fn):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop and loop.is_running():
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
            return pool.submit(asyncio.run, coro_fn()).result()
    return asyncio.run(coro_fn())


def _tmdb_configured() -> bool:
    return bool(getattr(settings, "TMDB_RAT", None) or getattr(settings, "TMDB_API_KEY", None))


def _steamgrid_configured() -> bool:
    return bool(
        getattr(settings, "STEAMGRID_API_KEY", None)
        or getattr(settings, "STEAM_GRID_API_KEY", None)
    )


def _placeholder_game_summary(
    *, item_id: str, title: str, slug: str, poster_url: str | None
) -> dict:
    return {
        "id": item_id,
        "media_type": "game",
        "title": title,
        "slug": slug or "",
        "tmdb_id": None,
        "poster_url": poster_url,
        "backdrop_url": None,
        "logo_url": None,
        "icon_url": None,
        "release_date": None,
        "popularity": 0,
        "avg_rating": None,
        "rating_count": 0,
        "overall_rating": None,
        "overall_rating_source": None,
        "like_count": 0,
        "watchlist_count": 0,
        "watched_count": 0,
        "played_count": 0,
        "started_count": 0,
        "listened_count": 0,
        "view_count": 0,
        "is_adult": False,
    }


def _placeholder_media_summary(
    *,
    item_id: str,
    media_type: str,
    title: str,
    slug: str,
    tmdb_id: str | None = None,
    poster_url: str | None = None,
    backdrop_url: str | None = None,
    release_date: str | None = None,
    overview: str | None = None,
    avg_rating: float | None = None,
) -> dict:
    return {
        "id": item_id,
        "media_type": media_type,
        "title": title,
        "slug": slug or "",
        "tmdb_id": tmdb_id,
        "poster_url": poster_url,
        "backdrop_url": backdrop_url,
        "logo_url": None,
        "icon_url": None,
        "release_date": release_date,
        "overview": overview,
        "popularity": 0,
        "avg_rating": round(avg_rating, 1) if avg_rating is not None else None,
        "rating_count": 0,
        "overall_rating": None,
        "overall_rating_source": None,
        "like_count": 0,
        "watchlist_count": 0,
        "watched_count": 0,
        "played_count": 0,
        "started_count": 0,
        "listened_count": 0,
        "view_count": 0,
        "is_adult": False,
    }


def _igdb_mapped(igdb_ids: list[str]) -> dict[str, int]:
    if not igdb_ids:
        return {}
    ct = ContentType.objects.get_for_model(MediaItem)
    rows = ExternalID.objects.filter(
        content_type=ct,
        provider="igdb",
        media_type="game",
        external_id__in=igdb_ids,
    )
    return {row.external_id: row.object_id for row in rows if row.object_id}


def _tmdb_mapped(tmdb_ids: list[str], media_type: str) -> dict[str, int]:
    if not tmdb_ids:
        return {}
    ct = ContentType.objects.get_for_model(MediaItem)
    rows = ExternalID.objects.filter(
        content_type=ct,
        provider="tmdb",
        media_type=media_type,
        external_id__in=tmdb_ids,
    )
    return {row.external_id: row.object_id for row in rows if row.object_id}


def _enqueue_igdb_imports(igdb_ids: list[str]) -> bool:
    """Queue missing IGDB games for ingest. Skip inline eager runs (test settings)."""
    if not igdb_ids:
        return False
    from apps.integrations.services.catalog_seed import ensure_catalog_job

    pending = False
    for gid in igdb_ids:
        job = ensure_catalog_job("igdb", "game", gid, priority=1, dispatch=True)
        if job is not None:
            pending = True
    return pending


def _enqueue_tmdb_imports(tmdb_ids: list[str], media_type: str) -> bool:
    if not tmdb_ids:
        return False
    from apps.integrations.services.catalog_seed import ensure_catalog_job

    pending = False
    for tid in tmdb_ids:
        job = ensure_catalog_job("tmdb", media_type, str(tid), priority=1, dispatch=True)
        if job is not None:
            pending = True
    return pending


def _any_backfill_pending(media_type: str | None = None) -> bool:
    from apps.integrations.models import SyncJob

    qs = SyncJob.objects.filter(status__in=("pending", "running"))
    if media_type == "game":
        qs = qs.filter(provider__in=("igdb", "steamgrid"), entity_type="game")
    elif media_type in ("movie", "show"):
        qs = qs.filter(provider="tmdb", entity_type=media_type)
    else:
        qs = qs.filter(provider__in=("tmdb", "igdb", "steamgrid"))
    return qs.exists()


def _igdb_backfill_pending() -> bool:
    return _any_backfill_pending("game")


async def _fetch_tmdb_movies(q: str, limit: int = 12) -> list[dict]:
    from core.providers.tmdb import TMDBProvider

    provider = TMDBProvider()
    payload = await provider.search_movie(q)
    return list(payload.get("results") or [])[:limit]


async def _fetch_tmdb_shows(q: str, limit: int = 12) -> list[dict]:
    from core.providers.tmdb import TMDBProvider

    provider = TMDBProvider()
    payload = await provider.search_tv(q)
    return list(payload.get("results") or [])[:limit]


async def _fetch_steamgrid_games(q: str, limit: int = 12) -> list[dict]:
    if not _steamgrid_configured():
        return []
    try:
        from core.providers.steamgrid import SteamGridDBProvider

        provider = SteamGridDBProvider()
        games = await provider.search_games(q)
        results = []
        for g in (games or [])[:limit]:
            gid = g.get("id")
            if not gid:
                continue
            grids = await provider.get_grids(int(gid), dimensions="600x900")
            if not grids:
                grids = await provider.get_grids(int(gid))
            poster = grids[0].get("url") if grids and isinstance(grids, list) else None
            results.append(
                {
                    "id": gid,
                    "name": g.get("name"),
                    "poster_url": poster,
                }
            )
        return results
    except Exception:
        logger.exception("steamgrid search games failed q=%s", q)
        return []


def _tmdb_movie_backfill(
    q: str,
    *,
    existing_count: int = 0,
    existing_ids: set[str] | None = None,
    limit: int = 12,
    threshold: int = BACKFILL_THRESHOLD,
    force: bool = False,
) -> tuple[list[dict], bool]:
    if not _should_backfill(q):
        return [], False
    if not force and existing_count >= threshold:
        return [], False
    if not _tmdb_configured():
        return [], False

    try:
        raw = _run_async(lambda: _fetch_tmdb_movies(q, limit=limit))
    except Exception:
        logger.exception("tmdb movie search backfill failed q=%s", q)
        return [], False

    tmdb_ids = [str(m["id"]) for m in raw if m.get("id") is not None]
    mapped = _tmdb_mapped(tmdb_ids, "movie")
    catalog_rows = {
        item.pk: item
        for item in MediaItem.objects.filter(pk__in=mapped.values()).prefetch_related(
            "assets", "external_ids"
        )
    }
    extras: list[dict] = []
    missing: list[str] = []
    seen = set(existing_ids or set())

    for movie in raw:
        raw_id = str(movie.get("id") or "")
        if not raw_id:
            continue
        pk = mapped.get(raw_id)
        if pk:
            sid = str(pk)
            if sid in seen:
                continue
            media = catalog_rows.get(pk)
            if media is not None:
                extras.extend(dict(row) for row in MediaSummarySerializer([media], many=True).data)
                seen.add(sid)
                continue
        missing.append(raw_id)
        placeholder_id = f"tmdb:movie:{raw_id}"
        if placeholder_id in seen:
            continue
        title = str(movie.get("title") or q)
        poster_path = movie.get("poster_path")
        backdrop_path = movie.get("backdrop_path")
        poster_url = f"{TMDB_POSTER_BASE}{poster_path}" if poster_path else None
        backdrop_url = f"{TMDB_BACKDROP_BASE}{backdrop_path}" if backdrop_path else None

        extras.append(
            _placeholder_media_summary(
                item_id=placeholder_id,
                media_type="movie",
                title=title,
                slug=slugify(title),
                tmdb_id=raw_id,
                poster_url=poster_url,
                backdrop_url=backdrop_url,
                release_date=movie.get("release_date") or None,
                overview=movie.get("overview"),
                avg_rating=movie.get("vote_average"),
            )
        )
        seen.add(placeholder_id)

    pending = _enqueue_tmdb_imports(missing, "movie")
    return extras, pending


def _tmdb_show_backfill(
    q: str,
    *,
    existing_count: int = 0,
    existing_ids: set[str] | None = None,
    limit: int = 12,
    threshold: int = BACKFILL_THRESHOLD,
    force: bool = False,
) -> tuple[list[dict], bool]:
    if not _should_backfill(q):
        return [], False
    if not force and existing_count >= threshold:
        return [], False
    if not _tmdb_configured():
        return [], False

    try:
        raw = _run_async(lambda: _fetch_tmdb_shows(q, limit=limit))
    except Exception:
        logger.exception("tmdb show search backfill failed q=%s", q)
        return [], False

    tmdb_ids = [str(s["id"]) for s in raw if s.get("id") is not None]
    mapped = _tmdb_mapped(tmdb_ids, "show")
    catalog_rows = {
        item.pk: item
        for item in MediaItem.objects.filter(pk__in=mapped.values()).prefetch_related(
            "assets", "external_ids"
        )
    }
    extras: list[dict] = []
    missing: list[str] = []
    seen = set(existing_ids or set())

    for show in raw:
        raw_id = str(show.get("id") or "")
        if not raw_id:
            continue
        pk = mapped.get(raw_id)
        if pk:
            sid = str(pk)
            if sid in seen:
                continue
            media = catalog_rows.get(pk)
            if media is not None:
                extras.extend(dict(row) for row in MediaSummarySerializer([media], many=True).data)
                seen.add(sid)
                continue
        missing.append(raw_id)
        placeholder_id = f"tmdb:show:{raw_id}"
        if placeholder_id in seen:
            continue
        name = str(show.get("name") or q)
        poster_path = show.get("poster_path")
        backdrop_path = show.get("backdrop_path")
        poster_url = f"{TMDB_POSTER_BASE}{poster_path}" if poster_path else None
        backdrop_url = f"{TMDB_BACKDROP_BASE}{backdrop_path}" if backdrop_path else None

        extras.append(
            _placeholder_media_summary(
                item_id=placeholder_id,
                media_type="show",
                title=name,
                slug=slugify(name),
                tmdb_id=raw_id,
                poster_url=poster_url,
                backdrop_url=backdrop_url,
                release_date=show.get("first_air_date") or None,
                overview=show.get("overview"),
                avg_rating=show.get("vote_average"),
            )
        )
        seen.add(placeholder_id)

    pending = _enqueue_tmdb_imports(missing, "show")
    return extras, pending


def _igdb_game_backfill(
    q: str,
    *,
    existing_count: int,
    existing_ids: set[str],
    limit: int,
    include_placeholders: bool,
    threshold: int,
    force: bool = False,
) -> tuple[list[dict], bool]:
    """Search IGDB when the catalog is sparse; enqueue missing games for ingest."""
    if not _should_backfill(q):
        return [], False
    if not force and existing_count >= threshold:
        return [], False

    from apps.media.services.igdb import (
        IGDBError,
        IGDBNotConfigured,
        IGDBProvider,
        configured,
        cover_url,
    )

    extras: list[dict] = []
    missing: list[str] = []
    seen = set(existing_ids)

    if configured():
        try:
            raw = IGDBProvider().search_games(q, limit=limit, fields="id,name,slug,cover.image_id")
            igdb_ids = [str(game["id"]) for game in raw if game.get("id") is not None]
            mapped = _igdb_mapped(igdb_ids)
            catalog_rows = {
                item.pk: item
                for item in MediaItem.objects.filter(pk__in=mapped.values()).prefetch_related(
                    "assets", "external_ids"
                )
            }
            for game in raw:
                gid = str(game.get("id") or "")
                if not gid:
                    continue
                pk = mapped.get(gid)
                if pk:
                    sid = str(pk)
                    if sid in seen:
                        continue
                    media = catalog_rows.get(pk)
                    if media is None:
                        continue
                    extras.extend(
                        dict(row) for row in MediaSummarySerializer([media], many=True).data
                    )
                    seen.add(sid)
                    continue
                missing.append(gid)
                if not include_placeholders:
                    continue
                placeholder_id = f"{IGDB_ID_PREFIX}{gid}"
                if placeholder_id in seen:
                    continue
                extras.append(
                    _placeholder_game_summary(
                        item_id=placeholder_id,
                        title=game.get("name") or q,
                        slug=game.get("slug") or "",
                        poster_url=cover_url(game.get("cover")),
                    )
                )
                seen.add(placeholder_id)
        except (IGDBNotConfigured, IGDBError):
            logger.warning("igdb search backfill skipped q=%s", q, exc_info=True)
        except Exception:  # noqa: BLE001 - provider outage must not fail search
            logger.exception("igdb search backfill failed q=%s", q)

    # Fall back to / augment with SteamGridDB when IGDB is missing or yields no results
    if (not extras or len(extras) < limit) and _steamgrid_configured():
        sg_games = _run_async(lambda: _fetch_steamgrid_games(q, limit=limit - len(extras)))
        for sg in sg_games:
            sg_id = str(sg["id"])
            placeholder_id = f"steamgrid:{sg_id}"
            if placeholder_id in seen:
                continue
            title = sg.get("name") or q
            extras.append(
                _placeholder_game_summary(
                    item_id=placeholder_id,
                    title=title,
                    slug=slugify(title),
                    poster_url=sg.get("poster_url"),
                )
            )
            seen.add(placeholder_id)

    pending = _enqueue_igdb_imports(missing)
    return extras, pending


def prehydrate_title_list(titles: list[str], *, limit: int = PREHYDRATE_TITLE_LIMIT) -> list[str]:
    """Deduped, searchable titles for a scan-time IGDB backfill."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in titles:
        title = " ".join(str(raw or "").replace("_", " ").replace(".", " ").split())
        if not _should_backfill(title):
            continue
        key = title.lower()
        if key in seen:
            continue
        seen.add(key)
        out.append(title)
        if len(out) >= limit:
            break
    return out


def prehydrate_game_titles(titles: list[str]) -> dict:
    """Search IGDB for each title and enqueue missing catalog ingest jobs."""
    searched = 0
    enqueued = 0
    for title in prehydrate_title_list(titles):
        cache_key = f"search:prehydrate:{title.lower()}"
        if cache.get(cache_key):
            continue
        cache.set(cache_key, 1, PREHYDRATE_CACHE_TTL)
        existing = MediaItem.objects.filter(media_type="game", title__icontains=title).count()
        _extras, pending = _igdb_game_backfill(
            title,
            existing_count=existing,
            existing_ids=set(),
            limit=8,
            include_placeholders=False,
            threshold=SUGGESTIONS_BACKFILL_THRESHOLD,
        )
        searched += 1
        if pending:
            enqueued += 1
    return {"searched": searched, "enqueued": enqueued}


def enqueue_prehydrate_titles(titles: list[str]) -> int:
    """Queue a worker to prehydrate titles. Skip inline eager runs (tests)."""
    cleaned = prehydrate_title_list(titles)
    if not cleaned:
        return 0
    if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
        return len(cleaned)
    from apps.search.tasks import prehydrate_games_task

    try:
        prehydrate_games_task.delay(cleaned)
    except Exception:  # noqa: BLE001 - scan listing must not fail if the worker is down
        logger.exception("could not enqueue game prehydrate")
        return 0
    return len(cleaned)


def search_media_payload(
    q: str,
    media_type: str | None = None,
    sort_by: str | None = None,
    page: int = 1,
    page_size: int = 24,
    include_external: bool = False,
) -> dict:
    """Legacy ``MediaItemListResponse`` shape for ``GET /search``."""
    if media_type == "music":
        return {
            "items": [],
            "tracks": [],
            "has_more": False,
            "total": 0,
            "backfill_pending": False,
            "next_cursor": None,
        }

    rows, total, has_more = _search_media_rows(q, media_type, sort_by, page, page_size)
    items = [dict(row) for row in MediaSummarySerializer(rows, many=True).data]
    backfill_pending = False

    if page == 1:
        existing_ids = {str(item["id"]) for item in items}
        current_count = total or len(items)

        if media_type == "game":
            extras, pending = _igdb_game_backfill(
                q,
                existing_count=current_count,
                existing_ids=existing_ids,
                limit=page_size,
                include_placeholders=True,
                threshold=BACKFILL_THRESHOLD,
                force=(current_count == 0),
            )
            items.extend(extras)
            backfill_pending = pending
        elif media_type == "movie":
            extras, pending = _tmdb_movie_backfill(
                q,
                existing_count=current_count,
                existing_ids=existing_ids,
                limit=page_size,
                threshold=BACKFILL_THRESHOLD,
                force=(current_count == 0),
            )
            items.extend(extras)
            backfill_pending = pending
        elif media_type in ("show", "tv"):
            extras, pending = _tmdb_show_backfill(
                q,
                existing_count=current_count,
                existing_ids=existing_ids,
                limit=page_size,
                threshold=BACKFILL_THRESHOLD,
                force=(current_count == 0),
            )
            items.extend(extras)
            backfill_pending = pending
        elif media_type is None:
            if current_count == 0:
                m_extras, m_pending = _tmdb_movie_backfill(q, limit=8, force=True)
                s_extras, s_pending = _tmdb_show_backfill(q, limit=8, force=True)
                g_extras, g_pending = _igdb_game_backfill(
                    q,
                    existing_count=0,
                    existing_ids=existing_ids,
                    limit=8,
                    include_placeholders=True,
                    threshold=BACKFILL_THRESHOLD,
                    force=True,
                )
                items.extend(m_extras + s_extras + g_extras)
                backfill_pending = m_pending or s_pending or g_pending

        backfill_pending = backfill_pending or _any_backfill_pending(media_type)
        if current_count == 0 and items:
            total = len(items)

    return {
        "items": items,
        "tracks": [],
        "has_more": has_more,
        "total": total,
        "backfill_pending": backfill_pending,
        "next_cursor": None,
    }


def suggestions_payload(q: str, media_type: str | None, limit: int) -> list[dict]:
    """Legacy bare ``list[MediaItemSummary]`` for ``GET /search/suggestions``.

    Game typeahead backfills from IGDB when the catalog is sparse so Match can
    show provider hits before ingest finishes (``id`` is ``igdb:{id}``).
    """
    if media_type == "music":
        return []
    rows, total, _has_more = _search_media_rows(q, media_type, None, 1, limit)
    items = [dict(row) for row in MediaSummarySerializer(rows, many=True).data]
    if media_type == "game":
        extras, _pending = _igdb_game_backfill(
            q,
            existing_count=total or 0,
            existing_ids={str(item["id"]) for item in items},
            limit=limit,
            include_placeholders=True,
            threshold=SUGGESTIONS_BACKFILL_THRESHOLD,
        )
        items.extend(extras)
        items = items[:limit]
    elif media_type == "movie":
        extras, _pending = _tmdb_movie_backfill(
            q,
            existing_count=total or 0,
            existing_ids={str(item["id"]) for item in items},
            limit=limit,
            threshold=SUGGESTIONS_BACKFILL_THRESHOLD,
        )
        items.extend(extras)
        items = items[:limit]
    elif media_type in ("show", "tv"):
        extras, _pending = _tmdb_show_backfill(
            q,
            existing_count=total or 0,
            existing_ids={str(item["id"]) for item in items},
            limit=limit,
            threshold=SUGGESTIONS_BACKFILL_THRESHOLD,
        )
        items.extend(extras)
        items = items[:limit]
    return items


def companies_payload(q: str, limit: int) -> dict:
    """Legacy ``CompanySearchListResponse`` shape for ``GET /search/companies``."""
    rows = list(Company.objects.filter(name__icontains=q).order_by("name", "id")[: limit + 1])
    has_more = len(rows) > limit
    return {
        "items": CompanySearchSerializer(rows[:limit], many=True).data,
        "total": None,
        "has_more": has_more,
    }


def poll_payload(q: str, media_type: str | None, known_ids: str, page_size: int) -> dict:
    """Legacy ``MediaItemListResponse`` for ``GET /search/poll``.

    Returns catalog matches not already in ``known_ids``. While ingest jobs are
    still pending, ``backfill_pending`` stays true so the client keeps polling.
    """
    if media_type == "music":
        return {
            "items": [],
            "tracks": [],
            "has_more": False,
            "total": 0,
            "backfill_pending": False,
            "next_cursor": None,
        }
    rows, total, _has_more = _search_media_rows(q, media_type, None, 1, page_size)
    known = {token for token in (known_ids or "").split(",") if token}
    fresh = [item for item in rows if str(item.id) not in known]
    pending = _any_backfill_pending(media_type)
    return {
        "items": MediaSummarySerializer(fresh, many=True).data,
        "tracks": [],
        "has_more": False,
        "total": total,
        "backfill_pending": pending,
        "next_cursor": None,
    }


def external_payload() -> dict:
    """Legacy empty ``MediaItemListResponse`` for ``GET /search/external``.

    The legacy endpoint searches IGDB for games not yet in the catalog; the
    provider layer is future integration work, so we return the empty contract
    rather than faking third-party calls.
    """
    return {
        "items": [],
        "tracks": [],
        "has_more": False,
        "total": 0,
        "backfill_pending": False,
        "next_cursor": None,
    }


def _best_results(q: str, media: list[dict], people: list[dict], tracks: list[dict]) -> list[dict]:
    """Top-3 blended results for ``StructuredSearchResponse.best_results``.

    Mirrors the legacy scoring pass: exact prefix/exact name matches rank first,
    with a small per-type weight and position tiebreaker. Entries are already
    serialized dicts, each carrying its own ``media_type`` discriminator.
    """
    ql = q.lower().strip()
    candidates: list[tuple[str, dict, float, int]] = []
    position = 0
    for item in media[:3]:
        candidates.append((item.get("title") or "", item, 0.5, position))
        position += 1
    for item in people[:2]:
        candidates.append((item.get("name") or "", item, 0.3, position))
        position += 1
    for item in tracks[:2]:
        candidates.append((item.get("title") or "", item, 0.1, position))
        position += 1

    scored: list[tuple[float, dict]] = []
    seen: set[tuple[str, int | None]] = set()
    for name, item, weight, position in candidates:
        key = (item.get("media_type") or "unknown", item.get("id"))
        if key in seen:
            continue
        seen.add(key)
        n = name.lower().strip()
        if n == ql:
            score = 10.0
        elif n.startswith(ql):
            score = 5.0
        elif ql and ql in n:
            score = 2.0
        else:
            score = 0.0
        scored.append((score + weight - position * 0.1, item))
    scored.sort(key=lambda pair: pair[0], reverse=True)
    return [item for _score, item in scored[:3]]


def grouped_payload(q: str, media_type_limit: int) -> dict:
    """Legacy ``StructuredSearchResponse`` shape for ``GET /search/grouped``.

    Media rows are grouped per type with per-group totals; people are matched by
    name. Users are always empty (the accounts.User model lacks the xp/bio/level
    columns the legacy user search needs). Music and tracks are excluded.
    """
    grouped: dict[str, list[MediaItem]] = {}
    counts: dict[str, int] = {}
    for media_type in ("movie", "show", "game"):
        rows, total, _has_more = _search_media_rows(q, media_type, None, 1, media_type_limit)
        grouped[media_type] = rows
        counts[media_type] = total or 0

    people = _search_people(q)
    people_total = Person.objects.filter(name__icontains=q).count()

    backfill_pending = False

    # Movies backfill
    if counts["movie"] == 0:
        m_extras, m_pending = _tmdb_movie_backfill(q, limit=media_type_limit, force=True)
        movie_data = m_extras
        counts["movie"] = len(movie_data)
        backfill_pending = backfill_pending or m_pending
    else:
        movie_data = [dict(r) for r in MediaSummarySerializer(grouped["movie"], many=True).data]

    # Shows backfill
    if counts["show"] == 0:
        s_extras, s_pending = _tmdb_show_backfill(q, limit=media_type_limit, force=True)
        show_data = s_extras
        counts["show"] = len(show_data)
        backfill_pending = backfill_pending or s_pending
    else:
        show_data = [dict(r) for r in MediaSummarySerializer(grouped["show"], many=True).data]

    # Games backfill
    if counts["game"] == 0:
        g_extras, g_pending = _igdb_game_backfill(
            q,
            existing_count=0,
            existing_ids=set(),
            limit=media_type_limit,
            include_placeholders=True,
            force=True,
        )
        game_data = g_extras
        counts["game"] = len(game_data)
        backfill_pending = backfill_pending or g_pending
    else:
        game_data = [dict(r) for r in MediaSummarySerializer(grouped["game"], many=True).data]

    music_data: list[dict] = []
    track_data: list[dict] = []
    people_data = PersonSearchResultSerializer(people, many=True).data
    media_data = movie_data + show_data + game_data

    backfill_pending = backfill_pending or _any_backfill_pending()
    total = sum(counts.values()) + people_total

    return {
        "best_results": _best_results(q, media_data, people_data, track_data),
        "movies": movie_data,
        "shows": show_data,
        "games": game_data,
        "music": music_data,
        "tracks": track_data,
        "people": people_data,
        "users": [],
        "total": total,
        "movies_count": counts["movie"],
        "shows_count": counts["show"],
        "games_count": counts["game"],
        "music_count": 0,
        "tracks_count": 0,
        "people_count": people_total,
        "users_count": 0,
        "backfill_pending": backfill_pending,
    }


def providers_payload(query: str, limit: int) -> dict:
    """Legacy ``ProviderSearchResponse`` for ``POST /search/providers``.

    Otix catalog games first, then IGDB hits (catalog id when already imported,
    otherwise ``igdb:{id}``) with ingest queued for missing rows.
    """
    rows, total, _has_more = _search_media_rows(query, "game", None, 1, limit)
    summaries = [dict(row) for row in MediaSummarySerializer(rows, many=True).data]
    extras, pending = _igdb_game_backfill(
        query,
        existing_count=total or 0,
        existing_ids={str(item["id"]) for item in summaries},
        limit=limit,
        include_placeholders=True,
        threshold=BACKFILL_THRESHOLD,
        force=True,
    )
    items = []
    for item in summaries + extras:
        item_id = str(item["id"])
        is_igdb = item_id.startswith(IGDB_ID_PREFIX)
        items.append(
            {
                "provider": "igdb" if is_igdb else "otix",
                "id": item_id,
                "title": item["title"],
                "poster_url": item.get("poster_url"),
                "slug": item.get("slug") or "",
                "confidence": None,
            }
        )
        if len(items) >= limit:
            break
    return {
        "items": ProviderResultSerializer(items, many=True).data,
        "backfill_pending": pending or _igdb_backfill_pending(),
    }


def steamgrid_payload(query: str | None = None) -> dict:
    """Search SteamGridDB for games/artwork."""
    if not query:
        return {"items": []}
    try:
        raw = _run_async(lambda: _fetch_steamgrid_games(query, limit=12))
        return {"items": raw}
    except Exception:
        logger.exception("steamgrid search failed query=%s", query)
        return {"items": []}


def log_search(
    *,
    query: str,
    media_type: str | None,
    sort_by: str | None,
    page: int,
    page_size: int,
    result_count: int | None,
    items_returned: int,
    tracks_returned: int,
    user: AbstractBaseUser | AnonymousUser | None,
    backfill_triggered: bool = False,
) -> None:
    """Record one catalog search event (mirrors legacy ``log_search``)."""
    SearchLog.objects.create(
        query=(query or "")[:500],
        media_type=media_type,
        sort_by=sort_by,
        page=page,
        page_size=page_size,
        result_count=result_count,
        items_returned=items_returned,
        tracks_returned=tracks_returned,
        backfill_triggered=backfill_triggered,
        cache_hit=False,
        query_embedding_available=None,
        user=user if getattr(user, "is_authenticated", False) else None,
        is_bot=False,
    )
