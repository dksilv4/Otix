"""Pending-node heartbeat: otix-server announces, Otix lists it for auto-connect."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer
from apps.library.services.game_server import apply_node_heartbeat, record_node_heartbeat

User = get_user_model()


class GameServerHeartbeatTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="password123"
        )
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_heartbeat_is_public_and_lists_as_pending(self):
        resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "DK Game Storage Server",
                "local_endpoints": ["http://172.18.0.6:8090"],
                "port": 8090,
                "auth_token": "otix_secret_token_abc123",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")

        self.client.force_authenticate(user=self.user)
        pending = self.client.get("/api/v1/library/servers/pending")
        self.assertEqual(pending.status_code, 200)
        rows = pending.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["server_name"], "DK Game Storage Server")
        self.assertEqual(rows[0]["local_url"], "http://127.0.0.1:8090")
        self.assertEqual(rows[0]["auth_token"], "otix_secret_token_abc123")

    def test_heartbeat_relinks_existing_localhost_server(self):
        """A manual localhost add (even without a token) is the same node as a LAN heartbeat."""
        server = UserGameServer.objects.create(
            user=self.user,
            name="DK Game Storage Server",
            local_url="http://127.0.0.1:8090",
            auth_token="",
            is_online=False,
        )

        resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "DK Game Storage Server",
                "local_endpoints": ["http://192.168.1.50:8090"],
                "port": 8090,
                "auth_token": "otix_secret_token_abc123",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        server.refresh_from_db()
        self.assertTrue(server.is_online)
        self.assertEqual(server.auth_token, "otix_secret_token_abc123")
        self.assertEqual(server.local_url, "http://127.0.0.1:8090")
        self.assertIsNotNone(server.last_seen_at)

        self.client.force_authenticate(user=self.user)
        pending = self.client.get("/api/v1/library/servers/pending")
        self.assertEqual(pending.json(), [])

    def test_docker_bridge_endpoint_rewrites_to_localhost_for_the_browser(self):
        node = record_node_heartbeat(
            {
                "server_name": "NAS",
                "local_endpoints": ["http://172.18.0.9:8090"],
                "port": 8090,
                "auth_token": "tok",
            }
        )
        self.assertEqual(node["local_url"], "http://127.0.0.1:8090")

    def test_lan_endpoint_is_kept(self):
        node = record_node_heartbeat(
            {
                "server_name": "NAS",
                "local_endpoints": ["http://192.168.1.50:8090"],
                "port": 8090,
                "auth_token": "tok",
            }
        )
        self.assertEqual(node["local_url"], "http://192.168.1.50:8090")

    def test_apply_heartbeat_matches_by_token(self):
        server = UserGameServer.objects.create(
            user=self.user,
            name="Old Name",
            local_url="http://10.0.0.8:8090",
            auth_token="same-token",
            is_online=False,
        )
        apply_node_heartbeat(
            {
                "server_name": "Relinked",
                "local_endpoints": ["http://192.168.1.50:8090"],
                "port": 8090,
                "auth_token": "same-token",
            }
        )
        server.refresh_from_db()
        self.assertTrue(server.is_online)
        self.assertEqual(server.name, "Relinked")
