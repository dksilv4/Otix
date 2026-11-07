"""Automated query count regression tests to verify O(1) database query scaling across core endpoints."""

from unittest.mock import MagicMock, patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.chat.models import Conversation, ConversationParticipant, Message
from apps.gameservers.models import DedicatedGameServer, GameServerShare
from apps.library.models import StorageShare, UserNode, UserNodeShare, UserServerMachine
from apps.media.models import MediaAsset, MediaItem
from apps.social.models import FriendRequest

User = get_user_model()


class QueryCountRegressionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="perf_tester", email="perf@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_gameserver_list_query_count_scaling(self):
        """Verify GET /api/v1/game-servers runs in O(1) database queries."""
        game = MediaItem.objects.create(
            media_type="game",
            title="Query Test Game",
            slug="query-test-game",
        )
        MediaAsset.objects.create(
            media_item=game,
            asset_type="poster",
            url="https://example.com/poster.jpg",
        )
        friend = User.objects.create_user(
            username="friend_bob", email="bob@example.com", password="password123"
        )
        FriendRequest.objects.create(sender=self.user, receiver=friend, status="accepted")

        # 1. Measure queries with 1 game server
        srv1 = DedicatedGameServer.objects.create(
            owner=self.user,
            media_item=game,
            name="Server 1",
            game_title="Query Test Game",
            server_type="steam_source",
            host="127.0.0.1",
            port=27015,
        )
        GameServerShare.objects.create(server=srv1, user=friend)

        # Baseline count for 1 server
        with self.assertNumQueries(4):
            # 1: DedicatedGameServer filter & select_related
            # 2: prefetch shares
            # 3: prefetch invites
            # 4: prefetch media_item__assets
            resp = self.client.get("/api/v1/game-servers")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(len(resp.json()), 1)

        # 2. Add 5 more servers with shares and ensure query count remains strictly 4 (O(1))
        for i in range(2, 7):
            s = DedicatedGameServer.objects.create(
                owner=self.user,
                media_item=game,
                name=f"Server {i}",
                game_title="Query Test Game",
                server_type="steam_source",
                host=f"127.0.0.{i}",
                port=27015,
            )
            GameServerShare.objects.create(server=s, user=friend)

        with self.assertNumQueries(4):
            resp2 = self.client.get("/api/v1/game-servers")
            self.assertEqual(resp2.status_code, 200)
            self.assertEqual(len(resp2.json()), 6)

    @patch("apps.library.services.node.httpx.Client")
    def test_node_list_query_count_scaling(self, mock_client_cls):
        """Verify GET /api/v1/nodes runs in O(1) queries regardless of node count."""
        mock_client = MagicMock()
        mock_resp = MagicMock()
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

        machine = UserServerMachine.objects.create(
            user=self.user,
            name="Primary Machine",
            host="192.168.1.10",
        )

        friend = User.objects.create_user(username="node_friend", password="password123")

        node1 = UserNode.objects.create(
            user=self.user,
            machine_id=machine.id,
            name="Node 1",
            local_url="http://192.168.1.10:8000",
            remote_url="https://node1.example.com",
            is_online=True,
        )
        UserNodeShare.objects.create(node=node1, shared_with=friend)
        StorageShare.objects.create(
            user=self.user,
            machine=machine,
            name="Media Share 1",
            protocol="smb",
            host="192.168.1.10",
            export_path="/mnt/media",
        )

        # Baseline queries with 1 node: exactly 7 queries
        with self.assertNumQueries(7):
            resp = self.client.get("/api/v1/nodes")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(len(resp.json()), 1)

        # Add 5 more nodes
        for i in range(2, 7):
            m = UserServerMachine.objects.create(
                user=self.user,
                name=f"Machine {i}",
                host=f"192.168.1.{i}",
            )
            n = UserNode.objects.create(
                user=self.user,
                machine_id=m.id,
                name=f"Node {i}",
                local_url=f"http://192.168.1.{i}:8000",
                remote_url=f"https://node{i}.example.com",
                is_online=True,
            )
            UserNodeShare.objects.create(node=n, shared_with=friend)

        # Query count for 6 nodes must be strictly identical to 1 node (O(1))
        with self.assertNumQueries(7):
            resp2 = self.client.get("/api/v1/nodes")
            self.assertEqual(resp2.status_code, 200)
            self.assertEqual(len(resp2.json()), 6)

    def test_machines_list_query_count_scaling(self):
        """Verify GET /api/v1/library/machines runs in O(1) queries regardless of machine count."""
        m1 = UserServerMachine.objects.create(
            user=self.user,
            name="Machine 1",
            host="192.168.1.1",
        )
        UserNode.objects.create(
            user=self.user,
            machine_id=m1.id,
            name="Node M1",
            local_url="http://192.168.1.1:8000",
        )

        resp = self.client.get("/api/v1/library/machines")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()), 1)

        # Add 5 more machines with nodes
        for i in range(2, 7):
            m = UserServerMachine.objects.create(
                user=self.user,
                name=f"Machine {i}",
                host=f"192.168.1.{i}",
            )
            UserNode.objects.create(
                user=self.user,
                machine_id=m.id,
                name=f"Node M{i}",
                local_url=f"http://192.168.1.{i}:8000",
            )

        with self.assertNumQueries(2):
            # 1: UserServerMachine query with annotations + prefetch
            # 2: in-memory smb_nodes prefetch
            resp2 = self.client.get("/api/v1/library/machines")
            self.assertEqual(resp2.status_code, 200)
            self.assertEqual(len(resp2.json()), 6)

    @patch("apps.chat.services.chat_service.get_client")
    def test_chat_conversations_list_query_count_scaling(self, mock_redis_get):
        """Verify GET /api/v1/chat/conversations scales in O(1) queries."""
        mock_redis_get.return_value = MagicMock()

        friend = User.objects.create_user(username="chat_friend_1", password="password123")
        FriendRequest.objects.create(sender=self.user, receiver=friend, status="accepted")

        conv1 = Conversation.objects.create(type="direct")
        ConversationParticipant.objects.create(conversation=conv1, user=self.user)
        ConversationParticipant.objects.create(conversation=conv1, user=friend)
        Message.objects.create(conversation=conv1, sender=friend, content="Hello 1")

        # Baseline with 1 conversation: exactly 8 batch queries
        with self.assertNumQueries(8):
            resp = self.client.get("/api/v1/chat/conversations")
            self.assertEqual(resp.status_code, 200)
            self.assertEqual(len(resp.json()), 1)

        # Add 5 more conversations
        for i in range(2, 7):
            f = User.objects.create_user(username=f"chat_friend_{i}", password="password123")
            FriendRequest.objects.create(sender=self.user, receiver=f, status="accepted")
            c = Conversation.objects.create(type="direct")
            ConversationParticipant.objects.create(conversation=c, user=self.user)
            ConversationParticipant.objects.create(conversation=c, user=f)
            Message.objects.create(conversation=c, sender=f, content=f"Hello {i}")

        # The query count for 6 conversations must remain strictly 8 (O(1))
        with self.assertNumQueries(8):
            resp2 = self.client.get("/api/v1/chat/conversations")
            self.assertEqual(resp2.status_code, 200)
            self.assertEqual(len(resp2.json()), 6)
