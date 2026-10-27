"""Endpoint tests for the calendar route.

Covers the calendar route mounted under ``/calendar`` (upcoming-release calendar),
mirroring legacy status codes and response keys.
"""

from datetime import date, timedelta

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import Franchise, FranchiseItem, MediaItem
from apps.social.models import UserMediaInteraction

User = get_user_model()

CALENDAR_EVENT_KEYS = {
    "id",
    "media_item_id",
    "media_type",
    "title",
    "poster_url",
    "slug",
    "release_date",
    "event_type",
    "release_kind",
    "reason",
    "episode_info",
    "season_number",
}


class CalendarApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.anon = APIClient()

    # ── Calendar ─────────────────────────────────────────────────────
    def test_calendar_allows_anonymous_access(self) -> None:
        MediaItem.objects.create(
            media_type="movie",
            title="Public Future Film",
            slug="public-future-film",
            release_date=date.today() + timedelta(days=10),
        )
        response = self.anon.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 200)
        self.assertIn("events", response.data)
        self.assertGreaterEqual(len(response.data["events"]), 1)
        self.assertEqual(response.data["events"][0]["event_type"], "public_release")

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
        self.assertEqual(events[0]["release_kind"], "release")
        self.assertIsNone(events[0]["episode_info"])

    def test_calendar_labels_digital_vs_theatrical_releases(self) -> None:
        movie = MediaItem.objects.create(
            media_type="movie",
            title="Brand New Day",
            slug="brand-new-day",
            release_date=date.today() - timedelta(days=5),
        )
        from apps.media.models import MediaRelease

        MediaRelease.objects.create(
            media_item=movie,
            country_code="US",
            release_date=date.today() - timedelta(days=5),
            release_type=3,  # theatrical
            certification="PG-13",
        )
        MediaRelease.objects.create(
            media_item=movie,
            country_code="US",
            release_date=date.today() + timedelta(days=3),
            release_type=4,  # digital
        )
        UserMediaInteraction.objects.create(
            user=self.user, media_item=movie, interaction_type="watchlisted"
        )

        response = self.client.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 200)
        events = response.data["events"]
        kinds = {e["release_kind"] for e in events}
        self.assertEqual(kinds, {"theatrical", "digital"})
        digital = next(e for e in events if e["release_kind"] == "digital")
        self.assertIn("Digital release", digital["reason"])
        theatrical = next(e for e in events if e["release_kind"] == "theatrical")
        self.assertIn("In theaters", theatrical["reason"])

    def test_calendar_empty_for_no_activity(self) -> None:
        response = self.client.get("/api/v1/calendar")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["events"], [])
