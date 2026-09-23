"""Heartbeat / pending-node APIs are retired (Django is the node)."""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

User = get_user_model()


class GameServerHeartbeatRetiredTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="hb", email="hb@example.com", password="password123"
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)

    def test_heartbeat_returns_gone(self):
        res = self.client.post(
            "/api/v1/servers/heartbeat",
            {
                "server_name": "DK Game Storage Server",
                "local_endpoints": ["http://172.18.0.6:8090"],
                "port": 8090,
                "auth_token": "otix_secret_token_abc123",
            },
            format="json",
        )
        self.assertEqual(res.status_code, 410)

    def test_pending_is_empty(self):
        pending = self.client.get("/api/v1/library/servers/pending")
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(pending.json(), [])
