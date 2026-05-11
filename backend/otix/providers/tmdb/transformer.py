"""TMDB JSON → domain model mapping.

Stateless pure functions. Each function takes raw TMDB data and returns an
unsaved SQLAlchemy model instance (or None if the data is insufficient).
"""

from __future__ import annotations

import re
from datetime import date

from otix.domain.genre import Genre
from otix.domain.media import Episode, MediaItem, Movie, Season, Show
from otix.domain.people import Person
from otix.lib.genres import normalize_genre_names, split_genre_name
from otix.lib.types import JSONValue


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
        backdrop_url=_image_url(raw.get("backdrop_path"), "w1280"),
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
        is_anime=_is_anime(raw),
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
        still_url=_image_url(raw.get("still_path")),
    )


# ── People ──────────────────────────────────────────────────────


def to_person(raw: dict[str, JSONValue]) -> Person:
    return Person(
        name=raw.get("name", ""),
        tmdb_id=raw.get("id"),
        imdb_id=raw.get("imdb_id") or None,
        photo_url=_image_url(raw.get("profile_path")),
        biography=raw.get("biography"),
        birthday=_parse_date(raw.get("birthday")),
        deathday=_parse_date(raw.get("deathday")),
        place_of_birth=raw.get("place_of_birth"),
    )


# ── Genres ──────────────────────────────────────────────────────


def to_genre(raw: dict[str, JSONValue]) -> Genre:
    name = split_genre_name(str(raw["name"]))[0]
    return Genre(
        name=name,
        slug=_slugify(name),
    )


def to_genres(raw: dict[str, JSONValue]) -> list[Genre]:
    return [
        Genre(name=name, slug=slug)
        for slug, name in normalize_genre_names([str(raw["name"])]).items()
    ]


# ── Helpers ─────────────────────────────────────────────────────


def _image_url(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"


def _slugify(title: str) -> str:
    slug = title.lower().strip()
    slug = re.sub(r"[^\w\s-]", "", slug)
    slug = re.sub(r"[\s_]+", "-", slug)
    slug = re.sub(r"-+", "-", slug)
    if len(slug) > 200:
        slug = slug[:200].rsplit("-", 1)[0]
    return slug


def _is_anime(raw: dict[str, JSONValue]) -> bool:
    keywords = [k.get("name", "").lower() for k in raw.get("keywords", {}).get("keywords", [])]
    if "anime" in raw.get("original_language", "") or "anime" in keywords:
        return True
    genre_map = normalize_genre_names(
        str(g["name"]) for g in raw.get("genres", []) if g.get("name")
    )
    genres = set(genre_map)
    return raw.get("original_language") == "ja" and "animation" in genres
