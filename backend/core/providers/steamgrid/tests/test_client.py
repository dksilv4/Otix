"""Tests for SteamGridDB async client (``core.providers.steamgrid.client``)."""

from __future__ import annotations

import asyncio
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

import core.providers.steamgrid.client as sg_client_module
from core.providers.framework import (
    ApiCache,
    BaseProviderClient,
    ProviderCapability,
    registry,
)
from core.providers.framework.testing import FakeAsyncRedis
from core.providers.steamgrid import (
    BASE_URL,
    MANIFEST,
    SteamGridDBError,
    SteamGridDBProvider,
    close_http_client,
    get_http_client,
)


def _run(coro):
    return asyncio.run(coro)


class SteamGridDBClientTests(SimpleTestCase):
    API_BASE_PATH = urlparse(BASE_URL).path

    def _full_path(self, path: str) -> str:
        return f"{self.API_BASE_PATH}{path}"

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
        provider = SteamGridDBProvider(redis=fake_redis, http_client=client)
        return provider, fake_redis, calls

    @staticmethod
    def _ok(data):
        return httpx.Response(200, json={"success": True, "data": data})

    @staticmethod
    def _not_found():
        return httpx.Response(404, json={"success": False, "errors": ["not found"]})

    @staticmethod
    def _error_body():
        return httpx.Response(200, json={"success": False, "errors": ["bad key"]})

    def test_manifest_and_registration(self):
        self.assertEqual(MANIFEST.id, "steamgrid")
        self.assertTrue(MANIFEST.has_capability(ProviderCapability.ARTWORK))
        self.assertFalse(MANIFEST.has_capability(ProviderCapability.RATINGS))
        self.assertIn("game", MANIFEST.supported_media_types)
        registered = registry.get("steamgrid")
        self.assertEqual(registered, MANIFEST)
        self.assertEqual(registry.get_client_class("steamgrid"), SteamGridDBProvider)

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        self.assertEqual(provider.name, "steamgrid")
        self.assertEqual(BASE_URL, "https://www.steamgriddb.com/api/v2")
        expected_rate = getattr(settings, "STEAMGRID_GLOBAL_RPS_LIMIT", 2.0)
        self.assertEqual(provider.rate_limiter.default_rate, expected_rate)

    @override_settings(STEAMGRID_API_KEY="sg-test-key")
    def test_every_request_carries_bearer_key(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: self._ok({}))
            async with provider.http:
                await provider.get_game_by_steam_app_id(292030)
            req = calls[0]
            self.assertEqual(req.method, "GET")
            self.assertEqual(req.url.path, self._full_path("/games/steam/292030"))
            self.assertEqual(req.headers["Authorization"], "Bearer sg-test-key")

        _run(run())

    def test_get_game_by_platform_id_returns_data_dict(self):
        async def run():
            game = {"id": 17, "name": "Rocket League", "types": ["steam"]}
            provider, _, _ = self._make_provider(lambda req: self._ok(game))
            async with provider.http:
                result = await provider.get_game_by_platform_id("steam", 252950)
            self.assertEqual(result, game)

        _run(run())

    def test_get_game_by_platform_id_takes_first_of_list(self):
        async def run():
            games = [{"id": 1}, {"id": 2}]
            provider, _, _ = self._make_provider(lambda req: self._ok(games))
            async with provider.http:
                result = await provider.get_game_by_platform_id("egs", "some-id")
            self.assertEqual(result, {"id": 1})

        _run(run())

    def test_get_game_by_platform_id_404_returns_none(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: self._not_found())
            async with provider.http:
                self.assertIsNone(await provider.get_game_by_platform_id("steam", 0))

        _run(run())

    def test_get_game_by_id(self):
        async def run():
            game = {"id": 4321, "name": "Hades"}
            provider, _, calls = self._make_provider(lambda req: self._ok(game))
            async with provider.http:
                result = await provider.get_game_by_id(4321)
            self.assertEqual(result, game)
            self.assertEqual(calls[0].url.path, self._full_path("/games/id/4321"))

        _run(run())

    def test_get_game_by_steam_app_id_delegates(self):
        async def run():
            game = {"id": 123, "name": "Portal"}
            provider, _, calls = self._make_provider(lambda req: self._ok(game))
            async with provider.http:
                result = await provider.get_game_by_steam_app_id(400)
            self.assertEqual(result, game)
            self.assertEqual(calls[0].url.path, self._full_path("/games/steam/400"))

        _run(run())

    def test_search_games_returns_data_list(self):
        async def run():
            matches = [{"id": 1, "name": "Cuphead", "types": ["steam", "epic"]}]
            provider, _, calls = self._make_provider(lambda req: self._ok(matches))
            async with provider.http:
                results = await provider.search_games("cuphead")
            self.assertEqual(results, matches)
            self.assertEqual(calls[0].url.path, self._full_path("/search/autocomplete/cuphead"))

        _run(run())

    def test_search_games_success_false_returns_empty(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: self._error_body())
            async with provider.http:
                self.assertEqual(await provider.search_games("zzz"), [])

        _run(run())

    def test_get_grids_passes_styles_and_dimensions(self):
        async def run():
            grids = [{"id": 9, "url": "http://x/1.jpg"}]
            provider, _, calls = self._make_provider(lambda req: self._ok(grids))
            async with provider.http:
                results = await provider.get_grids(17, styles="no_logo", dimensions="460x215")
            self.assertEqual(results, grids)
            self.assertEqual(calls[0].url.path, self._full_path("/grids/game/17"))
            self.assertEqual(calls[0].url.params.get("styles"), "no_logo")
            self.assertEqual(calls[0].url.params.get("dimensions"), "460x215")

        _run(run())

    def test_get_heroes_404_returns_empty(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: self._not_found())
            async with provider.http:
                self.assertEqual(await provider.get_heroes(17), [])

        _run(run())

    def test_get_logos_passes_styles(self):
        async def run():
            logos = [{"id": 11, "url": "http://x/logo.png"}]
            provider, _, calls = self._make_provider(lambda req: self._ok(logos))
            async with provider.http:
                results = await provider.get_logos(17, styles="official")
            self.assertEqual(results, logos)
            self.assertEqual(calls[0].url.path, self._full_path("/logos/game/17"))
            self.assertEqual(calls[0].url.params.get("styles"), "official")

        _run(run())

    def test_get_icons_error_success_returns_empty(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: self._error_body())
            async with provider.http:
                self.assertEqual(await provider.get_icons(17), [])

        _run(run())

    def test_resolve_success_raises_on_non_200(self):
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        with self.assertRaises(SteamGridDBError):
            provider._resolve_success(self._not_found())

    def test_resolve_success_raises_on_success_false_body(self):
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        with self.assertRaises(SteamGridDBError):
            provider._resolve_success(self._error_body())

    def test_http_client_factory_and_close(self):
        client = get_http_client()
        try:
            self.assertEqual(client.base_url, httpx.URL(f"{BASE_URL}/"))
            self.assertNotIn("Authorization", client.headers)
        finally:
            _run(close_http_client())
            self.assertIsNone(sg_client_module._shared_client)
