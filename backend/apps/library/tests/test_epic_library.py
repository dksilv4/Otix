"""Read tests for GET /api/v1/library/epic, /unmatched, and /status."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserEpicGame
from apps.media.models import Game, MediaItem

User = get_user_model()

MEDIA_LIST_ENVELOPE_KEYS = {
    "items",
    "next_cursor",
    "has_more",
    "total",
    "tracks",
    "backfill_pending",
}

UNMATCHED_EPIC_KEYS = {
    "id",
    "app_name",
    "epic_name",
    "namespace",
    "catalog_item_id",
    "offer_id",
}


class EpicLibraryApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.other = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.other_token = Token.objects.create(user=self.other)

        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        self.naked = APIClient()
        self.naked.credentials(HTTP_AUTHORIZATION=f"Token {self.other_token.key}")

        self.alpha_media = MediaItem.objects.create(
            media_type="game", title="Alpha Game", slug="alpha-game"
        )
        Game.objects.create(media_item=self.alpha_media)
        self.zulu_media = MediaItem.objects.create(
            media_type="game", title="Zulu Game", slug="zulu-game"
        )
        Game.objects.create(media_item=self.zulu_media)

        self.alpha = UserEpicGame.objects.create(
            user=self.user,
            media_item=self.alpha_media,
            app_name="AlphaApp",
            title="Alpha Game",
            namespace="ns-a",
            catalog_item_id="cat-a",
            offer_id="off-a",
        )
        self.zulu = UserEpicGame.objects.create(
            user=self.user,
            media_item=self.zulu_media,
            app_name="ZuluApp",
            title="Zulu Game",
            namespace="ns-z",
            catalog_item_id="cat-z",
            offer_id="off-z",
        )
        self.unmatched = UserEpicGame.objects.create(
            user=self.user,
            media_item=None,
            app_name="MysteryApp",
            title="Mystery Epic App",
            namespace="ns-u",
            catalog_item_id="cat-u",
            offer_id="off-u",
        )

    def test_matched_first_page_limit_1_has_more_and_cursor(self) -> None:
        response = self.client.get("/api/v1/library/epic", {"limit": 1})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), MEDIA_LIST_ENVELOPE_KEYS)
        self.assertEqual(response.data["has_more"], True)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], self.alpha_media.id)
        self.assertEqual(response.data["items"][0]["title"], "Alpha Game")
        self.assertIsNone(response.data["items"][0]["steam_playtime_forever"])
        self.assertEqual(int(response.data["next_cursor"]), self.alpha.id)

    def test_matched_second_page_uses_cursor(self) -> None:
        first = self.client.get("/api/v1/library/epic", {"limit": 1})
        response = self.client.get(
            "/api/v1/library/epic",
            {"limit": 1, "cursor": first.data["next_cursor"]},
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["id"], self.zulu_media.id)
        self.assertEqual(response.data["has_more"], False)
        self.assertIsNone(response.data["next_cursor"])

    def test_invalid_cursor_is_ignored(self) -> None:
        response = self.client.get("/api/v1/library/epic", {"limit": 1, "cursor": "not-an-int"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"][0]["id"], self.alpha_media.id)
        self.assertEqual(int(response.data["next_cursor"]), self.alpha.id)

    def test_unmatched_returns_raw_rows(self) -> None:
        response = self.client.get("/api/v1/library/epic/unmatched")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        row = response.data["items"][0]
        self.assertEqual(set(row), UNMATCHED_EPIC_KEYS)
        self.assertEqual(row["id"], self.unmatched.id)
        self.assertEqual(row["app_name"], "MysteryApp")
        self.assertEqual(row["epic_name"], "Mystery Epic App")
        self.assertEqual(row["namespace"], "ns-u")
        self.assertEqual(row["catalog_item_id"], "cat-u")
        self.assertEqual(row["offer_id"], "off-u")

    def test_status_reports_game_count(self) -> None:
        response = self.client.get("/api/v1/library/epic/status")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["game_count"], 3)
        self.assertIsNotNone(response.data["last_scanned_at"])

    def test_unlinked_returns_empty_not_404(self) -> None:
        library = self.naked.get("/api/v1/library/epic")
        unmatched = self.naked.get("/api/v1/library/epic/unmatched")
        status = self.naked.get("/api/v1/library/epic/status")

        self.assertEqual(library.status_code, 200)
        self.assertEqual(library.data["items"], [])
        self.assertEqual(library.data["has_more"], False)
        self.assertIsNone(library.data["next_cursor"])

        self.assertEqual(unmatched.status_code, 200)
        self.assertEqual(unmatched.data["items"], [])

        self.assertEqual(status.status_code, 200)
        self.assertEqual(status.data, {"game_count": 0, "last_scanned_at": None})

    def test_requires_authentication(self) -> None:
        anonymous = APIClient()
        response = anonymous.get("/api/v1/library/epic")
        self.assertEqual(response.status_code, 401)
