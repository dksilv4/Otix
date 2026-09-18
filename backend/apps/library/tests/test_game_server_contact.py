"""Reachability of otix-server from the API process (Docker vs host URLs)."""

import os
from unittest import mock

import httpx
from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase

from apps.library.models import UserGameServer
from apps.library.services.game_server import contact_urls, ping_server_sync

User = get_user_model()


class ContactUrlTests(SimpleTestCase):
    def test_loopback_is_rewritten_when_docker_host_is_set(self):
        with mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "storage-server"}):
            urls = contact_urls("http://127.0.0.1:8090")
        self.assertEqual(urls[0], "http://storage-server:8090")
        self.assertIn("http://127.0.0.1:8090", urls)

    def test_localhost_is_rewritten_the_same_way(self):
        with mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "storage-server"}):
            urls = contact_urls("http://localhost:8090")
        self.assertIn("http://storage-server:8090", urls)

    def test_lan_url_is_left_alone(self):
        urls = contact_urls("http://192.168.1.50:8090")
        self.assertEqual(urls, ["http://192.168.1.50:8090"])


class PingLoopbackTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="nas_user", email="nas@example.com", password="password123"
        )

    @mock.patch.dict(os.environ, {"OTIX_SERVER_DOCKER_HOST": "storage-server"})
    @mock.patch("apps.library.services.game_server.httpx.Client")
    def test_ping_without_token_is_online_via_docker_hostname(self, mock_client_cls):
        server = UserGameServer.objects.create(
            user=self.user,
            name="DK Game Storage Server",
            local_url="http://127.0.0.1:8090",
            auth_token="",
            is_online=False,
        )
        ok = mock.MagicMock()
        ok.status_code = 200
        ok.json.return_value = {
            "status": "online",
            "server_name": "DK Game Storage Server",
            "total_files": 4,
        }

        def get(url, headers=None):
            if "127.0.0.1" in url:
                raise httpx.ConnectError("Connection refused")
            self.assertEqual(url, "http://storage-server:8090/api/v1/status")
            self.assertFalse(headers)
            return ok

        mock_client = mock.MagicMock()
        mock_client.get.side_effect = get
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        result = ping_server_sync(server)
        self.assertTrue(result["online"])
        server.refresh_from_db()
        self.assertTrue(server.is_online)
        self.assertEqual(server.local_url, "http://127.0.0.1:8090")
        self.assertEqual(server.total_files, 4)
