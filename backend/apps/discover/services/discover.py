"""Discover feed read logic: hero + list_type over the media catalog.

Mirrors legacy ``otix/api/discover/{hero,media_type/list_type}``. The
personalization list types (``collaborative``/``semantic``/
``integration_steam``/``integration_plex``) have no seeding engine in the port
yet, so they fall through to the generic catalog listing exactly as legacy does
when a user has no seeds; ``new_season_for_you`` always yields an empty feed
(there is nothing to seed it from). Redis result-caching is deferred across all
ported routes.
"""

from __future__ import annotations

from datetime import date, timedelta

from django.db.models import OuterRef, Subquery
from django.db.models.query import QuerySet

from apps.media.models import MediaItem, Season
from apps.media.services import catalog as catalog_service

VALID_MEDIA_TYPES = {"movie", "show", "game", "music"}
VALID_LIST_TYPES = {
    "trending",
    "popular",
    "top_rated",
    "upcoming",
    "now_playing",
    "collaborative",
    "semantic",
    "integration_steam",
    "integration_plex",
    "new_season_for_you",
}

# list_type -> (sort_by, sort_dir, date_filter name). Personalized list types
# carry the generic (popularity, desc) fallback used when no seeds exist.
_LIST_CONFIG: dict[str, tuple[str, str, str | None]] = {
    "trending": ("popularity", "desc", "trending_window"),
    "popular": ("popularity", "desc", None),
    "top_rated": ("rating", "desc", None),
    "upcoming": ("release_date", "asc", "future"),
    "now_playing": ("popularity", "desc", "recent"),
    "collaborative": ("popularity", "desc", None),
    "semantic": ("popularity", "desc", None),
    "integration_steam": ("popularity", "desc", None),
    "integration_plex": ("popularity", "desc", None),
}


def _date_filter(name: str | None) -> tuple[date | None, date | None]:
    today = date.today()
    if name == "future":
        return (today, None)
    if name == "recent":
        return (today - timedelta(days=90), None)
    if name == "trending_window":
        return (today - timedelta(days=365), today + timedelta(days=180))
    return (None, None)


def hero_items(*, exclude_adult: bool, limit: int) -> list[MediaItem]:
    """A shuffled, artwork-backed slice of the catalog (legacy hero pool).

    Pulls a pool of ``min(limit * 4, 50)`` items that all have usable artwork,
    shuffles it for variety, and returns the first ``limit``.
    """
    import random

    pool_size = min(limit * 4, 50)
    pool = list(
        catalog_service.list_media(has_artwork=True, exclude_adult=exclude_adult)[
            :pool_size
        ]
    )
    random.shuffle(pool)
    return pool[:limit]


def list_feed(
    *,
    media_type: str,
    list_type: str,
    genre: str | None,
    language: str | None,
    is_anime: bool | None,
    exclude_adult: bool,
) -> QuerySet:
    """Resolve a discover feed to a catalog QuerySet (paginated by the view).

    Raises ``ValueError`` for unknown media/list types. The feed filters on
    ``has_logo`` and (unless genre/language/anime narrowing) ``has_artwork``,
    applies the list type's date window, and orders per ``_LIST_CONFIG``.
    """
    if media_type not in VALID_MEDIA_TYPES:
        raise ValueError(f"Invalid media_type: {media_type}")
    if list_type not in VALID_LIST_TYPES:
        raise ValueError(f"Invalid list_type: {list_type}")
    if list_type == "new_season_for_you":
        return MediaItem.objects.none()

    sort_by, sort_dir, date_filter_name = _LIST_CONFIG[list_type]
    date_from, date_to = _date_filter(date_filter_name)
    require_artwork = not (language or is_anime is not None)
    return catalog_service.list_media(
        media_type=media_type,
        genre=genre,
        language=language,
        is_anime=is_anime,
        has_artwork=require_artwork,
        has_logo=True,
        sort_by=sort_by,
        sort_dir=sort_dir,
        date_from=date_from,
        date_to=date_to,
        exclude_adult=exclude_adult,
    )


def trending_seasons(
    *,
    genre: str | None,
    language: str | None,
    is_anime: bool | None,
    exclude_adult: bool,
) -> list:
    """Latest season per show whose season premiered in the trending window.

    Trending Shows surfaces a show's *latest* season (by ``season_number``) as the
    item instead of the show itself, gated on the season's premiere (``air_date``)
    falling within ``[today-365d, today+180d]`` — a show whose latest season aired
    over a year ago drops out; one announced to premiere within the window is
    kept but *demoted* below seasons that have already aired (a not-yet-aired
    season isn't what people can watch right now). ``has_logo``/artwork gating is
    deliberately skipped: the season card renders its own poster (falling back to
    the show's poster) and plain-text title, and requiring show-level
    logo/textless assets would wrongly hide fresh seasons.

    Returns the ordered list (materialized here — the candidate set is bounded by
    the date window and one season per show, and Python lets the two date
    directions sort portably across Postgres/SQLite): aired seasons newest-first,
    then future seasons soonest-first.
    """
    today = date.today()
    date_from = today - timedelta(days=365)
    date_to = today + timedelta(days=180)

    latest_number = (
        Season.objects.filter(show_id=OuterRef("show_id"))
        .order_by("-season_number")
        .values("season_number")[:1]
    )
    qs = Season.objects.filter(
        air_date__isnull=False,
        air_date__gte=date_from,
        air_date__lte=date_to,
        season_number=Subquery(latest_number),
    )
    if genre:
        qs = qs.filter(show__media_item__media_genres__genre__slug=genre)
    if language:
        qs = qs.filter(show__media_item__original_language=language)
    if is_anime is not None:
        qs = qs.filter(show__is_anime=is_anime)
    if exclude_adult:
        qs = qs.filter(show__media_item__is_adult=False)
    seasons = list(qs.select_related("show__media_item").distinct())

    def _sort_key(season: Season) -> tuple[int, int]:
        days_to_premiere = (season.air_date - today).days
        if days_to_premiere <= 0:
            return (0, -days_to_premiere)  # aired, newest first
        return (1, days_to_premiere)  # future, soonest first

    seasons.sort(key=_sort_key)
    return seasons


def default_sections() -> list[dict]:
    """The anonymous discover-page section set (legacy ``default_sections``).

    Per-user ``generate_sections``/``compute_profile`` (preference signals) are
    part of the deferred personalization engine, so every caller gets these four
    canonical sections. Each is a descriptor for an already-ported list_type
    feed, so the frontend can resolve each section against the discover list
    routes. Field set mirrors ``PersonalizedSection`` (nulls included).
    """
    return [
        {
            "id": "trending_movies",
            "title": "Trending Movies",
            "media_type": "movie",
            "list_type": "trending",
            "genre": None,
            "language": None,
            "is_anime": None,
            "is_personalized": False,
            "reason": None,
        },
        {
            "id": "trending_shows",
            "title": "Trending Shows",
            "media_type": "show",
            "list_type": "trending",
            "genre": None,
            "language": None,
            "is_anime": None,
            "is_personalized": False,
            "reason": None,
        },
        {
            "id": "popular_games",
            "title": "Popular Games",
            "media_type": "game",
            "list_type": "popular",
            "genre": None,
            "language": None,
            "is_anime": None,
            "is_personalized": False,
            "reason": None,
        },
        {
            "id": "new_music",
            "title": "New Music",
            "media_type": "music",
            "list_type": "popular",
            "genre": None,
            "language": None,
            "is_anime": None,
            "is_personalized": False,
            "reason": None,
        },
    ]
