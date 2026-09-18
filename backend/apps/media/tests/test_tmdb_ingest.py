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
from django.test import TestCase, override_settings

from apps.company.models import Company, InvolvedCompany
from apps.media.models import (
    Episode,
    ExternalID,
    ExternalRating,
    Keyword,
    MediaAsset,
    MediaItem,
    MediaKeyword,
    MediaRelease,
    MediaVideo,
    Movie,
    Season,
    Show,
)
from apps.media.models.genre import Genre, MediaGenre, MediaGenreType
from apps.media.services.completeness import completeness_flags
from apps.media.services.tmdb_ingest import (
    fetch_and_seed_movie,
    fetch_and_seed_show,
    seed_episodes_from_season,
    seed_movie_from_tmdb,
    seed_show_from_tmdb,
)
from apps.people.models import MediaCredit, Person
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
            {
                "id": 0,
                "name": "Specials",
                "season_number": 0,
                "episode_count": 1,
                "air_date": None,
            },
            {
                "id": 3572,
                "name": "Season 1",
                "overview": "First season.",
                "season_number": 1,
                "episode_count": 7,
                "poster_path": "/s1.jpg",
                "air_date": "2008-01-20",
            },
            {
                "id": 3573,
                "name": "Season 2",
                "overview": "Second season.",
                "season_number": 2,
                "episode_count": 13,
                "poster_path": "/s2.jpg",
                "air_date": "2009-03-08",
            },
        ],
    }
    raw.update(overrides)
    return raw


def _season_raw(**overrides):
    """A ``/tv/{id}/season/{n}`` payload for Breaking Bad's Season 1."""
    raw = {
        "id": 3572,
        "season_number": 1,
        "name": "Season 1",
        "episodes": [
            {
                "episode_number": 1,
                "name": "Pilot",
                "overview": "Walt cooks.",
                "runtime": 58,
                "air_date": "2008-01-20",
                "still_path": "/still1.jpg",
            }
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


def _fight_club_credits():
    """Fight Club (550) cast+crew for the credits-seed tests."""
    return {
        "cast": [
            {
                "id": 819,
                "name": "Edward Norton",
                "character": "The Narrator",
                "order": 0,
                "profile_path": "/norton.jpg",
            },
            {
                "id": 287,
                "name": "Brad Pitt",
                "character": "Tyler Durden",
                "order": 1,
                "profile_path": "/pitt.jpg",
            },
        ],
        "crew": [
            {
                "id": 7467,
                "name": "David Fincher",
                "job": "Director",
                "order": 0,
                "profile_path": "/fincher.jpg",
            },
        ],
    }


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
        # Recompute at the seed tail: 12/22 movie flags (no credits; the raw's
        # ``keywords`` are now persisted so has_keywords is True).
        self.assertEqual(media.completeness_score, 0.571)
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

    def test_same_slug_without_tmdb_id_does_not_merge(self):
        stub = MediaItem.objects.create(media_type="movie", title="Fight Club", slug="fight-club")
        media_id = seed_movie_from_tmdb(_movie_raw())
        self.assertNotEqual(media_id, stub.pk)
        self.assertEqual(MediaItem.objects.count(), 2)
        self.assertTrue(
            ExternalID.objects.filter(
                provider="tmdb", external_id="550", object_id=media_id
            ).exists()
        )
        media = MediaItem.objects.get(pk=media_id)
        self.assertEqual(
            media.overview, "An insomniac and a soap salesman start an underground club."
        )
        self.assertEqual(Movie.objects.filter(media_item_id=media_id).count(), 1)

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


class SeedCreditsTests(TestCase):
    """Cast/crew seeding from the detail's appended ``credits`` (increment 42)."""

    def test_movie_seed_creates_person_stubs_and_cast_crew_rows(self):
        media_id = seed_movie_from_tmdb(_movie_raw(credits=_fight_club_credits()))
        self.assertEqual(Person.objects.count(), 3)
        credits = list(MediaCredit.objects.filter(media_item_id=media_id).order_by("id"))
        # cast rows first (in TMDB order), then crew
        self.assertEqual([c.role for c in credits], ["cast", "cast", "crew"])
        self.assertEqual(
            [(c.person.name, c.character_name, c.sort_order) for c in credits],
            [
                ("Edward Norton", "The Narrator", 0),
                ("Brad Pitt", "Tyler Durden", 1),
                ("David Fincher", "Director", 0),
            ],
        )
        # person stubs carry a w500 profile photo + a Person-scoped tmdb id
        norton = Person.objects.get(name="Edward Norton")
        self.assertTrue(norton.photo_url.endswith("/w500/norton.jpg"))
        ext = norton.external_ids.get(provider="tmdb")
        self.assertEqual(ext.external_id, "819")
        self.assertIsNone(ext.media_type)

    def test_shared_actor_across_titles_reuses_one_person(self):
        first = seed_movie_from_tmdb(_movie_raw(credits=_fight_club_credits()))
        second_raw = _movie_raw(
            id=807,
            title="Fight Club Two",
            imdb_id="tt0414055",
            credits=_fight_club_credits(),
        )
        second = seed_movie_from_tmdb(second_raw)
        self.assertNotEqual(first, second)
        # both titles link the same Norton row; no duplicate person stubs
        self.assertEqual(Person.objects.count(), 3)
        norton = Person.objects.get(name="Edward Norton")
        self.assertEqual(
            set(MediaCredit.objects.filter(person=norton).values_list("media_item_id", flat=True)),
            {first, second},
        )
        self.assertEqual(
            ExternalID.objects.filter(content_type__model="person", provider="tmdb").count(),
            3,
        )

    def test_movie_reseed_refreshes_credit_snapshot(self):
        raw = _movie_raw(credits=_fight_club_credits())
        media_id = seed_movie_from_tmdb(raw)
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 3)
        # second billing drops Pitt; the mapped re-sync rebuilds (delete+add)
        raw["credits"]["cast"] = raw["credits"]["cast"][:1]
        seed_movie_from_tmdb(raw)
        credits = list(MediaCredit.objects.filter(media_item_id=media_id))
        self.assertEqual({c.person.name for c in credits}, {"Edward Norton", "David Fincher"})
        # the dropped actor's Person row survives (it may credit other titles)
        self.assertTrue(Person.objects.filter(name="Brad Pitt").exists())

    def test_show_reseed_seeds_credits_once_they_appear(self):
        media_id = seed_show_from_tmdb(_show_raw())  # detail carries no credits
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 0)
        # a continuing-series re-sync whose detail now has credits hydrates them
        seed_show_from_tmdb(_show_raw(credits=_fight_club_credits()))
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 3)
        self.assertEqual(Person.objects.count(), 3)

    def test_entries_missing_tmdb_id_or_name_are_skipped(self):
        credits = _fight_club_credits()
        credits["cast"].append({"name": "No Id", "character": "x", "order": 9})
        credits["crew"].append({"id": 999999, "order": 0})  # no name
        media_id = seed_movie_from_tmdb(_movie_raw(credits=credits))
        self.assertEqual(MediaCredit.objects.filter(media_item_id=media_id).count(), 3)
        self.assertEqual(Person.objects.count(), 3)


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
            self.assertEqual(request.headers["Authorization"], "Bearer test-rat")
            if request.url.path == "/3/movie/550":
                return httpx.Response(200, json=raw)
            return httpx.Response(200, json={"results": [], "parts": []})

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
        # Recompute at the seed tail: 10/19 show flags (no credits in the raw).
        self.assertEqual(media.completeness_score, 0.526)
        self.assertIsNotNone(media.next_sync_at)

        show = Show.objects.get(media_item_id=media_id)
        self.assertEqual(show.status, "Ended")
        self.assertEqual(str(show.first_air_date), "2008-01-20")
        self.assertEqual(str(show.last_air_date), "2013-09-29")
        self.assertEqual(show.number_of_seasons, 5)
        self.assertEqual(show.number_of_episodes, 62)
        self.assertFalse(show.is_anime)

        # season summaries seeded from the embedded array; specials (0) skipped.
        # Episodes are not part of the base seed — fetch_and_seed_show hydrates
        # them per season from /tv/{id}/season/{n}.
        seasons = list(Season.objects.filter(show_id=media_id).order_by("season_number"))
        self.assertEqual(
            [(s.season_number, s.name) for s in seasons],
            [(1, "Season 1"), (2, "Season 2")],
        )
        self.assertEqual(seasons[1].overview, "Second season.")
        self.assertTrue(seasons[1].poster_url.endswith("/s2.jpg"))
        self.assertEqual([str(s.air_date) for s in seasons], ["2008-01-20", "2009-03-08"])
        self.assertEqual(Episode.objects.filter(season__show_id=media_id).count(), 0)

        # tmdb + imdb external ids, both scoped to media_type "show"
        exts = ExternalID.objects.filter(content_type__model="mediaitem", object_id=media_id)
        self.assertEqual(
            {(e.provider, e.external_id, e.media_type) for e in exts},
            {("tmdb", "1396", "show"), ("imdb", "tt0903747", "show")},
        )

        # canonical genres linked (dedup Genre rows by name)
        self.assertEqual({g.name for g in Genre.objects.all()}, {"Drama", "Crime"})
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

    def test_reseed_refreshes_existing_season_air_date(self) -> None:
        media_id = seed_show_from_tmdb(_show_raw())
        # Re-seed with Season 2's premiere moved (update_or_create, not get).
        raw = _show_raw()
        raw["seasons"][2]["air_date"] = "2009-06-01"
        reseeded_id = seed_show_from_tmdb(raw)
        self.assertEqual(reseeded_id, media_id)
        self.assertEqual(Season.objects.filter(show_id=media_id).count(), 2)
        season2 = Season.objects.get(show_id=media_id, season_number=2)
        self.assertEqual(str(season2.air_date), "2009-06-01")

    def test_null_season_air_date_backfilled_on_reseed(self) -> None:
        raw = _show_raw()
        raw["seasons"][1].pop("air_date")  # Season 1 has no premiere yet
        media_id = seed_show_from_tmdb(raw)
        season1 = Season.objects.get(show_id=media_id, season_number=1)
        self.assertIsNone(season1.air_date)
        # Upstream adds the premiere; a re-seed fills the previously-null row.
        reseeded_id = seed_show_from_tmdb(_show_raw())
        self.assertEqual(reseeded_id, media_id)
        season1.refresh_from_db()
        self.assertEqual(str(season1.air_date), "2008-01-20")

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

    def test_captures_tvdb_external_id_when_present(self):
        raw = _show_raw(external_ids={"imdb_id": "tt0903747", "tvdb_id": 73713})
        media_id = seed_show_from_tmdb(raw)
        exts = ExternalID.objects.filter(content_type__model="mediaitem", object_id=media_id)
        self.assertIn(
            ("tvdb", "73713", "show"),
            {(e.provider, e.external_id, e.media_type) for e in exts},
        )

    def test_omits_tvdb_external_id_when_absent(self):
        media_id = seed_show_from_tmdb(_show_raw())
        self.assertFalse(
            ExternalID.objects.filter(
                content_type__model="mediaitem",
                object_id=media_id,
                provider="tvdb",
            ).exists()
        )


class SeedEpisodesFromSeasonTests(TestCase):
    """Maps ``/tv/{id}/season/{n}`` episodes onto Episode rows (increment 41)."""

    def setUp(self):
        # seed_show_from_tmdb is a plain sync DB write, safe under rollback; it
        # leaves a Season-1 summary in place for the episode seeding to attach to.
        self.media_id = seed_show_from_tmdb(_show_raw())

    def season1(self):
        return Season.objects.get(show_id=self.media_id, season_number=1)

    def test_maps_season_payload_episodes_onto_rows(self):
        payload = {
            "season_number": 1,
            "episodes": [
                {
                    "episode_number": 1,
                    "name": "Pilot",
                    "overview": "Walt cooks.",
                    "runtime": 58,
                    "air_date": "2008-01-20",
                    "still_path": "/still1.jpg",
                },
                {
                    "episode_number": 2,
                    "name": "Cat's in the Bag...",
                    "overview": None,
                    "runtime": 48,
                    "air_date": "2008-01-27",
                    "still_path": None,
                },
            ],
        }
        created = seed_episodes_from_season(self.media_id, 1, payload)
        self.assertEqual(created, 2)
        season = self.season1()
        eps = list(Episode.objects.filter(season=season).order_by("episode_number"))
        self.assertEqual([e.episode_number for e in eps], [1, 2])
        self.assertEqual(eps[0].name, "Pilot")
        self.assertEqual(eps[0].runtime, 58)
        self.assertEqual(str(eps[0].air_date), "2008-01-20")
        self.assertTrue(eps[0].still_url.endswith("/w300/still1.jpg"))
        self.assertIsNone(eps[1].overview)
        self.assertIsNone(eps[1].still_url)
        # all rows landed under this season; the sibling Season 2 is untouched
        self.assertEqual(Episode.objects.count(), 2)

    def test_idempotent_reseed_returns_zero_new(self):
        payload = _season_raw()
        self.assertEqual(seed_episodes_from_season(self.media_id, 1, payload), 1)
        self.assertEqual(seed_episodes_from_season(self.media_id, 1, payload), 0)
        self.assertEqual(Episode.objects.filter(season=self.season1()).count(), 1)

    def test_missing_season_row_skips(self):
        # no Season-3 summary exists (the fixture only has seasons 1-2)
        self.assertEqual(seed_episodes_from_season(self.media_id, 3, _season_raw()), 0)
        self.assertEqual(Episode.objects.count(), 0)

    def test_episodes_without_a_number_are_skipped(self):
        payload = {
            "season_number": 1,
            "episodes": [
                {"episode_number": 1, "name": "Pilot"},
                {"name": "No number"},
            ],
        }
        self.assertEqual(seed_episodes_from_season(self.media_id, 1, payload), 1)
        self.assertEqual(Episode.objects.filter(season=self.season1()).count(), 1)


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

    def test_fetches_show_then_hydrates_episodes_per_season(self):
        show_raw = _show_raw()
        season1 = _season_raw(
            episodes=[
                {"episode_number": 1, "name": "Pilot", "air_date": "2008-01-20"},
                {"episode_number": 2, "name": "Cat's in the Bag...", "air_date": "2008-01-27"},
            ]
        )
        season2 = _season_raw(
            season_number=2,
            episodes=[{"episode_number": 1, "name": "Seven Thirty-Seven"}],
        )
        season_payloads = {
            "/3/tv/1396/season/1": season1,
            "/3/tv/1396/season/2": season2,
        }

        def handler(request):
            self.assertEqual(request.headers["Authorization"], "Bearer test-rat")
            path = request.url.path
            if path == "/3/tv/1396":
                return httpx.Response(200, json=show_raw)
            payload = season_payloads.get(path)
            if payload is not None:
                return httpx.Response(200, json=payload)
            return httpx.Response(200, json={"results": []})

        fake = FakeAsyncRedis()
        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url=TMDBProvider.BASE_URL,
            headers={"Authorization": "Bearer test-rat"},
        )
        provider = TMDBProvider(redis=fake, http_client=client)

        # Both seed writes run their ORM inserts via sync_to_async on a
        # worker-thread connection that escapes TestCase rollback, so stub them.
        with (
            mock.patch(
                "apps.media.services.tmdb_ingest.seed_show_from_tmdb", return_value=54321
            ) as seed_show,
            mock.patch(
                "apps.media.services.tmdb_ingest.seed_episodes_from_season", return_value=0
            ) as seed_eps,
        ):
            result = _run(fetch_and_seed_show(1396, provider=provider))

        seed_show.assert_called_once_with(show_raw)
        self.assertEqual(result, 54321)
        # one per aired season summary (specials 0 excluded), in order
        self.assertEqual(
            [c.args for c in seed_eps.call_args_list],
            [
                (54321, 1, season1),
                (54321, 2, season2),
            ],
        )
        _run(client.aclose())


def _rich_movie_raw(**overrides):
    """``_movie_raw`` plus every relation section increment-54 enrichment maps."""
    raw = _movie_raw(
        production_companies=[
            {
                "id": 508,
                "logo_path": "/cxw.jpg",
                "name": "Regency Enterprises",
                "origin_country": "US",
            },
            {"id": 711, "logo_path": None, "name": "Fox 2000 Pictures", "origin_country": "US"},
        ],
        release_dates={
            "results": [
                {
                    "iso_3166_1": "US",
                    "release_dates": [
                        {
                            "certification": "R",
                            "release_type": 3,
                            "release_date": "1999-10-15T00:00:00.000Z",
                        },
                        {
                            "certification": "R",
                            "release_type": 4,
                            "release_date": "1999-11-09T00:00:00.000Z",
                        },
                    ],
                },
                {
                    "iso_3166_1": "GB",
                    "release_dates": [
                        {
                            "certification": "18",
                            "release_type": 3,
                            "release_date": "1999-11-12T00:00:00.000Z",
                        },
                    ],
                },
            ]
        },
        videos={
            "results": [
                {"id": "abc123", "key": "oB6q8T4P4eA", "site": "YouTube", "type": "Trailer"},
                {"id": "skip9", "key": "zzz", "site": "Dailymotion", "type": "Trailer"},
            ]
        },
        images={
            "backdrops": [{"file_path": "/bk1.jpg", "width": 1920, "height": 1080}],
            "logos": [{"file_path": "/lg1.png", "iso_639_1": "en"}],
            "posters": [
                {"file_path": "/pst0.jpg", "iso_639_1": None},
                {"file_path": "/pst_en.jpg", "iso_639_1": "en"},
            ],
        },
        vote_average=8.4,
        vote_count=28000,
    )
    raw.update(overrides)
    return raw


class TmdbRelationHydrationTests(TestCase):
    """Increment-54: seed tails fold the detail's relation payload onto the row."""

    def test_movie_seed_hydrates_companies_releases_videos_keywords_artwork_rating(self):
        media_id = seed_movie_from_tmdb(_rich_movie_raw())
        flags = completeness_flags(MediaItem.objects.get(pk=media_id))
        for flag in (
            "has_companies",
            "has_releases",
            "has_videos",
            "has_keywords",
            "has_logo",
            "has_textless_poster",
            "has_external_ratings",
        ):
            self.assertTrue(flags[flag], f"{flag} should be True")

        # production companies -> Company + production InvolvedCompany + tmdb id
        companies = Company.objects.filter(involved_companies__media_item_id=media_id)
        self.assertEqual({c.name for c in companies}, {"Regency Enterprises", "Fox 2000 Pictures"})
        self.assertEqual(
            InvolvedCompany.objects.filter(media_item_id=media_id, production=True).count(), 2
        )
        company_exts = ExternalID.objects.filter(content_type__model="company", provider="tmdb")
        self.assertEqual({e.external_id for e in company_exts}, {"508", "711"})

        # country releases prefer the theatrical (type 3) date + certification
        rows = MediaRelease.objects.filter(media_item_id=media_id).order_by("country_code")
        self.assertEqual(
            [(r.country_code, str(r.release_date), r.certification) for r in rows],
            [
                ("GB", "1999-11-12", "18"),
                ("US", "1999-10-15", "R"),
            ],
        )

        # only the embeddable (YouTube) video lands; Dailymotion is skipped
        videos = MediaVideo.objects.filter(media_item_id=media_id)
        self.assertEqual(
            [(v.provider, v.provider_id, v.video_type) for v in videos],
            [
                ("tmdb", "abc123", "Trailer"),
            ],
        )
        self.assertTrue(videos[0].url.endswith("watch?v=oB6q8T4P4eA"))

        # keyword rows carry the movie-keyword shape
        kw_names = list(
            MediaKeyword.objects.filter(media_item_id=media_id).values_list(
                "keyword__name", flat=True
            )
        )
        self.assertEqual(kw_names, ["insomnia"])
        self.assertEqual(Keyword.objects.filter(name="insomnia").count(), 1)

        # image families land as logo / textless-poster / extra backdrop assets
        asset_types = set(
            MediaAsset.objects.filter(media_item_id=media_id).values_list("asset_type", flat=True)
        )
        self.assertEqual(asset_types, {"poster", "backdrop", "logo", "textless_poster"})

        rating = ExternalRating.objects.get(media_item_id=media_id, provider="tmdb")
        self.assertEqual((rating.score, rating.max_score, rating.vote_count), (8.4, 10.0, 28000))

    def test_show_seed_adds_networks_and_content_ratings(self):
        raw = _show_raw(
            production_companies=[
                {
                    "id": 7580,
                    "logo_path": None,
                    "name": "High Bridge Productions",
                    "origin_country": "US",
                }
            ],
            networks=[{"id": 174, "logo_path": "/amc.jpg", "name": "AMC", "origin_country": "US"}],
            content_ratings={"results": [{"iso_3166_1": "US", "rating": "TV-MA"}]},
            keywords={"results": [{"id": 100, "name": "antihero"}]},
            vote_average=9.5,
            vote_count=15000,
            images={"backdrops": [{"file_path": "/sbk.jpg"}], "logos": [], "posters": []},
        )
        media_id = seed_show_from_tmdb(raw)
        media = MediaItem.objects.get(pk=media_id)

        # networks + production companies are both production companies
        company_names = set(
            Company.objects.filter(involved_companies__media_item_id=media_id).values_list(
                "name", flat=True
            )
        )
        self.assertEqual(company_names, {"High Bridge Productions", "AMC"})
        self.assertTrue(
            ExternalID.objects.filter(
                content_type__model="company", provider="tmdb", external_id="174"
            ).exists()
        )
        # certification-only release row per country (no date)
        rel = MediaRelease.objects.get(media_item_id=media_id, country_code="US")
        self.assertEqual(rel.certification, "TV-MA")
        self.assertIsNone(rel.release_date)
        # show keyword shape ({results}) resolves too
        show_kw = list(
            MediaKeyword.objects.filter(media_item_id=media_id).values_list(
                "keyword__name", flat=True
            )
        )
        self.assertEqual(show_kw, ["antihero"])
        self.assertEqual(
            ExternalRating.objects.get(media_item_id=media_id, provider="tmdb").score, 9.5
        )
        self.assertTrue(completeness_flags(media)["has_releases"])

    def test_relation_enrichment_is_idempotent(self):
        media_id = seed_movie_from_tmdb(_rich_movie_raw())
        seed_movie_from_tmdb(_rich_movie_raw())
        self.assertEqual(
            Company.objects.filter(involved_companies__media_item_id=media_id).count(), 2
        )
        self.assertEqual(
            ExternalRating.objects.filter(media_item_id=media_id, provider="tmdb").count(), 1
        )
        self.assertEqual(MediaRelease.objects.filter(media_item_id=media_id).count(), 2)
        self.assertEqual(MediaVideo.objects.filter(media_item_id=media_id).count(), 1)
        self.assertEqual(MediaKeyword.objects.filter(media_item_id=media_id).count(), 1)
        self.assertEqual(MediaGenre.objects.filter(media_item_id=media_id).count(), 2)
        self.assertEqual(MediaAsset.objects.filter(media_item_id=media_id).count(), 5)

    def test_mapped_movie_resync_enriches_a_previously_minimal_row(self):
        media_id = seed_movie_from_tmdb(_movie_raw())
        media = MediaItem.objects.get(pk=media_id)
        self.assertFalse(completeness_flags(media)["has_companies"])
        # Second sync of the same tmdb id (early-out path) folds in the relations.
        self.assertEqual(seed_movie_from_tmdb(_rich_movie_raw()), media_id)
        media.refresh_from_db()
        self.assertTrue(completeness_flags(media)["has_companies"])
        self.assertTrue(completeness_flags(media)["has_external_ratings"])


class OmdbEnrichFoldInTests(TestCase):
    """The movie/show fetch tails fold in OMDb enrichment (key-gated).

    The seed writes are stubbed (a real write crosses ``sync_to_async`` onto a
    worker thread a ``TestCase`` can't see) and the OMDb enrich driver is patched
    at its imported home in ``tmdb_ingest``; these tests assert the gate + call
    wiring, not the OMDb mapping (covered by ``test_omdb_ingest.py``).
    """

    def test_movie_tail_enriches_when_key_configured(self):
        provider = mock.Mock()
        provider.get_movie = mock.AsyncMock(return_value=_movie_raw())
        with (
            override_settings(OMDB_API_KEY="test-key"),
            mock.patch("apps.media.services.tmdb_ingest.seed_movie_from_tmdb", return_value=9876),
            mock.patch(
                "apps.media.services.tmdb_ingest.omdb_enrich_ratings",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(fetch_and_seed_movie(550, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_awaited_once_with(9876)

    def test_show_tail_enriches_after_episode_hydration(self):
        provider = mock.Mock()
        provider.get_show = mock.AsyncMock(return_value=_show_raw())
        provider.get_season = mock.AsyncMock(return_value={})
        with (
            override_settings(OMDB_API_KEY="test-key"),
            mock.patch("apps.media.services.tmdb_ingest.seed_show_from_tmdb", return_value=9876),
            mock.patch("apps.media.services.tmdb_ingest.seed_episodes_from_season"),
            mock.patch(
                "apps.media.services.tmdb_ingest.omdb_enrich_ratings",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(fetch_and_seed_show(1396, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_awaited_once_with(9876)

    def test_unconfigured_key_skips_enrich(self):
        provider = mock.Mock()
        provider.get_movie = mock.AsyncMock(return_value=_movie_raw())

        async def _boom(media_id):
            raise AssertionError("OMDb enrich ran with no key configured")

        with (
            mock.patch("apps.media.services.tmdb_ingest.seed_movie_from_tmdb", return_value=9876),
            mock.patch(
                "apps.media.services.tmdb_ingest.omdb_enrich_ratings",
                new=mock.AsyncMock(side_effect=_boom),
            ) as enrich,
        ):
            result = _run(fetch_and_seed_movie(550, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_not_awaited()


class FanartEnrichFoldInTests(TestCase):
    """The movie/show fetch tails fold in Fanart artwork enrich (key-gated).

    Mirror of ``OmdbEnrichFoldInTests``: the seed write is stubbed (a real write
    crosses ``sync_to_async`` onto a worker-thread connection ``TestCase`` can't
    see) and the Fanart enrich driver is patched at its imported home in
    ``tmdb_ingest`` — these tests assert the gate + wiring, not Fanart mapping
    (covered by ``test_fanart_ingest.py``).
    """

    def test_movie_tail_enriches_when_key_configured(self):
        provider = mock.Mock()
        provider.get_movie = mock.AsyncMock(return_value=_movie_raw())

        with (
            override_settings(FANART_API_KEY="test-key"),
            mock.patch("apps.media.services.tmdb_ingest.seed_movie_from_tmdb", return_value=9876),
            mock.patch(
                "apps.media.services.tmdb_ingest.fanart_enrich_images",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(fetch_and_seed_movie(550, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_awaited_once_with(9876)

    def test_show_tail_enriches_after_episode_hydration(self):
        provider = mock.Mock()
        provider.get_show = mock.AsyncMock(return_value=_show_raw())
        provider.get_season = mock.AsyncMock(return_value={})

        with (
            override_settings(FANART_API_KEY="test-key"),
            mock.patch("apps.media.services.tmdb_ingest.seed_show_from_tmdb", return_value=9876),
            mock.patch("apps.media.services.tmdb_ingest.seed_episodes_from_season"),
            mock.patch(
                "apps.media.services.tmdb_ingest.fanart_enrich_images",
                new_callable=mock.AsyncMock,
            ) as enrich,
        ):
            result = _run(fetch_and_seed_show(1396, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_awaited_once_with(9876)

    def test_unconfigured_key_skips_enrich(self):
        provider = mock.Mock()
        provider.get_movie = mock.AsyncMock(return_value=_movie_raw())

        async def _boom(media_id):
            raise AssertionError("Fanart enrich ran with no key configured")

        # OMDb is configured so the movie tail reaches the Fanart gate; an unset
        # FANART_API_KEY must return before the enrich driver is ever awaited.
        with (
            override_settings(OMDB_API_KEY="test-key"),
            mock.patch("apps.media.services.tmdb_ingest.seed_movie_from_tmdb", return_value=9876),
            mock.patch(
                "apps.media.services.tmdb_ingest.omdb_enrich_ratings",
                new_callable=mock.AsyncMock,
            ),
            mock.patch(
                "apps.media.services.tmdb_ingest.fanart_enrich_images",
                new=mock.AsyncMock(side_effect=_boom),
            ) as enrich,
        ):
            result = _run(fetch_and_seed_movie(550, provider=provider))

        self.assertEqual(result, 9876)
        enrich.assert_not_awaited()
