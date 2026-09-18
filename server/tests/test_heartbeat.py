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
