"""Tests for UserGameServer endpoints: registry, ping, and server games aggregation."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer
from apps.media.models import MediaItem

User = get_user_model()


class GameServersApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="gamer_dan", email="dan@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_list_servers_empty(self):
        response = self.client.get("/api/v1/library/servers")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), [])

    @mock.patch("apps.library.views.game_servers.httpx.Client")
    def test_create_and_list_server(self, mock_client_cls):
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "status": "online",
            "total_files": 12,
            "disk_free_bytes": 100_000_000,
            "disk_total_bytes": 500_000_000,
        }
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        payload = {
            "name": "Home NAS",
            "local_url": "http://192.168.1.100:8000",
            "remote_url": "https://nas.example.com",
            "auth_token": "secret_token_123",
        }
        create_res = self.client.post("/api/v1/library/servers", payload, format="json")
        self.assertEqual(create_res.status_code, 201)
        data = create_res.json()
        self.assertEqual(data["name"], "Home NAS")
        self.assertTrue(data["is_online"])
        self.assertEqual(data["total_files"], 12)

        # List servers
        list_res = self.client.get("/api/v1/library/servers")
        self.assertEqual(list_res.status_code, 200)
        self.assertEqual(len(list_res.json()), 1)

    def test_patch_and_delete_server(self):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Old Server",
            local_url="http://10.0.0.5:8000",
            auth_token="token",
        )

        patch_res = self.client.patch(
            f"/api/v1/library/servers/{server.id}",
            {"name": "Renamed Server"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        self.assertEqual(patch_res.json()["name"], "Renamed Server")

        del_res = self.client.delete(f"/api/v1/library/servers/{server.id}")
        self.assertEqual(del_res.status_code, 204)
        self.assertFalse(UserGameServer.objects.filter(id=server.id).exists())

    @mock.patch("apps.library.views.game_servers.httpx.Client")
    def test_server_games_aggregation_with_catalog_matching(self, mock_client_cls):
        # Create game in catalog
        media = MediaItem.objects.create(
            media_type="game",
            title="Half Life 2",
            slug="half-life-2",
        )

        UserGameServer.objects.create(
            user=self.user,
            name="Unraid Box",
            local_url="http://192.168.1.50:8000",
            auth_token="test_token",
            is_active=True,
        )

        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "id": "file_abc123",
                "filename": "Half.Life.2.ISO",
                "filesize": 4_500_000_000,
                "extension": ".iso",
                "format_category": "iso",
                "game_title": "Half Life 2",
                "library_name": "PC Games",
            },
            {
                "id": "file_xyz789",
                "filename": "Portal.exe",
                "filesize": 2_000_000_000,
                "extension": ".exe",
                "format_category": "installer",
                "game_title": "Portal",
                "library_name": "PC Games",
            }
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.get("/api/v1/library/server-games")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["files"]), 2)
        hl2 = next(f for f in data["files"] if f["file_id"] == "file_abc123")
        self.assertEqual(hl2["download_url"], "http://192.168.1.50:8000/api/v1/files/file_abc123/download")
        self.assertIsNotNone(hl2["catalog_item"])
        self.assertEqual(hl2["catalog_item"]["id"], str(media.id))
        self.assertEqual(hl2["catalog_item"]["slug"], "half-life-2")

        portal = next(f for f in data["files"] if f["file_id"] == "file_xyz789")
        self.assertIsNone(portal["catalog_item"])

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_modular_providers_and_downloads_flow(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Modular Node",
            local_url="http://127.0.0.1:8090",
            auth_token="secret_token",
            is_active=True,
        )

        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        # 1. List providers
        mock_resp.json.return_value = {
            "active_downloader": "sabnzbd",
            "active_search_provider": "prowlarr",
            "downloaders": [{"name": "sabnzbd", "display_name": "SABnzbd", "protocol": "usenet", "is_active": True, "configured": True}],
            "search_providers": [{"name": "prowlarr", "display_name": "Prowlarr", "protocol": "usenet", "is_active": True, "configured": True}],
        }
        mock_client.request.return_value = mock_resp

        res = self.client.get(f"/api/v1/library/servers/{server.id}/providers")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["active_downloader"], "sabnzbd")

        # 2. Test provider connectivity
        mock_resp.json.return_value = {"ok": True, "version": "4.3.2", "message": "Connected"}
        res = self.client.post(f"/api/v1/library/servers/{server.id}/providers/downloader/sabnzbd/test")
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])

        # 3. Search releases
        mock_resp.json.return_value = [
            {
                "guid": "nzb-123",
                "title": "Elden Ring Deluxe",
                "size": 50_000_000_000,
                "download_url": "https://prowlarr.local/nzb/123",
                "indexer": "Geek",
                "protocol": "usenet",
            }
        ]
        res = self.client.get(f"/api/v1/library/servers/{server.id}/downloads/search?query=Elden+Ring")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Elden Ring Deluxe")

        # 4. Add download
        mock_resp.json.return_value = {"status": "queued", "nzo_id": "SABnzbd_nzo_456", "title": "Elden Ring Deluxe"}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/downloads/add",
            {"title": "Elden Ring Deluxe", "download_url": "https://prowlarr.local/nzb/123"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "queued")

        # 5. Fetch queue
        mock_resp.json.return_value = {
            "status": "Downloading",
            "speed": "25.4 MB/s",
            "time_left": "00:15:30",
            "items": [{"nzo_id": "SABnzbd_nzo_456", "filename": "Elden Ring Deluxe", "percentage": 45, "size_mb": 50000, "size_left_mb": 27500, "speed": "25.4 MB/s", "time_left": "00:15:30", "status": "Downloading"}],
        }
        res = self.client.get(f"/api/v1/library/servers/{server.id}/downloads/queue")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["items"]), 1)

        # 6. Delete queue item
        mock_resp.json.return_value = {"status": "deleted", "download_id": "SABnzbd_nzo_456"}
        res = self.client.delete(f"/api/v1/library/servers/{server.id}/downloads/queue/SABnzbd_nzo_456")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "deleted")

        # 7. Usenet-compat search alias used by the game detail UI
        mock_resp.json.return_value = [
            {
                "guid": "nzb-123",
                "title": "Elden Ring Deluxe",
                "size": 50_000_000_000,
                "download_url": "https://prowlarr.local/nzb/123",
                "indexer": "Geek",
                "protocol": "usenet",
            }
        ]
        res = self.client.get(f"/api/v1/library/servers/{server.id}/usenet/search?query=Elden+Ring")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Elden Ring Deluxe")
