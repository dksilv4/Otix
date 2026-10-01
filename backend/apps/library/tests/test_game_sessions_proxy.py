"""Tests for GameServerSessionsView and UserGameSessionsView endpoints."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer

User = get_user_model()


class GameSessionsProxyApiTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username="gamer_dan", email="dan@example.com", password="password123"
        )
        self.other_user = User.objects.create_user(
            username="gamer_bob", email="bob@example.com", password="password123"
        )
        self.server = UserGameServer.objects.create(
            user=self.user,
            name="Main Gaming PC",
            local_url="http://127.0.0.1:8090",
            auth_token="test_token_123",
            is_online=True,
        )
        self.client = APIClient()

    def test_anonymous_access_denied(self):
        resp1 = self.client.get(f"/api/v1/library/servers/{self.server.id}/sessions")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.get("/api/v1/library/game-sessions")
        self.assertEqual(resp2.status_code, 401)

    @mock.patch("apps.library.views.nodes.node_get_sessions")
    def test_get_server_sessions(self, mock_get_sessions):
        self.client.force_authenticate(user=self.user)
        mock_sessions = [
            {
                "id": "sess-1",
                "game_id": "game-101",
                "game_title": "Baldur's Gate 3",
                "process_name": "bg3.exe",
                "start_time": "2026-09-30T20:00:00Z",
                "end_time": "2026-09-30T22:00:00Z",
                "duration_seconds": 7200,
                "fps_stats": {
                    "avg_fps": 82.5,
                    "min_fps": 45.0,
                    "max_fps": 115.0,
                    "low_1_percent": 60.2,
                    "low_01_percent": 51.0,
                    "total_frames": 594000,
                    "duration_seconds": 7200,
                },
            }
        ]
        mock_get_sessions.return_value = (200, mock_sessions)

        resp = self.client.get(f"/api/v1/library/servers/{self.server.id}/sessions")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["game_title"], "Baldur's Gate 3")
        self.assertEqual(data[0]["fps_stats"]["avg_fps"], 82.5)

    @mock.patch("apps.library.views.nodes.node_get_sessions")
    def test_get_user_game_sessions_aggregated(self, mock_get_sessions):
        self.client.force_authenticate(user=self.user)
        server2 = UserGameServer.objects.create(
            user=self.user,
            name="Living Room PC",
            local_url="http://192.168.1.150:8090",
            auth_token="token_2",
            is_online=True,
        )

        sess_server1 = [
            {
                "id": "sess-1",
                "game_id": "game-1",
                "game_title": "Elden Ring",
                "start_time": "2026-09-29T10:00:00Z",
                "end_time": "2026-09-29T11:00:00Z",
                "duration_seconds": 3600,
            }
        ]
        sess_server2 = [
            {
                "id": "sess-2",
                "game_id": "game-2",
                "game_title": "Cyberpunk 2077",
                "start_time": "2026-09-30T15:00:00Z",
                "end_time": "2026-09-30T16:30:00Z",
                "duration_seconds": 5400,
            }
        ]

        def side_effect(srv, limit=100):
            if srv.id == self.server.id:
                return (200, sess_server1)
            elif srv.id == server2.id:
                return (200, sess_server2)
            return (404, {"error": "not found"})

        mock_get_sessions.side_effect = side_effect

        resp = self.client.get("/api/v1/library/game-sessions")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 2)
        # Should be sorted descending by time (Cyberpunk on 2026-09-30 is first)
        self.assertEqual(data[0]["game_title"], "Cyberpunk 2077")
        self.assertEqual(data[1]["game_title"], "Elden Ring")
