"""Tests for UserGameServer endpoints: registry, ping, and server games aggregation."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer, UserNodeConnection
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
        rows = response.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["id"], -2)
        self.assertEqual(rows[0]["name"], "Otix backend")
        self.assertTrue(rows[0]["is_backend"])
        self.assertTrue(rows[0]["is_online"])

    @mock.patch("apps.library.services.game_server.httpx.Client")
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

        # List servers includes the Otix backend plus the new worker
        list_res = self.client.get("/api/v1/library/servers")
        self.assertEqual(list_res.status_code, 200)
        rows = list_res.json()
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["id"], -2)
        self.assertEqual(rows[1]["name"], "Home NAS")

    @mock.patch("apps.library.views.nodes.httpx.Client")
    @mock.patch("apps.library.services.node.httpx.Client")
    def test_create_same_node_twice_updates_instead_of_duplicating(self, mock_client_service, mock_client_view):
        for mock_c in (mock_client_service, mock_client_view):
            mc = mock.MagicMock()
            mr = mock.MagicMock()
            mr.status_code = 200
            mr.json.return_value = {"status": "online", "total_files": 0, "disk_free_bytes": 0, "disk_total_bytes": 0}
            mc.get.return_value = mr
            mc.__enter__.return_value = mc
            mock_c.return_value = mc

        payload = {
            "name": "DK Game Storage Server",
            "local_url": "http://127.0.0.1:8090",
            "auth_token": "otix_secret_token_abc123",
        }
        first = self.client.post("/api/v1/library/servers", payload, format="json")
        second = self.client.post(
            "/api/v1/library/servers",
            {**payload, "local_url": "http://localhost:8090"},
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(first.json()["id"], second.json()["id"])
        self.assertEqual(UserGameServer.objects.filter(user=self.user).count(), 1)

    @mock.patch("apps.library.views.nodes.httpx.Client")
    @mock.patch("apps.library.services.node.httpx.Client")
    def test_create_same_token_from_lan_and_loopback_is_one_server(self, mock_client_service, mock_client_view):
        for mock_c in (mock_client_service, mock_client_view):
            mc = mock.MagicMock()
            mr = mock.MagicMock()
            mr.status_code = 200
            mr.json.return_value = {"status": "online", "total_files": 0, "disk_free_bytes": 0, "disk_total_bytes": 0}
            mc.get.return_value = mr
            mc.__enter__.return_value = mc
            mock_c.return_value = mc

        token = "otix_secret_token_abc123"
        first = self.client.post(
            "/api/v1/library/servers",
            {
                "name": "DK Game Storage Server",
                "local_url": "http://192.168.1.50:8090",
                "auth_token": token,
            },
            format="json",
        )
        second = self.client.post(
            "/api/v1/library/servers",
            {
                "name": "DK Game Storage Server",
                "local_url": "http://127.0.0.1:8090",
                "auth_token": token,
            },
            format="json",
        )
        self.assertEqual(first.status_code, 201)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(UserGameServer.objects.filter(user=self.user).count(), 1)

    def test_list_collapses_duplicate_servers(self):
        for _ in range(4):
            UserGameServer.objects.create(
                user=self.user,
                name="DK Game Storage Server",
                local_url="http://127.0.0.1:8090",
                auth_token="otix_secret_token_abc123",
            )
        list_res = self.client.get("/api/v1/library/servers")
        self.assertEqual(list_res.status_code, 200)
        rows = list_res.json()
        workers = [row for row in rows if not row.get("is_backend")]
        self.assertEqual(len(workers), 1)
        self.assertEqual(workers[0]["name"], "DK Game Storage Server")
        self.assertEqual(UserGameServer.objects.filter(user=self.user).count(), 1)

    def test_list_does_not_collapse_distinct_servers(self):
        UserGameServer.objects.create(
            user=self.user,
            name="Home NAS",
            local_url="http://192.168.1.50:8090",
            auth_token="home-token",
        )
        UserGameServer.objects.create(
            user=self.user,
            name="Office NAS",
            local_url="http://10.0.0.8:8090",
            auth_token="office-token",
        )
        list_res = self.client.get("/api/v1/library/servers")
        self.assertEqual(list_res.status_code, 200)
        rows = list_res.json()
        workers = [row for row in rows if not row.get("is_backend")]
        self.assertEqual(len(workers), 2)
        self.assertEqual(UserGameServer.objects.filter(user=self.user).count(), 2)

    @mock.patch("apps.library.services.game_server.ping_server_sync")
    def test_patch_and_delete_server(self, mock_ping):
        mock_ping.return_value = {"online": True}
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
            },
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.get("/api/v1/library/server-games")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data["files"]), 2)
        hl2 = next(f for f in data["files"] if f["file_id"] == "file_abc123")
        self.assertEqual(
            hl2["download_url"], "http://192.168.1.50:8000/api/v1/files/file_abc123/download"
        )
        self.assertIsNotNone(hl2["catalog_item"])
        self.assertEqual(hl2["catalog_item"]["id"], str(media.id))
        self.assertEqual(hl2["catalog_item"]["slug"], "half-life-2")

        portal = next(f for f in data["files"] if f["file_id"] == "file_xyz789")
        self.assertIsNone(portal["catalog_item"])

    @mock.patch("apps.library.views.game_servers.enqueue_prehydrate_titles")
    @mock.patch("apps.library.views.game_servers.httpx.Client")
    def test_server_games_queues_prehydrate_for_unmatched(self, mock_client_cls, mock_prehydrate):
        MediaItem.objects.create(media_type="game", title="Half Life 2", slug="half-life-2")
        UserGameServer.objects.create(
            user=self.user,
            name="Unraid Box",
            local_url="http://192.168.1.50:8000",
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
                "game_title": "Half Life 2",
            },
            {
                "id": "file_xyz789",
                "filename": "Portal.exe",
                "filesize": 2_000_000_000,
                "extension": ".exe",
                "game_title": "Portal",
            },
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.get("/api/v1/library/server-games")
        self.assertEqual(res.status_code, 200)
        mock_prehydrate.assert_called_once()
        titles = mock_prehydrate.call_args[0][0]
        self.assertIn("Portal", titles)
        self.assertNotIn("Half Life 2", titles)

    @mock.patch("apps.library.views.game_servers.httpx.Client")
    def test_server_games_match_update_files_to_parent_catalog(self, mock_client_cls):
        media = MediaItem.objects.create(
            media_type="game",
            title="Half Life 2",
            slug="half-life-2",
            overview="Follow Gordon Freeman.",
        )
        UserGameServer.objects.create(
            user=self.user,
            name="Unraid Box",
            local_url="http://192.168.1.50:8000",
            is_active=True,
        )
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "id": "file_upd",
                "filename": "Half.Life.2.Update.1-FLT.iso",
                "filesize": 800_000_000,
                "extension": ".iso",
                "format_category": "iso",
                "game_title": "Half Life 2 Update 1 Flt",
                "library_name": "PC Games",
            }
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.get("/api/v1/library/server-games")
        self.assertEqual(res.status_code, 200)
        upd = res.json()["files"][0]
        self.assertEqual(upd["catalog_item"]["id"], str(media.id))
        self.assertEqual(upd["catalog_item"]["title"], "Half Life 2")
        self.assertEqual(upd["catalog_item"]["overview"], "Follow Gordon Freeman.")

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
            "downloaders": [
                {
                    "name": "sabnzbd",
                    "display_name": "SABnzbd",
                    "protocol": "usenet",
                    "is_active": True,
                    "configured": True,
                }
            ],
            "search_providers": [
                {
                    "name": "prowlarr",
                    "display_name": "Prowlarr",
                    "protocol": "usenet",
                    "is_active": True,
                    "configured": True,
                }
            ],
        }
        mock_client.request.return_value = mock_resp

        res = self.client.get(f"/api/v1/library/servers/{server.id}/providers")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["active_downloader"], "sabnzbd")

        # 2. Test provider connectivity
        mock_resp.json.return_value = {"ok": True, "version": "4.3.2", "message": "Connected"}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/providers/downloader/sabnzbd/test"
        )
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
        res = self.client.get(
            f"/api/v1/library/servers/{server.id}/downloads/search?query=Elden+Ring"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Elden Ring Deluxe")

        # 4. Add download
        mock_resp.json.return_value = {
            "status": "queued",
            "nzo_id": "SABnzbd_nzo_456",
            "title": "Elden Ring Deluxe",
        }
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
            "items": [
                {
                    "nzo_id": "SABnzbd_nzo_456",
                    "filename": "Elden Ring Deluxe",
                    "percentage": 45,
                    "size_mb": 50000,
                    "size_left_mb": 27500,
                    "speed": "25.4 MB/s",
                    "time_left": "00:15:30",
                    "status": "Downloading",
                }
            ],
        }
        res = self.client.get(f"/api/v1/library/servers/{server.id}/downloads/queue")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()["items"]), 1)

        # 6. Delete queue item
        mock_resp.json.return_value = {"status": "deleted", "download_id": "SABnzbd_nzo_456"}
        res = self.client.delete(
            f"/api/v1/library/servers/{server.id}/downloads/queue/SABnzbd_nzo_456"
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "deleted")

        # 7. Usenet-compat search alias used by the game detail UI
        mock_resp.json.return_value = [
            {
                "guid": "nzb-123",
                "title": "Elden Ring Deluxe",
                "size": 50_000_000_000,
                "download_url": "https://prowlarr.local/nzb/123",
                "protocol": "usenet",
            }
        ]
        res = self.client.get(f"/api/v1/library/servers/{server.id}/usenet/search?query=Elden+Ring")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Elden Ring Deluxe")

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_usenet_download_is_persisted_and_history_syncs(self, mock_client_cls):
        from apps.library.models import GameServerDownload

        media = MediaItem.objects.create(media_type="game", title="Elden Ring", slug="elden-ring")
        server = UserGameServer.objects.create(
            user=self.user,
            name="History Node",
            local_url="http://127.0.0.1:8090",
            auth_token="secret_token",
            is_active=True,
        )

        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_client.request.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        mock_resp.json.return_value = {
            "status": "queued",
            "nzo_id": "SABnzbd_nzo_hist",
            "title": "ELDEN RING v1.09-Razor1911",
        }
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/usenet/download",
            {
                "title": "ELDEN RING v1.09-Razor1911",
                "download_url": "https://prowlarr.local/nzb/123",
                "protocol": "usenet",
                "media_item_id": media.id,
                "size": 54_700_000_000,
            },
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        posted = mock_client.request.call_args
        self.assertNotIn("media_item_id", posted.kwargs.get("json") or {})

        row = GameServerDownload.objects.get(server=server, nzo_id="SABnzbd_nzo_hist")
        self.assertEqual(row.media_item_id, media.id)
        self.assertEqual(row.status, "queued")
        self.assertEqual(row.size_bytes, 54_700_000_000)

        mock_resp.json.return_value = {
            "items": [
                {
                    "nzo_id": "SABnzbd_nzo_hist",
                    "filename": "ELDEN RING v1.09-Razor1911",
                    "status": "Completed",
                    "size_bytes": 54_700_000_000,
                    "fail_message": "",
                    "completed_at": "2026-09-16T01:00:00+00:00",
                }
            ]
        }
        history_res = self.client.get(f"/api/v1/library/servers/{server.id}/usenet/history")
        self.assertEqual(history_res.status_code, 200)
        items = history_res.json()["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["status"], "completed")
        self.assertEqual(items[0]["media_item_id"], str(media.id))
        row.refresh_from_db()
        self.assertEqual(row.status, "completed")
        self.assertEqual(row.media_item_id, media.id)

        mock_resp.json.return_value = {"status": "deleted", "nzo_id": "SABnzbd_nzo_hist"}
        cancel_res = self.client.delete(
            f"/api/v1/library/servers/{server.id}/usenet/queue/SABnzbd_nzo_hist"
        )
        self.assertEqual(cancel_res.status_code, 200)
        row.refresh_from_db()
        self.assertEqual(row.status, "cancelled")

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_scan_proxies_to_game_server(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Scan Node",
            local_url="http://127.0.0.1:8090",
            auth_token="secret_token",
            is_active=True,
        )
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "scanned", "total_files": 4}
        mock_client.request.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.post(f"/api/v1/library/servers/{server.id}/scan")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "scanned")
        self.assertEqual(res.json()["total_files"], 4)
        called = mock_client.request.call_args
        self.assertEqual(called.kwargs.get("method") or called.args[0], "POST")
        url = called.kwargs.get("url") or ""
        self.assertTrue(url.endswith("/api/v1/scan"))

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_radarr_and_sonarr_proxy_endpoints(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Arr Node",
            local_url="http://127.0.0.1:8090",
            auth_token="secret_token",
            is_active=True,
        )
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        # 1. Radarr Config
        mock_resp.json.return_value = {
            "enabled": True,
            "host": "127.0.0.1",
            "port": 7878,
            "configured": True,
        }
        mock_client.request.return_value = mock_resp
        res = self.client.get(f"/api/v1/library/servers/{server.id}/radarr/config")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["port"], 7878)

        # 2. Radarr Test
        mock_resp.json.return_value = {
            "ok": True,
            "version": "5.4.2",
            "message": "Connected to Radarr v5.4.2",
        }
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/radarr/test",
            {"host": "127.0.0.1", "port": 7878, "api_key": "test_key"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])

        # 3. Radarr Movies
        mock_resp.json.return_value = [
            {"id": 1, "title": "Dune", "tmdb_id": 438631, "monitored": True}
        ]
        res = self.client.get(f"/api/v1/library/servers/{server.id}/radarr/movies")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Dune")

        # 4. Radarr Add Movie
        mock_resp.json.return_value = {"id": 2, "title": "Oppenheimer", "tmdbId": 872585}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/radarr/movies",
            {"title": "Oppenheimer", "tmdb_id": 872585},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["title"], "Oppenheimer")

        # 5. Radarr Delete Queue
        mock_resp.json.return_value = {"status": "deleted", "queue_id": 99}
        res = self.client.delete(f"/api/v1/library/servers/{server.id}/radarr/queue/99")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "deleted")

        # 6. Sonarr Config
        mock_resp.json.return_value = {
            "enabled": True,
            "host": "127.0.0.1",
            "port": 8989,
            "configured": True,
        }
        res = self.client.get(f"/api/v1/library/servers/{server.id}/sonarr/config")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["port"], 8989)

        # 7. Sonarr Test
        mock_resp.json.return_value = {
            "ok": True,
            "version": "4.0.0",
            "message": "Connected to Sonarr v4.0.0",
        }
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/sonarr/test",
            {"host": "127.0.0.1", "port": 8989, "api_key": "test_key"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertTrue(res.json()["ok"])

        # 8. Sonarr Series
        mock_resp.json.return_value = [{"id": 1, "title": "Shogun", "tvdb_id": 354316}]
        res = self.client.get(f"/api/v1/library/servers/{server.id}/sonarr/series")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(res.json()), 1)
        self.assertEqual(res.json()[0]["title"], "Shogun")

        # 9. Sonarr Add Series
        mock_resp.json.return_value = {"id": 2, "title": "Fallout", "tvdbId": 385599}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/sonarr/series",
            {"title": "Fallout", "tvdb_id": 385599},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["title"], "Fallout")

        # 10. Sonarr Delete Queue
        mock_resp.json.return_value = {"status": "deleted", "queue_id": 88}
        res = self.client.delete(f"/api/v1/library/servers/{server.id}/sonarr/queue/88")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()["status"], "deleted")

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_radarr_and_sonarr_proxy_forwards_instance_id(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Arr Multi",
            local_url="http://127.0.0.1:8090",
            auth_token="secret_token",
            is_active=True,
        )
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = []
        mock_client.request.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        res = self.client.get(
            f"/api/v1/library/servers/{server.id}/radarr/rootfolders",
            {"instance_id": "uhd"},
        )
        self.assertEqual(res.status_code, 200)
        called = mock_client.request.call_args
        params = called.kwargs.get("params") or {}
        self.assertEqual(params.get("instance_id"), "uhd")

        mock_resp.json.return_value = {"ok": True, "message": "ok"}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/radarr/test",
            {"host": "10.0.0.5", "port": 7878, "api_key": "k", "instance_id": "uhd"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        body = mock_client.request.call_args.kwargs.get("json") or {}
        self.assertEqual(body.get("instance_id"), "uhd")

        mock_resp.json.return_value = []
        res = self.client.get(
            f"/api/v1/library/servers/{server.id}/sonarr/series",
            {"instance_id": "anime"},
        )
        self.assertEqual(res.status_code, 200)
        params = mock_client.request.call_args.kwargs.get("params") or {}
        self.assertEqual(params.get("instance_id"), "anime")

        mock_resp.json.return_value = {"id": 2, "title": "Fallout"}
        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/sonarr/series",
            {"title": "Fallout", "tvdb_id": 385599, "instance_id": "anime"},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        body = mock_client.request.call_args.kwargs.get("json") or {}
        self.assertEqual(body.get("instance_id"), "anime")

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_node_libraries_and_organize_proxy(self, mock_client_cls):
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [{"name": "Games", "path": "/games", "kind": "game"}]
        mock_client.request.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        server = UserGameServer.objects.create(
            user=self.user,
            name="Home NAS",
            local_url="http://192.168.1.100:8000",
            auth_token="secret",
        )

        res = self.client.get(f"/api/v1/library/servers/{server.id}/libraries")
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.json()[0]["path"], "/games")

        mock_resp.json.return_value = {"status": "updated", "libraries": []}
        res = self.client.put(
            f"/api/v1/library/servers/{server.id}/libraries",
            {"libraries": [{"name": "ISOs", "path": "/isos", "kind": "iso"}]},
            format="json",
        )
        self.assertEqual(res.status_code, 200)

        mock_resp.json.return_value = {"autoOrganizeEnabled": True, "isoDownloadPath": "/isos"}
        res = self.client.get(f"/api/v1/library/servers/{server.id}/organize")
        self.assertEqual(res.status_code, 200)
        organize = res.json()
        self.assertTrue(organize.get("auto_organize_enabled") or organize.get("autoOrganizeEnabled"))

        res = self.client.post(
            f"/api/v1/library/servers/{server.id}/organize",
            {"autoOrganizeEnabled": False},
            format="json",
        )
        self.assertEqual(res.status_code, 200)


class BackendNodeApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="backend_node", email="backend@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_backend_node_cannot_be_patched_or_deleted(self):
        patch_res = self.client.patch(
            "/api/v1/library/servers/-2",
            {"name": "Renamed"},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 404)
        del_res = self.client.delete("/api/v1/library/servers/-2")
        self.assertEqual(del_res.status_code, 404)

    def test_backend_node_stores_connections_libraries_and_organize(self):
        usenet = self.client.post(
            "/api/v1/library/servers/-2/usenet/config",
            {"sabnzbd": {"host": "127.0.0.1", "port": 8080, "api_key": "sab-secret"}},
            format="json",
        )
        self.assertEqual(usenet.status_code, 200)

        stored = UserNodeConnection.objects.get(user=self.user)
        self.assertEqual(stored.usenet["sabnzbd"]["host"], "127.0.0.1")
        self.assertEqual(stored.usenet["sabnzbd"]["api_key"], "sab-secret")

        fetched = self.client.get("/api/v1/library/servers/-2/usenet/config")
        self.assertEqual(fetched.status_code, 200)
        self.assertEqual(fetched.json()["sabnzbd"]["host"], "127.0.0.1")
        self.assertEqual(fetched.json()["sabnzbd"]["api_key"], "***")

        libraries = self.client.put(
            "/api/v1/library/servers/-2/libraries",
            {"libraries": [{"name": "Games", "path": "/data/games", "kind": "game"}]},
            format="json",
        )
        self.assertEqual(libraries.status_code, 200)
        listed = self.client.get("/api/v1/library/servers/-2/libraries")
        self.assertEqual(listed.json()[0]["path"], "/data/games")

        organize = self.client.post(
            "/api/v1/library/servers/-2/organize",
            {"autoOrganizeEnabled": True, "isoDownloadPath": "/data/isos"},
            format="json",
        )
        self.assertEqual(organize.status_code, 200)
        current = self.client.get("/api/v1/library/servers/-2/organize")
        body = current.json()
        self.assertTrue(body.get("autoOrganizeEnabled") or body.get("auto_organize_enabled"))
        self.assertEqual(body.get("isoDownloadPath") or body.get("iso_download_path"), "/data/isos")

        desktop = self.client.post(
            "/api/v1/library/servers/-2/desktop",
            {"gamesDownloadPath": "/data/downloads"},
            format="json",
        )
        self.assertEqual(desktop.status_code, 200)
        self.assertEqual(desktop.json().get("gamesDownloadPath") or desktop.json().get("games_download_path"), "/data/downloads")

        tray = self.client.post(
            "/api/v1/library/servers/-2/desktop",
            {"launchOnStartup": True},
            format="json",
        )
        self.assertEqual(tray.status_code, 400)

    def test_backend_node_rejects_worker_only_actions(self):
        scan = self.client.post("/api/v1/library/servers/-2/scan")
        self.assertEqual(scan.status_code, 400)
        explore = self.client.get("/api/v1/library/servers/-2/explorer")
        self.assertEqual(explore.status_code, 400)
        ping = self.client.post("/api/v1/library/servers/-2/ping")
        self.assertEqual(ping.status_code, 200)
        self.assertTrue(ping.json()["online"])
        self.assertEqual(ping.json()["server"]["id"], -2)

    def test_backend_node_arr_and_usenet_endpoints(self):
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/usenet/queue").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/prowlarr/indexers").status_code, 200)
        self.assertEqual(self.client.post("/api/v1/library/servers/-2/prowlarr/sync").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/radarr/movies").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/radarr/queue").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/radarr/rootfolders").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/radarr/qualityprofiles").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/sonarr/series").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/sonarr/queue").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/sonarr/rootfolders").status_code, 200)
        self.assertEqual(self.client.get("/api/v1/library/servers/-2/sonarr/qualityprofiles").status_code, 200)
        # Test endpoints return 200 with result payload
        test_radarr = self.client.post(
            "/api/v1/library/servers/-2/radarr/test",
            {"host": "127.0.0.1", "port": 7878, "api_key": "test"},
            format="json",
        )
        self.assertEqual(test_radarr.status_code, 200)
        self.assertIn("ok", test_radarr.json())

        test_sab = self.client.post(
            "/api/v1/library/servers/-2/usenet/test-sabnzbd",
            {"host": "127.0.0.1", "port": 8080, "api_key": "test"},
            format="json",
        )
        self.assertEqual(test_sab.status_code, 200)
        self.assertIn("ok", test_sab.json())

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_create_node_unreachable_returns_400_and_does_not_commit(self, mock_client_cls):
        mock_client = mock.MagicMock()
        mock_client.get.side_effect = Exception("Connection refused")
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        payload = {
            "name": "Unreachable Node",
            "local_url": "http://192.0.2.1:8090",
        }
        res = self.client.post("/api/v1/library/nodes", payload, format="json")
        self.assertEqual(res.status_code, 400)
        self.assertIn("Could not connect to node", res.json()["detail"])
        self.assertEqual(UserGameServer.objects.filter(name="Unreachable Node").count(), 0)

    @mock.patch("apps.library.services.node.httpx.Client")
    def test_create_node_auto_names_fallback_node_id_x(self, mock_client_cls):
        mock_client = mock.MagicMock()
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "online", "total_files": 0, "disk_free_bytes": 0, "disk_total_bytes": 0}
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        # No name provided
        payload = {
            "local_url": "http://127.0.0.1:8090",
            "auth_token": "token123",
            "is_local": True,
        }
        res = self.client.post("/api/v1/library/nodes", payload, format="json")
        self.assertEqual(res.status_code, 201)
        data = res.json()
        self.assertEqual(data["name"], "Node ID:1")
        self.assertTrue(data["is_local"])

    def test_nodes_endpoint_get_lists_nodes(self):
        res = self.client.get("/api/v1/library/nodes")
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(len(res.json()), 1)
