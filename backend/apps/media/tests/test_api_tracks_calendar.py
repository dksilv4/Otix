"""Endpoint tests for the track-rating and calendar routes.

Covers the wave-#4 tail family mounted under ``/tracks`` (music track rating)
and ``/calendar`` (upcoming-release calendar), mirroring legacy status codes
and response keys.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import Album, Franchise, FranchiseItem, MediaItem, Track
from apps.social.models import UserMediaInteraction

User = get_user_model()

TRACK_RATING_KEYS = {
    "user_id",
    "track_id",
    "score",
    "avg_rating",
    "rating_count",
    "created_at",
    "updated_at",
}
CALENDAR_EVENT_KEYS = {
    "id",
    "media_item_id",
    "media_type",
    "title",
    "poster_url",
    "slug",
    "release_date",
    "event_type",
    "reason",
    "episode_info",
    "season_number",
}


class TrackCalendarApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.anon = APIClient()

        self.album_item = MediaItem.objects.create(
            media_type="music", title="Songs", slug="songs", release_date=date(2024, 1, 1)
        )
        self.album = Album.objects.create(media_item=self.album_item)
        self.track = Track.objects.create(
            album=self.album, track_number=1, disc_number=1, title="Opening"
        )

    # ── Track rating ─────────────────────────────────────────────────
    def test_track_rating_unrated_returns_null(self) -> None:
        response = self.client.get(f"/api/v1/tracks/{self.track.pk}/rating")
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data)

    def test_track_rating_requires_auth(self) -> None:
        response = self.anon.get(f"/api/v1/tracks/{self.track.pk}/rating")
        self.assertEqual(response.status_code, 401)

    def test_track_rating_put_upserts_and_get_roundtrips(self) -> None:
        url = f"/api/v1/tracks/{self.track.pk}/rating"
        created = self.client.put(url, {"score": 8}, format="json")
        self.assertEqual(created.status_code, 200)
        self.assertEqual(set(created.data), TRACK_RATING_KEYS)
        self.assertEqual(created.data["user_id"], self.user.pk)
        self.assertEqual(created.data["track_id"], self.track.pk)
        self.assertEqual(created.data["score"], 8)
        self.assertEqual(created.data["avg_rating"], 8.0)
        self.assertEqual(created.data["rating_count"], 1)

        seen = self.client.get(url)
        self.assertEqual(seen.status_code, 200)
        self.assertEqual(seen.data["score"], 8)

        updated = self.client.put(url, {"score": 5}, format="json")
        self.assertEqual(updated.status_code, 200)
        self.assertEqual(updated.data["score"], 5)
        self.assertEqual(updated.data["avg_rating"], 5.0)
        self.assertEqual(
            Track.objects.get(pk=self.track.pk).rating_count, 1
        )

    def test_track_rating_rejects_out_of_range_score(self) -> None:
        response = self.client.put(
            f"/api/v1/tracks/{self.track.pk}/rating", {"score": 0}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_track_rating_missing_track_is_404(self) -> None:
        got = self.client.get("/api/v1/tracks/99999999/rating")
        self.assertEqual(got.status_code, 404)
        self.assertEqual(got.data["detail"], "Track not found")
        put = self.client.put(
            "/api/v1/tracks/99999999/rating", {"score": 8}, format="json"
        )
        self.assertEqual(put.status_code, 404)
        self.assertEqual(put.data["detail"], "Track not found")

    # ── Calendar ─────────────────────────────────────────────────────
    def test_calendar_requires_auth(self) -> None:
        response = self.anon.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 401)

    def test_calendar_returns_franchise_sequel_events(self) -> None:
        starter = MediaItem.objects.create(
            media_type="game", title="Starter", slug="starter", release_date=date(2022, 1, 1)
        )
        sequel = MediaItem.objects.create(
            media_type="game",
            title="Sequel",
            slug="sequel",
            release_date=date.today() + timedelta(days=30),
        )
        franchise = Franchise.objects.create(name="Series", slug="series")
        FranchiseItem.objects.create(franchise=franchise, media_item=starter, sort_order=1)
        FranchiseItem.objects.create(franchise=franchise, media_item=sequel, sort_order=2)
        UserMediaInteraction.objects.create(
            user=self.user, media_item=starter, interaction_type="played"
        )

        response = self.client.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"events"})
        events = response.data["events"]
        self.assertEqual(len(events), 1)
        self.assertEqual(set(events[0]), CALENDAR_EVENT_KEYS)
        self.assertEqual(events[0]["media_item_id"], sequel.pk)
        self.assertEqual(events[0]["event_type"], "sequel")
        self.assertEqual(events[0]["media_type"], "game")
        self.assertIsNone(events[0]["episode_info"])

    def test_calendar_empty_for_no_activity(self) -> None:
        response = self.client.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["events"], [])
