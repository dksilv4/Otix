"""Tests for catalog lifecycle: next_sync_at policy + content-hash skip."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from django.contrib.contenttypes.models import ContentType
from django.test import SimpleTestCase, TestCase

from apps.media.models import ExternalID, MediaItem, Movie
from apps.media.services.catalog_lifecycle import (
    compute_content_hash,
    compute_next_sync_at,
    payload_hash_matches,
    record_payload_hash,
)
from apps.media.services.completeness import CORE_FLAGS, required_flags
from apps.media.services.tmdb_ingest import seed_movie_from_tmdb


class NextSyncAtTests(SimpleTestCase):
    now = datetime(2026, 9, 17, tzinfo=UTC)

    def _delta_hours(self, entity_type, raw, hash_match_count=0):
        nxt = compute_next_sync_at(entity_type, raw, hash_match_count, now=self.now)
        return (nxt - self.now).total_seconds() / 3600

    def test_recent_movie_is_twelve_hours(self):
        self.assertEqual(
            self._delta_hours("movie", {"release_date": "2026-09-01"}),
            12,
        )

    def test_two_year_movie_is_seven_days(self):
        self.assertEqual(
            self._delta_hours("movie", {"release_date": "2025-01-01"}),
            24 * 7,
        )

    def test_old_movie_is_thirty_days(self):
        self.assertEqual(
            self._delta_hours("movie", {"release_date": "1999-10-15"}),
            24 * 30,
        )

    def test_airing_show_is_six_hours(self):
        self.assertEqual(
            self._delta_hours("show", {"status": "Returning Series"}),
            6,
        )

    def test_hash_match_doubles_the_interval(self):
        base = self._delta_hours("movie", {"release_date": "1999-10-15"}, 0)
        doubled = self._delta_hours("movie", {"release_date": "1999-10-15"}, 1)
        self.assertEqual(doubled, base * 2)

    def test_coming_soon_game_is_twelve_hours(self):
        future = datetime(2027, 1, 1, tzinfo=UTC).timestamp()
        self.assertEqual(self._delta_hours("game", {"first_release_date": future}), 12)


class ContentHashTests(TestCase):
    def test_popularity_is_excluded_from_the_hash(self):
        a = compute_content_hash({"id": 1, "title": "X", "popularity": 1})
        b = compute_content_hash({"id": 1, "title": "X", "popularity": 99})
        self.assertEqual(a, b)

    def test_record_and_match_round_trip(self):
        media = MediaItem.objects.create(media_type="movie", title="X", slug="x")
        Movie.objects.create(media_item=media)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        raw = {"id": 550, "title": "Fight Club", "popularity": 1}
        self.assertFalse(payload_hash_matches(media.pk, "tmdb", "550", "movie", raw))
        record_payload_hash(media.pk, "tmdb", "550", "movie", raw, matched=False)
        self.assertTrue(payload_hash_matches(media.pk, "tmdb", "550", "movie", raw))
        count = record_payload_hash(media.pk, "tmdb", "550", "movie", raw, matched=True)
        self.assertEqual(count, 1)

    def test_seed_stamps_a_future_next_sync_at(self):
        before = datetime.now(UTC)
        media_id = seed_movie_from_tmdb(
            {
                "id": 550,
                "title": "Fight Club",
                "overview": "An insomniac and a soap salesman start an underground club.",
                "release_date": "1999-10-15",
                "original_language": "en",
                "runtime": 139,
                "budget": 1,
                "revenue": 2,
                "poster_path": "/x.jpg",
                "imdb_id": "tt0137523",
                "genres": [{"id": 18, "name": "Drama"}],
            }
        )
        media = MediaItem.objects.get(pk=media_id)
        self.assertIsNotNone(media.next_sync_at)
        self.assertGreater(media.next_sync_at, before + timedelta(hours=1))


class CompletenessReachableTests(SimpleTestCase):
    def test_embedding_is_not_required(self):
        self.assertNotIn("has_embedding", CORE_FLAGS)
        self.assertNotIn("has_embedding", required_flags("movie"))
        self.assertNotIn("has_embedding", required_flags("game"))


class RelatedEnqueueTests(TestCase):
    def test_tmdb_collection_and_similar_enqueue_priority_two(self):
        import asyncio
        import unittest.mock as mock

        from apps.media.services.tmdb_ingest import _enqueue_related_tmdb

        provider = mock.Mock()
        provider.get_collection = mock.AsyncMock(return_value={"parts": [{"id": 551}, {"id": 550}]})
        provider.get_movie_similar = mock.AsyncMock(return_value={"results": [{"id": 807}]})
        jobs: list[tuple] = []

        def _capture(provider, entity_type, external_id, **kwargs):
            jobs.append((provider, entity_type, external_id, kwargs.get("priority")))

        with mock.patch(
            "apps.integrations.services.catalog_seed.ensure_catalog_job",
            side_effect=_capture,
        ):
            asyncio.run(
                _enqueue_related_tmdb(
                    {"id": 550, "belongs_to_collection": {"id": 10}},
                    "movie",
                    provider,
                )
            )
        self.assertEqual(set(jobs), {("tmdb", "movie", "551", 2), ("tmdb", "movie", "807", 2)})

    def test_igdb_similar_games_enqueue_priority_two(self):
        import asyncio
        import unittest.mock as mock

        from apps.media.services.igdb_ingest import _enqueue_related_igdb

        jobs: list[tuple] = []

        def _capture(provider, entity_type, external_id, **kwargs):
            jobs.append((provider, entity_type, str(external_id), kwargs.get("priority")))

        with mock.patch(
            "apps.integrations.services.catalog_seed.ensure_catalog_job",
            side_effect=_capture,
        ):
            asyncio.run(
                _enqueue_related_igdb({"id": 119133, "similar_games": [1942, {"id": 1942}, 71]})
            )
        self.assertEqual(set(jobs), {("igdb", "game", "1942", 2), ("igdb", "game", "71", 2)})
