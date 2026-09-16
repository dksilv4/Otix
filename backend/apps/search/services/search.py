"""Search domain logic as plain callables over the models.

Port of the legacy ``backend/otix/api/search/search.py`` endpoint functions.
Embeddings/pgvector are DEFERRED in this migration (ARCHITECTURE §9): every media
query is a plain relational ``title__icontains`` stand-in and returns the legacy
response envelope. Sparse game searches backfill from IGDB: already-imported
hits are merged in as catalog rows, missing ids are enqueued for ingest, and
typeahead may include ``igdb:{id}`` placeholders until that ingest lands.
"""

from __future__ import annotations

import logging
import re

from django.conf import settings
from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.contrib.contenttypes.models import ContentType
from django.core.cache import cache
from django.db.models import Case, IntegerField, QuerySet, Value, When

from apps.company.models import Company
from apps.media.models import ExternalID, MediaItem, Track
from apps.people.models import Person
from apps.search.models import SearchLog
from apps.search.serializers import (
    CompanySearchSerializer,
    MediaSummarySerializer,
    PersonSearchResultSerializer,
    ProviderResultSerializer,
    TrackSearchSerializer,
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
    qs = MediaItem.objects.filter(title__icontains=q)
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
    """Album-track title matches for music search."""
    return list(
        Track.objects.filter(title__icontains=q)
        .select_related("album__media_item")
        .prefetch_related("album__media_item__assets")
        .order_by("title", "id")[:limit]
    )


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


def _placeholder_game_summary(*, item_id: str, title: str, slug: str, poster_url: str | None) -> dict:
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


def _enqueue_igdb_imports(igdb_ids: list[str]) -> bool:
    """Queue missing IGDB games for ingest. Skip inline eager runs (test settings)."""
    if not igdb_ids:
        return False
    from apps.integrations.models import SyncJob
    from apps.integrations.services.sync import enqueue_sync_job
    from apps.integrations.tasks import run_sync_job

    pending = False
    for gid in igdb_ids:
        if SyncJob.objects.filter(
            provider="igdb",
            entity_type="game",
            external_id=gid,
            status__in=("pending", "running"),
        ).exists():
            pending = True
            continue
        job = enqueue_sync_job(provider="igdb", entity_type="game", external_id=gid)
        pending = True
        if getattr(settings, "CELERY_TASK_ALWAYS_EAGER", False):
            continue
        try:
            run_sync_job.delay(job.pk)
        except Exception:  # noqa: BLE001 - search must still return catalog hits
            logger.exception("could not enqueue igdb backfill for %s", gid)
    return pending


def _igdb_backfill_pending() -> bool:
    from apps.integrations.models import SyncJob

    return SyncJob.objects.filter(
        provider="igdb",
        entity_type="game",
        status__in=("pending", "running"),
    ).exists()


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
    """Search IGDB when the catalog is sparse; enqueue missing games for ingest.

    Already-imported IGDB hits are returned as catalog summaries even when the
    local title search missed them. Unimported hits are placeholders
    (``igdb:{id}``) when ``include_placeholders`` is set so typeahead can show
    provider results immediately.
    """
    if not _should_backfill(q):
        return [], False
    if not force and existing_count >= threshold:
        return [], False

    from apps.media.services.igdb import IGDBError, IGDBNotConfigured, IGDBProvider, configured, cover_url

    if not configured():
        return [], False
    try:
        raw = IGDBProvider().search_games(q, limit=limit, fields="id,name,slug,cover.image_id")
    except (IGDBNotConfigured, IGDBError):
        logger.warning("igdb search backfill skipped q=%s", q, exc_info=True)
        return [], False
    except Exception:  # noqa: BLE001 - provider outage must not fail search
        logger.exception("igdb search backfill failed q=%s", q)
        return [], False

    igdb_ids = [str(game["id"]) for game in raw if game.get("id") is not None]
    mapped = _igdb_mapped(igdb_ids)
    catalog_rows = {
        item.pk: item
        for item in MediaItem.objects.filter(pk__in=mapped.values()).prefetch_related(
            "assets", "external_ids"
        )
    }
    extras: list[dict] = []
    missing: list[str] = []
    seen = set(existing_ids)
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
            extras.extend(dict(row) for row in MediaSummarySerializer([media], many=True).data)
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
    rows, total, has_more = _search_media_rows(q, media_type, sort_by, page, page_size)
    tracks: list[Track] = []
    if page == 1 and media_type in (None, "music"):
        tracks = _search_track_rows(q)
    items = [dict(row) for row in MediaSummarySerializer(rows, many=True).data]
    backfill_pending = False
    if page == 1 and media_type == "game":
        extras, pending = _igdb_game_backfill(
            q,
            existing_count=total or 0,
            existing_ids={str(item["id"]) for item in items},
            limit=12,
            include_placeholders=include_external,
            threshold=BACKFILL_THRESHOLD,
        )
        items.extend(extras)
        backfill_pending = pending or _igdb_backfill_pending()
    return {
        "items": items,
        "tracks": TrackSearchSerializer(tracks, many=True).data,
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

    Returns catalog matches not already in ``known_ids``. While IGDB ingest
    jobs are still pending, ``backfill_pending`` stays true so the client keeps
    polling.
    """
    rows, total, _has_more = _search_media_rows(q, media_type, None, 1, page_size)
    known = {token for token in (known_ids or "").split(",") if token}
    fresh = [item for item in rows if str(item.id) not in known]
    pending = media_type in (None, "game") and _igdb_backfill_pending()
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
    columns the legacy user search needs) and tracks/albums are title matches.
    """
    grouped: dict[str, list[MediaItem]] = {}
    counts: dict[str, int] = {}
    for media_type in ("movie", "show", "game", "music"):
        rows, total, _has_more = _search_media_rows(q, media_type, None, 1, media_type_limit)
        grouped[media_type] = rows
        counts[media_type] = total or 0

    tracks = _search_track_rows(q)
    tracks_total = Track.objects.filter(title__icontains=q).count()
    people = _search_people(q)
    people_total = Person.objects.filter(name__icontains=q).count()

    movie_data = MediaSummarySerializer(grouped["movie"], many=True).data
    show_data = MediaSummarySerializer(grouped["show"], many=True).data
    game_data = MediaSummarySerializer(grouped["game"], many=True).data
    music_data = MediaSummarySerializer(grouped["music"], many=True).data
    track_data = TrackSearchSerializer(tracks, many=True).data
    people_data = PersonSearchResultSerializer(people, many=True).data
    media_data = movie_data + show_data + game_data + music_data

    total = sum(counts.values()) + tracks_total + people_total
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
        "music_count": counts["music"],
        "tracks_count": tracks_total,
        "people_count": people_total,
        "users_count": 0,
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


def steamgrid_payload() -> dict:
    """Legacy empty ``SteamGridSearchResponse`` for ``POST /search/steamgrid``.

    SteamGridDB is a third-party provider (future integration work); the empty
    contract mirrors the legacy response when the provider call fails.
    """
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
