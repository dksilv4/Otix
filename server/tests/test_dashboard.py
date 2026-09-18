"""Node homepage must show the access token so it can be pasted into Otix."""

import unittest

from fastapi.testclient import TestClient

import otix_server.api as api
from otix_server.config import AppConfig, ServerSettings
from otix_server.indexer import StorageIndexer


class DashboardTokenTests(unittest.TestCase):
    def setUp(self):
        api._config = AppConfig(
            server=ServerSettings(
                name="DK Game Storage Server",
                port=8090,
                auth_token="otix_test_token",
            ),
            game_libraries=[],
        )
        api._indexer = StorageIndexer([])

    def tearDown(self):
        api._config = None
        api._indexer = None

    def test_homepage_shows_copyable_access_token(self):
        resp = TestClient(api.app).get("/")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("otix_test_token", resp.text)
        self.assertIn('id="node-access-token"', resp.text)
        self.assertIn("Paste this into Otix", resp.text)
