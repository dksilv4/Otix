"""Tests for dedicated game servers, friend sharing, invite links, and live queries."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.gameservers.models import DedicatedGameServer, GameServerShare
from apps.media.models import MediaItem
from apps.social.models import FriendRequest

User = get_user_model()


class DedicatedGameServerTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username="alice", password="password123")
        self.bob = User.objects.create_user(username="bob", password="password123")
        self.charlie = User.objects.create_user(username="charlie", password="password123")

        # Alice and Bob are friends
        FriendRequest.objects.create(sender=self.alice, receiver=self.bob, status="accepted")

        # Catalog game
        self.game = MediaItem.objects.create(
            media_type="game",
            title="Palworld",
            slug="palworld",
        )

        self.client.force_authenticate(user=self.alice)

    def test_create_and_list_server(self):
        # Test creation using non-trailing slash URL and slug as media_item_id
        resp = self.client.post(
            "/api/v1/game-servers",
            {
                "name": "Alice's Palworld World",
                "game_title": "Palworld",
                "media_item_id": "palworld",
                "server_type": "steam_source",
                "host": "192.168.1.100",
                "port": 8211,
                "query_port": 27015,
                "password": "secretpassword",
                "description": "Casual co-op world",
                "is_public_link": False,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["name"], "Alice's Palworld World")
        self.assertEqual(resp.data["connection_address"], "192.168.1.100:8211")
        self.assertEqual(resp.data["media_item_id"], self.game.id)
        self.assertTrue(resp.data["is_owner"])

        # Test creation with NO name provided -> should default to "{game_title} Server"
        resp_no_name = self.client.post(
            "/api/v1/game-servers",
            {
                "game_title": "Palworld",
                "media_item_id": "palworld",
                "server_type": "steam_source",
                "host": "192.168.1.101",
                "port": 8211,
            },
            format="json",
        )
        self.assertEqual(resp_no_name.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp_no_name.data["name"], "Palworld Server")

        # List servers for Alice
        list_resp = self.client.get("/api/v1/game-servers")
        self.assertEqual(list_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(list_resp.data), 2)

    def test_create_and_update_with_server_machine(self):
        from apps.library.models.user_server_machine import UserServerMachine

        machine = UserServerMachine.objects.create(
            user=self.alice,
            name="Homelab TrueNAS",
            host="192.168.1.50",
            os="truenas",
        )
        resp = self.client.post(
            "/api/v1/game-servers",
            {
                "name": "Minecraft Paper",
                "game_title": "Minecraft",
                "server_type": "minecraft",
                "host": "192.168.1.50",
                "port": 25565,
                "server_machine_id": machine.id,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["server_machine_id"], machine.id)
        self.assertEqual(resp.data["server_machine_name"], "Homelab TrueNAS")

        server_id = resp.data["id"]
        patch_resp = self.client.patch(
            f"/api/v1/game-servers/{server_id}",
            {"server_machine_id": None},
            format="json",
        )
        self.assertEqual(patch_resp.status_code, status.HTTP_200_OK)
        self.assertIsNone(patch_resp.data["server_machine_id"])

    def test_by_game_lookup(self):
        server = DedicatedGameServer.objects.create(
            owner=self.alice,
            media_item=self.game,
            name="Palworld Dedicated",
            server_type="steam_source",
            host="10.0.0.1",
            port=8211,
        )
        # Test lookup by integer PK
        resp = self.client.get(f"/api/v1/game-servers/by-game/{self.game.id}")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 1)
        self.assertEqual(resp.data[0]["id"], server.id)

        # Test lookup by slug
        resp_slug = self.client.get("/api/v1/game-servers/by-game/palworld")
        self.assertEqual(resp_slug.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp_slug.data), 1)
        self.assertEqual(resp_slug.data[0]["id"], server.id)

    def test_share_only_with_otix_friends(self):
        server = DedicatedGameServer.objects.create(
            owner=self.alice,
            media_item=self.game,
            name="Palworld Dedicated",
            host="10.0.0.1",
            port=8211,
        )

        # Share with Bob (accepted friend) -> should succeed
        resp = self.client.post(
            f"/api/v1/game-servers/{server.id}/shares",
            {"user_id": self.bob.id, "permission": "viewer"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(GameServerShare.objects.filter(server=server, user=self.bob).exists())

        # Share with Charlie (NOT a friend) -> must fail with 400
        resp_charlie = self.client.post(
            f"/api/v1/game-servers/{server.id}/shares",
            {"user_id": self.charlie.id, "permission": "viewer"},
            format="json",
        )
        self.assertEqual(resp_charlie.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("Otix friends", str(resp_charlie.data))

        # Bob can now view the shared server
        self.client.force_authenticate(user=self.bob)
        bob_list = self.client.get("/api/v1/game-servers/")
        self.assertEqual(len(bob_list.data), 1)
        self.assertEqual(bob_list.data[0]["id"], server.id)
        self.assertFalse(bob_list.data[0]["is_owner"])
        self.assertEqual(bob_list.data[0]["user_permission"], "viewer")

    def test_anyone_with_link_invite(self):
        server = DedicatedGameServer.objects.create(
            owner=self.alice,
            media_item=self.game,
            name="Public Minecraft World",
            server_type="minecraft",
            host="mc.example.com",
            port=25565,
            is_public_link=False,
        )

        # Generate invite link token
        resp = self.client.post(f"/api/v1/game-servers/{server.id}/invites")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        code = resp.data["code"]
        self.assertTrue(code)

        server.refresh_from_db()
        self.assertTrue(server.is_public_link)

        # Charlie (not a friend) visits the invite link (unauthenticated check)
        self.client.force_authenticate(user=None)
        resolve_resp = self.client.get(f"/api/v1/game-servers/invites/{code}")
        self.assertEqual(resolve_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resolve_resp.data["server"]["name"], "Public Minecraft World")
        self.assertFalse(resolve_resp.data["server"]["is_member"])
        self.assertFalse(resolve_resp.data["server"]["is_owner"])

        # Charlie logs in and accepts the invite
        self.client.force_authenticate(user=self.charlie)
        join_resp = self.client.post(f"/api/v1/game-servers/invites/{code}/join")
        self.assertEqual(join_resp.status_code, status.HTTP_200_OK)
        self.assertTrue(join_resp.data["is_member"])
        self.assertFalse(join_resp.data["is_owner"])

        # Charlie now has access via the share record
        charlie_list = self.client.get("/api/v1/game-servers/")
        self.assertEqual(len(charlie_list.data), 1)
        self.assertEqual(charlie_list.data[0]["id"], server.id)

    @mock.patch("apps.gameservers.services.query.query_minecraft")
    def test_live_query_minecraft(self, mock_query):
        mock_query.return_value = {
            "status": "online",
            "current_players": 5,
            "max_players": 20,
            "player_list": ["Alice", "Steve", "Alex"],
            "version": "1.20.4",
            "current_map": "Survival World",
            "ping_ms": 28,
        }

        server = DedicatedGameServer.objects.create(
            owner=self.alice,
            name="My MC Server",
            server_type="minecraft",
            host="mc.example.com",
            port=25565,
        )

        resp = self.client.post(f"/api/v1/game-servers/{server.id}/query")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["server"]["status"], "online")
        self.assertEqual(resp.data["server"]["current_players"], 5)
        self.assertEqual(resp.data["server"]["ping_ms"], 28)
        self.assertEqual(resp.data["server"]["player_list"], ["Alice", "Steve", "Alex"])

        server.refresh_from_db()
        self.assertEqual(server.status, "online")
        self.assertEqual(server.current_players, 5)

    def test_live_query_with_client_result(self):
        server = DedicatedGameServer.objects.create(
            owner=self.alice,
            name="Alice Local Palworld",
            server_type="steam_source",
            host="192.168.1.100",
            port=8211,
            status="offline",
        )

        resp = self.client.post(
            f"/api/v1/game-servers/{server.id}/query",
            {
                "client_result": {
                    "status": "online",
                    "ping_ms": 12,
                    "current_players": 4,
                    "max_players": 32,
                    "player_list": ["Player1"],
                    "current_map": "Palworld Island",
                    "version": "v0.2.1",
                }
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["server"]["status"], "online")
        self.assertEqual(resp.data["server"]["ping_ms"], 12)
        self.assertEqual(resp.data["server"]["current_players"], 4)
        self.assertEqual(resp.data["server"]["current_map"], "Palworld Island")

        server.refresh_from_db()
        self.assertEqual(server.status, "online")
        self.assertEqual(server.ping_ms, 12)
        self.assertEqual(server.current_players, 4)

    @mock.patch("apps.gameservers.services.query.query_minecraft")
    def test_verify_connection(self, mock_query):
        mock_query.return_value = {
            "status": "online",
            "current_players": 3,
            "max_players": 10,
            "ping_ms": 15,
        }

        resp = self.client.post(
            "/api/v1/game-servers/verify",
            {
                "host": "mc.example.com",
                "port": 25565,
                "server_type": "minecraft",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "online")
        self.assertEqual(resp.data["ping_ms"], 15)

    @mock.patch("apps.gameservers.services.query.query_generic")
    @mock.patch("apps.gameservers.services.query.query_a2s")
    def test_verify_steam_falls_back_to_tcp_when_a2s_times_out(self, mock_a2s, mock_generic):
        mock_a2s.side_effect = TimeoutError("timed out")
        mock_generic.return_value = {"status": "online", "ping_ms": 42}

        resp = self.client.post(
            "/api/v1/game-servers/verify",
            {
                "host": "192.168.1.50",
                "port": 8211,
                "server_type": "steam_source",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "online")
        self.assertEqual(resp.data["ping_ms"], 42)
        self.assertIn("Reachable over TCP", resp.data["query_warning"])
        self.assertEqual(mock_a2s.call_count, 2)
        mock_a2s.assert_has_calls(
            [
                mock.call("192.168.1.50", 8211, timeout=5.0),
                mock.call("192.168.1.50", 8212, timeout=5.0),
            ]
        )
        mock_generic.assert_called_once_with("192.168.1.50", 8211, timeout=5.0)

    @mock.patch("apps.gameservers.services.query.query_generic")
    @mock.patch("apps.gameservers.services.query.query_a2s")
    def test_verify_steam_timeout_message_when_tcp_also_fails(self, mock_a2s, mock_generic):
        mock_a2s.side_effect = TimeoutError("timed out")
        mock_generic.side_effect = TimeoutError("timed out")

        resp = self.client.post(
            "/api/v1/game-servers/verify",
            {
                "host": "192.168.1.50",
                "port": 8211,
                "server_type": "steam_source",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "offline")
        self.assertIn("A2S query timed out", resp.data["error"])
        self.assertIn("Otix backend", resp.data["error"])
