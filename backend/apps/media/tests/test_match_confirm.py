from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.integrations.models import UserSteamGame
from apps.media.models import ExternalID, MediaItem

User = get_user_model()


class MatchConfirmViewTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.media = MediaItem.objects.create(
            media_type="game",
            title="Half-Life 2",
            slug="half-life-2",
        )

    def test_confirm_steam_match(self):
        steam_game = UserSteamGame.objects.create(
            user=self.user,
            steam_app_id=220,
            name="Half-Life 2",
            media_item=None,
        )

        resp = self.client.post(
            "/api/v1/media/match/confirm",
            {"query_id": "steam:220", "media_item_id": self.media.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])
        self.assertEqual(resp.json()["media_item_id"], str(self.media.id))

        steam_game.refresh_from_db()
        self.assertEqual(steam_game.media_item_id, self.media.id)
        self.assertTrue(
            ExternalID.objects.filter(
                provider="steam", external_id="220", object_id=self.media.id
            ).exists()
        )

    def test_confirm_steam_unmatched_prefix(self):
        steam_game = UserSteamGame.objects.create(
            user=self.user,
            steam_app_id=220,
            name="Half-Life 2",
            media_item=None,
        )

        resp = self.client.post(
            "/api/v1/media/match/confirm",
            {"query_id": f"steam:steam-unmatched-{steam_game.id}", "media_item_id": self.media.id},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

        steam_game.refresh_from_db()
        self.assertEqual(steam_game.media_item_id, self.media.id)

    def test_unlink_steam_match(self):
        steam_game = UserSteamGame.objects.create(
            user=self.user,
            steam_app_id=220,
            name="Half-Life 2",
            media_item=self.media,
        )

        resp = self.client.post(
            "/api/v1/media/match/unlink",
            {"query_id": "steam:220"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.json()["success"])

        steam_game.refresh_from_db()
        self.assertIsNone(steam_game.media_item_id)
