"""Endpoint tests for the enriched profile + preferences surface.

Covers the new writable ``PATCH /auth/me`` allow-list and the read-only
``GET /auth/me/preferences`` blob against real (test) storage, mirroring the
legacy ``_UPDATABLE_FIELDS`` / ``MePreferencesResponse`` split. Non-editable
columns (``total_xp``, ``date_of_birth``, security flags) must stay read-only.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()


class MeProfilePreferencesTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="erin", email="erin@example.com", password="a-strong-pass-123"
        )
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    # ── GET /auth/me ─────────────────────────────────────────────────
    def test_me_returns_default_profile_scalars(self) -> None:
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 200)
        body = response.data
        self.assertEqual(body["bio"], None)
        self.assertEqual(body["background_url"], None)
        self.assertEqual(body["country"], None)
        self.assertEqual(body["date_of_birth"], None)
        self.assertFalse(body["is_private"])
        self.assertFalse(body["show_adult_content"])
        self.assertFalse(body["is_bot"])
        self.assertFalse(body["onboarding_completed"])
        self.assertEqual(body["total_xp"], 0)
        self.assertFalse(body["two_factor_enabled"])
        self.assertFalse(body["is_verified"])
        self.assertEqual(body["username"], "erin")

    # ── PATCH /auth/me (profile allow-list) ──────────────────────────
    def test_patch_updates_profile_fields(self) -> None:
        response = self.client.patch(
            "/api/v1/auth/me",
            {
                "bio": "Movie buff.",
                "background_url": "https://cdn.example.com/bg.png",
                "country": "SE",
                "is_private": True,
                "show_adult_content": True,
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["bio"], "Movie buff.")
        self.assertEqual(response.data["background_url"], "https://cdn.example.com/bg.png")
        self.assertEqual(response.data["country"], "SE")
        self.assertTrue(response.data["is_private"])
        self.assertTrue(response.data["show_adult_content"])

        self.user.refresh_from_db()
        self.assertEqual(self.user.bio, "Movie buff.")
        self.assertTrue(self.user.is_private)

    def test_patch_date_of_birth_and_total_xp_are_read_only(self) -> None:
        response = self.client.patch(
            "/api/v1/auth/me",
            {"date_of_birth": "1990-01-02", "total_xp": 9999, "is_bot": True},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsNone(response.data["date_of_birth"])
        self.assertEqual(response.data["total_xp"], 0)
        self.assertFalse(response.data["is_bot"])
        self.user.refresh_from_db()
        self.assertIsNone(self.user.date_of_birth)
        self.assertEqual(self.user.total_xp, 0)
        self.assertFalse(self.user.is_bot)

    # ── GET /auth/me/preferences ─────────────────────────────────────
    def test_preferences_requires_auth(self) -> None:
        anon = APIClient()
        response = anon.get("/api/v1/auth/me/preferences")
        self.assertEqual(response.status_code, 401)

    def test_preferences_returns_defaults(self) -> None:
        response = self.client.get("/api/v1/auth/me/preferences")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {
            "preferred_media_types",
            "preferred_genres",
            "preferred_languages",
            "discover_emphases",
            "daily_mood_checkins_enabled",
            "hall_of_fame_media_ids",
            "profile_sections",
            "profile_card_sections",
            "integration_visibility",
            "notification_preferences",
        })
        self.assertEqual(
            response.data["preferred_media_types"], ["movie", "show", "game"]
        )
        self.assertEqual(response.data["preferred_genres"], [])
        self.assertEqual(response.data["preferred_languages"], [])
        self.assertEqual(response.data["discover_emphases"], [])
        self.assertTrue(response.data["daily_mood_checkins_enabled"])
        self.assertEqual(response.data["hall_of_fame_media_ids"], {})
        self.assertEqual(response.data["integration_visibility"], {})
        self.assertEqual(response.data["notification_preferences"], {})
        self.assertIn("mood_timeline", response.data["profile_sections"])
        self.assertIn("reviews", response.data["profile_card_sections"])

    def test_preferences_update_via_me_patch_round_trips(self) -> None:
        new_sections = ["hof_movie", "library_breakdown"]
        response = self.client.patch(
            "/api/v1/auth/me",
            {
                "preferred_media_types": ["movie"],
                "preferred_genres": ["sci-fi", "thriller"],
                "discover_emphases": ["fast"],
                "profile_sections": new_sections,
                "daily_mood_checkins_enabled": False,
                "hall_of_fame_media_ids": {"movie": ["1", "2"]},
                "integration_visibility": {"steam": "public"},
                "notification_preferences": {"review_replies": False},
            },
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        prefs = self.client.get("/api/v1/auth/me/preferences")
        self.assertEqual(prefs.status_code, 200)
        self.assertEqual(prefs.data["preferred_media_types"], ["movie"])
        self.assertEqual(prefs.data["preferred_genres"], ["sci-fi", "thriller"])
        self.assertEqual(prefs.data["discover_emphases"], ["fast"])
        self.assertEqual(prefs.data["profile_sections"], new_sections)
        self.assertFalse(prefs.data["daily_mood_checkins_enabled"])
        self.assertEqual(prefs.data["hall_of_fame_media_ids"], {"movie": ["1", "2"]})
        self.assertEqual(prefs.data["integration_visibility"], {"steam": "public"})
        self.assertEqual(prefs.data["notification_preferences"], {"review_replies": False})

        self.user.refresh_from_db()
        self.assertEqual(self.user.preferred_genres, ["sci-fi", "thriller"])
        self.assertEqual(self.user.profile_sections, new_sections)

    # ── POST /auth/me/taste/reset ────────────────────────────────────
    def test_taste_reset_requires_auth(self) -> None:
        anon = APIClient()
        response = anon.post("/api/v1/auth/me/taste/reset")
        self.assertEqual(response.status_code, 401)

    def test_taste_reset_sets_epoch_and_clears_preference_seeds(self) -> None:
        self.user.preferred_genres = ["sci-fi", "thriller"]
        self.user.discover_emphases = ["fast"]
        self.user.save(update_fields=["preferred_genres", "discover_emphases", "updated_at"])

        response = self.client.post("/api/v1/auth/me/taste/reset")
        self.assertEqual(response.status_code, 200)
        self.assertIsNotNone(response.data["taste_reset_at"])

        self.user.refresh_from_db()
        self.assertIsNotNone(self.user.taste_reset_at)
        self.assertEqual(self.user.preferred_genres, [])
        self.assertEqual(self.user.discover_emphases, [])

        me = self.client.get("/api/v1/auth/me")
        self.assertEqual(me.status_code, 200)
        self.assertIsNotNone(me.data["taste_reset_at"])
