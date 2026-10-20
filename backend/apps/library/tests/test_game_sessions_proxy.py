"""Tests for GameServerSessionsView and UserGameSessionsView endpoints."""

from unittest import mock

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.test import TestCase
from rest_framework.test import APIClient

from apps.library.models import UserGameServer, UserGameSession
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
        self.assertIn(data[0]["game_title"], ["Baldur's Gate 3", "Baldur's Gate III"])
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

    def test_anonymous_access_denied_running(self):
        resp1 = self.client.get(f"/api/v1/library/servers/{self.server.id}/running")
        self.assertEqual(resp1.status_code, 401)

        resp2 = self.client.get("/api/v1/library/game-running")
        self.assertEqual(resp2.status_code, 401)

    @mock.patch("apps.library.views.nodes.node_get_running_games")
    def test_get_server_running_game(self, mock_get_running):
        self.client.force_authenticate(user=self.user)
        mock_get_running.return_value = (
            200,
            {
                "running": True,
                "game": {
                    "id": "steam_1091500",
                    "title": "Cyberpunk 2077",
                    "process_name": "Cyberpunk2077.exe",
                    "pid": 1234,
                },
                "games": [
                    {
                        "id": "steam_1091500",
                        "title": "Cyberpunk 2077",
                        "process_name": "Cyberpunk2077.exe",
                        "pid": 1234,
                    }
                ],
            },
        )

        resp = self.client.get(f"/api/v1/library/servers/{self.server.id}/running")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["running"])
        self.assertEqual(data["game"]["title"], "Cyberpunk 2077")
        self.assertEqual(len(data["games"]), 1)

    @mock.patch("apps.library.views.nodes.node_get_running_games")
    def test_get_user_game_running_aggregated(self, mock_get_running):
        self.client.force_authenticate(user=self.user)
        mock_get_running.return_value = (
            200,
            {
                "running": True,
                "game": {
                    "id": "steam_1245620",
                    "title": "Elden Ring",
                    "process_name": "eldenring.exe",
                    "pid": 5678,
                },
                "games": [
                    {
                        "id": "steam_1245620",
                        "title": "Elden Ring",
                        "process_name": "eldenring.exe",
                        "pid": 5678,
                    }
                ],
            },
        )

        resp = self.client.get("/api/v1/library/game-running")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["running"])
        self.assertIsNotNone(data["game"])
        self.assertEqual(data["game"]["title"], "Elden Ring")
        self.assertEqual(len(data["games"]), 1)

    @mock.patch("apps.library.views.nodes.node_get_running_games")
    def test_get_user_game_running_none(self, mock_get_running):
        self.client.force_authenticate(user=self.user)
        mock_get_running.return_value = (
            200,
            {
                "running": False,
                "game": None,
                "games": [],
            },
        )

        resp = self.client.get("/api/v1/library/game-running")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertFalse(data["running"])
        self.assertIsNone(data["game"])
        self.assertEqual(data["games"], [])

    def test_post_and_get_user_game_running_cached(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "running": True,
            "game": {
                "id": "steam_1245620",
                "title": "Elden Ring",
                "process_name": "eldenring.exe",
                "start_time": 1718000000000,
            },
            "games": [
                {
                    "id": "steam_1245620",
                    "title": "Elden Ring",
                    "process_name": "eldenring.exe",
                    "start_time": 1718000000000,
                }
            ],
        }

        # POST active running game
        post_resp = self.client.post("/api/v1/library/game-running", payload, format="json")
        self.assertEqual(post_resp.status_code, 200)
        post_data = post_resp.json()
        self.assertTrue(post_data["running"])
        self.assertEqual(post_data["game"]["title"], "Elden Ring")

        # GET should retrieve the cached game without calling any node
        get_resp = self.client.get("/api/v1/library/game-running")
        self.assertEqual(get_resp.status_code, 200)
        get_data = get_resp.json()
        self.assertTrue(get_data["running"])
        self.assertEqual(get_data["game"]["title"], "Elden Ring")
        self.assertEqual(len(get_data["games"]), 1)

        # POST stopped running game
        stop_resp = self.client.post(
            "/api/v1/library/game-running",
            {"running": False, "game": None, "games": []},
            format="json",
        )
        self.assertEqual(stop_resp.status_code, 200)
        self.assertFalse(stop_resp.json()["running"])

        # DELETE endpoint also clears
        del_resp = self.client.delete("/api/v1/library/game-running")
        self.assertEqual(del_resp.status_code, 200)
        self.assertFalse(del_resp.json()["running"])

    def test_user_defaults_for_game_sessions(self):
        self.assertTrue(self.user.save_game_sessions)
        self.assertTrue(self.user.game_sessions_private)

    def test_post_saves_game_session_to_database_by_default_private(self):
        self.client.force_authenticate(user=self.user)
        payload = {
            "sessions": [
                {
                    "game_id": "steam_730",
                    "game_title": "Counter-Strike 2",
                    "process_name": "cs2.exe",
                    "start_time": "2026-10-15T18:00:00Z",
                    "end_time": "2026-10-15T19:30:00Z",
                    "duration_seconds": 5400,
                    "fps_stats": {
                        "avg_fps": 240.5,
                        "min_fps": 160.0,
                        "max_fps": 310.0,
                    },
                }
            ]
        }
        res = self.client.post("/api/v1/library/game-sessions", payload, format="json")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertTrue(data[0]["is_private"])
        self.assertEqual(data[0]["game_title"], "Counter-Strike 2")
        self.assertEqual(data[0]["fps_stats"]["avg_fps"], 240.5)

        # Verify persisted in database
        db_session = UserGameSession.objects.get(user=self.user, game_id="steam_730")
        self.assertEqual(db_session.game_title, "Counter-Strike 2")
        self.assertTrue(db_session.is_private)
        self.assertEqual(db_session.duration_seconds, 5400)
        self.assertEqual(db_session.avg_fps, 240.5)

        # GET /library/game-sessions retrieves this session from DB
        get_res = self.client.get("/api/v1/library/game-sessions")
        self.assertEqual(get_res.status_code, 200)
        get_data = get_res.json()
        self.assertEqual(len(get_data), 1)
        self.assertEqual(get_data[0]["game_id"], "steam_730")
        self.assertTrue(get_data[0]["is_private"])

    def test_opt_out_game_sessions_in_settings_does_not_save_to_db(self):
        self.client.force_authenticate(user=self.user)
        # Opt out via PATCH /auth/me
        patch_res = self.client.patch("/api/v1/auth/me", {"save_game_sessions": False}, format="json")
        self.assertEqual(patch_res.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.save_game_sessions)

        # Post session
        payload = {
            "sessions": [
                {
                    "game_id": "steam_105600",
                    "game_title": "Terraria",
                    "start_time": "2026-10-16T14:00:00Z",
                    "end_time": "2026-10-16T15:00:00Z",
                }
            ]
        }
        res = self.client.post("/api/v1/library/game-sessions", payload, format="json")
        self.assertEqual(res.status_code, 200)
        # In memory it's enriched
        self.assertEqual(len(res.json()), 1)
        # But DB has 0 sessions saved!
        self.assertEqual(UserGameSession.objects.filter(user=self.user).count(), 0)

    def test_other_user_cannot_see_private_sessions(self):
        # gamer_dan has 1 private session and 1 public session
        UserGameSession.objects.create(
            user=self.user,
            game_id="steam_private",
            game_title="Secret Game",
            start_time="2026-10-10T10:00:00Z",
            is_private=True,
        )
        UserGameSession.objects.create(
            user=self.user,
            game_id="steam_public",
            game_title="Public Halo",
            start_time="2026-10-11T10:00:00Z",
            is_private=False,
        )

        # gamer_bob queries gamer_dan's sessions
        self.client.force_authenticate(user=self.other_user)
        res = self.client.get(f"/api/v1/library/game-sessions?username={self.user.username}")
        self.assertEqual(res.status_code, 200)
        data = res.json()
        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["game_title"], "Public Halo")
        self.assertFalse(data[0]["is_private"])

        # gamer_dan viewing self sees both
        self.client.force_authenticate(user=self.user)
        self_res = self.client.get("/api/v1/library/game-sessions")
        self.assertEqual(len(self_res.json()), 2)

    def test_patch_and_delete_game_session(self):
        self.client.force_authenticate(user=self.user)
        sess = UserGameSession.objects.create(
            user=self.user,
            game_id="steam_570",
            game_title="Dota 2",
            start_time="2026-10-12T12:00:00Z",
            is_private=True,
        )

        # PATCH to make public
        patch_res = self.client.patch(
            f"/api/v1/library/game-sessions/{sess.id}",
            {"is_private": False},
            format="json",
        )
        self.assertEqual(patch_res.status_code, 200)
        sess.refresh_from_db()
        self.assertFalse(sess.is_private)

        # DELETE session
        del_res = self.client.delete(f"/api/v1/library/game-sessions/{sess.id}")
        self.assertEqual(del_res.status_code, 204)
        self.assertEqual(UserGameSession.objects.filter(pk=sess.id).count(), 0)



