import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

import otix_server.api as api
from otix_server.config import AppConfig, DesktopSettings, LibraryConfig, OrganizeSettings, ServerSettings


class NodeLibraryOrganizeTests(unittest.TestCase):
    def setUp(self):
        api._config = AppConfig(
            server=ServerSettings(name="Test Node", auth_token="test_token"),
            desktop=DesktopSettings(games_download_path="/storage/downloads"),
            organize=OrganizeSettings(),
            game_libraries=[
                LibraryConfig(name="Games", path="/games", kind="game"),
            ],
        )
        api._indexer = None
        self.client = TestClient(api.app)

    def tearDown(self):
        api._config = None
        api._indexer = None

    def test_list_libraries_includes_kind(self):
        resp = self.client.get("/api/v1/libraries?token=test_token")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data[0]["kind"], "game")
        self.assertEqual(data[0]["path"], "/games")

    @patch("otix_server.desktop_node.save_config")
    def test_replace_libraries(self, mock_save):
        mock_save.return_value = True
        resp = self.client.put(
            "/api/v1/libraries?token=test_token",
            json={
                "libraries": [
                    {"name": "PC", "path": "/media/games", "kind": "game"},
                    {"name": "Discs", "path": "/media/isos", "kind": "iso"},
                ]
            },
        )
        self.assertEqual(resp.status_code, 200)
        kinds = {row["kind"] for row in resp.json()["libraries"]}
        self.assertEqual(kinds, {"game", "iso"})
        self.assertEqual(len(api._config.game_libraries), 2)
        mock_save.assert_called()

    def test_get_organize_settings(self):
        resp = self.client.get("/api/v1/organize?token=test_token")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("autoOrganizeEnabled", data)
        self.assertIn("isoDownloadPath", data)
        self.assertIn("scanOnLaunch", data)

    @patch("otix_server.desktop_node.save_config")
    def test_post_organize_settings(self, mock_save):
        mock_save.return_value = True
        resp = self.client.post(
            "/api/v1/organize?token=test_token",
            json={
                "autoOrganizeEnabled": True,
                "isoDownloadPath": "/media/isos",
                "scanOnLaunch": True,
            },
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertTrue(data["autoOrganizeEnabled"])
        self.assertEqual(data["isoDownloadPath"], "/media/isos")
        self.assertTrue(data["scanOnLaunch"])
        self.assertTrue(api._config.desktop.scan_on_launch)