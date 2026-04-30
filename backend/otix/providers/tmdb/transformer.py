"""TMDB JSON → domain model mapping.

Stateless pure functions. Each function takes raw TMDB data and returns an
unsaved SQLAlchemy model instance (or None if the data is insufficient).
"""

from __future__ import annotations

from datetime import date
from otix.domain.asset import ExternalRating
from otix.domain.genre import Genre
from otix.domain.media import Episode, ExternalID, Game, MediaItem, Movie, Season, Show
from otix.lib.types import JSONValue
from otix.domain.people import MediaCredit, Person

# TODO: Replace JSONValue with typed TMDB response schemas (e.g. MovieResponse, ShowResponse).


def _parse_date(raw: str | None) -> date | None:
    """Parse a date string like '1999-10-15' to a date object."""
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except (ValueError, TypeError):
        return None


# ── Media Items ──────────────────────────────────────────────────


def to_media_item(raw: dict[str, JSONValue], media_type: str) -> MediaItem:
    title = raw.get("title") or raw.get("name", "")
    slug = _slugify(title)

    return MediaItem(
        media_type=media_type,
        title=title,
        overview=raw.get("overview"),
        slug=slug,
        poster_url=_image_url(raw.get("poster_path")),
        backdrop_url=_image_url(raw.get("backdrop_path")),
        release_date=_parse_date(raw.get("release_date") or raw.get("first_air_date")),
        popularity=raw.get("popularity", 0.0),
        original_language=raw.get("original_language"),
    )


def to_movie(raw: dict[str, JSONValue]) -> Movie:
    movie = Movie(
        runtime=raw.get("runtime"),
        budget=raw.get("budget"),
        revenue=raw.get("revenue"),
        tagline=raw.get("tagline"),
        is_anime=_is_anime(raw),
    )
    movie.media_item = to_media_item(raw, "movie")
    return movie


def to_show(raw: dict[str, JSONValue]) -> Show:
    show = Show(
        status=raw.get("status"),
        first_air_date=_parse_date(raw.get("first_air_date")),
        last_air_date=_parse_date(raw.get("last_air_date")),
        number_of_seasons=raw.get("number_of_seasons"),
        number_of_episodes=raw.get("number_of_episodes"),
    )
    show.media_item = to_media_item(raw, "show")

    for season_data in raw.get("seasons", []):
        if season_data.get("season_number", 0) > 0:
            show.seasons.append(_to_season(season_data))

    return show


def _to_season(raw: dict[str, JSONValue]) -> Season:
    season = Season(
        season_number=raw.get("season_number", 0),
        name=raw.get("name"),
        overview=raw.get("overview"),
        poster_url=_image_url(raw.get("poster_path")),
    )
    for ep_data in raw.get("episodes", []):
        season.episodes.append(_to_episode(ep_data))
    return season


def _to_episode(raw: dict[str, JSONValue]) -> Episode:
    return Episode(
        episode_number=raw.get("episode_number", 0),
        name=raw.get("name"),
        overview=raw.get("overview"),
        runtime=raw.get("runtime"),
        air_date=_parse_date(raw.get("air_date")),
    )


# ── People ──────────────────────────────────────────────────────


def to_person(raw: dict[str, JSONValue]) -> Person:
    return Person(
        name=raw.get("name", ""),
        tmdb_id=raw.get("id"),
        imdb_id=raw.get("imdb_id"),
        photo_url=_image_url(raw.get("profile_path")),
    )


def to_credit(raw: dict[str, JSONValue], role: str) -> MediaCredit | None:
    person_id = raw.get("id")
    if not person_id:
        return None

    return MediaCredit(
        role=role,
        character_name=raw.get("character") if role == "cast" else raw.get("job"),
        sort_order=raw.get("order", 0),
    )


# ── Genres ──────────────────────────────────────────────────────


def to_genre(raw: dict[str, JSONValue]) -> Genre:
    return Genre(
        name=raw["name"],
        slug=_slugify(raw["name"]),
    )


# ── Ratings ─────────────────────────────────────────────────────


def to_rating(media_item_id: str, provider: str, score: float, max_score: float = 10.0, vote_count: int | None = None) -> ExternalRating:
    return ExternalRating(
        media_item_id=media_item_id,
        provider=provider,
        score=score,
        max_score=max_score,
        vote_count=vote_count,
    )


# ── Helpers ─────────────────────────────────────────────────────


TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500"
TMDB_IMAGE_BASE_ORIGINAL = "https://image.tmdb.org/t/p/original"


def _image_url(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"


def _slugify(title: str) -> str:
    import re
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    if len(slug) > 200:
        slug = slug[:200].rsplit("-", 1)[0]
    return slug


def _is_anime(raw: dict[str, JSONValue]) -> bool:
    keywords = [k.get("name", "").lower() for k in raw.get("keywords", {}).get("keywords", [])]
    return "anime" in raw.get("original_language", "") or "anime" in keywords
