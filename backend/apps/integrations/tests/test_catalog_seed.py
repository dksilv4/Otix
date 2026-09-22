"""Tests for the bulk catalog-seed driver (``apps.integrations.services.catalog_seed``).

DB-touching enqueue/drain behavior runs as ordinary ``TestCase`` methods so the
writes roll back per test. The async discovery feeder
(``enqueue_tmdb_popular``) drives a real ``TMDBProvider`` over an
``httpx.MockTransport`` (popular pages), but its enqueue step crosses to a
worker thread via ``sync_to_async`` — a write that would escape ``TestCase``'s
rollback — so the feeder tests stub ``enqueue_seed_jobs`` (the module global it
resolves at call time) and assert the discovered id list instead. The drain
loop's per-job execution is stubbed at the ``execute_sync_job`` seam so the
selection/order logic is tested without re-running a provider engine.
"""

from __future__ import annotations

import asyncio
import unittest.mock as mock

import httpx
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.services.catalog_seed import (
    enqueue_seed_jobs,
    enqueue_tmdb_discover,
    enqueue_tmdb_popular,
    run_pending_jobs,
)
from apps.media.models import ExternalID, MediaItem
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.tmdb import TMDBProvider


def _run(coro):
    return asyncio.run(coro)


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


class _FakeAsyncRedis:
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


class EnqueueSeedJobsTests(TestCase):
    def test_creates_one_pending_job_per_unseen_external_id(self):
        jobs = enqueue_seed_jobs(provider="tmdb", entity_type="movie", external_ids=["550", "999"])
        self.assertEqual(sorted(j.external_id for j in jobs), ["550", "999"])
        self.assertEqual(SyncJob.objects.filter(status="pending").count(), 2)
        for job in jobs:
            self.assertEqual(job.provider, "tmdb")
            self.assertEqual(job.entity_type, "movie")
            self.assertEqual(job.status, "pending")
            self.assertEqual(job.phase, "core")

    def test_skips_external_ids_already_mapped_to_a_catalog_row(self):
        media = MediaItem.objects.create(media_type="movie", title="Fight Club", slug="fight-club")
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        jobs = enqueue_seed_jobs(provider="tmdb", entity_type="movie", external_ids=["550", "999"])
        self.assertEqual([j.external_id for j in jobs], ["999"])
        self.assertEqual(SyncJob.objects.count(), 1)

    def test_skips_ids_with_live_pending_or_running_jobs(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="7", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="6", status="running"
        )
        jobs = enqueue_seed_jobs(provider="tmdb", entity_type="movie", external_ids=["6", "7", "8"])
        self.assertEqual([j.external_id for j in jobs], ["8"])
        self.assertEqual(SyncJob.objects.count(), 3)

    def test_completed_job_does_not_block_re_enqueue(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="9", status="completed"
        )
        jobs = enqueue_seed_jobs(provider="tmdb", entity_type="movie", external_ids=["9"])
        self.assertEqual([j.external_id for j in jobs], ["9"])
        self.assertEqual(SyncJob.objects.count(), 2)

    def test_collapses_blank_and_duplicate_ids(self):
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=[" 550 ", "550", "", "999"]
        )
        self.assertEqual(sorted(j.external_id for j in jobs), ["550", "999"])
        self.assertEqual(SyncJob.objects.count(), 2)

    def test_all_blank_input_enqueues_nothing(self):
        jobs = enqueue_seed_jobs(provider="tmdb", entity_type="movie", external_ids=["", "  "])
        self.assertEqual(jobs, [])
        self.assertEqual(SyncJob.objects.count(), 0)

    def test_is_bulk_and_parent_are_passed_through(self):
        parent = SyncJob.objects.create(
            provider="tmdb", entity_type="company", external_id="61", status="running"
        )
        jobs = enqueue_seed_jobs(
            provider="tmdb",
            entity_type="movie",
            external_ids=["550"],
            is_bulk=False,
            parent=parent,
        )
        self.assertEqual(len(jobs), 1)
        self.assertFalse(jobs[0].is_bulk)
        self.assertEqual(jobs[0].parent_id, parent.pk)


class EnsureCatalogJobTests(TestCase):
    def test_rejects_music(self):
        from apps.integrations.services.catalog_seed import ensure_catalog_job

        self.assertIsNone(ensure_catalog_job("musicbrainz", "album", "mbid"))
        self.assertIsNone(ensure_catalog_job("tmdb", "music", "1"))
        self.assertEqual(SyncJob.objects.count(), 0)

    def test_creates_a_live_job_for_an_unmapped_id(self):
        from apps.integrations.services.catalog_seed import ensure_catalog_job

        job = ensure_catalog_job("tmdb", "movie", "550", priority=1, dispatch=False)
        self.assertIsNotNone(job)
        self.assertEqual(job.status, "pending")
        self.assertEqual(job.priority, 1)

    def test_rehydrate_is_allowed_for_mapped_ids_when_due(self):
        from apps.integrations.services.catalog_seed import ensure_catalog_job

        media = MediaItem.objects.create(
            media_type="movie", title="Fight Club", slug="fight-club", completeness_score=0.2
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        job = ensure_catalog_job("tmdb", "movie", "550", priority=4, dispatch=False)
        self.assertIsNotNone(job)
        self.assertEqual(SyncJob.objects.filter(external_id="550").count(), 1)

    def test_fresh_complete_row_is_a_noop(self):
        from datetime import timedelta

        from django.utils import timezone

        from apps.integrations.services.catalog_seed import ensure_catalog_job

        media = MediaItem.objects.create(
            media_type="movie",
            title="Fight Club",
            slug="fight-club",
            completeness_score=0.9,
            next_sync_at=timezone.now() + timedelta(days=7),
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        self.assertIsNone(ensure_catalog_job("tmdb", "movie", "550", dispatch=False))
        self.assertEqual(SyncJob.objects.count(), 0)

    def test_bumps_priority_on_an_existing_live_job(self):
        from apps.integrations.services.catalog_seed import ensure_catalog_job

        first = ensure_catalog_job("tmdb", "movie", "550", priority=5, dispatch=False)
        second = ensure_catalog_job("tmdb", "movie", "550", priority=0, dispatch=False)
        self.assertEqual(first.pk, second.pk)
        first.refresh_from_db()
        self.assertEqual(first.priority, 0)
        self.assertEqual(SyncJob.objects.count(), 1)


class RunPendingJobsTests(TestCase):
    def test_drains_oldest_pending_jobs_up_to_limit(self):
        first = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending"
        )
        second = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="2", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="3", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="99", status="completed"
        )

        drained = []
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=lambda pk: drained.append(pk) or {"status": "success"},
        ):
            summary = run_pending_jobs(provider="tmdb", limit=2)

        self.assertEqual(summary["ran"], 2)
        self.assertEqual(summary["succeeded"], 2)
        self.assertEqual(summary["failed"], 0)
        self.assertEqual(drained, [first.pk, second.pk])
        self.assertEqual(SyncJob.objects.filter(external_id="3", status="pending").exists(), True)

    def test_drains_higher_priority_first(self):
        low = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending", priority=5
        )
        high = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="2", status="pending", priority=0
        )
        drained = []
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=lambda pk: drained.append(pk) or {"status": "success"},
        ):
            run_pending_jobs(limit=1)
        self.assertEqual(drained, [high.pk])
        self.assertTrue(SyncJob.objects.filter(pk=low.pk, status="pending").exists())

    def test_entity_type_filter_narrows_the_drain(self):
        movie = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="show", external_id="2", status="pending"
        )
        drained = []
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=lambda pk: drained.append(pk) or {"status": "success"},
        ):
            summary = run_pending_jobs(provider="tmdb", entity_type="movie")

        self.assertEqual(summary["ran"], 1)
        self.assertEqual(drained, [movie.pk])

    def test_counts_failed_and_skipped_outcomes(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="2", status="pending"
        )
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=[
                {"status": "failed", "error": "boom"},
                {"status": "skipped", "task_id": "x"},
            ],
        ):
            summary = run_pending_jobs()

        self.assertEqual(summary["ran"], 2)
        self.assertEqual(summary["failed"], 1)
        self.assertEqual(summary["skipped"], 1)
        self.assertEqual(summary["succeeded"], 0)

    def test_skips_music_jobs(self):
        SyncJob.objects.create(
            provider="musicbrainz", entity_type="album", external_id="mbid", status="pending"
        )
        movie = SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="1", status="pending"
        )
        drained = []
        with mock.patch(
            "apps.integrations.services.catalog_seed.execute_sync_job",
            side_effect=lambda pk: drained.append(pk) or {"status": "success"},
        ):
            summary = run_pending_jobs()
        self.assertEqual(summary["ran"], 1)
        self.assertEqual(drained, [movie.pk])


class EnqueueDueAndIncompleteTests(TestCase):
    def test_enqueues_incomplete_mapped_movie(self):
        from apps.integrations.services.catalog_seed import enqueue_due_and_incomplete

        media = MediaItem.objects.create(
            media_type="movie", title="Fight Club", slug="fight-club", completeness_score=0.2
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        summary = enqueue_due_and_incomplete(limit=10)
        self.assertEqual(summary["enqueued"], 1)
        job = SyncJob.objects.get(external_id="550")
        self.assertEqual(job.priority, 4)
        self.assertEqual(job.provider, "tmdb")

    def test_skips_title_only_orphans(self):
        from apps.integrations.services.catalog_seed import enqueue_due_and_incomplete

        MediaItem.objects.create(
            media_type="movie", title="Stub", slug="stub", completeness_score=0.15
        )
        summary = enqueue_due_and_incomplete(limit=10)
        self.assertEqual(SyncJob.objects.count(), 0)
        self.assertEqual(summary["skipped"], 1)



class EnqueueTmdbPopularTests(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _provider(self, results_by_page, pages_seen):
        fake = _FakeAsyncRedis()

        def handler(request):
            page = int(request.url.params.get("page", "1"))
            pages_seen.append(page)
            return httpx.Response(
                200, json={"page": page, "results": results_by_page.get(page, [])}
            )

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url=TMDBProvider.BASE_URL,
        )
        self.addCleanup(lambda: _run(client.aclose()))
        return TMDBProvider(redis=fake, http_client=client)

    def test_pages_popular_until_limit_and_passes_unseen_ids_to_enqueue(self):
        pages_seen = []
        provider = self._provider(
            {
                1: [{"id": 1}, {"id": 2}, {"id": 3}],
                2: [{"id": 3}, {"id": 4}, {"id": 5}],
            },
            pages_seen,
        )
        with mock.patch(
            "apps.integrations.services.catalog_seed.enqueue_seed_jobs",
            return_value=[],
        ) as enqueue:
            summary = _run(enqueue_tmdb_popular("movie", limit=4, provider=provider))

        self.assertEqual(pages_seen, [1, 2])
        enqueue.assert_called_once_with(
            provider="tmdb",
            entity_type="movie",
            external_ids=["1", "2", "3", "4"],
        )
        self.assertEqual(summary["discovered"], 4)
        self.assertEqual(summary["enqueued"], 0)

    def test_stops_at_the_first_empty_page(self):
        pages_seen = []
        provider = self._provider({1: [{"id": 1}, {"id": 2}], 2: []}, pages_seen)
        with mock.patch(
            "apps.integrations.services.catalog_seed.enqueue_seed_jobs",
            return_value=[],
        ) as enqueue:
            summary = _run(enqueue_tmdb_popular("show", limit=10, provider=provider))

        self.assertEqual(pages_seen, [1, 2])
        enqueue.assert_called_once_with(
            provider="tmdb", entity_type="show", external_ids=["1", "2"]
        )
        self.assertEqual(summary["discovered"], 2)

    def test_reports_enqueued_created_ids(self):
        pages_seen = []
        provider = self._provider({1: [{"id": 1}, {"id": 2}]}, pages_seen)
        with mock.patch(
            "apps.integrations.services.catalog_seed.enqueue_seed_jobs",
            return_value=[SyncJob(provider="tmdb", external_id="1")],
        ):
            summary = _run(enqueue_tmdb_popular("movie", limit=10, provider=provider))

        self.assertEqual(summary["discovered"], 2)
        self.assertEqual(summary["enqueued"], 1)
        self.assertEqual(summary["external_ids"], ["1"])

    def test_unsupported_entity_type_raises(self):
        provider = self._provider({}, [])
        with self.assertRaises(ValueError):
            _run(enqueue_tmdb_popular("game", provider=provider))


class EnqueueTmdbDiscoverTests(TestCase):
    def test_unsupported_entity_type_raises(self):
        with self.assertRaises(ValueError):
            _run(enqueue_tmdb_discover("game"))

    def test_unknown_source_raises(self):
        provider = mock.MagicMock()
        with self.assertRaises(ValueError):
            _run(enqueue_tmdb_discover("movie", provider=provider, sources=("bogus",)))

    def test_fans_out_and_dedupes_sources(self):
        provider = mock.MagicMock()
        provider.get_movie_popular = mock.AsyncMock(
            return_value={"results": [{"id": 101}, {"id": 102}]}
        )
        provider.get_movie_top_rated = mock.AsyncMock(
            return_value={"results": [{"id": 102}, {"id": 103}]}
        )
        with mock.patch(
            "apps.integrations.services.catalog_seed.enqueue_seed_jobs",
            return_value=[SyncJob(provider="tmdb", external_id="101")],
        ) as enqueue_mock:
            summary = _run(
                enqueue_tmdb_discover(
                    "movie",
                    limit=10,
                    provider=provider,
                    sources=("popular", "top_rated"),
                )
            )

        self.assertEqual(summary["discovered"], 3)  # 101, 102, 103 (102 deduped)
        self.assertEqual(summary["enqueued"], 1)
        enqueue_mock.assert_called_once_with(
            provider="tmdb",
            entity_type="movie",
            external_ids=["101", "102", "103"],
        )

