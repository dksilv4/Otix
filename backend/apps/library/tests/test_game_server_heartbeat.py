"""Pending-node heartbeat: otix-server announces, Otix lists it for auto-connect."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer
from apps.library.services.game_server import (
    PENDING_CACHE_KEY,
    apply_node_heartbeat,
    record_node_heartbeat,
)

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

    def test_unclaimed_heartbeat_does_not_resurrect_claimed_status(self):
        """When a node explicitly heartbeats as unclaimed, matching database URLs must NOT force it claimed."""
        server = UserGameServer.objects.create(
            user=self.user,
            name="Claimed Node",
            local_url="http://127.0.0.1:8090",
            auth_token="previous_claimed_token",
            is_online=True,
        )

        resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Claimed Node",
                "local_endpoints": ["http://127.0.0.1:8090"],
                "port": 8090,
                "auth_token": "",
                "claim_code": "OTX-9988",
                "claimed": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data.get("claimed", False))
        self.assertFalse(data.get("auth_token"))

        server.refresh_from_db()
        self.assertFalse(server.is_online)

    def test_unclaim_node_endpoint_deletes_server_and_cache(self):
        """POST /api/v1/servers/unclaim removes the server and cleans pending cache."""
        token = "unclaim_target_token_123"
        server = UserGameServer.objects.create(
            user=self.user,
            name="Node To Unclaim",
            local_url="http://127.0.0.1:8090",
            auth_token=token,
            is_online=True,
        )

        cache.set(PENDING_CACHE_KEY, [{"auth_token": token, "claimed": True}], 300)

        resp = self.client.post(
            "/api/v1/servers/unclaim",
            {"auth_token": token},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")
        self.assertEqual(resp.json()["unclaimed"], 1)

        self.assertFalse(UserGameServer.objects.filter(id=server.id).exists())
        cached = cache.get(PENDING_CACHE_KEY) or []
        self.assertFalse(any(r.get("auth_token") == token for r in cached))

    def test_claimed_heartbeat_restores_user_server_when_database_row_missing(self):
        """When an already claimed node announces heartbeat with a known username, it restores UserGameServer."""
        self.assertEqual(UserGameServer.objects.filter(user=self.user).count(), 0)

        resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Restored Node",
                "local_endpoints": ["http://127.0.0.1:8090"],
                "port": 8090,
                "auth_token": "token_restored_123",
                "claimed": True,
                "claimed_by": self.user.username,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data.get("claimed"))
        self.assertEqual(data.get("username"), self.user.username)

        servers = list(UserGameServer.objects.filter(user=self.user))
        self.assertEqual(len(servers), 1)
        self.assertEqual(servers[0].name, "Restored Node")
        self.assertTrue(servers[0].is_online)
        self.assertEqual(servers[0].auth_token, "token_restored_123")
