"""Test suite for Node heartbeat announcements."""

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.library.models import UserNode
from apps.library.services.node import (
    apply_node_heartbeat,
    record_node_heartbeat,
)

User = get_user_model()


class NodeHeartbeatTests(TestCase):
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
            "/api/v1/nodes/heartbeat",
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
        pending = self.client.get("/api/v1/nodes/pending")
        self.assertEqual(pending.status_code, 200)
        rows = pending.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["server_name"], "DK Game Storage Server")
        self.assertEqual(rows[0]["local_url"], "http://127.0.0.1:8090")
        self.assertEqual(rows[0]["auth_token"], "otix_secret_token_abc123")

    def test_heartbeat_relinks_existing_localhost_server(self):
        """A manual localhost add (even without a token) is the same node as a LAN heartbeat."""
        node = UserNode.objects.create(
            user=self.user,
            name="DK Game Storage Server",
            local_url="http://127.0.0.1:8090",
            api_key="",
            is_online=False,
        )

        resp = self.client.post(
            "/api/v1/nodes/heartbeat",
            {
                "server_name": "DK Game Storage Server",
                "local_endpoints": ["http://192.168.1.50:8090"],
                "port": 8090,
                "auth_token": "otix_secret_token_abc123",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        node.refresh_from_db()
        self.assertTrue(node.is_online)
        self.assertEqual(node.api_key, "otix_secret_token_abc123")
        self.assertEqual(node.local_url, "http://127.0.0.1:8090")
        self.assertIsNotNone(node.last_heartbeat)

        self.client.force_authenticate(user=self.user)
        pending = self.client.get("/api/v1/nodes/pending")
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
        node = UserNode.objects.create(
            user=self.user,
            name="Old Name",
            local_url="http://10.0.0.8:8090",
            api_key="same-token",
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
        node.refresh_from_db()
        self.assertTrue(node.is_online)
        self.assertEqual(node.name, "Relinked")

    def test_unclaimed_heartbeat_does_not_resurrect_claimed_status(self):
        """When a node explicitly heartbeats as unclaimed, matching database URLs must NOT force it claimed."""
        UserNode.objects.create(
            user=self.user,
            name="Claimed Node",
            local_url="http://127.0.0.1:8090",
            api_key="previous_claimed_token",
            is_online=True,
        )

        resp = self.client.post(
            "/api/v1/nodes/heartbeat",
            {
                "server_name": "Claimed Node",
                "local_endpoints": ["http://127.0.0.1:8090"],
                "port": 8090,
                "auth_token": "",
                "claimed": False,
                "claim_code": "OTX-1234",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.json().get("claimed", False))

        other_user = User.objects.create_user(
            username="other_claimer", email="other@example.com", password="password123"
        )
        self.client.force_authenticate(user=other_user)
        pending = self.client.get("/api/v1/nodes/pending")
        self.assertEqual(len(pending.json()), 1)
        self.assertEqual(pending.json()[0]["claim_code"], "OTX-1234")

    def test_node_instance_heartbeat_view(self):
        """POST /api/v1/nodes/<node_id>/heartbeat authenticated instance heartbeat updates fields."""
        node = UserNode.objects.create(
            user=self.user,
            name="Instance Node",
            api_key="secret_node_key_999",
            is_online=False,
        )

        resp = self.client.post(
            f"/api/v1/nodes/{node.id}/heartbeat",
            {
                "api_key": "secret_node_key_999",
                "local_ip": "192.168.1.200",
                "port": 7777,
                "primary_url": "http://192.168.1.200:7777",
                "version": "1.0.0",
                "network_interfaces": [
                    {"type": "lan", "ip": "192.168.1.200", "url": "http://192.168.1.200:7777", "priority": 10}
                ],
                "system_stats": {"cpu_percent": 24.5, "memory_used_bytes": 104857600},
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertTrue(data["is_online"])

        node.refresh_from_db()
        self.assertTrue(node.is_online)
        self.assertEqual(node.local_ip, "192.168.1.200")
        self.assertEqual(node.port, 7777)
        self.assertEqual(node.primary_url, "http://192.168.1.200:7777")
        self.assertEqual(node.version, "1.0.0")
        self.assertEqual(len(node.network_interfaces), 1)
        self.assertEqual(node.system_stats["cpu_percent"], 24.5)

    def test_node_instance_heartbeat_invalid_token(self):
        """POST /api/v1/nodes/<node_id>/heartbeat with wrong token rejects with 401."""
        node = UserNode.objects.create(
            user=self.user,
            name="Instance Node",
            api_key="correct_token",
            is_online=False,
        )

        resp = self.client.post(
            f"/api/v1/nodes/{node.id}/heartbeat",
            {"api_key": "wrong_token"},
            format="json",
        )
        self.assertIn(resp.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))
