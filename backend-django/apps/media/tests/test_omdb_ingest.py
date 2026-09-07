"""Tests for the OMDb rating enrich service (``apps.media.services.omdb_ingest``).

DB-touching pieces run as sync ``TestCase`` against the real (test) database:
the pure parsers/``_rating_specs`` mapper and the idempotent
``upsert_omdb_ratings`` write. The async driver (``omdb_enrich_ratings``) runs
its DB reads/writes via ``sync_to_async`` on a worker-thread connection that
escapes ``TestCase``'s per-test rollback, so its async tests stub
``_stored_imdb_id``/``upsert_omdb_ratings`` and assert call patterns instead.
``core.providers.omdb.OMDbProvider`` is exercised over an ``httpx.MockTransport``
(the key rides the query string; the token bucket runs on an in-memory Redis
double).
"""

from __future__ import annotations

import asyncio
from unittest import mock

import httpx
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase, override_settings

from apps.media.models import ExternalID, ExternalRating, MediaItem
from apps.media.services.completeness import completeness_flags
from apps.media.services.omdb_ingest import (
    _parse_score,
    _parse_votes,
    _rating_specs,
    _stored_imdb_id,
    omdb_enrich_ratings,
    upsert_omdb_ratings,
)
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.omdb import BASE_URL, OMDbProvider

IMDB_TT = "tt0137523"


def _run(coro):
    return asyncio.run(coro)


def _media():
    return MediaItem.objects.create(
        media_type="movie", title="Fight Club", slug="fight-club"
    )


def _omdb_raw(**overrides):
    raw = {
        "Title": "Fight Club",
        "imdbID": IMDB_TT,
        "Type": "movie",
        "imdbRating": "8.8",
        "imdbVotes": "2,304,528",
        "Ratings": [
            {"Source": "Internet Movie Database", "Value": "8.8/10"},
            {"Source": "Rotten Tomatoes", "Value": "79%"},
            {"Source": "Metacritic", "Value": "66/100"},
        ],
    }
    raw.update(overrides)
    return raw


# ── In-memory async Redis double (token-bucket script transcription) ──


class _FakeScript:
    """Grant token-bucket acquisition over ``redis.storage``."""

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


class OmdbParsersTests(TestCase):
    def test_parse_votes(self):
        self.assertEqual(_parse_votes("2,304,528"), 2304528)
        self.assertEqual(_parse_votes("900"), 900)
        self.assertIsNone(_parse_votes(""))
        self.assertIsNone(_parse_votes(None))
        self.assertIsNone(_parse_votes("N/A"))

    def test_parse_score_formats(self):
        self.assertEqual(_parse_score("8.8/10"), 8.8)
        self.assertEqual(_parse_score("79%"), 79.0)
        self.assertEqual(_parse_score("66/100"), 66.0)
        self.assertEqual(_parse_score("8.8"), 8.8)
        self.assertIsNone(_parse_score("N/A"))
        self.assertIsNone(_parse_score(None))
        self.assertIsNone(_parse_score(88))  # non-string
        self.assertIsNone(_parse_score("garbage"))


class OmdbRatingSpecsTests(TestCase):
    def test_maps_three_sources_in_order_with_imdb_votes(self):
        specs = _rating_specs(_omdb_raw())
        self.assertEqual(
            [spec["provider"] for spec in specs],
            ["imdb", "rotten_tomatoes", "metacritic"],
        )
        self.assertEqual(specs[0]["score"], 8.8)
        self.assertEqual(specs[0]["max_score"], 10.0)
        self.assertEqual(specs[0]["vote_count"], 2304528)
        self.assertEqual(specs[1]["score"], 79.0)
        self.assertEqual(specs[1]["max_score"], 100.0)
        self.assertIsNone(specs[1]["vote_count"])
        self.assertEqual(specs[2]["score"], 66.0)

    def test_top_level_imdb_fallback_when_ratings_array_omits_it(self):
        ratings = [
            {"Source": "Rotten Tomatoes", "Value": "85%"},
            {"Source": "Metacritic", "Value": "70/100"},
        ]
        specs = _rating_specs(_omdb_raw(Ratings=ratings))
        imdb = next(spec for spec in specs if spec["provider"] == "imdb")
        self.assertEqual(imdb["score"], 8.8)
        self.assertEqual(imdb["vote_count"], 2304528)

    def test_na_entries_are_skipped(self):
        ratings = [
            {"Source": "Internet Movie Database", "Value": "N/A"},
            {"Source": "Rotten Tomatoes", "Value": "79%"},
        ]
        specs = _rating_specs(
            _omdb_raw(Ratings=ratings, imdbRating="N/A", imdbVotes="N/A")
        )
        self.assertEqual(
            [spec["provider"] for spec in specs], ["rotten_tomatoes"]
        )

    def test_unknown_sources_ignored_empty_payloads_produce_nothing(self):
        ratings = [{"Source": "Some Website", "Value": "9/10"}]
        # An unknown source is ignored; top-level imdb fields still fall back.
        specs = _rating_specs(_omdb_raw(Ratings=ratings))
        self.assertEqual([spec["provider"] for spec in specs], ["imdb"])
        self.assertEqual(
            _rating_specs(_omdb_raw(Ratings=ratings, imdbRating="N/A", imdbVotes="N/A")),
            [],
        )
        self.assertEqual(_rating_specs({"Title": "Fight Club"}), [])


class OmdbStoredImdbIdTests(TestCase):
    def _media_ct(self):
        return ContentType.objects.get_for_model(MediaItem)

    def test_reads_back_a_backfilled_imdb_external_id(self):
        media = _media()
        self.assertIsNone(_stored_imdb_id(media.pk))
        ExternalID.objects.create(
            content_type=self._media_ct(),
            object_id=media.pk,
            provider="imdb",
            external_id=IMDB_TT,
            media_type="movie",
        )
        self.assertEqual(_stored_imdb_id(media.pk), IMDB_TT)
        self.assertIsNone(_stored_imdb_id(media.pk + 1000))


class UpsertOmdbRatingsTests(TestCase):
    def test_creates_one_rating_row_per_provider(self):
        media = _media()
        added = upsert_omdb_ratings(media.pk, _omdb_raw())

        self.assertEqual(added, 3)
        rows = {r.provider: r for r in ExternalRating.objects.filter(media_item=media)}
        self.assertEqual(set(rows), {"imdb", "rotten_tomatoes", "metacritic"})
        self.assertEqual(rows["imdb"].score, 8.8)
        self.assertEqual(rows["imdb"].max_score, 10.0)
        self.assertEqual(rows["imdb"].vote_count, 2304528)
        self.assertEqual(rows["rotten_tomatoes"].score, 79.0)
        self.assertEqual(rows["rotten_tomatoes"].max_score, 100.0)
        self.assertEqual(rows["metacritic"].score, 66.0)
        self.assertTrue(completeness_flags(media)["has_external_ratings"])

    def test_rerun_is_idempotent(self):
        media = _media()
        upsert_omdb_ratings(media.pk, _omdb_raw())
        added = upsert_omdb_ratings(media.pk, _omdb_raw())
        self.assertEqual(added, 0)
        self.assertEqual(ExternalRating.objects.filter(media_item=media).count(), 3)

    def test_drifted_score_and_votes_are_refreshed(self):
        media = _media()
        upsert_omdb_ratings(media.pk, _omdb_raw())
        added = upsert_omdb_ratings(
            media.pk,
            _omdb_raw(
                imdbVotes="2,304,529",
                Ratings=[
                    {"Source": "Internet Movie Database", "Value": "8.9/10"},
                    {"Source": "Rotten Tomatoes", "Value": "85%"},
                    {"Source": "Metacritic", "Value": "70/100"},
                ],
            ),
        )
        self.assertEqual(added, 0)
        rows = {r.provider: r for r in ExternalRating.objects.filter(media_item=media)}
        self.assertEqual(rows["imdb"].score, 8.9)
        self.assertEqual(rows["imdb"].vote_count, 2304529)
        self.assertEqual(rows["rotten_tomatoes"].score, 85.0)
        self.assertEqual(ExternalRating.objects.filter(media_item=media).count(), 3)

    def test_na_only_payload_creates_nothing(self):
        media = _media()
        added = upsert_omdb_ratings(media.pk, _omdb_raw(Ratings=None, imdbRating="N/A"))
        self.assertEqual(added, 0)
        self.assertFalse(ExternalRating.objects.filter(media_item=media).exists())


class OmdbEnrichRatingsTests(TestCase):
    """Async driver: imdb-id resolution + OMDb fetch + sync upsert.

    The two DB-backed helpers run through ``sync_to_async`` on a worker thread,
    where a ``TestCase`` transaction isn't visible, so they're stubbed to keep
    each branch deterministic; their real DB behavior is covered by the sync
    ``OmdbStoredImdbIdTests``/``UpsertOmdbRatingsTests`` classes above.
    """

    def setUp(self):
        self.media = _media()

    def _provider(self, raw=None, *, side_effect=None):
        provider = mock.Mock()
        provider.get_by_imdb_id = mock.AsyncMock(
            return_value=raw, side_effect=side_effect
        )
        return provider

    def test_unconfigured_key_skips_everything(self):
        provider = self._provider()
        with override_settings(OMDB_API_KEY=""), mock.patch(
            "apps.media.services.omdb_ingest._stored_imdb_id",
            return_value=IMDB_TT,
        ):
            result = _run(omdb_enrich_ratings(self.media.pk, provider=provider))

        provider.get_by_imdb_id.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "unconfigured")

    def test_fetches_ratings_and_upserts(self):
        provider = self._provider(_omdb_raw())
        with override_settings(OMDB_API_KEY="test-key"), mock.patch(
            "apps.media.services.omdb_ingest._stored_imdb_id", return_value=IMDB_TT
        ), mock.patch(
            "apps.media.services.omdb_ingest.upsert_omdb_ratings", return_value=3
        ) as upsert:
            result = _run(omdb_enrich_ratings(self.media.pk, provider=provider))

        provider.get_by_imdb_id.assert_awaited_once_with(IMDB_TT)
        upsert.assert_called_once_with(self.media.pk, _omdb_raw())
        self.assertEqual(result["imdb_id"], IMDB_TT)
        self.assertTrue(result["enriched"])
        self.assertEqual(result["ratings_added"], 3)
        self.assertIsNone(result["reason"])

    def test_missing_imdb_id_is_benign_noop(self):
        provider = self._provider()
        with override_settings(OMDB_API_KEY="test-key"), mock.patch(
            "apps.media.services.omdb_ingest._stored_imdb_id", return_value=None
        ):
            result = _run(omdb_enrich_ratings(self.media.pk, provider=provider))

        provider.get_by_imdb_id.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no imdb id")

    def test_provider_miss_is_benign_noop(self):
        provider = self._provider(None)
        with override_settings(OMDB_API_KEY="test-key"), mock.patch(
            "apps.media.services.omdb_ingest._stored_imdb_id", return_value=IMDB_TT
        ), mock.patch(
            "apps.media.services.omdb_ingest.upsert_omdb_ratings"
        ) as upsert:
            result = _run(omdb_enrich_ratings(self.media.pk, provider=provider))

        provider.get_by_imdb_id.assert_awaited_once_with(IMDB_TT)
        upsert.assert_not_called()
        self.assertFalse(result["enriched"])
        self.assertEqual(result["reason"], "no result")


class OMDbProviderTests(TestCase):
    """Client transport: apikey injection + Response-False/HTTP miss -> None."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _client(self, handler):
        transport = httpx.MockTransport(handler=handler)
        return OMDbProvider(
            redis=FakeAsyncRedis(),
            http_client=httpx.AsyncClient(transport=transport, base_url=BASE_URL),
        )

    def test_get_by_imdb_id_sends_key_and_returns_body(self):
        body = _omdb_raw()
        body["Response"] = "True"

        def handler(request):
            self.assertEqual(request.url.params["apikey"], "test-key")
            self.assertEqual(request.url.params["i"], IMDB_TT)
            return httpx.Response(200, json=body)

        with override_settings(OMDB_API_KEY="test-key"):
            result = _run(self._client(handler).get_by_imdb_id(IMDB_TT))

        self.assertEqual(result["Title"], "Fight Club")
        self.assertEqual(result["imdbID"], IMDB_TT)

    def test_response_false_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(
                200, json={"Response": "False", "Error": "Movie not found!"}
            )

        with override_settings(OMDB_API_KEY="test-key"):
            result = _run(self._client(handler).get_by_imdb_id(IMDB_TT))

        self.assertIsNone(result)

    def test_non_200_is_normalized_to_none(self):
        def handler(request):
            return httpx.Response(503, text="unavailable")

        with override_settings(OMDB_API_KEY="test-key"):
            result = _run(self._client(handler).get_by_imdb_id(IMDB_TT))

        self.assertIsNone(result)
