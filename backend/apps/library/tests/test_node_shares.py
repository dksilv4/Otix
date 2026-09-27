"""Tests for Otix Node library sharing and multi-user file aggregation."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.library.models import UserGameServer, UserNodeShare
from apps.social.models import FriendRequest

User = get_user_model()


class NodeSharingTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.alice = User.objects.create_user(username="alice", password="password123")
        self.bob = User.objects.create_user(username="bob", password="password123")
        self.charlie = User.objects.create_user(username="charlie", password="password123")

        # Alice and Bob are friends
        FriendRequest.objects.create(sender=self.alice, receiver=self.bob, status="accepted")

        # Alice's Otix node
        self.node = UserGameServer.objects.create(
            user=self.alice,
            name="Alice's TrueNAS Node",
            local_url="http://192.168.1.50:8090",
            auth_token="token123",
            is_online=True,
            is_active=True,
        )

        self.client.force_authenticate(user=self.alice)

    def test_share_node_only_with_friends(self):
        # Share with Bob (friend)
        resp = self.client.post(
            f"/api/v1/library/nodes/{self.node.id}/shares",
            {
                "shared_with_id": self.bob.id,
                "allow_all_libraries": True,
                "permission": "read",
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(
            UserNodeShare.objects.filter(node=self.node, shared_with=self.bob).exists()
        )

        # Share with Charlie (not friend) -> rejected
        resp_charlie = self.client.post(
            f"/api/v1/library/nodes/{self.node.id}/shares",
            {
                "shared_with_id": self.charlie.id,
                "allow_all_libraries": True,
            },
            format="json",
        )
        self.assertEqual(resp_charlie.status_code, status.HTTP_400_BAD_REQUEST)

    def test_share_node_via_public_link(self):
        resp = self.client.post(
            f"/api/v1/library/nodes/{self.node.id}/shares",
            {
                "is_public_link": True,
                "allow_all_libraries": True,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        token = resp.data["share_token"]
        self.assertTrue(token)
        self.assertTrue(resp.data["is_public_link"])

    @mock.patch("apps.library.views.nodes.enqueue_prehydrate_titles")
    @mock.patch("httpx.Client.get")
    def test_server_games_aggregates_shared_node_files(self, mock_get, mock_prehydrate):
        # Mock file response from Alice's node
        mock_resp = mock.MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "id": "file-1",
                "filename": "Palworld_Setup.exe",
                "filepath": "/storage/games/Palworld/Palworld_Setup.exe",
                "relative_path": "Palworld/Palworld_Setup.exe",
                "filesize": 15000000000,
                "extension": ".exe",
                "format_category": "installer",
                "game_title": "Palworld",
                "library_name": "Games",
                "modified_at": "2026-09-01T12:00:00Z",
            }
        ]
        mock_get.return_value = mock_resp

        # Share node with Bob
        UserNodeShare.objects.create(
            node=self.node,
            shared_with=self.bob,
            allow_all_libraries=True,
            permission="read",
        )

        # Authenticate as Bob
        self.client.force_authenticate(user=self.bob)
        resp = self.client.get("/api/v1/library/server-games")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

        files = resp.data["files"]
        self.assertEqual(len(files), 1)
        self.assertEqual(files[0]["filename"], "Palworld_Setup.exe")
        self.assertTrue(files[0]["is_shared"])
        self.assertEqual(files[0]["shared_by"]["username"], "alice")
