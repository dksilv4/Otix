"""Roundtrip tests for the real ``igdb`` sync engine (increment 45).

Drives the whole stack like the tmdb/musicbrainz engine tests: a pending
``SyncJob`` (``entity_type="game"``, ``external_id`` = an IGDB id) is handed to
``run_sync_job.delay`` (eager, no broker), which claims the row, publishes
``sync_started``, runs the registered igdb engine, and publishes
``sync_complete``. The async fetch+seed driver
(``apps.media.services.igdb_ingest.fetch_and_seed_game``) is stubbed out: its
real ORM write runs via ``sync_to_async`` on a worker-thread connection that
would escape ``TestCase``'s per-test rollback, so the test asserts the engine
drives it with the job's IGDB id rather than touching the DB asynchronously.
Redis is faked by patching ``core.progress.get_client`` so frames and stored
keys are captured.
"""

import json
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.tasks import run_sync_job
from apps.media.models import ExternalID, MediaItem
from core import progress as progress_lib

IGDB_ID = 119133


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


class IgdbSyncEngineTests(TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        patcher = mock.patch("core.progress.get_client", return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def job(self, external_id=str(IGDB_ID)):
        return SyncJob.objects.create(
            provider="igdb",
            entity_type="game",
            external_id=external_id,
            status="pending",
        )

    def test_game_job_fetches_id_seeds_and_completes(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.igdb_sync.fetch_and_seed_game",
            new=mock.AsyncMock(return_value=12345),
        ) as fetch:
            outcome = run_sync_job.delay(job.pk).get()

        fetch.assert_awaited_once_with(IGDB_ID, force=False)
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["media_item_id"], 12345)
        self.assertEqual(outcome["igdb_id"], IGDB_ID)
        self.assertFalse(outcome["matched"])
        self.assertTrue(outcome["seeded"])
        self.assertEqual(job.status, "completed")
        self.assertIsNone(job.error_message)

        channel = f"igdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "fetching_game", "game_seeded", "sync_complete"],
        )
        stored = progress_lib.RedisProgress("igdb:sync").get_stored_result(job.pk)
        self.assertEqual(stored["media_item_id"], 12345)
        self.assertEqual(stored["task_id"], str(job.pk))

    def test_existing_igdb_mapping_reports_matched(self):
        media = MediaItem.objects.create(media_type="game", title="Hades", slug="hades")
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="igdb",
            external_id=str(IGDB_ID),
            media_type="game",
        )

        job = self.job()
        with mock.patch(
            "apps.integrations.services.igdb_sync.fetch_and_seed_game",
            new=mock.AsyncMock(return_value=media.pk),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["status"], "success")
        self.assertTrue(outcome["matched"])
        self.assertFalse(outcome["seeded"])
        self.assertEqual(outcome["media_item_id"], media.pk)
        channel = f"igdb:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertIn("game_matched", types)
        self.assertNotIn("game_seeded", types)

    def test_unsupported_entity_type_aborts_to_error(self):
        job = SyncJob.objects.create(
            provider="igdb",
            entity_type="movie",
            external_id=str(IGDB_ID),
            status="pending",
        )
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("entity_type 'movie'", outcome["error"])
        self.assertEqual(job.status, "failed")
        last_frame = json.loads(self.fake.published_on(f"igdb:sync:{job.pk}:events")[-1])
        self.assertEqual(last_frame["type"], "error")

    def test_blank_id_aborts_to_error(self):
        job = self.job(external_id="  ")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid IGDB game id in sync job: blank", outcome["error"])
        self.assertEqual(job.status, "failed")

    def test_non_numeric_id_aborts_to_error(self):
        job = self.job(external_id="abc")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid IGDB game id in sync job: 'abc'", outcome["error"])
        self.assertEqual(job.status, "failed")

    def test_fetch_failure_marks_job_failed(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.igdb_sync.fetch_and_seed_game",
            new=mock.AsyncMock(side_effect=ValueError("igdb unreachable")),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "igdb unreachable")
        last_frame = json.loads(self.fake.published_on(f"igdb:sync:{job.pk}:events")[-1])
        self.assertEqual(last_frame["type"], "error")
        self.assertEqual(last_frame["message"], "Sync failed unexpectedly")
