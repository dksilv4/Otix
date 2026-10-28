"""Tests for Plex-style node claiming flow and remote access probe."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer

User = get_user_model()


class GameServerClaimTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = User.objects.create_user(
            username="owner", email="owner@example.com", password="password123"
        )
        self.client = APIClient()

    def tearDown(self):
        cache.clear()

    def test_heartbeat_includes_claim_code_in_pending(self):
        """Unclaimed node sends claim_code in heartbeat; pending list exposes it."""
        resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Unraid NAS",
                "local_endpoints": ["http://192.168.1.100:8090"],
                "port": 8090,
                "auth_token": "",
                "claim_code": "OTX-9988",
                "claimed": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)

        self.client.force_authenticate(user=self.user)
        pending = self.client.get("/api/v1/library/servers/pending")
        self.assertEqual(pending.status_code, 200)
        rows = pending.json()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["claim_code"], "OTX-9988")
        self.assertFalse(rows[0]["claimed"])

    @patch("apps.library.services.game_server.ping_server_sync")
    @patch("httpx.Client.post")
    def test_claim_node_by_pin_endpoint(self, mock_post, mock_ping):
        """Claiming with a PIN code contacts the node, binds to user, and creates UserGameServer."""
        # Setup pending node
        self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Unraid NAS",
                "local_endpoints": ["http://192.168.1.100:8090"],
                "port": 8090,
                "auth_token": "",
                "claim_code": "OTX-7766",
                "claimed": False,
            },
            format="json",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "claimed"}
        mock_post.return_value = mock_resp
        mock_ping.return_value = {"online": True, "latency_ms": 12}

        self.client.force_authenticate(user=self.user)
        claim_resp = self.client.post(
            "/api/v1/library/servers/claim",
            {
                "claim_code": "OTX-7766",
            },
            format="json",
        )
        self.assertEqual(claim_resp.status_code, 201)
        data = claim_resp.json()
        self.assertEqual(data["name"], "Unraid NAS")
        self.assertTrue(data["created"])
        self.assertTrue(data["auth_token"])

        # Check node confirm was called with auth token and claim_code
        mock_post.assert_called()
        call_kwargs = mock_post.call_args[1]
        self.assertEqual(call_kwargs["json"]["claim_code"], "OTX-7766")
        self.assertEqual(call_kwargs["json"]["username"], "owner")

        # Verify UserGameServer row
        server = UserGameServer.objects.get(user=self.user, name="Unraid NAS")
        self.assertEqual(server.auth_token, data["auth_token"])

        # Verify pending list is now cleared
        pending = self.client.get("/api/v1/library/servers/pending")
        self.assertEqual(len(pending.json()), 0)

    @patch("httpx.Client.get")
    def test_remote_access_probe(self, mock_get):
        """Probe endpoint verifies WAN reachability of the server."""
        server = UserGameServer.objects.create(
            user=self.user,
            name="My Remote Node",
            local_url="http://192.168.1.50:8090",
            remote_url="http://73.189.22.40:8090",
            auth_token="token_xyz",
        )

        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"status": "online"}
        mock_get.return_value = mock_resp

        self.client.force_authenticate(user=self.user)
        resp = self.client.post(f"/api/v1/library/servers/{server.id}/probe")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["reachable"])
        self.assertIsNotNone(data["latency_ms"])

    def test_claim_node_direct_outbound(self):
        """Direct outbound claim registers the node without requiring inbound reachability."""
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(
            "/api/v1/library/servers/claim-direct",
            {
                "server_name": "Living Room NAS",
                "auth_token": "direct_token_123",
                "port": 8090,
                "local_endpoints": ["http://192.168.1.120:8090", "http://127.0.0.1:8090"],
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 201)
        data = resp.json()
        self.assertEqual(data["name"], "Living Room NAS")
        self.assertEqual(data["auth_token"], "direct_token_123")
        self.assertTrue(data["is_online"])
        self.assertTrue(data["created"])

        # Also verify UserGameServer row in database
        server = UserGameServer.objects.get(user=self.user, name="Living Room NAS")
        self.assertEqual(server.auth_token, "direct_token_123")
        self.assertTrue(server.is_online)
        self.assertEqual(server.local_url, "http://192.168.1.120:8090")

        # Also verify the alias endpoint /api/v1/servers/claim-direct updates the existing node
        alias_resp = self.client.post(
            "/api/v1/servers/claim-direct",
            {
                "server_name": "Living Room NAS",
                "auth_token": "direct_token_123",
                "port": 8090,
                "local_endpoints": ["http://192.168.1.120:8090"],
            },
            format="json",
        )
        self.assertEqual(alias_resp.status_code, 200)
        alias_data = alias_resp.json()
        self.assertFalse(alias_data["created"])

    @patch("httpx.Client.post")
    def test_claim_node_by_pin_heartbeat_rendezvous(self, mock_post):
        """When node is behind NAT and direct HTTP fails, PIN claim succeeds via heartbeat rendezvous."""
        # 1. Unclaimed node sends heartbeat announcement
        hb_resp = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Home Desktop Rig",
                "local_endpoints": ["http://192.168.1.150:8090"],
                "port": 8090,
                "auth_token": "",
                "claim_code": "OTX-8822",
                "claimed": False,
            },
            format="json",
        )
        self.assertEqual(hb_resp.status_code, 200)
        self.assertFalse(hb_resp.json().get("claimed", False))

        # 2. Inbound HTTP connection from backend to node fails (NAT / no port forward)
        mock_post.side_effect = Exception("Connection refused / NAT blocked")

        # 3. User claims via PIN on backend
        self.client.force_authenticate(user=self.user)
        claim_resp = self.client.post(
            "/api/v1/library/servers/claim",
            {
                "claim_code": "OTX-8822",
            },
            format="json",
        )
        self.assertEqual(claim_resp.status_code, 201)
        data = claim_resp.json()
        self.assertEqual(data["name"], "Home Desktop Rig")
        self.assertTrue(data["is_online"])
        assigned_token = data["auth_token"]
        self.assertTrue(assigned_token)

        # 4. Node sends subsequent heartbeat and gets claimed status and auth token back
        next_hb = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "Home Desktop Rig",
                "local_endpoints": ["http://192.168.1.150:8090"],
                "port": 8090,
                "auth_token": "",
                "claim_code": "OTX-8822",
                "claimed": False,
            },
            format="json",
        )
        self.assertEqual(next_hb.status_code, 200)
        next_data = next_hb.json()
        self.assertTrue(next_data.get("claimed"))
        self.assertEqual(next_data.get("auth_token"), assigned_token)
        self.assertEqual(next_data.get("username"), "owner")
