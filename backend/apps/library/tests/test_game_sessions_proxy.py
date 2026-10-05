"""Tests for GameServerSessionsView and UserGameSessionsView endpoints."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer
from apps.media.models import ExternalID, MediaAsset, MediaItem

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

    def test_post_hydrate_sessions_with_existing_media_item(self):
        self.client.force_authenticate(user=self.user)
        item = MediaItem.objects.create(
            media_type="game",
            title="Hades II",
            slug="hades-ii",
        )
        MediaAsset.objects.create(
            media_item=item,
            asset_type="poster",
            url="https://images.otix.tv/hades-poster.jpg",
        )
        MediaAsset.objects.create(
            media_item=item,
            asset_type="backdrop",
            url="https://images.otix.tv/hades-backdrop.jpg",
        )

        resp = self.client.post(
            "/api/v1/library/game-sessions",
            {"sessions": [{"game_title": "Hades II", "game_id": "hades-2", "start_time": "2026-10-01T12:00:00Z"}]},
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["otix_media_id"], str(item.id))
        self.assertEqual(data[0]["slug"], "hades-ii")
        self.assertIn("hades-poster.jpg", data[0]["poster_url"])
        self.assertIn("hades-backdrop.jpg", data[0]["backdrop_url"])

    def test_post_hydrate_sessions_with_external_id_match(self):
        self.client.force_authenticate(user=self.user)
        item = MediaItem.objects.create(
            media_type="game",
            title="Dota 2",
            slug="dota-2",
        )
        media_ct = ContentType.objects.get_for_model(MediaItem)
        ExternalID.objects.create(
            content_type=media_ct,
            object_id=item.id,
            provider="steam",
            external_id="570",
        )

        resp = self.client.post(
            "/api/v1/library/game-sessions",
            {
                "sessions": [
                    {
                        "game_title": "dota2.exe",
                        "game_id": "steam_570",
                        "steam_app_id": "570",
                        "start_time": "2026-10-01T12:00:00Z",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["otix_media_id"], str(item.id))
        self.assertEqual(data[0]["game_title"], "Dota 2")

    @mock.patch("apps.library.views.nodes.hydrate_game_to_otix")
    def test_post_hydrate_game_seeds_from_igdb_when_not_in_catalog(self, mock_hydrate):
        self.client.force_authenticate(user=self.user)
        mock_item = MediaItem.objects.create(
            media_type="game",
            title="Deep Rock Galactic",
            slug="deep-rock-galactic",
        )
        mock_hydrate.return_value = mock_item

        resp = self.client.post(
            "/api/v1/library/game-sessions",
            {
                "sessions": [
                    {
                        "game_title": "FSD.exe",
                        "game_id": "steam_548430",
                        "steam_app_id": "548430",
                        "start_time": "2026-10-01T12:00:00Z",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        mock_hydrate.assert_called_once()
        data = resp.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["otix_media_id"], str(mock_item.id))
        self.assertEqual(data[0]["game_title"], "Deep Rock Galactic")

    def test_steam_app_id_does_not_collide_with_igdb_id(self):
        self.client.force_authenticate(user=self.user)
        # Create GTA 3 which has IGDB ID 730
        gta3 = MediaItem.objects.create(
            media_type="game",
            title="Grand Theft Auto III",
            slug="grand-theft-auto-iii",
        )
        media_ct = ContentType.objects.get_for_model(MediaItem)
        ExternalID.objects.create(
            content_type=media_ct,
            object_id=gta3.id,
            provider="igdb",
            external_id="730",
        )

        # Create CS2 which has Steam App ID 730
        cs2 = MediaItem.objects.create(
            media_type="game",
            title="Counter-Strike 2",
            slug="counter-strike-2",
        )
        ExternalID.objects.create(
            content_type=media_ct,
            object_id=cs2.id,
            provider="steam",
            external_id="730",
        )

        resp = self.client.post(
            "/api/v1/library/game-sessions",
            {
                "sessions": [
                    {
                        "game_title": "cs2.exe",
                        "game_id": "steam_730",
                        "steam_app_id": "730",
                        "start_time": "2026-10-01T12:00:00Z",
                    }
                ]
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(len(data), 1)
        # Must match Counter-Strike 2, NOT Grand Theft Auto III
        self.assertEqual(data[0]["otix_media_id"], str(cs2.id))
        self.assertEqual(data[0]["game_title"], "Counter-Strike 2")
        self.assertEqual(data[0]["slug"], "counter-strike-2")


