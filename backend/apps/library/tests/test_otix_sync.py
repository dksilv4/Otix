from unittest import mock

from django.test import TestCase

from apps.accounts.models import User
from apps.library.models import UserGameServer
from apps.library.services.otix_sync import sync_otix_sidecars
from apps.media.models import MediaItem


class OtixSyncTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="otixsync", password="pass")
        self.server = UserGameServer.objects.create(
            user=self.user,
            name="Living Room",
            local_url="http://127.0.0.1:8090",
            auth_token="tok",
            is_active=True,
        )
        self.media = MediaItem.objects.create(
            media_type="game",
            title="Half-Life 2",
            slug="half-life-2",
            overview="Follow Gordon.",
        )

    @mock.patch("apps.library.services.otix_sync.node_write_otix")
    @mock.patch("apps.library.services.otix_sync.match_games_payload")
    @mock.patch("apps.library.services.otix_sync.enqueue_prehydrate_titles")
    @mock.patch("apps.library.services.otix_sync.usenet_proxy_request")
    @mock.patch("apps.library.services.otix_sync.node_get_otix_settings")
    def test_sync_writes_sidecar_for_catalog_match(
        self,
        mock_settings,
        mock_proxy,
        mock_prehydrate,
        mock_batch,
        mock_write,
    ):
        mock_settings.return_value = (
            200,
            {"write_otix_after_scan": True, "download_otix_images": False},
        )
        mock_proxy.return_value = (
            200,
            [
                {
                    "id": "file_hl2",
                    "filename": "hl2.exe",
                    "filepath": "/Volumes/Games/Half-Life 2/hl2.exe",
                    "game_title": "Half-Life 2",
                    "format_category": "game",
                }
            ],
        )
        mock_batch.return_value = {"matches": []}
        mock_write.return_value = (200, {"written": 1, "failed": []})

        status_code, data = sync_otix_sidecars(self.server, download_images=False)
        self.assertEqual(status_code, 200)
        self.assertEqual(data["written"], 1)
        self.assertGreaterEqual(data["matched"], 1)
        mock_write.assert_called_once()
        payload = mock_write.call_args[0][1]
        self.assertFalse(payload["download_images"])
        item = payload["items"][0]
        self.assertEqual(item["file_id"], "file_hl2")
        self.assertEqual(item["sidecar"]["mediaId"], str(self.media.id))
        self.assertEqual(item["sidecar"]["title"], "Half-Life 2")
        self.assertEqual(item["sidecar"]["matchSource"], "catalog")

    @mock.patch("apps.library.services.otix_sync.node_get_otix_settings")
    def test_sync_skips_when_disabled(self, mock_settings):
        mock_settings.return_value = (
            200,
            {"write_otix_after_scan": False, "download_otix_images": False},
        )
        status_code, data = sync_otix_sidecars(self.server)
        self.assertEqual(status_code, 200)
        self.assertEqual(data["status"], "skipped")
        self.assertEqual(data["written"], 0)

    @mock.patch("apps.media.services.imports._enqueue_local_game_mirror")
    @mock.patch("apps.library.services.otix_sync.node_write_otix")
    @mock.patch("apps.library.services.otix_sync.node_get_otix_settings")
    def test_manual_match_writes_sidecar_and_marks_owned(
        self, mock_settings, mock_write, mock_enqueue
    ):
        mock_settings.return_value = (
            200,
            {"download_otix_images": False},
        )
        mock_write.return_value = (200, {"written": 1, "failed": []})

        from apps.library.services.otix_sync import node_match_and_write_otix

        status_code, data = node_match_and_write_otix(
            self.server,
            media_id=self.media.id,
            file_id="file_hl2",
            filepath="/Volumes/Games/Half-Life 2/hl2.exe",
            confidence=0.99,
            user=self.user,
        )
        self.assertEqual(status_code, 200)
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["sidecar"]["mediaId"], str(self.media.id))
        self.assertEqual(data["sidecar"]["matchSource"], "manual")
        self.assertEqual(data["sidecar"]["confidence"], 0.99)
        mock_write.assert_called_once()
        payload = mock_write.call_args[0][1]
        self.assertEqual(payload["items"][0]["file_id"], "file_hl2")

    @mock.patch("apps.media.services.imports._enqueue_local_game_mirror")
    @mock.patch("apps.library.services.otix_sync.node_write_otix")
    @mock.patch("apps.library.services.otix_sync.node_get_otix_settings")
    def test_manual_match_api_endpoint(self, mock_settings, mock_write, mock_enqueue):
        mock_settings.return_value = (
            200,
            {"download_otix_images": False},
        )
        mock_write.return_value = (200, {"written": 1, "failed": []})

        self.client.force_login(self.user)
        resp = self.client.post(
            f"/api/v1/library/servers/{self.server.id}/otix/match",
            {
                "media_id": self.media.id,
                "file_id": "file_hl2",
                "filepath": "/Volumes/Games/Half-Life 2/hl2.exe",
            },
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["status"], "ok")
        mock_write.assert_called_once()
