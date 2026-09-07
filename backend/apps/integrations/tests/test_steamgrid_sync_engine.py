"""Roundtrip tests for the real ``steamgrid`` sync engine (increment 46).

Drives the whole stack like the igdb engine test: a pending ``SyncJob``
(``entity_type="game"``, ``external_id`` = a Steam App ID) is handed to
``run_sync_job.delay`` (eager, no broker), which claims the row, publishes
``sync_started``, runs the registered steamgrid engine, and publishes
``sync_complete``. The engine resolves the target catalog game through its
``provider="steam"`` ``ExternalID`` link, then calls the async attach driver
(``apps.media.services.steamgrid_artwork.fetch_and_attach_game_artwork``), which
is stubbed out: its real ORM write runs via ``sync_to_async`` on a
worker-thread connection that would escape ``TestCase``'s per-test rollback, so
the test asserts the engine drives it with the job's Steam App ID and resolved
media id rather than touching the DB asynchronously. Redis is faked by patching
``core.progress.get_client`` so frames and stored keys are captured.
"""

import json
from unittest import mock

from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.models import SyncJob
from apps.integrations.tasks import run_sync_job
from apps.media.models import ExternalID, MediaItem
from core import progress as progress_lib

STEAM_APP_ID = 1145360
SGDB_GAME_ID = 4321


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


def _media_ct():
    return ContentType.objects.get_for_model(MediaItem)


class SteamgridSyncEngineTests(TestCase):
    def setUp(self):
        self.fake = FakeRedis()
        patcher = mock.patch("core.progress.get_client", return_value=self.fake)
        patcher.start()
        self.addCleanup(patcher.stop)

    def job(self, external_id=str(STEAM_APP_ID)):
        return SyncJob.objects.create(
            provider="steamgrid",
            entity_type="game",
            external_id=external_id,
            status="pending",
        )

    def steam_linked_game(self):
        media = MediaItem.objects.create(
            media_type="game", title="Hades", slug="hades"
        )
        ExternalID.objects.create(
            content_type=_media_ct(),
            object_id=media.pk,
            provider="steam",
            external_id=str(STEAM_APP_ID),
            media_type="game",
        )
        return media

    def attach_result(self, media, **overrides):
        result = {
            "steam_app_id": STEAM_APP_ID,
            "media_item_id": media.pk,
            "sgdb_game_id": SGDB_GAME_ID,
            "attached": True,
            "assets_added": 4,
        }
        result.update(overrides)
        return result

    def test_game_job_attaches_artwork_and_completes(self):
        media = self.steam_linked_game()
        job = self.job()
        with mock.patch(
            "apps.integrations.services.steamgrid_sync.fetch_and_attach_game_artwork",
            new=mock.AsyncMock(return_value=self.attach_result(media)),
        ) as driver:
            outcome = run_sync_job.delay(job.pk).get()

        driver.assert_awaited_once_with(media.pk, STEAM_APP_ID)
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["media_item_id"], media.pk)
        self.assertEqual(outcome["sgdb_game_id"], SGDB_GAME_ID)
        self.assertTrue(outcome["attached"])
        self.assertEqual(outcome["assets_added"], 4)
        self.assertFalse(outcome["matched"])
        self.assertEqual(job.status, "completed")
        self.assertIsNone(job.error_message)

        channel = f"steamgrid:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            ["sync_started", "attaching_artwork", "artwork_attached", "sync_complete"],
        )
        stored = progress_lib.RedisProgress("steamgrid:sync").get_stored_result(
            job.pk
        )
        self.assertEqual(stored["media_item_id"], media.pk)
        self.assertEqual(stored["task_id"], str(job.pk))

    def test_existing_steamgrid_id_reports_matched(self):
        media = self.steam_linked_game()
        ExternalID.objects.create(
            content_type=_media_ct(),
            object_id=media.pk,
            provider="steamgrid",
            external_id=str(SGDB_GAME_ID),
            media_type="game",
        )

        job = self.job()
        with mock.patch(
            "apps.integrations.services.steamgrid_sync.fetch_and_attach_game_artwork",
            new=mock.AsyncMock(return_value=self.attach_result(media)),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["status"], "success")
        self.assertTrue(outcome["matched"])
        self.assertEqual(outcome["media_item_id"], media.pk)
        channel = f"steamgrid:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertIn("artwork_attached", types)

    def test_missing_sgdb_entry_still_completes(self):
        media = self.steam_linked_game()
        job = self.job()
        with mock.patch(
            "apps.integrations.services.steamgrid_sync.fetch_and_attach_game_artwork",
            new=mock.AsyncMock(
                return_value=self.attach_result(
                    media, sgdb_game_id=None, attached=False, assets_added=0
                )
            ),
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertIsNone(outcome["sgdb_game_id"])
        self.assertFalse(outcome["attached"])
        self.assertEqual(outcome["assets_added"], 0)
        self.assertEqual(job.status, "completed")

    def test_unlinked_app_aborts_to_error(self):
        job = self.job(external_id=str(999999))
        with mock.patch(
            "apps.integrations.services.steamgrid_sync.fetch_and_attach_game_artwork",
            new=mock.AsyncMock(),
        ) as driver:
            outcome = run_sync_job.delay(job.pk).get()

        driver.assert_not_called()
        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("No catalog game linked to Steam App ID 999999", outcome["error"])
        self.assertEqual(job.status, "failed")
        last_frame = json.loads(
            self.fake.published_on(f"steamgrid:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")

    def test_unsupported_entity_type_aborts_to_error(self):
        job = SyncJob.objects.create(
            provider="steamgrid",
            entity_type="movie",
            external_id=str(STEAM_APP_ID),
            status="pending",
        )
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("entity_type 'movie'", outcome["error"])
        self.assertEqual(job.status, "failed")
        last_frame = json.loads(
            self.fake.published_on(f"steamgrid:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")

    def test_blank_id_aborts_to_error(self):
        job = self.job(external_id="  ")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid Steam App ID in sync job: blank", outcome["error"])
        self.assertEqual(job.status, "failed")

    def test_non_numeric_id_aborts_to_error(self):
        job = self.job(external_id="abc")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertIn("Invalid Steam App ID in sync job: 'abc'", outcome["error"])
        self.assertEqual(job.status, "failed")
