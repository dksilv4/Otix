"""Endpoint tests for the DB-backed game save-path routes.

Covers ``GET /saves/locations/{media_item_id}`` (verified + suggested buckets)
and ``POST .../suggest`` (upsert + consensus promotion), mirroring the legacy
status codes and response keys.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.media.models import MediaItem
from apps.track.models import GameSaveOfficialPath, GameSavePathSuggestion

User = get_user_model()


class SaveApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.anon = APIClient()

        self.game = MediaItem.objects.create(
            media_type="game", title="Dune", slug="dune", release_date=None
        )

    def test_locations_returns_verified_and_suggested_buckets(self) -> None:
        GameSaveOfficialPath.objects.create(
            game=self.game, platform="windows", path_pattern="C:/Saves/official", is_verified=True
        )
        for name in ("bob", "carol"):
            other = User.objects.create_user(username=name, password="pw")
            GameSavePathSuggestion.objects.create(
                game=self.game,
                user=other,
                platform="windows",
                path_pattern="C:/Users/%USER%/Saves",
            )

        response = self.client.get(f"/api/v1/saves/locations/{self.game.pk}")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["game_id"], self.game.pk)
        self.assertEqual(response.data["verified"], [
            {
                "platform": "windows",
                "path_pattern": "C:/Saves/official",
                "is_verified": True,
            }
        ])
        self.assertEqual(response.data["suggested"], [
            {
                "platform": "windows",
                "path_pattern": "C:/Users/%USER%/Saves",
                "count": 2,
            }
        ])

    def test_locations_missing_game_is_404(self) -> None:
        response = self.client.get("/api/v1/saves/locations/99999999")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Game not found.")

    def test_suggest_creates_user_suggestion(self) -> None:
        response = self.client.post(
            f"/api/v1/saves/locations/{self.game.pk}/suggest",
            {"platform": "pc", "path_pattern": "~/Games/Dune/saves"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["status"], "success")
        self.assertEqual(response.data["suggestion_count"], 1)
        self.assertFalse(response.data["promoted_to_official"])
        self.assertTrue(
            GameSavePathSuggestion.objects.filter(
                user=self.user, game=self.game, platform="pc"
            ).exists()
        )

    def test_suggest_promotes_after_consensus(self) -> None:
        platform = "pc"
        pattern = "~/Games/Dune/saves"
        for name in ("bob", "carol"):
            other = User.objects.create_user(username=name, password="pw")
            GameSavePathSuggestion.objects.create(
                game=self.game, user=other, platform=platform, path_pattern=pattern
            )

        response = self.client.post(
            f"/api/v1/saves/locations/{self.game.pk}/suggest",
            {"platform": platform, "path_pattern": pattern},
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["suggestion_count"], 3)
        self.assertTrue(response.data["promoted_to_official"])
        official = GameSaveOfficialPath.objects.get(game=self.game, platform=platform)
        self.assertTrue(official.is_verified)
        self.assertEqual(official.path_pattern, pattern)

    def test_suggest_requires_auth(self) -> None:
        response = self.anon.post(
            f"/api/v1/saves/locations/{self.game.pk}/suggest",
            {"platform": "pc", "path_pattern": "~/Games/Dune/saves"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_suggest_missing_game_is_404(self) -> None:
        response = self.client.post(
            "/api/v1/saves/locations/99999999/suggest",
            {"platform": "pc", "path_pattern": "~/Games/Dune/saves"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)
        self.assertEqual(response.data["detail"], "Game not found.")
