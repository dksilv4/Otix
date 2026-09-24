import unittest
from unittest.mock import patch
from pathlib import Path

from otix_server.config import AppConfig, LibraryConfig
from otix_server.download_library import provider_library_status, _mapping_status
from otix_server.usenet_types import DownloadPathMapping, SabnzbdConfig, UsenetConfig


class DownloadLibraryOfflineMountTests(unittest.TestCase):
    def test_mapping_status_handles_host_down_oserror(self):
        config = AppConfig(
            game_libraries=[LibraryConfig(name="Games", path="/server/Games")],
            usenet=UsenetConfig(
                sabnzbd=SabnzbdConfig(
                    path_mappings=[
                        DownloadPathMapping(
                            remote_path="/Downloads",
                            host_path="/server/Downloads",
                        )
                    ]
                )
            ),
        )

        with patch("otix_server.download_library.Path.resolve", side_effect=OSError(112, "Host is down")):
            with patch("otix_server.download_library.Path.is_dir", side_effect=OSError(112, "Host is down")):
                status = provider_library_status(config)
                self.assertFalse(status["folder_linked"])
                self.assertEqual(len(status["path_mappings"]), 1)
                mapping = status["path_mappings"][0]
                self.assertFalse(mapping["linked"])
                self.assertIn("This host path is not visible to Otix Server", mapping["error"])
