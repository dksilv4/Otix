"""Tests for OMDb async client (``core.providers.omdb.client``)."""

from __future__ import annotations

import asyncio

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

import core.providers.omdb.client as omdb_client_module
from core.providers.framework import (
    ApiCache,
    BaseProviderClient,
    ProviderCapability,
    registry,
)
from core.providers.framework.testing import FakeAsyncRedis
from core.providers.omdb import (
    BASE_URL,
    MANIFEST,
    OMDbProvider,
    close_http_client,
    get_http_client,
)

IMDB_TT = "tt0137523"


def _run(coro):
    return asyncio.run(coro)


class OMDbClientTests(SimpleTestCase):
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
        provider = OMDbProvider(redis=fake_redis, http_client=client)
        return provider, fake_redis, calls

    def test_manifest_and_registration(self):
        self.assertEqual(MANIFEST.id, "omdb")
        self.assertTrue(MANIFEST.has_capability(ProviderCapability.RATINGS))
        self.assertFalse(MANIFEST.has_capability(ProviderCapability.ARTWORK))
        self.assertEqual(registry.get("omdb"), MANIFEST)
        self.assertEqual(registry.get_client_class("omdb"), OMDbProvider)

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: httpx.Response(200, json={}))
        self.assertEqual(provider.name, "omdb")
        self.assertEqual(BASE_URL, "https://www.omdbapi.com")
        expected_rate = getattr(settings, "OMDB_GLOBAL_RPS_LIMIT", 5.0)
        self.assertEqual(provider.rate_limiter.default_rate, expected_rate)

    @override_settings(OMDB_API_KEY="test-key")
    def test_get_by_imdb_id_sends_key_and_returns_body(self):
        body = {
            "Title": "Fight Club",
            "imdbID": IMDB_TT,
            "Response": "True",
        }

        async def run():
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json=body))
            async with provider.http:
                result = await provider.get_by_imdb_id(IMDB_TT)

            self.assertEqual(result, body)
            req = calls[0]
            self.assertEqual(req.url.params["apikey"], "test-key")
            self.assertEqual(req.url.params["i"], IMDB_TT)

        _run(run())

    @override_settings(OMDB_API_KEY="test-key")
    def test_response_false_is_normalized_to_none(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: httpx.Response(200, json={"Response": "False", "Error": "Not found"})
            )
            async with provider.http:
                result = await provider.get_by_imdb_id(IMDB_TT)
            self.assertIsNone(result)

        _run(run())

    @override_settings(OMDB_API_KEY="test-key")
    def test_non_200_is_normalized_to_none(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: httpx.Response(503, text="Service Unavailable")
            )
            async with provider.http:
                result = await provider.get_by_imdb_id(IMDB_TT)
            self.assertIsNone(result)

        _run(run())

    @override_settings(OMDB_API_KEY="test-key")
    def test_invalid_json_is_normalized_to_none(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: httpx.Response(200, text="not json"))
            async with provider.http:
                result = await provider.get_by_imdb_id(IMDB_TT)
            self.assertIsNone(result)

        _run(run())

    def test_http_client_factory_and_close(self):
        client = get_http_client()
        try:
            self.assertEqual(str(client.base_url).rstrip("/"), BASE_URL.rstrip("/"))
        finally:
            _run(close_http_client())
            self.assertIsNone(omdb_client_module._shared_client)
