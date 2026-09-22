"""Tests for Fanart.tv async client (``core.providers.fanart.client``)."""

from __future__ import annotations

import asyncio

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

import core.providers.fanart.client as fanart_client_module
from core.providers.fanart import (
    BASE_URL,
    MANIFEST,
    FanartProvider,
    close_http_client,
    get_http_client,
)
from core.providers.framework import (
    ApiCache,
    BaseProviderClient,
    ProviderCapability,
    registry,
)
from core.providers.framework.testing import FakeAsyncRedis

TMDB_ID = 550
TVDB_ID = 73713


def _run(coro):
    return asyncio.run(coro)


class FanartClientTests(SimpleTestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls._orig_cache = BaseProviderClient._api_cache
        BaseProviderClient._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProviderClient._api_cache = cls._orig_cache
        super().tearDownClass()

    def _make_provider(self, handler):
        fake_redis = FakeAsyncRedis()
        calls: list[httpx.Request] = []

        def counting_handler(request: httpx.Request) -> httpx.Response:
            calls.append(request)
            return handler(request)

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=counting_handler),
            base_url=BASE_URL,
        )
        provider = FanartProvider(redis=fake_redis, http_client=client)
        return provider, fake_redis, calls

    def test_manifest_and_registration(self):
        self.assertEqual(MANIFEST.id, "fanart")
        self.assertTrue(MANIFEST.has_capability(ProviderCapability.ARTWORK))
        self.assertFalse(MANIFEST.has_capability(ProviderCapability.RATINGS))
        self.assertEqual(registry.get("fanart"), MANIFEST)
        self.assertEqual(registry.get_client_class("fanart"), FanartProvider)

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: httpx.Response(200, json={}))
        self.assertEqual(provider.name, "fanart")
        self.assertEqual(BASE_URL, "https://webservice.fanart.tv/v3")
        expected_rate = getattr(settings, "FANART_GLOBAL_RPS_LIMIT", 1.0)
        self.assertEqual(provider.rate_limiter.default_rate, expected_rate)

    @override_settings(FANART_API_KEY="test-key")
    def test_movie_images_hit_tmdb_path_with_api_key(self):
        body = {"name": "Fight Club", "hdmovielogo": []}

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/v3/movies/550")
            self.assertEqual(request.url.params["api_key"], "test-key")
            return httpx.Response(200, json=body)

        async def run():
            provider, _, _ = self._make_provider(handler)
            async with provider.http:
                result = await provider.get_movie_images(TMDB_ID)
            self.assertEqual(result, body)

        _run(run())

    @override_settings(FANART_API_KEY="test-key")
    def test_show_images_hit_tvdb_path(self):
        body = {"name": "Breaking Bad", "hdtvlogo": []}

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/v3/tv/73713")
            self.assertEqual(request.url.params["api_key"], "test-key")
            return httpx.Response(200, json=body)

        async def run():
            provider, _, _ = self._make_provider(handler)
            async with provider.http:
                result = await provider.get_show_images(TVDB_ID)
            self.assertEqual(result, body)

        _run(run())

    @override_settings(FANART_API_KEY="test-key")
    def test_non_200_is_normalized_to_none(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: httpx.Response(404, text="missing")
            )
            async with provider.http:
                result = await provider.get_movie_images(TMDB_ID)
            self.assertIsNone(result)

        _run(run())

    @override_settings(FANART_API_KEY="test-key")
    def test_non_dict_body_is_normalized_to_none(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: httpx.Response(200, json=[1, 2, 3])
            )
            async with provider.http:
                result = await provider.get_movie_images(TMDB_ID)
            self.assertIsNone(result)

        _run(run())

    def test_http_client_factory_and_close(self):
        client = get_http_client()
        try:
            self.assertEqual(str(client.base_url).rstrip("/"), BASE_URL.rstrip("/"))
        finally:
            _run(close_http_client())
            self.assertIsNone(fanart_client_module._shared_client)
