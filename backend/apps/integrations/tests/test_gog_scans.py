from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserGOGGame
from apps.library.models import UserGameServer
from apps.media.models import ExternalID, Game, MediaItem

User = get_user_model()

SCAN_URL = "/api/v1/integrations/gog/scan"
STATUS_URL = "/api/v1/integrations/gog/status"


def _node(user, **kwargs):
    defaults = dict(
        name="nas",
        local_url="http://127.0.0.1:8090",
        is_online=True,
        is_active=True,
        last_seen_at=timezone.now(),
    )
    defaults.update(kwargs)
    return UserGameServer.objects.create(user=user, **defaults)


def _catalog_game(*, external_id: str, title: str):
    media = MediaItem.objects.create(media_type="game", title=title, slug=title.lower())
    Game.objects.create(media_item=media)
    ExternalID.objects.create(
        content_type=ContentType.objects.get_for_model(MediaItem),
        object_id=media.pk,
        provider="gog",
        external_id=external_id,
        media_type="game",
    )
    return media


class UserGOGGameModelTests(TestCase):
    def test_unique_per_user_game_id(self):
        user = get_user_model().objects.create_user(username="a", password="pw")
        UserGOGGame.objects.create(user=user, game_id="123", title="Witcher 3")
        with self.assertRaises(IntegrityError):
            UserGOGGame.objects.create(user=user, game_id="123", title="dupe")


class GOGScanTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def post(self):
        return self.client.post(SCAN_URL, {}, format="json")

    @patch("apps.integrations.services.gog.proxy_gog_scan")
    def test_matches_catalog_game_id(self, proxy):
        _node(self.user)
        media = _catalog_game(external_id="1207658924", title="The Witcher 3")
        proxy.return_value = (
            200,
            {
                "games": [
                    {
                        "game_id": "1207658924",
                        "title": "The Witcher 3: Wild Hunt",
                        "slug": "the_witcher_3_wild_hunt",
                        "image": "https://images.gog.com/witcher.jpg",
                    }
                ]
            },
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_gog": 1, "matched_in_otix": 1, "failed": 0, "source": "node"},
        )
        row = UserGOGGame.objects.get(user=self.user, game_id="1207658924")
        self.assertEqual(row.media_item_id, media.pk)
        self.assertEqual(row.title, "The Witcher 3: Wild Hunt")
        self.assertEqual(row.slug, "the_witcher_3_wild_hunt")

    @patch("apps.integrations.services.gog.proxy_gog_scan")
    def test_500_keeps_rows(self, proxy):
        _node(self.user)
        UserGOGGame.objects.create(user=self.user, game_id="123", title="The Witcher 3")
        proxy.return_value = (500, {"detail": "boom"})
        resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(
            resp.json()["detail"],
            "Failed to scan GOG library. Please try again.",
        )
        self.assertEqual(UserGOGGame.objects.filter(user=self.user).count(), 1)

    @patch("apps.integrations.services.gog.proxy_gog_scan")
    def test_title_fallback_match(self, proxy):
        _node(self.user)
        media = MediaItem.objects.create(
            media_type="game", title="Cyberpunk 2077", slug="cyberpunk-2077"
        )
        Game.objects.create(media_item=media)

        proxy.return_value = (
            200,
            {
                "games": [
                    {
                        "game_id": "1423049311",
                        "title": "Cyberpunk 2077",
                        "slug": "cyberpunk_2077",
                        "image": "https://images.gog.com/cp.jpg",
                    }
                ]
            },
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["matched_in_otix"], 1)
        row = UserGOGGame.objects.get(user=self.user, game_id="1423049311")
        self.assertEqual(row.media_item_id, media.pk)
        self.assertTrue(
            ExternalID.objects.filter(
                provider="gog", external_id="1423049311", object_id=media.pk
            ).exists()
        )

    @patch("apps.integrations.services.gog_client.scan_gog_cloud_library")
    def test_cloud_scan_when_no_node_online(self, mock_cloud_scan):
        self.user.gog_refresh_token = "mock-refresh"
        self.user.save()
        media = _catalog_game(external_id="1207658924", title="The Witcher 3")
        mock_cloud_scan.return_value = [
            {
                "game_id": "1207658924",
                "title": "The Witcher 3",
                "slug": "the_witcher_3",
                "image": "https://images.gog.com/witcher.jpg",
            }
        ]
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_gog": 1, "matched_in_otix": 1, "failed": 0, "source": "cloud"},
        )
        row = UserGOGGame.objects.get(user=self.user, game_id="1207658924")
        self.assertEqual(row.media_item_id, media.pk)


class GOGStatusTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_disconnected_status_without_node(self):
        resp = self.client.get(STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(), {"connected": False, "account_id": None, "display_name": None}
        )

    def test_user_connected_status(self):
        self.user.gog_refresh_token = "mock-ref"
        self.user.gog_account_id = "acc-123"
        self.user.gog_display_name = "AliceGamer"
        self.user.save()
        resp = self.client.get(STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"connected": True, "account_id": "acc-123", "display_name": "AliceGamer"},
        )

    @patch("apps.integrations.views.gog.proxy_gog_status")
    def test_strips_refresh_token(self, proxy):
        _node(self.user)
        proxy.return_value = (
            200,
            {
                "connected": True,
                "account_id": "acc",
                "display_name": "D",
                "refresh_token": "leak",
            },
        )
        resp = self.client.get(STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertNotIn("refresh_token", resp.json())
        self.assertEqual(resp.json()["connected"], True)
        self.assertEqual(resp.json()["account_id"], "acc")
        self.assertEqual(resp.json()["display_name"], "D")
