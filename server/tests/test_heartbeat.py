"""Heartbeat registry URL: host loopback vs Docker compose DNS."""

import os
import unittest
from unittest import mock

from otix_server.config import AppConfig, ServerSettings
from otix_server.heartbeat import resolve_registry_url


class ResolveRegistryUrlTests(unittest.TestCase):
    def setUp(self):
        self.config = AppConfig(
            server=ServerSettings(
                name="DK Game Storage Server",
                registry_url="http://127.0.0.1:8000/api",
            )
        )

    def test_host_run_keeps_loopback_registry(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("OTIX_REGISTRY_URL", None)
            self.assertEqual(
                resolve_registry_url(self.config, in_docker=False),
                "http://127.0.0.1:8000/api",
            )

    def test_docker_rewrites_loopback_to_compose_api(self):
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("OTIX_REGISTRY_URL", None)
            self.assertEqual(
                resolve_registry_url(self.config, in_docker=True),
                "http://api:8000/api",
            )

    def test_env_override_wins_in_docker(self):
        with mock.patch.dict(os.environ, {"OTIX_REGISTRY_URL": "http://api:8000/api"}):
            self.assertEqual(
                resolve_registry_url(self.config, in_docker=True),
                "http://api:8000/api",
            )

    def test_empty_registry_returns_empty_in_host_and_docker(self):
        empty_config = AppConfig(
            server=ServerSettings(
                name="DK Game Storage Server",
                registry_url="",
                enable_heartbeat=False,
            )
        )
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("OTIX_REGISTRY_URL", None)
            self.assertEqual(
                resolve_registry_url(empty_config, in_docker=False),
                "",
            )
            self.assertEqual(
                resolve_registry_url(empty_config, in_docker=True),
                "",
            )

    def test_default_server_settings_heartbeat_disabled(self):
        settings = ServerSettings()
        self.assertFalse(settings.enable_heartbeat)
        self.assertEqual(settings.registry_url, "")


class AnnounceHeartbeatTests(unittest.IsolatedAsyncioTestCase):
    async def test_heartbeat_skips_when_disabled(self):
        config = AppConfig(
            server=ServerSettings(
                registry_url="http://127.0.0.1:8000/api",
                enable_heartbeat=False,
            )
        )
        with mock.patch("otix_server.heartbeat.httpx.AsyncClient") as mock_client:
            from otix_server.heartbeat import announce_heartbeat
            await announce_heartbeat(config)
            mock_client.assert_not_called()

    async def test_heartbeat_skips_when_no_registry_url(self):
        config = AppConfig(
            server=ServerSettings(
                registry_url="",
                enable_heartbeat=True,
            )
        )
        with mock.patch.dict(os.environ, {}, clear=False):
            os.environ.pop("OTIX_REGISTRY_URL", None)
            with mock.patch("otix_server.heartbeat.httpx.AsyncClient") as mock_client:
                from otix_server.heartbeat import announce_heartbeat
                await announce_heartbeat(config)
                mock_client.assert_not_called()

