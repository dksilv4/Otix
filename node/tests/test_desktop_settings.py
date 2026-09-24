import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import otix_server.api as api
from otix_server.config import AppConfig, DesktopSettings, ServerSettings
import otix_server.desktop_node as desktop_node


class DesktopSettingsTests(unittest.TestCase):
    def setUp(self):
        api._config = AppConfig(
            server=ServerSettings(
                name="Test Otix Node",
                auth_token="test_token",
                downloads_path="/storage/downloads",
            ),
            desktop=DesktopSettings(
                launch_on_startup=False,
                minimize_to_tray=False,
                close_to_tray=False,
                always_on_top=False,
                start_minimized=False,
                games_download_path="",
            ),
        )
        self.client = TestClient(api.app)

    def tearDown(self):
        api._config = None

    def test_get_desktop_settings(self):
        resp = self.client.get("/api/v1/desktop/settings")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("platform", data)
        self.assertIn("supported", data)
        self.assertIn("launchOnStartup", data)
        self.assertIn("minimizeToTray", data)
        self.assertIn("closeToTray", data)
        self.assertIn("alwaysOnTop", data)
        self.assertIn("startMinimized", data)
        self.assertIn("gamesDownloadPath", data)
        self.assertEqual(data["gamesDownloadPath"], "/storage/downloads")

    @patch("otix_server.desktop_node.sync_os_startup")
    @patch("otix_server.desktop_node.save_config")
    def test_post_desktop_settings_authed(self, mock_save, mock_sync):
        mock_sync.return_value = True
        mock_save.return_value = True

        resp = self.client.post(
            "/api/v1/desktop/settings?token=test_token",
            json={
                "launchOnStartup": True,
                "minimizeToTray": True,
                "closeToTray": True,
                "alwaysOnTop": True,
                "startMinimized": True,
                "gamesDownloadPath": "/custom/games/path",
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["minimizeToTray"])
        self.assertTrue(data["closeToTray"])
        self.assertTrue(data["alwaysOnTop"])
        self.assertTrue(data["startMinimized"])
        self.assertEqual(data["gamesDownloadPath"], "/custom/games/path")
        mock_sync.assert_called_with(True)
        mock_save.assert_called()

    def test_post_desktop_settings_unauthorized(self):
        resp = self.client.post(
            "/api/v1/desktop/settings",
            json={"minimizeToTray": True},
        )
        self.assertEqual(resp.status_code, 401)

    @patch("sys.platform", "win32")
    def test_platform_detection_windows(self):
        self.assertEqual(desktop_node.get_node_platform(), "windows")
        self.assertTrue(desktop_node.is_desktop_platform_supported())

    @patch("sys.platform", "linux")
    def test_platform_detection_linux(self):
        self.assertEqual(desktop_node.get_node_platform(), "linux")
        self.assertTrue(desktop_node.is_desktop_platform_supported())

    @patch("sys.platform", "darwin")
    def test_platform_detection_darwin(self):
        self.assertEqual(desktop_node.get_node_platform(), "darwin")
        self.assertFalse(desktop_node.is_desktop_platform_supported())
