"""Search domain logic as plain callables over the models.

Port of the legacy ``backend/otix/api/search/search.py`` endpoint functions.
Embeddings/pgvector are DEFERRED in this migration (ARCHITECTURE §9): every media
query is a plain relational ``title__icontains`` stand-in and returns the legacy
response envelope. Third-party provider paths (IGDB, SteamGridDB) are NOT faked;
their payloads return the legacy-shaped empty contract until the provider layer
lands.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser, AnonymousUser
from django.db.models import Case, IntegerField, QuerySet, Value, When

from apps.company.models import Company
from apps.media.models import MediaItem, Track
from apps.people.models import Person
from apps.search.models import SearchLog
from apps.search.serializers import (
    CompanySearchSerializer,
    MediaSummarySerializer,
    PersonSearchResultSerializer,
    ProviderResultSerializer,
    TrackSearchSerializer,
)

# Adult-content rows are hidden for every caller until per-user date-of-birth /
# ``show_adult_content`` preferences land on the accounts.User model.
EXCLUDE_ADULT = True

_SORT_ORDERS = {
    "popularity": "-popularity",
    "rating": "-avg_rating",
    "release_date": "-release_date",
    "title": "title",
}


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


def search_media_payload(
    q: str,
    media_type: str | None = None,
    sort_by: str | None = None,
    page: int = 1,
    page_size: int = 24,
) -> dict:
    """Legacy ``MediaItemListResponse`` shape for ``GET /search``."""
    rows, total, has_more = _search_media_rows(q, media_type, sort_by, page, page_size)
    tracks: list[Track] = []
    if page == 1 and media_type in (None, "music"):
        tracks = _search_track_rows(q)
    return {
        "items": MediaSummarySerializer(rows, many=True).data,
        "tracks": TrackSearchSerializer(tracks, many=True).data,
        "has_more": has_more,
        "total": total,
        "backfill_pending": False,
        "next_cursor": None,
    }


def suggestions_payload(q: str, media_type: str | None, limit: int) -> list[dict]:
    """Legacy bare ``list[MediaItemSummary]`` for ``GET /search/suggestions``."""
    rows, _total, _has_more = _search_media_rows(q, media_type, None, 1, limit)
    return MediaSummarySerializer(rows, many=True).data


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

    No external backfill runs in this migration, so every match not already
    present in ``known_ids`` is returned immediately with ``backfill_pending``
    False.
    """
    rows, total, _has_more = _search_media_rows(q, media_type, None, 1, page_size)
    known = {token for token in (known_ids or "").split(",") if token}
    fresh = [item for item in rows if str(item.id) not in known]
    return {
        "items": MediaSummarySerializer(fresh, many=True).data,
        "tracks": [],
        "has_more": False,
        "total": total,
        "backfill_pending": False,
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

    Only the Otix catalog branch (media_type ``game``) is answered from our DB.
    IGDB and SteamGridDB rows are omitted until the provider integration lands.
    """
    rows, _total, _has_more = _search_media_rows(query, "game", None, 1, limit)
    summaries = MediaSummarySerializer(rows, many=True).data
    items = [
        {
            "provider": "otix",
            "id": str(item["id"]),
            "title": item["title"],
            "poster_url": item["poster_url"],
            "slug": item["slug"],
            "confidence": None,
        }
        for item in summaries
    ]
    return {"items": ProviderResultSerializer(items, many=True).data, "backfill_pending": False}


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
        backfill_triggered=False,
        cache_hit=False,
        query_embedding_available=None,
        user=user if getattr(user, "is_authenticated", False) else None,
        is_bot=False,
    )
