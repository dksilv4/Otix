"""Test suite for Node endpoints (rebranded from test_game_servers.py)."""

from django.contrib.auth import get_user_model
from rest_framework import status
from rest_framework.test import APITestCase

from apps.library.models import UserNode
from apps.library.tests.test_game_servers import *  # noqa: F401, F403

User = get_user_model()


class DeviceRegistrationAndOfflineUpdatesTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="device_user", email="device@example.com", password="password123"
        )
        self.client.force_authenticate(user=self.user)

    def test_device_registration_on_login_creates_node(self):
        resp = self.client.post(
            "/api/v1/library/nodes/desktop-heartbeat",
            {"device_id": "laptop-123", "name": "Work Laptop", "is_online": True},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        node = UserNode.objects.get(user=self.user, local_url="otix://desktop/laptop-123")
        self.assertEqual(node.name, "Work Laptop")
        self.assertTrue(node.is_online)
        self.assertTrue(node.is_local_desktop)

    def test_distinct_devices_get_distinct_nodes(self):
        self.client.post(
            "/api/v1/library/nodes/desktop-heartbeat",
            {"device_id": "device-A", "name": "Desktop PC", "is_online": True},
            format="json",
        )
        self.client.post(
            "/api/v1/library/nodes/desktop-heartbeat",
            {"device_id": "device-B", "name": "MacBook", "is_online": True},
            format="json",
        )
        nodes = UserNode.objects.filter(user=self.user, is_local_desktop=True)
        self.assertEqual(nodes.count(), 2)

    def test_offline_node_setup_queues_updates_and_can_be_retrieved(self):
        node = UserNode.objects.create(
            user=self.user,
            name="Living Room PC",
            local_url="otix://desktop/living-room",
            is_local_desktop=True,
            is_online=False,
        )
        # Configure libraries while offline
        resp = self.client.put(
            f"/api/v1/library/servers/{node.id}/libraries",
            {"libraries": [{"path": "/games", "enabled": True}]},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(resp.data.get("queued"))

        # Node comes online or asks for pending updates
        updates_resp = self.client.get(f"/api/v1/library/servers/{node.id}/pending-updates")
        self.assertEqual(updates_resp.status_code, status.HTTP_200_OK)
        pending = updates_resp.data.get("pending_updates", [])
        self.assertEqual(len(pending), 1)
        self.assertEqual(pending[0]["type"], "libraries")

        # Acknowledge updates
        ack_resp = self.client.post(
            f"/api/v1/library/servers/{node.id}/acknowledge-updates",
            {"update_ids": [pending[0]["id"]]},
            format="json",
        )
        self.assertEqual(ack_resp.status_code, status.HTTP_200_OK)
        self.assertEqual(ack_resp.data.get("remaining_updates"), 0)

