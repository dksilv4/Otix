"""Roundtrip tests for the real ``plex`` sync engine (increment 29).

Like the youtube engine tests, each case hands a pending ``SyncJob`` to
``run_sync_job.delay`` (eager) and asserts the claim → engine → completed
lifecycle plus the DB rows the library scan should write. Discovery and the Plex
HTTP layer are faked at the ``apps.integrations.services.plex`` seams (servers,
libraries, section ``_request``), so the engine exercises its real ORM path on
sqlite.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase

from apps.integrations.models import SyncJob, UserPlexItem, UserPlexLibrary, UserPlexServer
from apps.integrations.services.plex_sync import LIBRARY_NOT_FOUND_ERROR, NO_PLEX_TOKEN_ERROR
from apps.integrations.tasks import run_sync_job
from apps.media.models import ExternalID, MediaItem, Movie
from apps.social.models import UserMediaInteraction
from core import progress as progress_lib

User = get_user_model()

_MOVIE_ITEM = {
    "ratingKey": "101",
    "title": "The Matrix",
    "type": "movie",
    "year": 1999,
    "guid": "plex://movie/5d7768bc",
    "summary": "A hacker learns the truth.",
    "originallyAvailableAt": "1999-03-31",
    "thumb": "/library/metadata/101/thumb/1",
    "viewCount": 2,
    "viewOffset": None,
    "duration": 8400000,
    "lastViewedAt": None,
}


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


class PlexSyncEngineTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="plexer", password="pw")
        self.user.plex_auth_token = "plex-token"
        self.user.save(update_fields=("plex_auth_token",))
        self.server = UserPlexServer.objects.create(
            user=self.user,
            machine_identifier="srv-1",
            name="Home",
            base_url="http://plex.local",
        )
        self.library = UserPlexLibrary.objects.create(
            user=self.user,
            server=self.server,
            section_key="1",
            title="Movies",
            library_type="movie",
            selected=True,
        )

        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch(
                "apps.integrations.services.plex.discover_plex_servers",
                return_value=[self.server],
            ),
            mock.patch(
                "apps.integrations.services.plex.discover_plex_libraries",
                return_value=[self.library],
            ),
            mock.patch(
                "apps.integrations.services.plex._request",
                side_effect=self._fake_section_request,
            ),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    @staticmethod
    def _fake_section_request(url, *, method="GET", headers=None, timeout=15.0):
        payload = {
            "MediaContainer": {"totalSize": 1, "Metadata": [dict(_MOVIE_ITEM)]}
        }
        return 200, json.dumps(payload)

    def job(self, entity_type="user", external_id=None):
        return SyncJob.objects.create(
            provider="plex",
            entity_type=entity_type,
            external_id=external_id or str(self.user.id),
            status="pending",
        )

    def _last_frame(self, task_id):
        channel = f"plex:sync:{task_id}:events"
        return json.loads(self.fake.published_on(channel)[-1])

    def test_full_user_sync_seeds_movie_and_writes_interaction(self):
        job = self.job()
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(
            {k: outcome[k] for k in ("servers", "libraries", "total", "matched", "seeded")},
            {"servers": 1, "libraries": 1, "total": 1, "matched": 0, "seeded": 1},
        )
        self.assertEqual(job.status, "completed")

        media = MediaItem.objects.get(title="The Matrix")
        self.assertEqual(media.media_type, "movie")
        self.assertTrue(Movie.objects.filter(media_item=media).exists())
        # 3 of 22 movie flags (overview + release date + external ids) — the
        # stub is recomputed at seed, not stamped with the legacy 0.15 base.
        self.assertAlmostEqual(media.completeness_score, 0.136)
        self.assertEqual(media.watched_count, 1)
        self.assertTrue(
            UserMediaInteraction.objects.filter(
                user=self.user, media_item=media, interaction_type="watched"
            ).exists()
        )
        item = UserPlexItem.objects.get(server=self.server, rating_key="101")
        self.assertEqual(item.media_item_id, media.id)
        self.assertTrue(item.viewed)

        types = [
            json.loads(msg)["type"]
            for msg in self.fake.published_on(f"plex:sync:{job.pk}:events")
        ]
        self.assertEqual(
            types,
            ["sync_started", "syncing_library", "library_complete", "sync_complete"],
        )

    def test_existing_guid_matches_without_seeding_duplicate(self):
        media = MediaItem.objects.create(
            media_type="movie", title="The Matrix", slug="the-matrix-1999"
        )
        Movie.objects.create(media_item=media)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            object_id=media.id,
            provider="plex",
            external_id="plex://movie/5d7768bc",
            media_type=None,
        )

        job = self.job()
        outcome = run_sync_job.delay(job.pk).get()

        self.assertEqual(outcome["matched"], 1)
        self.assertEqual(outcome["seeded"], 0)
        self.assertEqual(MediaItem.objects.filter(title="The Matrix").count(), 1)
        self.assertEqual(UserPlexItem.objects.count(), 1)

    def test_resync_is_idempotent(self):
        first = self.job()
        run_sync_job.delay(first.pk).get()
        second = self.job()
        outcome = run_sync_job.delay(second.pk).get()

        # Second run finds the plex-guid ExternalID seeded by the first run, so
        # the item is matched rather than seeded again — no duplicates.
        self.assertEqual(outcome["seeded"], 0)
        self.assertEqual(outcome["matched"], 1)
        self.assertEqual(MediaItem.objects.filter(title="The Matrix").count(), 1)
        self.assertEqual(UserPlexItem.objects.count(), 1)

    def test_single_library_job_uses_stored_server_row(self):
        job = self.job(entity_type="library", external_id=str(self.library.pk))
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(outcome["servers"], 1)
        self.assertEqual(outcome["libraries"], 1)
        self.assertEqual(outcome["seeded"], 1)
        self.assertEqual(job.status, "completed")

    def test_library_not_found_aborts(self):
        job = self.job(entity_type="library", external_id="999999")
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(outcome["error"], LIBRARY_NOT_FOUND_ERROR)
        self.assertEqual(job.status, "failed")
        self.assertEqual(self._last_frame(job.pk)["type"], "error")

    def test_no_token_aborts_to_error_terminal_state(self):
        self.user.plex_auth_token = None
        self.user.save(update_fields=("plex_auth_token",))
        job = self.job()
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(outcome["error"], NO_PLEX_TOKEN_ERROR)
        self.assertEqual(job.status, "failed")
        frame = self._last_frame(job.pk)
        self.assertEqual(frame["type"], "error")
        self.assertEqual(frame["message"], NO_PLEX_TOKEN_ERROR)
        stored = progress_lib.RedisProgress("plex:sync").get_stored_result(job.pk)
        self.assertEqual(stored["error"], NO_PLEX_TOKEN_ERROR)
