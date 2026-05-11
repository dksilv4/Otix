"""Tests for TMDB transformer — stateless pure functions mapping TMDB JSON to domain models."""

from __future__ import annotations

from datetime import date

import pytest

from otix.providers.tmdb.transformer import (
    _parse_date,
    _slugify,
    _image_url,
    _is_anime,
    to_media_item,
    to_movie,
    to_show,
    to_person,
    to_genre,
    to_genres,
)


# ── _parse_date ─────────────────────────────────────────────────────


class TestParseDate:
    def test_valid_iso_date(self):
        assert _parse_date("1999-10-15") == date(1999, 10, 15)

    def test_none_input(self):
        assert _parse_date(None) is None

    def test_empty_string(self):
        assert _parse_date("") is None

    def test_invalid_string(self):
        assert _parse_date("not-a-date") is None

    def test_partial_date(self):
        assert _parse_date("1999") is None


# ── _slugify ────────────────────────────────────────────────────────


class TestSlugify:
    def test_basic_title(self):
        assert _slugify("Fight Club") == "fight-club"

    def test_special_characters(self):
        assert _slugify("Hello, World!") == "hello-world"

    def test_ampersand(self):
        assert _slugify("Drama & Comedy") == "drama-comedy"

    def test_multiple_spaces(self):
        assert _slugify("  The   Matrix  ") == "the-matrix"

    def test_long_title_truncated(self):
        long_title = "A" * 250
        slug = _slugify(long_title)
        assert len(slug) <= 200
        assert not slug.endswith("-")


# ── _image_url ──────────────────────────────────────────────────────


class TestImageUrl:
    def test_valid_path(self):
        assert _image_url("/abc.jpg") == "https://image.tmdb.org/t/p/w500/abc.jpg"

    def test_none_path(self):
        assert _image_url(None) is None

    def test_empty_path(self):
        assert _image_url("") is None

    def test_custom_size(self):
        assert _image_url("/abc.jpg", "original") == "https://image.tmdb.org/t/p/original/abc.jpg"


# ── _is_anime ───────────────────────────────────────────────────────


class TestIsAnime:
    def test_original_language_contains_anime(self):
        assert _is_anime({"original_language": "anime", "keywords": {"keywords": []}}) is True

    def test_anime_keyword(self):
        assert _is_anime({
            "original_language": "en",
            "keywords": {"keywords": [{"id": 1, "name": "anime"}]},
        }) is True

    def test_not_anime(self):
        assert _is_anime({
            "original_language": "en",
            "keywords": {"keywords": [{"id": 1, "name": "action"}]},
        }) is False

    def test_keywords_case_insensitive(self):
        assert _is_anime({
            "original_language": "en",
            "keywords": {"keywords": [{"id": 1, "name": "Anime"}]},
        }) is True


# ── to_media_item ───────────────────────────────────────────────────


class TestToMediaItem:
    def test_movie_title(self, sample_movie_raw: dict):
        item = to_media_item(sample_movie_raw, "movie")
        assert item.title == "Fight Club"
        assert item.media_type == "movie"
        assert item.overview == sample_movie_raw["overview"]
        assert item.slug == "fight-club"
        assert item.popularity == 73.0
        assert item.original_language == "en"
        assert item.release_date == date(1999, 10, 15)

    def test_show_uses_name_not_title(self, sample_show_raw: dict):
        item = to_media_item(sample_show_raw, "show")
        assert item.title == "Game of Thrones"

    def test_missing_release_date(self):
        raw = {"title": "Unknown", "overview": "", "popularity": 0}
        item = to_media_item(raw, "movie")
        assert item.release_date is None

    def test_poster_and_backdrop_urls(self):
        raw = {
            "title": "Test",
            "overview": "",
            "popularity": 0,
            "poster_path": "/poster.jpg",
            "backdrop_path": "/backdrop.jpg",
        }
        item = to_media_item(raw, "movie")
        assert item.poster_url == "https://image.tmdb.org/t/p/w500/poster.jpg"
        assert item.backdrop_url == "https://image.tmdb.org/t/p/w1280/backdrop.jpg"


# ── to_movie ────────────────────────────────────────────────────────


class TestToMovie:
    def test_basic_movie(self, sample_movie_raw: dict):
        movie = to_movie(sample_movie_raw)
        assert movie.runtime == 139
        assert movie.budget == 63000000
        assert movie.revenue == 100853753
        assert movie.tagline == "Mischief. Mayhem. Soap."
        assert movie.is_anime is False
        assert movie.media_item is not None
        assert movie.media_item.title == "Fight Club"

    def test_movie_without_collection(self, sample_movie_raw: dict):
        movie = to_movie(sample_movie_raw)
        assert movie.collection_id is None

    def test_movie_anime_detection(self):
        raw = {
            "title": "Spirited Away",
            "overview": "",
            "original_language": "anime",
            "poster_path": None,
            "backdrop_path": None,
            "popularity": 80.0,
            "runtime": 125,
            "budget": None,
            "revenue": None,
            "tagline": None,
            "keywords": {"keywords": []},
        }
        movie = to_movie(raw)
        assert movie.is_anime is True


# ── to_show ─────────────────────────────────────────────────────────


class TestToShow:
    def test_basic_show(self, sample_show_raw: dict):
        show = to_show(sample_show_raw)
        assert show.status == "Ended"
        assert show.first_air_date == date(2011, 4, 17)
        assert show.last_air_date == date(2019, 5, 19)
        assert show.number_of_seasons == 8
        assert show.number_of_episodes == 73
        assert show.media_item.title == "Game of Thrones"

    def test_seasons_included(self, sample_show_raw: dict):
        show = to_show(sample_show_raw)
        assert len(show.seasons) == 1  # season 0 is skipped
        season = show.seasons[0]
        assert season.season_number == 1
        assert season.name == "Season 1"
        assert len(season.episodes) == 2
        assert season.episodes[0].name == "Winter Is Coming"
        assert season.episodes[0].runtime == 62

    def test_skips_season_zero(self, sample_show_raw: dict):
        show = to_show(sample_show_raw)
        season_numbers = [s.season_number for s in show.seasons]
        assert 0 not in season_numbers

    def test_show_without_seasons(self):
        raw = {
            "name": "Minimal Show",
            "overview": "",
            "poster_path": None,
            "backdrop_path": None,
            "first_air_date": None,
            "last_air_date": None,
            "popularity": 0,
            "original_language": "en",
            "number_of_seasons": 0,
            "number_of_episodes": 0,
            "status": None,
            "seasons": [],
        }
        show = to_show(raw)
        assert len(show.seasons) == 0


# ── to_person ───────────────────────────────────────────────────────


class TestToPerson:
    def test_basic_person(self):
        raw = {"id": 819, "name": "Edward Norton", "imdb_id": "nm0001570", "profile_path": "/ed.jpg"}
        person = to_person(raw)
        assert person.name == "Edward Norton"
        assert person.tmdb_id == 819
        assert person.imdb_id == "nm0001570"
        assert person.photo_url == "https://image.tmdb.org/t/p/w500/ed.jpg"

    def test_person_without_photo(self):
        raw = {"id": 819, "name": "Edward Norton", "imdb_id": None, "profile_path": None}
        person = to_person(raw)
        assert person.photo_url is None

    def test_biography(self):
        raw = {"id": 287, "name": "Brad Pitt", "biography": "An American actor."}
        person = to_person(raw)
        assert person.biography == "An American actor."

    def test_biography_none(self):
        raw = {"id": 287, "name": "Brad Pitt"}
        person = to_person(raw)
        assert person.biography is None

    def test_birthday(self, sample_person_raw: dict):
        person = to_person(sample_person_raw)
        assert person.birthday == date(1963, 12, 18)

    def test_birthday_none(self):
        person = to_person({"id": 287, "name": "Brad Pitt"})
        assert person.birthday is None

    def test_deathday(self):
        raw = {"id": 287, "name": "Test", "deathday": "2020-01-15"}
        person = to_person(raw)
        assert person.deathday == date(2020, 1, 15)

    def test_deathday_none(self):
        person = to_person({"id": 287, "name": "Brad Pitt", "deathday": None})
        assert person.deathday is None

    def test_place_of_birth(self, sample_person_raw: dict):
        person = to_person(sample_person_raw)
        assert person.place_of_birth == "Shawnee, Oklahoma, USA"

    def test_place_of_birth_none(self):
        person = to_person({"id": 287, "name": "Brad Pitt"})
        assert person.place_of_birth is None


# ── to_genre ────────────────────────────────────────────────────────


class TestToGenre:
    def test_basic_genre(self):
        raw = {"id": 18, "name": "Science Fiction"}
        genre = to_genre(raw)
        assert genre.name == "Science Fiction"
        assert genre.slug == "science-fiction"

    def test_composite_genres(self):
        raw = {"id": 10765, "name": "Sci-Fi & Fantasy"}
        genres = to_genres(raw)
        assert [(g.name, g.slug) for g in genres] == [
            ("Sci-Fi", "sci-fi"),
            ("Fantasy", "fantasy"),
        ]
