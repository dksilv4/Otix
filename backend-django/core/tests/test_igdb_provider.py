"""Tests for the IGDB async client (``core.providers.igdb``).

Same doubles as the sibling provider tests (in-memory async Redis double + an
``httpx.MockTransport``), plus a ``setex`` method on the Redis double because
IGDB caches raw search responses in Redis.

IGDB auth is two-part: every API request carries ``Client-ID`` + ``Bearer``
headers, and the access token is itself cached in Redis after a Twitch
client-credentials OAuth POST. The transport handler therefore routes on the
request host — ``id.twitch.tv`` answers token requests, ``api.igdb.com`` is the
Apicalypse API (all reads are POSTs with the query DSL in the body).
"""

from __future__ import annotations

import asyncio
import json
import time
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from core.providers import igdb as igdb_module
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider, RateLimitError
from core.providers.igdb import (
    OAUTH_URL,
    TOKEN_KEY,
    IGDBError,
    IGDBProvider,
    get_http_client,
)

# get_http_client hardcodes base_url "https://api.igdb.com/v4"; httpx merges a
# relative "/games" request onto that prefix → request.url.path "/v4/games".
_IGDB_API_PATH = "/v4"
_TWITCH_HOST = urlparse(OAUTH_URL).hostname


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
    """``register_script`` (token bucket) + set/get/setex/ttl/delete."""

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

    async def setex(self, key, seconds, value):
        self.storage[key] = value
        self._expires[key] = time.monotonic() + seconds

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


# ── Transport handler helpers ──────────────────────────────────────────


def _token_response(token: str) -> httpx.Response:
    return httpx.Response(200, json={"access_token": token, "expires_in": 3600})


class IGDBProviderTests(SimpleTestCase):
    """Drive ``IGDBProvider`` methods and assert issued requests + caching."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Pin the shared ApiCache OFF so requests always hit the transport
        # (IGDB reads are POSTs — never GET-cached — but pin for uniformity).
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _make_provider(self, api_handler, *, seed_token: bool = True, token="cached-token"):
        """Provider over a MockTransport; return (p, redis, api_calls).

        *api_handler* is called only for api.igdb.com requests; id.twitch.tv
        requests return a token response. When *seed_token* is set the cached
        token is pre-seeded so most tests never touch Twitch.
        """
        fake = FakeAsyncRedis()
        api_calls = []
        twitch_calls = []

        def handler(request):
            if request.url.host == _TWITCH_HOST:
                twitch_calls.append(request)
                n = len(twitch_calls)
                return _token_response(f"twitch-token-{n}")
            api_calls.append(request)
            return api_handler(request)

        if seed_token:
            fake.storage[TOKEN_KEY] = token

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=handler),
            base_url=f"https://api.igdb.com{_IGDB_API_PATH}",
        )
        provider = IGDBProvider(redis=fake, http_client=client)
        return provider, fake, api_calls

    def _path(self, path):
        return f"{_IGDB_API_PATH}{path}"

    @staticmethod
    def _games_json(rows):
        return httpx.Response(200, json=rows)

    # ── Identity / auth ───────────────────────────────────────────────

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: self._games_json([]))
        self.assertEqual(provider.name, "igdb")
        self.assertEqual(provider.rate_limiter.default_rate, settings.IGDB_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider.rate_limiter.default_burst, settings.IGDB_GLOBAL_RPS_LIMIT)
        # Token cache is shared with the rate limiter's redis.
        self.assertIs(provider._redis, provider.rate_limiter.redis)

    @override_settings(IGDB_CLIENT_ID="igdb-client-1", IGDB_CLIENT_SECRET="s3cret")
    def test_api_request_carries_client_id_and_bearer(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: self._games_json([{"id": 190}]),
                token="tok-abc",
            )
            async with provider.http:
                await provider.get_game(190)
            req = calls[0]
            self.assertEqual(req.method, "POST")
            self.assertEqual(req.url.path, self._path("/games"))
            self.assertEqual(req.headers["Client-ID"], "igdb-client-1")
            self.assertEqual(req.headers["Authorization"], "Bearer tok-abc")

        _run(run())

    def test_token_fetched_once_from_twitch_and_cached(self):
        async def run():
            provider, fake, calls = self._make_provider(
                lambda req: self._games_json([{"id": 190}]),
                seed_token=False,
            )
            async with provider.http:
                await provider.get_game(190)
                await provider.get_games([190])
            # Exactly one Twitch OAuth call for both requests…
            self.assertEqual(fake.storage[TOKEN_KEY], "twitch-token-1")
            # …and every api.igdb.com request reused the cached token.
            self.assertEqual({c.headers["Authorization"] for c in calls}, {"Bearer twitch-token-1"})
            self.assertEqual(len(calls), 2)

        _run(run())

    def test_401_invalidates_token_and_refetches_once(self):
        async def run():
            responses = [httpx.Response(401, json={}), httpx.Response(200, json=[{"id": 190}])]
            state = {"i": 0}

            def api_handler(request):
                resp = responses[state["i"]]
                state["i"] += 1
                return resp

            provider, fake, calls = self._make_provider(api_handler, seed_token=False)
            async with provider.http:
                result = await provider.get_game(190)
            # Two igdb attempts (401 then retry) + two Twitch fetches (original + refetch).
            self.assertEqual(len(calls), 2)
            self.assertEqual(calls[0].headers["Authorization"], "Bearer twitch-token-1")
            self.assertEqual(calls[1].headers["Authorization"], "Bearer twitch-token-2")
            self.assertEqual(result, {"id": 190})
            self.assertEqual(fake.storage[TOKEN_KEY], "twitch-token-2")

        _run(run())

    # ── Apicalypse reads ──────────────────────────────────────────────

    def test_get_games_posts_apicalypse_body(self):
        async def run():
            games = [{"id": 1, "name": "A"}, {"id": 2, "name": "B"}]
            provider, _, calls = self._make_provider(lambda req: self._games_json(games))
            async with provider.http:
                result = await provider.get_games([1, 2], fields="name")
            self.assertEqual(result, games)
            self.assertEqual(calls[0].url.path, self._path("/games"))
            self.assertEqual(calls[0].content, b"fields name; where id = (1,2); limit 2;")

        _run(run())

    def test_get_game_returns_first_or_none(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: self._games_json([{"id": 5, "name": "Portal"}])
            )
            async with provider.http:
                found = await provider.get_game(5)
            self.assertEqual(found, {"id": 5, "name": "Portal"})

            provider2, _, _ = self._make_provider(lambda req: self._games_json([]))
            async with provider2.http:
                self.assertIsNone(await provider2.get_game(0))

        _run(run())

    def test_get_popular_games_sorts_by_rating(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: self._games_json([]))
            async with provider.http:
                await provider.get_popular_games(limit=10)
            self.assertEqual(
                calls[0].content,
                b"fields *; sort aggregated_rating desc; "
                b"where aggregated_rating != null & rating_count > 10; limit 10;",
            )

        _run(run())

    def test_get_companies_and_franchise_bodies(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json=[]))
            async with provider.http:
                await provider.get_companies([1, 2])
                await provider.get_franchise(23)
            self.assertEqual(calls[0].url.path, self._path("/companies"))
            self.assertEqual(calls[0].content, b"fields name,slug; where id = (1,2); limit 2;")
            self.assertEqual(calls[1].url.path, self._path("/franchises"))
            self.assertEqual(calls[1].content, b"fields name,slug; where id = 23; limit 1;")

        _run(run())

    # ── Search caching ────────────────────────────────────────────────

    def test_search_games_cached_in_redis(self):
        async def run():
            matches = [{"id": 30, "name": "Zelda"}]
            provider, fake, calls = self._make_provider(lambda req: self._games_json(matches))
            async with provider.http:
                first = await provider.search_games("zelda")
                second = await provider.search_games("zelda")
            self.assertEqual(first, matches)
            self.assertEqual(second, matches)
            # Second identical call was served from Redis — one transport hit.
            self.assertEqual(len(calls), 1)
            cache_key = provider._search_cache_key("relevance", "zelda", 50, None)
            self.assertIn(cache_key, fake.storage)
            self.assertEqual(json.loads(fake.storage[cache_key]), matches)

        _run(run())

    def test_search_by_name_escapes_body(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: self._games_json([]))
            async with provider.http:
                await provider.search_games_by_name('For "The" King')
            self.assertEqual(
                calls[0].content,
                b'fields *; where name ~ *"For \\"The\\" King"*; limit 20;',
            )

        _run(run())

    # ── External id mapping ───────────────────────────────────────────

    def test_lookup_external_game_ids_maps_uid_to_game(self):
        async def run():
            rows = [{"uid": "400", "game": 19}]
            provider, _, calls = self._make_provider(lambda req: self._games_json(rows))
            async with provider.http:
                mapping = await provider.lookup_external_game_ids(1, ["400"])
            self.assertEqual(mapping, {"400": 19})
            self.assertEqual(calls[0].url.path, self._path("/external_games"))
            self.assertEqual(
                calls[0].content,
                b'fields uid,game; where external_game_source = 1 & uid = ("400"); limit 1;',
            )

        _run(run())

    def test_lookup_steam_app_ids_coerces_int_keys(self):
        async def run():
            rows = [{"uid": "400", "game": 19}, {"uid": "620", "game": 71}]
            provider, _, _ = self._make_provider(lambda req: self._games_json(rows))
            async with provider.http:
                mapping = await provider.lookup_steam_app_ids([400, 620])
            self.assertEqual(mapping, {400: 19, 620: 71})

        _run(run())

    def test_lookup_external_game_ids_empty_no_request(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: self._games_json([]))
            async with provider.http:
                self.assertEqual(await provider.lookup_external_game_ids(1, []), {})
            self.assertEqual(calls, [])

        _run(run())

    # ── Error handling ────────────────────────────────────────────────

    def test_4xx_raises_igdb_error(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: httpx.Response(400, json={}))
            async with provider.http:
                with self.assertRaises(IGDBError):
                    await provider.get_games([1])

        _run(run())

    def test_429_rate_limited_raises_rate_limit_error(self):
        async def run():
            provider, fake, _ = self._make_provider(
                lambda req: httpx.Response(429, headers={"Retry-After": "3"}, json={})
            )
            async with provider.http:
                with self.assertRaises(RateLimitError) as ctx:
                    await provider.get_games([1])
            self.assertEqual(ctx.exception.retry_after, 3)

        _run(run())


class IGDBHttpClientFactoryTests(SimpleTestCase):
    def test_factory_binds_base_url_and_timeout(self):
        client = get_http_client()
        try:
            self.assertEqual(client.base_url, httpx.URL("https://api.igdb.com/v4/"))
            self.assertEqual(client.timeout.read, settings.IGDB_REQUEST_TIMEOUT_SECONDS)
            # Auth headers are per-request, never client-level defaults.
            self.assertNotIn("Client-ID", client.headers)
            self.assertNotIn("Authorization", client.headers)
        finally:
            _run(client.aclose())
            igdb_module._shared_client = None
            igdb_module._shared_client_loop_id = None

    @override_settings(IGDB_REQUEST_TIMEOUT_SECONDS=11.0)
    def test_factory_reads_overridden_timeout(self):
        client = get_http_client()
        try:
            self.assertEqual(client.timeout.read, 11.0)
        finally:
            _run(client.aclose())
            igdb_module._shared_client = None
            igdb_module._shared_client_loop_id = None
