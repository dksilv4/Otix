"""SABnzbd / *arr connections are node-specific; nodes store their own configuration."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer, UserNodeConnection
from apps.library.services.game_server import apply_node_heartbeat
from apps.library.services.node_connections import store_connection

User = get_user_model()


def _ok_client(payload=None):
    mock_client = mock.MagicMock()
    mock_resp = mock.MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = payload or {"status": "ok"}
    mock_client.request.return_value = mock_resp
    mock_client.get.return_value = mock_resp
    mock_client.__enter__.return_value = mock_client
    return mock_client, mock_resp


class NodeConnectionSyncTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="node_sync", email="sync@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        self.node_a = UserGameServer.objects.create(
            user=self.user,
            name="Living Room",
            local_url="http://10.0.0.10:8090",
            auth_token="token-a",
            is_active=True,
            is_online=True,
        )
        self.node_b = UserGameServer.objects.create(
            user=self.user,
            name="Office",
            local_url="http://10.0.0.20:8090",
            auth_token="token-b",
            is_active=True,
            is_online=True,
        )

    def _posted_urls(self, mock_client):
        urls = []
        for call in mock_client.request.call_args_list:
            kwargs = call.kwargs
            args = call.args
            urls.append(kwargs.get("url") or (args[1] if len(args) > 1 else None))
        return urls

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_usenet_save_is_node_specific(self, mock_client_cls):
        mock_client, _resp = _ok_client({"status": "ok", "sabnzbdLibrary": {"folderLinked": True}})
        mock_client_cls.return_value = mock_client

        res = self.client.post(
            f"/api/v1/library/servers/{self.node_a.id}/usenet/config",
            {"sabnzbd": {"host": "10.0.0.50", "port": 8080, "api_key": "sab-secret"}},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        self.assertFalse(UserNodeConnection.objects.filter(user=self.user).exists())

        urls = self._posted_urls(mock_client)
        self.assertTrue(
            any(
                "10.0.0.10:8090" in (url or "") and url.endswith("/api/v1/usenet/config")
                for url in urls
            )
        )
        self.assertFalse(any("10.0.0.20:8090" in (url or "") for url in urls))

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_radarr_and_sonarr_save_only_the_target_node(self, mock_client_cls):
        mock_client, _resp = _ok_client({"status": "ok"})
        mock_client_cls.return_value = mock_client

        radarr = self.client.post(
            f"/api/v1/library/servers/{self.node_a.id}/radarr/config",
            {"host": "10.0.0.8", "port": 7878, "api_key": "radarr-key"},
            format="json",
        )
        sonarr = self.client.post(
            f"/api/v1/library/servers/{self.node_b.id}/sonarr/config",
            {"host": "10.0.0.9", "port": 8989, "api_key": "sonarr-key"},
            format="json",
        )
        self.assertEqual(radarr.status_code, 200)
        self.assertEqual(sonarr.status_code, 200)
        self.assertFalse(UserNodeConnection.objects.filter(user=self.user).exists())

        urls = self._posted_urls(mock_client)
        self.assertTrue(
            any(
                url and url.endswith("/api/v1/radarr/config") and "10.0.0.10:8090" in url
                for url in urls
            )
        )
        self.assertFalse(
            any(
                url and url.endswith("/api/v1/radarr/config") and "10.0.0.20:8090" in url
                for url in urls
            )
        )
        self.assertTrue(
            any(
                url and url.endswith("/api/v1/sonarr/config") and "10.0.0.20:8090" in url
                for url in urls
            )
        )
        self.assertFalse(
            any(
                url and url.endswith("/api/v1/sonarr/config") and "10.0.0.10:8090" in url
                for url in urls
            )
        )

    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_get_does_not_overlay_backend_store_onto_workers(self, mock_client_cls):
        store_connection(
            self.user,
            "usenet",
            {"sabnzbd": {"host": "sab.local", "port": 8080, "api_key": "keep-secret"}},
        )
        mock_client, _mock_resp = _ok_client(
            {"enabled": True, "sabnzbd": {"host": "", "port": 8080, "api_key": ""}, "prowlarr": {}}
        )
        mock_client_cls.return_value = mock_client

        res = self.client.get(f"/api/v1/library/servers/{self.node_b.id}/usenet/config")
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertEqual(body["sabnzbd"]["host"], "")

    def test_backend_node_save_returns_404(self):
        res = self.client.post(
            "/api/v1/library/servers/-2/usenet/config",
            {"sabnzbd": {"host": "backend.local", "port": 8080, "api_key": "backend-secret"}},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

    def test_store_connection_ignores_redacted_api_keys(self):
        store_connection(self.user, "radarr", {"host": "radarr.local", "api_key": "real-key"})
        store_connection(self.user, "radarr", {"host": "radarr.local", "api_key": "***"})
        stored = UserNodeConnection.objects.get(user=self.user)
        self.assertEqual(stored.radarr["api_key"], "real-key")

    @mock.patch("apps.library.services.game_server.ping_server_sync")
    @mock.patch("apps.library.services.game_server.usenet_save_config")
    def test_claiming_a_node_does_not_push_shared_connections(self, mock_save, mock_ping):
        mock_ping.return_value = {"online": True}
        mock_save.return_value = (200, {"status": "ok"})
        store_connection(
            self.user,
            "usenet",
            {"sabnzbd": {"host": "10.0.0.50", "port": 8080, "api_key": "sab-secret"}},
        )

        res = self.client.post(
            "/api/v1/library/servers",
            {
                "name": "Basement",
                "local_url": "http://10.0.0.30:8090",
                "auth_token": "token-c",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 201)
        self.assertFalse(mock_save.called)

    @mock.patch("apps.library.services.game_server.usenet_save_config")
    def test_heartbeat_does_not_push_shared_connections(self, mock_save):
        mock_save.return_value = (200, {"status": "ok"})
        store_connection(
            self.user,
            "usenet",
            {"prowlarr": {"host": "prowlarr.local", "port": 9696, "api_key": "idx-key"}},
        )
        self.node_a.is_online = False
        self.node_a.save(update_fields=["is_online"])

        apply_node_heartbeat(
            {
                "server_name": "Living Room",
                "port": 8090,
                "auth_token": "token-a",
                "local_endpoints": ["http://10.0.0.10:8090"],
            }
        )
        self.node_a.refresh_from_db()
        self.assertTrue(self.node_a.is_online)
        self.assertFalse(mock_save.called)

    @mock.patch("apps.library.services.game_server.sonarr_save_config")
    @mock.patch("apps.library.services.game_server.radarr_save_config")
    @mock.patch("apps.library.services.game_server.usenet_save_config")
    @mock.patch("apps.library.services.game_server.sonarr_get_config")
    @mock.patch("apps.library.services.game_server.radarr_get_config")
    @mock.patch("apps.library.services.game_server.usenet_get_config")
    def test_import_instances_between_nodes(
        self,
        mock_u_get,
        mock_r_get,
        mock_s_get,
        mock_u_save,
        mock_r_save,
        mock_s_save,
    ):
        mock_u_get.return_value = (
            200,
            {"sabnzbd": {"host": "10.0.0.50", "port": 8080, "api_key": "sab-secret"}},
        )
        mock_r_get.return_value = (
            200,
            {"host": "10.0.0.8", "port": 7878, "api_key": "radarr-key"},
        )
        mock_s_get.return_value = (200, {})
        mock_u_save.return_value = (200, {"status": "ok"})
        mock_r_save.return_value = (200, {"status": "ok"})
        mock_s_save.return_value = (200, {"status": "ok"})

        res = self.client.post(
            f"/api/v1/library/servers/{self.node_a.id}/instances/import",
            {"from_server_id": self.node_b.id},
            format="json",
        )
        self.assertEqual(res.status_code, 200)
        body = res.json()
        self.assertIn("usenet", body["imported"])
        self.assertIn("radarr", body["imported"])
        self.assertEqual(mock_u_save.call_args.args[1]["sabnzbd"]["api_key"], "sab-secret")
        self.assertEqual(mock_r_save.call_args.args[1]["api_key"], "radarr-key")
        mock_s_save.assert_not_called()

    def test_import_instances_from_backend_node_returns_404(self):
        res = self.client.post(
            f"/api/v1/library/servers/{self.node_a.id}/instances/import",
            {"from_server_id": -2},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

    def test_import_instances_to_backend_node_returns_404(self):
        res = self.client.post(
            "/api/v1/library/servers/-2/instances/import",
            {"from_server_id": self.node_a.id},
            format="json",
        )
        self.assertEqual(res.status_code, 404)

    def test_import_instances_rejects_the_same_node(self):
        res = self.client.post(
            f"/api/v1/library/servers/{self.node_a.id}/instances/import",
            {"from_server_id": self.node_a.id},
            format="json",
        )
        self.assertEqual(res.status_code, 400)
