from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.db import IntegrityError
from django.test import TestCase
from django.utils import timezone
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserEpicGame
from apps.library.models import UserGameServer
from apps.library.services.game_server import NO_EPIC_NODE
from apps.media.models import ExternalID, Game, MediaItem

User = get_user_model()

SCAN_URL = "/api/v1/integrations/epic/scan"
STATUS_URL = "/api/v1/integrations/epic/status"


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
        provider="epic",
        external_id=external_id,
        media_type="game",
    )
    return media


class UserEpicGameModelTests(TestCase):
    def test_unique_per_user_app_name(self):
        user = get_user_model().objects.create_user(username="a", password="pw")
        UserEpicGame.objects.create(user=user, app_name="Jaguar", title="Rocket League")
        with self.assertRaises(IntegrityError):
            UserEpicGame.objects.create(user=user, app_name="Jaguar", title="dupe")


class EpicScanTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def post(self):
        return self.client.post(SCAN_URL, {}, format="json")

    @patch("apps.integrations.services.epic.proxy_epic_scan")
    def test_matches_catalog_item_id(self, proxy):
        _node(self.user)
        media = _catalog_game(external_id="c1", title="Rocket League")
        proxy.return_value = (
            200,
            {
                "games": [
                    {
                        "app_name": "Jaguar",
                        "catalog_item_id": "c1",
                        "offer_id": "o1",
                        "namespace": "fn",
                        "title": "Rocket League",
                    }
                ]
            },
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_epic": 1, "matched_in_otix": 1, "failed": 0, "source": "node"},
        )
        row = UserEpicGame.objects.get(user=self.user, app_name="Jaguar")
        self.assertEqual(row.media_item_id, media.pk)
        self.assertEqual(row.title, "Rocket League")
        self.assertEqual(row.catalog_item_id, "c1")
        self.assertEqual(row.offer_id, "o1")
        self.assertEqual(row.namespace, "fn")

    @patch("apps.integrations.services.epic.proxy_epic_scan")
    def test_500_keeps_rows(self, proxy):
        _node(self.user)
        UserEpicGame.objects.create(user=self.user, app_name="Jaguar", title="Rocket League")
        proxy.return_value = (500, {"detail": "boom"})
        resp = self.post()
        self.assertEqual(resp.status_code, 500)
        self.assertEqual(
            resp.json()["detail"],
            "Failed to scan Epic library. Please try again.",
        )
        self.assertEqual(UserEpicGame.objects.filter(user=self.user).count(), 1)

    def test_400_without_node(self):
        resp = self.post()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], NO_EPIC_NODE)

    @patch("apps.integrations.services.epic.proxy_epic_scan")
    def test_400_returns_node_detail(self, proxy):
        _node(self.user)
        proxy.return_value = (400, {"detail": "Reconnect Epic"})
        resp = self.post()
        self.assertEqual(resp.status_code, 400)
        self.assertEqual(resp.json()["detail"], "Reconnect Epic")
        self.assertEqual(UserEpicGame.objects.filter(user=self.user).count(), 0)

    @patch("apps.integrations.services.epic.proxy_epic_scan")
    def test_matches_offer_id_then_app_name(self, proxy):
        _node(self.user)
        offer_media = _catalog_game(external_id="o1", title="By Offer")
        name_media = _catalog_game(external_id="Fortnite", title="By App")
        proxy.return_value = (
            200,
            {
                "games": [
                    {
                        "app_name": "Other",
                        "catalog_item_id": "missing",
                        "offer_id": "o1",
                        "namespace": "ns",
                        "title": "Offer Game",
                    },
                    {
                        "app_name": "Fortnite",
                        "catalog_item_id": None,
                        "offer_id": None,
                        "namespace": "fn",
                        "title": "Fortnite",
                    },
                ]
            },
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["matched_in_otix"], 2)
        self.assertEqual(
            UserEpicGame.objects.get(user=self.user, app_name="Other").media_item_id,
            offer_media.pk,
        )
        self.assertEqual(
            UserEpicGame.objects.get(user=self.user, app_name="Fortnite").media_item_id,
            name_media.pk,
        )

    @patch("apps.integrations.services.epic.proxy_epic_scan")
    def test_matches_catalog_title_fallback_and_records_external_id(self, proxy):
        _node(self.user)
        media = MediaItem.objects.create(
            media_type="game", title="River City Girls 2", slug="river-city-girls-2"
        )
        Game.objects.create(media_item=media)
        proxy.return_value = (
            200,
            {
                "games": [
                    {
                        "app_name": "app123",
                        "catalog_item_id": "cid999",
                        "offer_id": "off999",
                        "namespace": "ns",
                        "title": "River City Girls 2",
                    }
                ]
            },
        )
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["matched_in_otix"], 1)
        row = UserEpicGame.objects.get(user=self.user, app_name="app123")
        self.assertEqual(row.media_item_id, media.pk)
        self.assertTrue(
            ExternalID.objects.filter(
                provider="epic", external_id="cid999", object_id=media.pk
            ).exists()
        )

    @patch("apps.integrations.services.epic_client.scan_epic_cloud_library")
    def test_cloud_scan_when_no_node_online(self, mock_cloud_scan):
        self.user.epic_refresh_token = "mock-refresh"
        self.user.save()
        media = _catalog_game(external_id="c_cloud", title="Cloud Game")
        mock_cloud_scan.return_value = [
            {
                "app_name": "CloudApp",
                "catalog_item_id": "c_cloud",
                "offer_id": "o_cloud",
                "namespace": "ns_cloud",
                "title": "Cloud Game",
            }
        ]
        resp = self.post()
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"total_in_epic": 1, "matched_in_otix": 1, "failed": 0, "source": "cloud"},
        )
        row = UserEpicGame.objects.get(user=self.user, app_name="CloudApp")
        self.assertEqual(row.media_item_id, media.pk)


class EpicStatusTests(TestCase):
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
        self.user.epic_refresh_token = "mock-ref"
        self.user.epic_account_id = "acc-123"
        self.user.epic_display_name = "AliceGamer"
        self.user.save()
        resp = self.client.get(STATUS_URL)
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(
            resp.json(),
            {"connected": True, "account_id": "acc-123", "display_name": "AliceGamer"},
        )

    @patch("apps.integrations.views.epic.proxy_epic_status")
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
