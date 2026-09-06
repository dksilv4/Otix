"""Tests for the TMDB movie ingest service (``apps.media.services.tmdb_ingest``).

DB-touching: seeds MediaItem+Movie rows from TMDB detail JSON on the real
(test) database. The fetch-wiring path is exercised with the seed stubbed out —
the service runs its DB write via ``sync_to_async`` on a worker-thread
connection, which would escape ``TestCase``'s per-test transaction rollback, so
the async test must not touch the DB. It drives
``core.providers.tmdb.TMDBProvider`` over an ``httpx.MockTransport`` (auth is a
static Bearer; the token bucket runs on an in-memory Redis double), so no
network or broker is touched.
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.test import TestCase

from apps.media.models import (
    Episode,
    ExternalID,
    MediaAsset,
    MediaItem,
    Movie,
    Season,
    Show,
)
from apps.media.models.genre import Genre, MediaGenre, MediaGenreType
from apps.media.services.tmdb_ingest import (
    fetch_and_seed_movie,
    fetch_and_seed_show,
    seed_movie_from_tmdb,
    seed_show_from_tmdb,
)
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.tmdb import TMDBProvider


def _run(coro):
    return asyncio.run(coro)


def _show_raw(**overrides):
    raw = {
        "id": 1396,
        "name": "Breaking Bad",
        "overview": "A high school chemistry teacher turned meth kingpin.",
        "first_air_date": "2008-01-20",
        "last_air_date": "2013-09-29",
        "original_language": "en",
        "adult": False,
        "popularity": 300.0,
        "status": "Ended",
        "number_of_seasons": 5,
        "number_of_episodes": 62,
        "poster_path": "/wtsl2MpCmT0qvogW5U0bHc4ZJc2.jpg",
        "backdrop_path": "/bF0F3uCqZ6bVtf9Yj7cR1VqzqRq.jpg",
        "external_ids": {"imdb_id": "tt0903747"},
        "genres": [{"id": 18, "name": "Drama"}, {"id": 80, "name": "Crime"}],
        "seasons": [
            {"id": 0, "name": "Specials", "season_number": 0, "episode_count": 1},
            {
                "id": 3572,
                "name": "Season 1",
                "overview": "First season.",
                "season_number": 1,
                "episode_count": 7,
                "poster_path": "/s1.jpg",
            },
            {
                "id": 3573,
                "name": "Season 2",
                "overview": "Second season.",
                "season_number": 2,
                "episode_count": 13,
                "poster_path": "/s2.jpg",
            },
        ],
    }
    raw.update(overrides)
    return raw


def _movie_raw(**overrides):
    raw = {
        "id": 550,
        "title": "Fight Club",
        "overview": "An insomniac and a soap salesman start an underground club.",
        "release_date": "1999-10-15",
        "original_language": "en",
        "adult": False,
        "popularity": 60.0,
        "runtime": 139,
        "budget": 63000000,
        "revenue": 100000000,
        "tagline": "Mischief. Mayhem. Soap.",
        "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
        "backdrop_path": "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
        "imdb_id": "tt0137523",
        "genres": [{"id": 18, "name": "Drama"}, {"id": 53, "name": "Thriller"}],
        "keywords": {"keywords": [{"id": 1, "name": "insomnia"}]},
    }
    raw.update(overrides)
    return raw


# ── In-memory async Redis double (token-bucket script transcription) ──


class _FakeScript:
    """Grant every token-bucket acquisition over ``redis.storage``."""

    def __init__(self, redis):
        self._redis = redis

    async def __call__(self, *, keys=None, args=None):
        key = keys[0]
        now, rate, burst, requested = (float(a) for a in args)
        tokens = burst - requested
        self._redis.storage[f"{key}:tokens"] = tokens
        self._redis.storage[f"{key}:last"] = now
        return [1, str(tokens), "0.0"]


class FakeAsyncRedis:
    def __init__(self):
        self.storage: dict[str, object] = {}

    def register_script(self, script):
        return _FakeScript(self)

    async def get(self, key):
        return self.storage.get(key)

    async def set(self, key, value, ex=None):
        self.storage[key] = value

    async def setex(self, key, seconds, value):
        self.storage[key] = value

    async def delete(self, *keys):
        for key in keys:
            self.storage.pop(key, None)
        return len(keys)

    async def ttl(self, key):
        return -1


class SeedMovieFromTmdbTests(TestCase):
    def test_creates_full_media_row_with_subtype_and_links(self):
        media_id = seed_movie_from_tmdb(_movie_raw())
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.media_type, "movie")
        self.assertEqual(media.title, "Fight Club")
        self.assertEqual(media.slug, "fight-club")
        self.assertEqual(str(media.release_date), "1999-10-15")
        self.assertEqual(media.popularity, 60.0)
        self.assertEqual(media.original_language, "en")
        self.assertFalse(media.is_adult)
        self.assertEqual(media.completeness_score, 0.15)
        self.assertIsNotNone(media.next_sync_at)

        movie = Movie.objects.get(media_item_id=media_id)
        self.assertEqual(movie.runtime, 139)
        self.assertEqual(movie.budget, 63000000)
        self.assertEqual(movie.revenue, 100000000)
        self.assertEqual(movie.tagline, "Mischief. Mayhem. Soap.")
        self.assertFalse(movie.is_anime)

        # tmdb + imdb external ids
        exts = ExternalID.objects.filter(content_type__model="mediaitem", object_id=media_id)
        self.assertEqual(
            {(e.provider, e.external_id) for e in exts},
            {("tmdb", "550"), ("imdb", "tt0137523")},
        )

        # canonical genres linked (dedup Genre rows by name)
        names = {g.name for g in Genre.objects.all()}
        self.assertEqual(names, {"Drama", "Thriller"})
        self.assertEqual(MediaGenre.objects.filter(media_item_id=media_id).count(), 2)

        # poster + backdrop assets from image paths
        assets = MediaAsset.objects.filter(media_item_id=media_id)
        self.assertEqual({a.asset_type for a in assets}, {"poster", "backdrop"})

    def test_idempotent_when_tmdb_external_already_mapped(self):
        first = seed_movie_from_tmdb(_movie_raw())
        second = seed_movie_from_tmdb(_movie_raw())
        self.assertEqual(first, second)
        self.assertEqual(MediaItem.objects.count(), 1)
        self.assertEqual(Movie.objects.count(), 1)
        self.assertEqual(MediaAsset.objects.filter(media_item_id=first).count(), 2)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=first).count(), 2)

    def test_reuses_same_slug_movie_and_tops_up_missing_overview(self):
        MediaItem.objects.create(media_type="movie", title="Fight Club", slug="fight-club")
        media_id = seed_movie_from_tmdb(_movie_raw())
        self.assertEqual(MediaItem.objects.count(), 1)
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(
            media.overview, "An insomniac and a soap salesman start an underground club."
        )
        # subtype row + external links still created for the reused hub
        self.assertEqual(Movie.objects.count(), 1)
        self.assertTrue(ExternalID.objects.filter(provider="tmdb", external_id="550").exists())

    def test_anime_heuristic_japanese_animation(self):
        raw = _movie_raw(
            id=101,
            title="Spirited Away",
            original_language="ja",
            release_date="2001-07-20",
            genres=[{"id": 16, "name": "Animation"}, {"id": 14, "name": "Fantasy"}],
        )
        media_id = seed_movie_from_tmdb(raw)
        self.assertTrue(Movie.objects.get(media_item_id=media_id).is_anime)

    def test_missing_id_raises_value_error(self):
        with self.assertRaises(ValueError):
            seed_movie_from_tmdb({"title": "No id here"})


class FetchAndSeedMovieTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def test_fetches_through_provider_and_passes_raw_to_seed(self):
        raw = _movie_raw()

        def handler(request):
            self.assertEqual(request.url.path, "/3/movie/550")
            self.assertEqual(request.headers["Authorization"], "Bearer test-rat")
            return httpx.Response(200, json=raw)

        fake = FakeAsyncRedis()
        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url=TMDBProvider.BASE_URL,
            headers={"Authorization": "Bearer test-rat"},
        )
        provider = TMDBProvider(redis=fake, http_client=client)

        with mock.patch(
            "apps.media.services.tmdb_ingest.seed_movie_from_tmdb", return_value=9876
        ) as seed:
            result = _run(fetch_and_seed_movie(550, provider=provider))
        seed.assert_called_once_with(raw)
        self.assertEqual(result, 9876)
        _run(client.aclose())


class SeedShowFromTmdbTests(TestCase):
    def test_creates_full_show_row_with_seasons_and_links(self):
        media_id = seed_show_from_tmdb(_show_raw())
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(media.media_type, "show")
        self.assertEqual(media.title, "Breaking Bad")
        self.assertEqual(media.slug, "breaking-bad")
        self.assertEqual(str(media.release_date), "2008-01-20")
        self.assertEqual(media.popularity, 300.0)
        self.assertEqual(media.original_language, "en")
        self.assertFalse(media.is_adult)
        self.assertEqual(media.completeness_score, 0.15)
        self.assertIsNotNone(media.next_sync_at)

        show = Show.objects.get(media_item_id=media_id)
        self.assertEqual(show.status, "Ended")
        self.assertEqual(str(show.first_air_date), "2008-01-20")
        self.assertEqual(str(show.last_air_date), "2013-09-29")
        self.assertEqual(show.number_of_seasons, 5)
        self.assertEqual(show.number_of_episodes, 62)
        self.assertFalse(show.is_anime)

        # season summaries seeded from the embedded array; specials (0) skipped;
        # episodes are a deferred full pass.
        seasons = list(Season.objects.filter(show_id=media_id).order_by("season_number"))
        self.assertEqual(
            [(s.season_number, s.name) for s in seasons],
            [(1, "Season 1"), (2, "Season 2")],
        )
        self.assertEqual(seasons[1].overview, "Second season.")
        self.assertTrue(seasons[1].poster_url.endswith("/s2.jpg"))
        self.assertEqual(Episode.objects.filter(season__show_id=media_id).count(), 0)

        # tmdb + imdb external ids, both scoped to media_type "show"
        exts = ExternalID.objects.filter(content_type__model="mediaitem", object_id=media_id)
        self.assertEqual(
            {(e.provider, e.external_id, e.media_type) for e in exts},
            {("tmdb", "1396", "show"), ("imdb", "tt0903747", "show")},
        )

        # canonical genres linked (dedup Genre rows by name)
        self.assertEqual(
            {g.name for g in Genre.objects.all()}, {"Drama", "Crime"}
        )
        self.assertEqual(MediaGenre.objects.filter(media_item_id=media_id).count(), 2)
        self.assertTrue(
            MediaGenreType.objects.filter(genre__name="Drama", media_type="show").exists()
        )

        # poster + backdrop assets from image paths
        assets = MediaAsset.objects.filter(media_item_id=media_id)
        self.assertEqual({a.asset_type for a in assets}, {"poster", "backdrop"})

    def test_idempotent_when_tmdb_external_already_mapped(self):
        first = seed_show_from_tmdb(_show_raw())
        second = seed_show_from_tmdb(_show_raw())
        self.assertEqual(first, second)
        self.assertEqual(MediaItem.objects.count(), 1)
        self.assertEqual(Show.objects.count(), 1)
        self.assertEqual(Season.objects.filter(show_id=first).count(), 2)
        self.assertEqual(MediaAsset.objects.filter(media_item_id=first).count(), 2)

    def test_reseed_same_slug_refreshes_counts_and_upserts_new_season(self):
        seed_show_from_tmdb(_show_raw())
        new_season = {
            "id": 3574,
            "name": "Season 3",
            "overview": "Third season.",
            "season_number": 3,
            "episode_count": 16,
            "poster_path": "/s3.jpg",
        }
        media_id = seed_show_from_tmdb(
            _show_raw(
                number_of_seasons=6,
                number_of_episodes=78,
                status="Returning Series",
                seasons=_show_raw()["seasons"] + [new_season],
            )
        )
        self.assertEqual(MediaItem.objects.count(), 1)
        self.assertEqual(Show.objects.count(), 1)
        show = Show.objects.get(media_item_id=media_id)
        self.assertEqual(show.status, "Returning Series")
        self.assertEqual(show.number_of_seasons, 6)
        self.assertEqual(show.number_of_episodes, 78)
        self.assertEqual(Season.objects.filter(show_id=media_id).count(), 3)

    def test_anime_heuristic_japanese_animation(self):
        raw = _show_raw(
            id=1429,
            name="Cowboy Bebop",
            original_language="ja",
            genres=[{"id": 16, "name": "Animation"}, {"id": 35, "name": "Comedy"}],
        )
        media_id = seed_show_from_tmdb(raw)
        self.assertTrue(Show.objects.get(media_item_id=media_id).is_anime)

    def test_missing_id_raises_value_error(self):
        with self.assertRaises(ValueError):
            seed_show_from_tmdb({"name": "No id here"})


class FetchAndSeedShowTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def test_fetches_through_provider_and_passes_raw_to_seed(self):
        raw = _show_raw()

        def handler(request):
            self.assertEqual(request.url.path, "/3/tv/1396")
            self.assertEqual(request.headers["Authorization"], "Bearer test-rat")
            return httpx.Response(200, json=raw)

        fake = FakeAsyncRedis()
        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url=TMDBProvider.BASE_URL,
            headers={"Authorization": "Bearer test-rat"},
        )
        provider = TMDBProvider(redis=fake, http_client=client)

        with mock.patch(
            "apps.media.services.tmdb_ingest.seed_show_from_tmdb", return_value=54321
        ) as seed:
            result = _run(fetch_and_seed_show(1396, provider=provider))
        seed.assert_called_once_with(raw)
        self.assertEqual(result, 54321)
        _run(client.aclose())
