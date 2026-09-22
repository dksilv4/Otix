"""Roundtrip tests for the real ``youtube`` sync engine (increment 28).

Drives the whole stack like the lifecycle tests: a pending ``SyncJob`` is handed
to ``run_sync_job.delay`` (eager, no broker), which claims the row, publishes
``sync_started``, runs the registered youtube engine, and publishes
``sync_complete``. The Google/YouTube surface is faked at two seams: the oauth
token function returns a fake token, and ``apps.integrations.services.youtube._request``
returns canned ``videos.list`` pages. Redis is faked by patching
``core.progress.get_client`` so published frames and stored keys are captured.
"""

import json
from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase

from apps.integrations.models import SyncJob, UserYoutubeLikedVideo
from apps.integrations.services.youtube_sync import NO_TOKEN_ERROR
from apps.integrations.tasks import run_sync_job
from apps.media.models import ExternalID
from apps.people.models import Person
from core import progress as progress_lib

User = get_user_model()

_MUSIC_MATCHED = {
    "id": "v1",
    "snippet": {
        "categoryId": "10",
        "title": "Cool Song",
        "channelId": "UC-artist",
        "channelTitle": "Song Artist - Topic",
        "description": "single",
        "thumbnails": {"default": {"url": "http://img/v1"}},
        "publishedAt": "2024-01-01T00:00:00Z",
    },
}

_MUSIC_UNMATCHED = {
    "id": "v3",
    "snippet": {
        "categoryId": "10",
        "title": "Mystery Track",
        "channelId": "UC-unknown",
        "channelTitle": "Unknown Channel",
        "description": "",
        "thumbnails": {"default": {"url": "http://img/v3"}},
        "publishedAt": "2024-02-01T00:00:00Z",
    },
}

_NON_MUSIC = {
    "id": "v2",
    "snippet": {
        "categoryId": "20",
        "title": "Random Vlog",
        "channelId": "UC-vlog",
        "channelTitle": "Some Vlogger",
        "description": "",
        "thumbnails": {},
        "publishedAt": "2024-03-01T00:00:00Z",
    },
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


class YoutubeSyncEngineTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="youtuber", password="pw")
        self.artist = Person.objects.create(name="Song Artist")

        self.fake = FakeRedis()
        patchers = [
            mock.patch("core.progress.get_client", return_value=self.fake),
            mock.patch(
                "apps.accounts.services.oauth.get_user_google_access_token",
                return_value="fake-token",
            ),
            mock.patch(
                "apps.integrations.services.youtube._request",
                side_effect=self._fake_youtube,
            ),
        ]
        for patcher in patchers:
            patcher.start()
            self.addCleanup(patcher.stop)

    @staticmethod
    def _fake_youtube(url, *, headers=None, timeout=30.0):
        if "pageToken=" in url:  # second page terminates the pagination loop
            return 200, json.dumps({"items": []})
        return 200, json.dumps(
            {
                "nextPageToken": "token-2",
                "items": [_NON_MUSIC, _MUSIC_MATCHED, _MUSIC_UNMATCHED],
            }
        )

    def job(self):
        return SyncJob.objects.create(
            provider="youtube",
            entity_type="watch-history",
            external_id=str(self.user.id),
            status="pending",
        )

    def test_happy_path_matches_music_links_channel_and_completes(self):
        job = self.job()
        outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "success")
        self.assertEqual(
            {k: outcome[k] for k in ("total", "music_videos", "matched", "channel_links")},
            {"total": 3, "music_videos": 2, "matched": 0, "channel_links": 1},
        )
        self.assertEqual(job.status, "completed")
        self.assertIsNone(job.error_message)

        channel = f"youtube:sync:{job.pk}:events"
        types = [json.loads(msg)["type"] for msg in self.fake.published_on(channel)]
        self.assertEqual(
            types,
            [
                "sync_started",
                "fetching_liked_videos",
                "liked_videos_fetched",
                "videos_analyzed",
                "matching_complete",
                "sync_complete",
            ],
        )
        stored = progress_lib.RedisProgress("youtube:sync").get_stored_result(job.pk)
        self.assertEqual(stored["matched"], 0)
        self.assertEqual(stored["task_id"], str(job.pk))

    def test_music_videos_upserted_raw_and_unmatched_stays_null(self):
        job = self.job()
        run_sync_job.delay(job.pk).get()

        rows = list(UserYoutubeLikedVideo.objects.filter(user=self.user))
        self.assertEqual(len(rows), 2)  # non-music video is never stored
        by_id = {row.video_id: row for row in rows}
        self.assertIsNone(by_id["v1"].matched_media_item_id)
        self.assertEqual(by_id["v1"].matched_artist, "Song Artist")
        self.assertEqual(by_id["v1"].matched_title, "Cool Song")
        self.assertIsNone(by_id["v3"].matched_media_item_id)

    def test_channel_linked_to_person_via_external_id(self):
        job = self.job()
        run_sync_job.delay(job.pk).get()

        self.artist.refresh_from_db()
        self.assertEqual(self.artist.youtube_channel_title, "Song Artist - Topic")
        self.assertTrue(
            ExternalID.objects.filter(
                provider="youtube_channel", external_id="UC-artist"
            ).exists()
        )

    def test_no_token_aborts_to_error_terminal_state(self):
        job = self.job()
        with mock.patch(
            "apps.accounts.services.oauth.get_user_google_access_token",
            return_value=None,
        ):
            outcome = run_sync_job.delay(job.pk).get()

        job.refresh_from_db()
        self.assertEqual(outcome["status"], "failed")
        self.assertEqual(outcome["error"], NO_TOKEN_ERROR)
        self.assertEqual(job.status, "failed")
        self.assertEqual(job.error_message, NO_TOKEN_ERROR)

        last_frame = json.loads(
            self.fake.published_on(f"youtube:sync:{job.pk}:events")[-1]
        )
        self.assertEqual(last_frame["type"], "error")
        self.assertEqual(last_frame["message"], NO_TOKEN_ERROR)
        stored = progress_lib.RedisProgress("youtube:sync").get_stored_result(job.pk)
        self.assertEqual(stored["error"], NO_TOKEN_ERROR)

    def test_resync_is_idempotent(self):
        first = self.job()
        run_sync_job.delay(first.pk).get()
        second = self.job()
        outcome = run_sync_job.delay(second.pk).get()

        self.assertEqual(outcome["matched"], 0)
        self.assertEqual(
            UserYoutubeLikedVideo.objects.filter(user=self.user).count(), 2
        )
        self.assertEqual(
            UserYoutubeLikedVideo.objects.filter(
                user=self.user, video_id="v1"
            ).count(),
            1,
        )
