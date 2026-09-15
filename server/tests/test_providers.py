"""Unit tests for the modular provider framework in otix-server."""

import unittest
from unittest.mock import MagicMock, patch
from otix_server.providers.base import (
    BaseDownloader,
    BaseSearchProvider,
    ProviderInfo,
)
from otix_server.providers.sabnzbd import SabnzbdDownloader
from otix_server.providers.prowlarr import ProwlarrSearchProvider
from otix_server.providers.manager import ProviderManager
from otix_server.usenet_types import (
    SabnzbdConfig,
    ProwlarrConfig,
    ServerDownloadQueue,
    ProwlarrRelease,
)


class TestProvidersFramework(unittest.TestCase):
    def test_sabnzbd_implements_base_downloader(self):
        cfg = SabnzbdConfig(host="127.0.0.1", port=8080, api_key="secret123")
        downloader = SabnzbdDownloader(cfg)
        self.assertIsInstance(downloader, BaseDownloader)
        self.assertEqual(downloader.name, "SABnzbd")
        self.assertEqual(downloader.protocol, "usenet")
        self.assertTrue(downloader.is_configured())

        info = downloader.to_info()
        self.assertIsInstance(info, ProviderInfo)
        self.assertEqual(info.id, "sabnzbd")
        self.assertEqual(info.type, "downloader")
        self.assertTrue(info.is_configured)

    def test_sabnzbd_not_configured_when_no_api_key(self):
        cfg = SabnzbdConfig(host="127.0.0.1", port=8080, api_key="")
        downloader = SabnzbdDownloader(cfg)
        self.assertFalse(downloader.is_configured())

    def test_prowlarr_implements_base_search_provider(self):
        cfg = ProwlarrConfig(host="127.0.0.1", port=9696, api_key="prowlarr_key")
        provider = ProwlarrSearchProvider(cfg)
        self.assertIsInstance(provider, BaseSearchProvider)
        self.assertEqual(provider.name, "Prowlarr")
        self.assertEqual(provider.protocol, "multi")
        self.assertTrue(provider.is_configured())

        info = provider.to_info()
        self.assertIsInstance(info, ProviderInfo)
        self.assertEqual(info.id, "prowlarr")
        self.assertEqual(info.type, "search_provider")

    def test_provider_manager_registration_and_listing(self):
        mgr = ProviderManager()
        sab_cfg = SabnzbdConfig(host="127.0.0.1", port=8080, api_key="key1")
        prow_cfg = ProwlarrConfig(host="127.0.0.1", port=9696, api_key="key2")

        downloader = SabnzbdDownloader(sab_cfg)
        search_provider = ProwlarrSearchProvider(prow_cfg)

        mgr.register_downloader(downloader)
        mgr.register_search_provider(search_provider)

        self.assertEqual(mgr.get_downloader(), downloader)
        self.assertEqual(mgr.get_downloader("sabnzbd"), downloader)
        self.assertEqual(mgr.get_search_provider(), search_provider)
        self.assertEqual(mgr.get_search_provider("prowlarr"), search_provider)

        providers = mgr.list_providers()
        self.assertIn("downloaders", providers)
        self.assertIn("search_providers", providers)
        self.assertEqual(len(providers["downloaders"]), 1)
        self.assertEqual(providers["downloaders"][0]["name"], "SABnzbd")
        self.assertEqual(len(providers["search_providers"]), 1)
        self.assertEqual(providers["search_providers"][0]["name"], "Prowlarr")

    def test_provider_manager_unknown_provider_raises(self):
        mgr = ProviderManager()
        with self.assertRaises(ValueError):
            mgr.get_downloader("unknown")

        with self.assertRaises(ValueError):
            mgr.get_search_provider("unknown")

    @patch("otix_server.providers.sabnzbd.fetch_sabnzbd_queue")
    def test_provider_manager_get_queue(self, mock_queue):
        mock_queue.return_value = ServerDownloadQueue(
            status="downloading", speed="15.2 MB/s", timeleft="0:05:00", slots=[]
        )
        mgr = ProviderManager()
        mgr.register_downloader(SabnzbdDownloader(SabnzbdConfig(api_key="k")))

        queue = mgr.get_queue()
        self.assertEqual(queue.status, "downloading")
        self.assertEqual(queue.speed, "15.2 MB/s")

    @patch("otix_server.providers.prowlarr.search_prowlarr")
    def test_provider_manager_search(self, mock_search):
        mock_search.return_value = [
            ProwlarrRelease(
                guid="rel1",
                title="Elden Ring-FLT",
                size=50000000000,
                age="2d",
                download_url="http://nzb.example.com/rel1.nzb",
                indexer="NZBGeek",
                protocol="usenet",
            )
        ]
        mgr = ProviderManager()
        mgr.register_search_provider(ProwlarrSearchProvider(ProwlarrConfig(api_key="k")))

        results = mgr.search("Elden Ring")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].title, "Elden Ring-FLT")

    @patch("otix_server.providers.prowlarr.search_prowlarr")
    def test_prowlarr_search_forwards_categories(self, mock_search):
        mock_search.return_value = []
        provider = ProwlarrSearchProvider(ProwlarrConfig(api_key="k"))
        provider.search("Hades", [4050])
        mock_search.assert_called_once_with(provider.config, "Hades", categories=[4050])

    @patch("otix_server.usenet_utils.httpx.Client")
    def test_search_prowlarr_sends_repeated_category_params(self, mock_client_cls):
        mock_client = MagicMock()
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = []
        mock_client.get.return_value = mock_resp
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        from otix_server.usenet_utils import search_prowlarr

        search_prowlarr(
            ProwlarrConfig(host="127.0.0.1", port=9696, api_key="k", categories=[1000, 4000]),
            "Celeste",
        )
        _args, kwargs = mock_client.get.call_args
        params = kwargs["params"]
        self.assertEqual(
            [value for key, value in params if key == "categories"],
            ["1000", "4000"],
        )

    def test_build_prowlarr_search_params_repeats_categories(self):
        from otix_server.usenet_utils import build_prowlarr_search_params

        params = build_prowlarr_search_params("Hollow Knight", [1000, 4000])
        self.assertIn(("query", "Hollow Knight"), params)
        self.assertIn(("type", "search"), params)
        self.assertEqual(
            [value for key, value in params if key == "categories"],
            ["1000", "4000"],
        )

    def test_parse_prowlarr_release_keeps_results_without_download_url(self):
        from otix_server.usenet_utils import parse_prowlarr_release

        parsed = parse_prowlarr_release({
            "guid": "rel-magnet",
            "title": "Hades II-RUNE",
            "size": "12345",
            "magnetUrl": "magnet:?xt=urn:btih:abc",
            "indexer": "1337x",
            "protocol": "torrent",
            "age": "2",
            "seeders": 18,
        })
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.download_url, "magnet:?xt=urn:btih:abc")
        self.assertEqual(parsed.protocol, "torrent")
        self.assertEqual(parsed.age_days, 2)
        self.assertEqual(parsed.seeders, 18)

        listed = parse_prowlarr_release({
            "id": 99,
            "title": "Celeste-GOG",
            "size": 4000000000,
            "indexerName": "NZBGeek",
            "protocol": "usenet",
            "age": 0.4,
        })
        self.assertIsNotNone(listed)
        self.assertEqual(listed.title, "Celeste-GOG")
        self.assertEqual(listed.download_url, "")
        self.assertEqual(listed.indexer, "NZBGeek")
        self.assertEqual(listed.age_days, 0)

        self.assertIsNone(parse_prowlarr_release({"guid": "empty"}))

    def test_url_base_resolution_for_sabnzbd(self):
        from otix_server.usenet_utils import build_sabnzbd_url

        # 1. Standard host with url_base
        cfg1 = SabnzbdConfig(host="192.168.1.50", port=8080, url_base="/sabnzbd", api_key="test123")
        url1 = build_sabnzbd_url(cfg1, "version")
        self.assertTrue(url1.startswith("http://192.168.1.50:8080/sabnzbd/api?"))

        # 2. Host with trailing/leading slashes in url_base
        cfg2 = SabnzbdConfig(host="192.168.1.50", port=8080, url_base="sabnzbd/", api_key="test123")
        url2 = build_sabnzbd_url(cfg2, "version")
        self.assertTrue(url2.startswith("http://192.168.1.50:8080/sabnzbd/api?"))

        # 3. Full URL specified in host
        cfg3 = SabnzbdConfig(host="https://nas.example.com/sabnzbd", port=443, api_key="test123")
        url3 = build_sabnzbd_url(cfg3, "version")
        self.assertTrue(url3.startswith("https://nas.example.com/sabnzbd/api?"))

    def test_url_base_resolution_for_prowlarr(self):
        from otix_server.usenet_utils import build_prowlarr_base_url

        # 1. Standard host with url_base
        cfg1 = ProwlarrConfig(host="192.168.1.50", port=9696, url_base="/prowlarr")
        base1 = build_prowlarr_base_url(cfg1)
        self.assertEqual(base1, "http://192.168.1.50:9696/prowlarr")

        # 2. Full URL in host
        cfg2 = ProwlarrConfig(host="https://proxy.example.com:8443/prowlarr", port=8443)
        base2 = build_prowlarr_base_url(cfg2)
        self.assertEqual(base2, "https://proxy.example.com:8443/prowlarr")

    def test_custom_domain_resolution(self):
        from otix_server.usenet_utils import build_sabnzbd_url, build_prowlarr_base_url

        # 1. User hosting SABnzbd on their own domain with subpath
        cfg_domain = SabnzbdConfig(host="server.diogodasilva.com/sabnzbd", port=8080, use_ssl=True, api_key="k123")
        url_domain = build_sabnzbd_url(cfg_domain, "version")
        self.assertTrue(url_domain.startswith("https://server.diogodasilva.com/sabnzbd/api?"))

        # 2. User with comma typo in domain name: server,diogodasilva.com/sabnzbd
        cfg_typo = SabnzbdConfig(host="server,diogodasilva.com/sabnzbd", port=8080, use_ssl=True, api_key="k123")
        url_typo = build_sabnzbd_url(cfg_typo, "version")
        self.assertTrue(url_typo.startswith("https://server.diogodasilva.com/sabnzbd/api?"))

        # 3. User custom domain with custom port
        cfg_custom_port = SabnzbdConfig(host="server.diogodasilva.com:8443/sabnzbd", port=8080, use_ssl=True, api_key="k123")
        url_custom_port = build_sabnzbd_url(cfg_custom_port, "version")
        self.assertTrue(url_custom_port.startswith("https://server.diogodasilva.com:8443/sabnzbd/api?"))

        # 4. Prowlarr on user custom domain root
        cfg_prow_domain = ProwlarrConfig(host="prowlarr.diogodasilva.com", port=9696, use_ssl=True, api_key="pk123")
        base_prow = build_prowlarr_base_url(cfg_prow_domain)
        self.assertEqual(base_prow, "https://prowlarr.diogodasilva.com")


if __name__ == "__main__":
    unittest.main()
