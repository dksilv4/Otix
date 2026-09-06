"""Roundtrip tests for the real ``musicbrainz`` sync engine (increment 43).

Drives the whole stack like the tmdb engine tests: a pending ``SyncJob``
(``entity_type="album"``, ``external_id`` = a release MBID) is handed to
``run_sync_job.delay`` (eager, no broker), which claims the row, publishes
``sync_started``, runs the registered musicbrainz engine, and publishes
``sync_complete``. The async fetch+seed driver
(``apps.media.services.musicbrainz_ingest.fetch_and_seed_album``) is stubbed out:
its real ORM write runs via ``sync_to_async`` on a worker-thread connection that
would escape ``TestCase``'s per-test rollback, so the test asserts the engine
drives it with the job's MBID rather than touching the DB asynchronously. Redis
is faked by patching ``core.progress.get_client`` so frames and stored keys are
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

MBID = "2f4f6f9e-4c6d-4e63-9b1a-2a4a4c9c4e6f"


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


class MusicbrainzSyncEngineTests(TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        patcher = mock.patch("core.progress.get_client", return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def job(self, external_id=MBID):
        return SyncJob.objects.create(
            provider="musicbrainz",
            entity_type="album",
            external_id=external_id,
            status="pending",
        )

    def test_album_job_fetches_mbid_seeds_and_completes(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.musicbrainz_sync.fetch_and_seed_album",
            new=mock.AsyncMock(return_value=12345),
        ) as fetch:
            outcome = run_sync_job.delay(job.pk).get()

        fetch.assert_awaited_once_with(MBID)
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["media_item_id"], 12345)
        self.assertEqual(outcome["mbid"], MBID)
        self.assertFalse(outcome["matched"])
        self.assertTrue(outcome["seeded"])
        self.assertEqual(job.status, "completed")
        self.assertIsNone(job.error_message)

        channel = f"musicbrainz:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "fetching_album", "album_seeded", "sync_complete"],
        )
        stored = progress_lib.RedisProgress("musicbrainz:sync").get_stored_result(job.pk)
        self.assertEqual(stored["media_item_id"], 12345)
        self.assertEqual(stored["task_id"], str(job.pk))

    def test_existing_mbid_mapping_reports_matched(self):
        media = MediaItem.objects.create(
            media_type="music", title="In Rainbows", slug="in-rainbows"
        )
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.pk,
            provider="musicbrainz",
            external_id=MBID,
            media_type="music",
        )

        job = self.job()
        with mock.patch(
            "apps.integrations.services.musicbrainz_sync.fetch_and_seed_album",
            new=mock.AsyncMock(return_value=media.pk),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["status"], "success")
        self.assertTrue(outcome["matched"])
        self.assertFalse(outcome["seeded"])
        self.assertEqual(outcome["media_item_id"], media.pk)
        channel = f"musicbrainz:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertIn("album_matched", types)
        self.assertNotIn("album_seeded", types)

    def test_unsupported_entity_type_aborts_to_error(self):
        job = SyncJob.objects.create(
            provider="musicbrainz",
            entity_type="movie",
            external_id=MBID,
            status="pending",
        )
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("entity_type 'movie'", outcome["error"])
        self.assertEqual(job.status, "failed")
        last_frame = json.loads(
            self.fake.published_on(f"musicbrainz:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")

    def test_blank_mbid_aborts_to_error(self):
        job = self.job(external_id="  ")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid MusicBrainz album MBID", outcome["error"])
        self.assertEqual(job.status, "failed")

    def test_fetch_failure_marks_job_failed(self):
        job = self.job()
        with mock.patch(
            "apps.integrations.services.musicbrainz_sync.fetch_and_seed_album",
            new=mock.AsyncMock(side_effect=ValueError("musicbrainz unreachable")),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, "musicbrainz unreachable")
        last_frame = json.loads(
            self.fake.published_on(f"musicbrainz:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")
        self.assertEqual(last_frame["message"], "Sync failed unexpectedly")
