"""Unit tests for Radarr and Sonarr integration in otix-server."""

import unittest
from unittest.mock import MagicMock, patch

from otix_server.arr_types import (
    AddRadarrMovieRequest,
    AddSonarrSeriesRequest,
    ArrConnectionTestResult,
    ArrQueueRecord,
    ArrQueueResponse,
    QualityProfile,
    RadarrConfig,
    RadarrMovie,
    RootFolder,
    SonarrConfig,
    SonarrSeries,
)
from otix_server.arr_utils import (
    build_arr_base_url,
    test_radarr_connection,
    test_sonarr_connection,
    fetch_radarr_movies,
    fetch_sonarr_series,
    fetch_radarr_queue,
    fetch_sonarr_queue,
    add_radarr_movie,
    add_sonarr_series,
    delete_radarr_queue_item,
    delete_sonarr_queue_item,
)


class TestArrIntegration(unittest.TestCase):
    def test_build_arr_base_url(self):
        # Default host & port
        self.assertEqual(
            build_arr_base_url("127.0.0.1", 7878, False, ""),
            "http://127.0.0.1:7878",
        )
        # SSL + url_base
        self.assertEqual(
            build_arr_base_url("radarr.local", 7878, True, "/radarr"),
            "https://radarr.local:7878/radarr",
        )
        # Full URL in host
        self.assertEqual(
            build_arr_base_url("https://nas.example.com/radarr", 7878, False, ""),
            "https://nas.example.com/radarr",
        )
        # Custom domain with subpath and comma typo
        self.assertEqual(
            build_arr_base_url("server,example.com/sonarr", 8989, True, ""),
            "https://server.example.com/sonarr",
        )

    def test_radarr_config_defaults(self):
        cfg = RadarrConfig(api_key="secret")
        self.assertEqual(cfg.port, 7878)
        self.assertEqual(cfg.host, "127.0.0.1")
        self.assertEqual(cfg.clean_url_base, "")

        cfg_base = RadarrConfig(url_base="/radarr/")
        self.assertEqual(cfg_base.clean_url_base, "/radarr")

    def test_sonarr_config_defaults(self):
        cfg = SonarrConfig(api_key="secret")
        self.assertEqual(cfg.port, 8989)
        self.assertEqual(cfg.host, "127.0.0.1")
        self.assertEqual(cfg.series_type, "standard")
        self.assertTrue(cfg.season_folder)

    @patch("otix_server.arr_utils.httpx.Client")
    def test_test_radarr_connection_success(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"version": "5.4.2"}
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = RadarrConfig(api_key="valid_key")
        res = test_radarr_connection(cfg)
        self.assertTrue(res.ok)
        self.assertEqual(res.version, "5.4.2")
        self.assertIn("v5.4.2", res.message)

    @patch("otix_server.arr_utils.httpx.Client")
    def test_test_sonarr_connection_unauthorized(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = SonarrConfig(api_key="bad_key")
        res = test_sonarr_connection(cfg)
        self.assertFalse(res.ok)
        self.assertIn("Invalid", res.message)

    @patch("otix_server.arr_utils.httpx.Client")
    def test_fetch_radarr_movies(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "id": 101,
                "title": "Inception",
                "year": 2010,
                "tmdbId": 27205,
                "monitored": True,
                "hasFile": True,
                "path": "/movies/Inception (2010)",
                "sizeOnDisk": 15000000000,
            }
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = RadarrConfig(api_key="key")
        movies = fetch_radarr_movies(cfg)
        self.assertEqual(len(movies), 1)
        self.assertEqual(movies[0].title, "Inception")
        self.assertEqual(movies[0].tmdb_id, 27205)
        self.assertTrue(movies[0].has_file)

    @patch("otix_server.arr_utils.httpx.Client")
    def test_fetch_sonarr_series(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = [
            {
                "id": 202,
                "title": "Severance",
                "year": 2022,
                "tvdbId": 371980,
                "monitored": True,
                "status": "continuing",
                "statistics": {"totalEpisodeCount": 9, "episodeFileCount": 9},
            }
        ]
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = SonarrConfig(api_key="key")
        series_list = fetch_sonarr_series(cfg)
        self.assertEqual(len(series_list), 1)
        self.assertEqual(series_list[0].title, "Severance")
        self.assertEqual(series_list[0].tvdb_id, 371980)
        self.assertEqual(series_list[0].episode_file_count, 9)

    @patch("otix_server.arr_utils.httpx.Client")
    def test_fetch_radarr_queue(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "page": 1,
            "pageSize": 50,
            "totalRecords": 1,
            "records": [
                {
                    "id": 55,
                    "title": "Dune Part Two 2024",
                    "status": "Downloading",
                    "size": 25000000000,
                    "sizeleft": 10000000000,
                    "timeleft": "00:10:00",
                    "downloadClient": "SABnzbd",
                    "protocol": "usenet",
                }
            ],
        }
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = RadarrConfig(api_key="key")
        queue = fetch_radarr_queue(cfg)
        self.assertEqual(queue.total_records, 1)
        self.assertEqual(queue.records[0].title, "Dune Part Two 2024")
        self.assertEqual(queue.records[0].status, "Downloading")

    @patch("otix_server.arr_utils.httpx.Client")
    def test_add_radarr_movie(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 201
        mock_resp.json.return_value = {"id": 12, "title": "Oppenheimer"}
        mock_client.post.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = RadarrConfig(api_key="key", quality_profile_id=1, root_folder_path="/movies")
        res = add_radarr_movie(cfg, {"title": "Oppenheimer", "tmdb_id": 872585, "year": 2023})
        self.assertEqual(res["id"], 12)
        sent_json = mock_client.post.call_args[1]["json"]
        self.assertEqual(sent_json["title"], "Oppenheimer")
        self.assertEqual(sent_json["tmdbId"], 872585)
        self.assertEqual(sent_json["qualityProfileId"], 1)
        self.assertEqual(sent_json["rootFolderPath"], "/movies")
        self.assertTrue(sent_json["addOptions"]["searchForMovie"])

    @patch("otix_server.arr_utils.httpx.Client")
    def test_delete_radarr_queue_item(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_client.delete.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        cfg = RadarrConfig(api_key="key")
        ok = delete_radarr_queue_item(cfg, 55, remove_from_client=True, blocklist=True)
        self.assertTrue(ok)
        mock_client.delete.assert_called_once_with(
            "http://127.0.0.1:7878/api/v3/queue/55",
            headers={"X-Api-Key": "key"},
            params={"removeFromClient": "true", "blocklist": "true"},
        )


if __name__ == "__main__":
    unittest.main()
