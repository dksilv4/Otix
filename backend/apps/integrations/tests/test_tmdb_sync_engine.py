"""Roundtrip tests for the real ``tmdb`` sync engine (increment 39).

Drives the whole stack like the lifecycle/youtube tests: a pending ``SyncJob``
(``entity_type="movie"``, ``external_id`` = a TMDB movie id) is handed to
``run_sync_job.delay`` (eager, no broker), which claims the row, publishes
``sync_started``, runs the registered tmdb engine, and publishes
``sync_complete``. The async fetch+seed driver
(``apps.media.services.tmdb_ingest.fetch_and_seed_movie``) is stubbed out: its
real ORM write runs via ``sync_to_async`` on a worker-thread connection that
would escape ``TestCase``'s per-test rollback (the increment-38 gotcha), so the
test asserts the engine drives it with the job's TMDB id rather than touching
the DB asynchronously. The ``matched`` pre-check and the ``SyncJob`` row are
plain synchronous DB reads/writes, safe under rollback. Redis is faked by
patching ``core.progress.get_client`` so published frames and stored keys are
captured.
"""

import json
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.tasks import run_sync_job
from apps.media.models import ExternalID, MediaItem
from core import progress as progress_lib


class FakeRedis:
    """In-memory stand-in for ``redis.Redis`` (publish + set/get keys)."""

    def __init__(self):
        self.stored: dict[str, str] = {}
        self.published: list[tuple[str, str]] = []

    def set(self, key, value, ex=None):
        self.stored[key] = value

    def get(self, key):
        return self.stored.get(key)

    def publish(self, channel, message):
        self.published.append((channel, message))
        return 1

    def published_on(self, channel):
        return [msg for (c, msg) in self.published if c == channel]


class TmdbSyncEngineTests(TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        patcher = mock.patch("core.progress.get_client", return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def job(self, entity_type="movie", external_id="550"):
        return SyncJob.objects.create(
            provider="tmdb",
            entity_type=entity_type,
            external_id=external_id,
            status="pending",
        )

    def test_movie_job_fetches_tmdb_id_seeds_and_completes(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_movie",
            new=mock.AsyncMock(return_value=12345),
        ) as fetch:
            outcome = run_sync_job.delay(job.pk).get()

        fetch.assert_awaited_once_with(550)
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["media_item_id"], 12345)
        self.assertEqual(outcome["tmdb_id"], 550)
        self.assertFalse(outcome["matched"])
        self.assertTrue(outcome["seeded"])
        self.assertEqual(job.status, "completed")
        self.assertIsNone(job.error_message)

        channel = f"tmdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "fetching_movie", "movie_seeded", "sync_complete"],
        )
        stored = progress_lib.RedisProgress("tmdb:sync").get_stored_result(job.pk)
        self.assertEqual(stored["media_item_id"], 12345)
        self.assertEqual(stored["task_id"], str(job.pk))

    def test_existing_tmdb_mapping_reports_matched(self):
        media = MediaItem.objects.create(
            media_type="movie", title="Fight Club", slug="fight-club-tmdb"
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="tmdb",
            external_id="550",
            media_type="movie",
        )

        job = self.job()
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_movie",
            new=mock.AsyncMock(return_value=media.pk),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["status"], "success")
        self.assertTrue(outcome["matched"])
        self.assertFalse(outcome["seeded"])
        self.assertEqual(outcome["media_item_id"], media.pk)
        channel = f"tmdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertIn("movie_matched", types)
        self.assertNotIn("movie_seeded", types)

    def test_show_job_dispatches_to_show_seed_and_completes(self):
        job = self.job(entity_type="show", external_id="1396")
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_show",
            new=mock.AsyncMock(return_value=777),
        ) as fetch:
            outcome = run_sync_job.delay(job.pk).get()

        fetch.assert_awaited_once_with(1396)
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["media_item_id"], 777)
        self.assertEqual(outcome["tmdb_id"], 1396)
        self.assertTrue(outcome["seeded"])
        channel = f"tmdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "fetching_show", "show_seeded", "sync_complete"],
        )

    def test_unsupported_entity_type_aborts_to_error(self):
        job = self.job(entity_type="episode")  # per-episode sync is still deferred
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("entity_type 'episode'", outcome["error"])
        self.assertEqual(job.status, "failed")
        self.assertIn("entity_type 'episode'", job.error_message)
        last_frame = json.loads(
            self.fake.published_on(f"tmdb:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")

    def test_non_numeric_tmdb_id_aborts_to_error(self):
        job = self.job(external_id="not-a-number")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid TMDB movie id", outcome["error"])
        self.assertEqual(job.status, "failed")

    def test_fetch_failure_marks_job_failed(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_movie",
            new=mock.AsyncMock(side_effect=ValueError("tmdb unreachable")),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "tmdb unreachable")  # detail stays server-side
        last_frame = json.loads(
            self.fake.published_on(f"tmdb:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")
        self.assertEqual(last_frame["message"], "Sync failed unexpectedly")

    def test_company_job_seeds_and_dispatches_children(self):
        job = self.job(entity_type="company", external_id="61")
        summary = {
            "company_id": 7,
            "tmdb_id": 61,
            "name": "A24",
            "discovered": {"movie": 1, "show": 1},
            "enqueued": 2,
            "child_job_ids": [101, 102],
        }
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_company",
            new=mock.AsyncMock(return_value=summary),
        ) as fetch, mock.patch(
            "apps.integrations.services.tmdb_sync._dispatch_child"
        ) as dispatch:
            outcome = run_sync_job.delay(job.pk).get()

        fetch.assert_awaited_once_with(61, parent_job=job)
        dispatched = [call.args[0] for call in dispatch.call_args_list]
        self.assertEqual(dispatched, [101, 102])
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["company_id"], 7)
        self.assertEqual(outcome["enqueued"], 2)
        channel = f"tmdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "fetching_company", "company_synced", "sync_complete"],
        )

    def test_company_child_dispatch_failure_does_not_fail_the_job(self):
        job = self.job(entity_type="company", external_id="61")
        summary = {"company_id": 7, "tmdb_id": 61, "child_job_ids": [101]}
        with mock.patch(
            "apps.integrations.services.tmdb_sync.fetch_and_seed_company",
            new=mock.AsyncMock(return_value=summary),
        ), mock.patch(
            "apps.integrations.services.tmdb_sync._dispatch_child",
            side_effect=RuntimeError("broker down"),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(job.status, "completed")

    def test_company_non_numeric_id_aborts_to_error(self):
        job = self.job(entity_type="company", external_id="nope")
        outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid TMDB company id", outcome["error"])
