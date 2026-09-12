"""Tests for the SteamGridDB async client (``core.providers.steamgrid``).

Same doubles as the sibling provider tests (in-memory async Redis double + an
``httpx.MockTransport`` over a client bound to the SteamGridDB base URL).

SteamGridDB authenticates per request — the API key is injected as a Bearer
header by the provider's ``_request`` override (not set on the shared client) —
and "not found"/empty answers come back as 4xx JSON that the lookup methods
normalize to ``None``/``[]`` rather than raising.
"""

from __future__ import annotations

import asyncio
import time
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from core.providers import steamgrid as sg_module
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.steamgrid import (
    BASE_URL,
    SteamGridDBError,
    SteamGridDBProvider,
    get_http_client,
)


def _run(coro):
    return asyncio.run(coro)


# ── In-memory async Redis double (transcribes the token-bucket script) ──


class _FakeScript:
    """Transcribe the token-bucket arithmetic over ``redis.storage``."""

    def __init__(self, redis):
        self._redis = redis

    async def __call__(self, *, keys=None, args=None):
        key = keys[0]
        now, rate, burst, requested = (float(a) for a in args)
        tokens = self._redis.storage.get(f"{key}:tokens")
        last = self._redis.storage.get(f"{key}:last")
        if tokens is None or last is None:
            tokens = burst
            last = now
        elapsed = now - last
        if elapsed > 0:
            tokens = min(burst, tokens + elapsed * rate)
        if tokens >= requested:
            tokens -= requested
            allowed = 1
            wait = 0.0
        else:
            allowed = 0
            wait = (requested - tokens) / rate
        self._redis.storage[f"{key}:tokens"] = tokens
        self._redis.storage[f"{key}:last"] = now
        return [allowed, str(tokens), str(wait)]


class FakeAsyncRedis:
    """``register_script`` (token bucket) + ``set``/``ttl``/``get``/``delete``."""

    def __init__(self):
        self.storage: dict[str, object] = {}
        self._expires: dict[str, float] = {}
        self.registered: list[str] = []

    def register_script(self, script):
        self.registered.append(script)
        return _FakeScript(self)

    async def set(self, key, value, ex=None):
        self.storage[key] = value
        if ex is None:
            self._expires.pop(key, None)
        else:
            self._expires[key] = time.monotonic() + ex

    async def get(self, key):
        if self._expired(key):
            return None
        return self.storage.get(key)

    async def ttl(self, key):
        if self._expired(key):
            return 0
        deadline = self._expires.get(key)
        if deadline is None:
            return -1
        remaining = deadline - time.monotonic()
        return int(remaining) if remaining > 0 else 0

    async def delete(self, *keys):
        for key in keys:
            self.storage.pop(key, None)
            self._expires.pop(key, None)
        return len(keys)

    def _expired(self, key) -> bool:
        deadline = self._expires.get(key)
        if deadline is not None and deadline <= time.monotonic():
            self.storage.pop(key, None)
            self._expires.pop(key, None)
            return True
        return False


class SteamGridDBProviderTests(SimpleTestCase):
    """Drive ``SteamGridDBProvider`` methods and assert the issued requests."""

    # Base client is bound to SteamGridDB BASE_URL (…/api/v2); httpx merges the
    # relative method paths onto that prefix, so "/games/steam/1" lands on
    # "/api/v2/games/steam/1".
    API_BASE_PATH = urlparse(BASE_URL).path

    def _full_path(self, path):
        return f"{self.API_BASE_PATH}{path}"

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Pin the shared ApiCache OFF so GETs always hit the transport.
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _make_provider(self, handler):
        """Provider over a MockTransport bound to BASE_URL; return (p, redis, calls)."""
        fake = FakeAsyncRedis()
        calls = []

        def counting_handler(request):
            calls.append(request)
            return handler(request)

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=counting_handler),
            base_url=BASE_URL,
        )
        provider = SteamGridDBProvider(redis=fake, http_client=client)
        return provider, fake, calls

    @staticmethod
    def _ok(data):
        return httpx.Response(200, json={"success": True, "data": data})

    @staticmethod
    def _not_found():
        return httpx.Response(404, json={"success": False, "errors": ["not found"]})

    @staticmethod
    def _error_body():
        return httpx.Response(200, json={"success": False, "errors": ["bad key"]})

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        self.assertEqual(provider.name, "steamgrid")
        self.assertEqual(BASE_URL, "https://www.steamgriddb.com/api/v2")
        self.assertEqual(provider.rate_limiter.default_rate, settings.STEAMGRID_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider.rate_limiter.default_burst, settings.STEAMGRID_GLOBAL_RPS_LIMIT)

    @override_settings(STEAMGRID_API_KEY="sg-test-key")
    def test_every_request_carries_bearer_key(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: self._ok({}))
            async with provider.http:
                await provider.get_game_by_steam_app_id(292030)
            req = calls[0]
            self.assertEqual(req.method, "GET")
            self.assertEqual(req.url.path, self._full_path("/games/steam/292030"))
            # Key injected per request by the provider's _request override.
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

    def test_get_icons_error_success_returns_empty(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: self._error_body())
            async with provider.http:
                self.assertEqual(await provider.get_icons(17), [])

        _run(run())

    def test_resolve_success_raises_on_non_200(self):
        # The public methods swallow SteamGridDBError into []/None, so exercise
        # the parser directly: a 4xx body (passes through BaseProvider) raises.
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        with self.assertRaises(SteamGridDBError):
            provider._resolve_success(self._not_found())

    def test_resolve_success_raises_on_success_false_body(self):
        provider, _, _ = self._make_provider(lambda req: self._ok([]))
        with self.assertRaises(SteamGridDBError):
            provider._resolve_success(self._error_body())


class SteamGridHttpClientFactoryTests(SimpleTestCase):
    def test_factory_binds_base_url_and_timeout_no_default_auth(self):
        client = get_http_client()
        try:
            # httpx normalizes base_url to a trailing-slash form on construction.
            self.assertEqual(client.base_url, httpx.URL(f"{BASE_URL}/"))
            self.assertEqual(client.timeout.read, settings.STEAMGRID_REQUEST_TIMEOUT_SECONDS)
            # Auth is per-request, never a client-level default header.
            self.assertNotIn("Authorization", client.headers)
        finally:
            _run(client.aclose())
            sg_module._shared_client = None
            sg_module._shared_client_loop_id = None

    @override_settings(STEAMGRID_REQUEST_TIMEOUT_SECONDS=6.0)
    def test_factory_reads_overridden_timeout(self):
        client = get_http_client()
        try:
            self.assertEqual(client.timeout.read, 6.0)
        finally:
            _run(client.aclose())
            sg_module._shared_client = None
            sg_module._shared_client_loop_id = None
