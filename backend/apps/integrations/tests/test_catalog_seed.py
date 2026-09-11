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
from io import StringIO

import httpx
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.services import catalog_seed
from apps.integrations.services.catalog_seed import (
    enqueue_seed_jobs,
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
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=["550", "999"]
        )
        self.assertEqual(sorted(j.external_id for j in jobs), ["550", "999"])
        self.assertEqual(SyncJob.objects.filter(status="pending").count(), 2)
        for job in jobs:
            self.assertEqual(job.provider, "tmdb")
            self.assertEqual(job.entity_type, "movie")
            self.assertEqual(job.status, "pending")
            self.assertEqual(job.phase, "core")

    def test_skips_external_ids_already_mapped_to_a_catalog_row(self):
        media = MediaItem.objects.create(
            media_type="movie", title="Fight Club", slug="fight-club"
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=["550", "999"]
        )
        self.assertEqual([j.external_id for j in jobs], ["999"])
        self.assertEqual(SyncJob.objects.count(), 1)

    def test_skips_ids_with_live_pending_or_running_jobs(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="7", status="pending"
        )
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="6", status="running"
        )
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=["6", "7", "8"]
        )
        self.assertEqual([j.external_id for j in jobs], ["8"])
        self.assertEqual(SyncJob.objects.count(), 3)

    def test_completed_job_does_not_block_re_enqueue(self):
        SyncJob.objects.create(
            provider="tmdb", entity_type="movie", external_id="9", status="completed"
        )
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=["9"]
        )
        self.assertEqual([j.external_id for j in jobs], ["9"])
        self.assertEqual(SyncJob.objects.count(), 2)

    def test_collapses_blank_and_duplicate_ids(self):
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=[" 550 ", "550", "", "999"]
        )
        self.assertEqual(sorted(j.external_id for j in jobs), ["550", "999"])
        self.assertEqual(SyncJob.objects.count(), 2)

    def test_all_blank_input_enqueues_nothing(self):
        jobs = enqueue_seed_jobs(
            provider="tmdb", entity_type="movie", external_ids=["", "  "]
        )
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
        self.assertEqual(
            SyncJob.objects.filter(external_id="3", status="pending").exists(), True
        )

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


class CatalogSeedCommandTests(TestCase):
    def test_command_enqueues_popular_then_drains(self):
        out = StringIO()
        summary = {
            "provider": "tmdb",
            "entity_type": "movie",
            "discovered": 5,
            "enqueued": 2,
            "external_ids": ["1", "2"],
        }
        drain = {"ran": 1, "succeeded": 1, "failed": 0, "skipped": 0}
        with mock.patch.object(
            catalog_seed, "enqueue_tmdb_popular", new=mock.AsyncMock(return_value=summary)
        ) as enqueue, mock.patch.object(
            catalog_seed, "run_pending_jobs", return_value=drain
        ) as drain_jobs:
            call_command("catalog_seed", kind="movie", limit=5, drain=True, stdout=out)

        enqueue.assert_awaited_once_with("movie", limit=5)
        drain_jobs.assert_called_once_with(provider="tmdb", entity_type="movie")
        self.assertIn("discovered 5 popular movie ids", out.getvalue())
        self.assertIn("enqueued 2 new sync jobs", out.getvalue())
        self.assertIn("drained 1 jobs: 1 succeeded", out.getvalue())
