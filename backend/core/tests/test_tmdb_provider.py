"""Tests for the concrete TMDB async client (``core.providers.tmdb``).

Like ``test_providers.py``, requests run against an ``httpx.MockTransport`` (no
sockets) whose client carries ``base_url=TMDBProvider.BASE_URL`` so the client's
relative paths resolve, and the token bucket runs on an in-memory async-Redis
double. The assertions check the request method/path/params/body each method
issues rather than the canned response, plus the write endpoints' throttled
path and ``raise_for_status`` behaviour.
"""

from __future__ import annotations

import asyncio
import json
import time
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from core.providers import tmdb as tmdb_module
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider
from core.providers.tmdb import TMDBProvider, get_http_client


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


class TMDBProviderTests(SimpleTestCase):
    """Drive ``TMDBProvider`` methods and assert the issued requests."""

    # Base client is bound to TMDBProvider.BASE_URL (…/3); httpx merges the
    # client's relative method paths onto that prefix, so a request for
    # "/movie/550" lands on "/3/movie/550".
    API_BASE_PATH = urlparse(TMDBProvider.BASE_URL).path

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
        """Provider over a MockTransport with the TMDB base URL; return (p, redis, calls)."""
        fake = FakeAsyncRedis()
        calls = []

        def counting_handler(request):
            calls.append(request)
            return handler(request)

        client = httpx.AsyncClient(
            transport=httpx.MockTransport(handler=counting_handler),
            base_url=TMDBProvider.BASE_URL,
        )
        provider = TMDBProvider(redis=fake, http_client=client)
        return provider, fake, calls

    def _assert_get(self, request, path, **expected_params):
        self.assertEqual(request.method, "GET")
        self.assertEqual(request.url.path, self._full_path(path))
        params = request.url.params
        for key, value in expected_params.items():
            self.assertEqual(params.get(key), value)

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: httpx.Response(200, json={}))
        self.assertEqual(provider.name, "tmdb")
        self.assertEqual(TMDBProvider.BASE_URL, "https://api.themoviedb.org/3")
        # Reads run at TMDB's default 40 rps (rate == burst token bucket).
        self.assertEqual(provider.rate_limiter.default_rate, settings.TMDB_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider.rate_limiter.default_burst, settings.TMDB_GLOBAL_RPS_LIMIT)

    def test_get_movie_sends_language_and_append(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"id": 550})
            )
            async with provider.http:
                data = await provider.get_movie(550)
                self.assertEqual(data, {"id": 550})
                self.assertEqual(len(calls), 1)
                self._assert_get(
                    calls[0],
                    "/movie/550",
                    language="en-US",
                    append_to_response="credits,external_ids,images,videos,release_dates,keywords",
                    include_image_language="en,null",
                )

        _run(run())

    def test_get_show_append_includes_seasons_and_ratings(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"id": 1399})
            )
            async with provider.http:
                data = await provider.get_show(1399)
                self.assertEqual(data["id"], 1399)
                self._assert_get(
                    calls[0],
                    "/tv/1399",
                    append_to_response="credits,external_ids,images,videos,keywords,seasons,content_ratings",
                    include_image_language="en,null",
                )

        _run(run())

    def test_get_movie_images_sends_no_language(self):
        async def run():
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json={}))
            async with provider.http:
                await provider.get_movie_images(550)
                self.assertEqual(calls[0].method, "GET")
                self.assertEqual(calls[0].url.path, self._full_path("/movie/550/images"))
                # No language param: language-filtered drops textless posters.
                self.assertNotIn("language", calls[0].url.params)

        _run(run())

    def test_paginated_list_passes_page_and_language(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"page": 3})
            )
            async with provider.http:
                data = await provider.get_movie_popular(page=3, language="fr-FR")
                self.assertEqual(data["page"], 3)
                self._assert_get(calls[0], "/movie/popular", page="3", language="fr-FR")

        _run(run())

    def test_search_multi_passes_query(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"results": []})
            )
            async with provider.http:
                data = await provider.search_multi("alien", page=2)
                self.assertEqual(data["results"], [])
                self._assert_get(
                    calls[0], "/search/multi", query="alien", page="2", language="en-US"
                )

        _run(run())

    def test_find_by_external_id_passes_source(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"movie_results": []})
            )
            async with provider.http:
                await provider.find_by_external_id("tt0078748")
                self._assert_get(
                    calls[0], "/find/tt0078748", external_source="imdb_id", language="en-US"
                )

        _run(run())

    def test_discover_merges_params_and_language_into_path(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"results": []})
            )
            async with provider.http:
                await provider.discover("tv", {"with_genres": "18"}, language="es-ES")
                self.assertEqual(calls[0].url.path, self._full_path("/discover/tv"))
                params = calls[0].url.params
                self.assertEqual(params.get("language"), "es-ES")
                self.assertEqual(params.get("with_genres"), "18")

        _run(run())

    def test_account_endpoint_carries_session_api_key_and_sort(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"results": []})
            )
            async with provider.http:
                await provider.get_rated_movies(account_id=1, session_id="sess-abc")
                req = calls[0]
                self.assertEqual(req.url.path, self._full_path("/account/1/rated/movies"))
                params = req.url.params
                self.assertIn("api_key", params)
                self.assertEqual(params.get("session_id"), "sess-abc")
                self.assertEqual(params.get("sort_by"), "created_at.desc")
                self.assertEqual(params.get("page"), "1")

        _run(run())

    def test_rate_movie_posts_value_through_throttled_path(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"success": True})
            )
            async with provider.http:
                data = await provider.rate_movie(550, 8.5, "sess-abc")
                self.assertEqual(data, {"success": True})
                req = calls[0]
                self.assertEqual(req.method, "POST")
                self.assertEqual(req.url.path, self._full_path("/movie/550/rating"))
                self.assertEqual(req.url.params.get("session_id"), "sess-abc")
                self.assertEqual(json.loads(req.content), {"value": 8.5})
                # A successful write recorded breaker success.
                self.assertEqual(provider.circuit_breaker._failure_count, 0)

        _run(run())

    def test_add_to_watchlist_posts_media_type_body(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"success": True})
            )
            async with provider.http:
                await provider.add_to_watchlist(
                    account_id=1, session_id="s", media_type="movie", media_id=550
                )
                req = calls[0]
                self.assertEqual(req.method, "POST")
                self.assertEqual(req.url.path, self._full_path("/account/1/watchlist"))
                self.assertEqual(
                    json.loads(req.content),
                    {"media_type": "movie", "media_id": 550, "watchlist": True},
                )

        _run(run())

    def test_delete_rating_uses_delete(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"success": True})
            )
            async with provider.http:
                await provider.delete_tv_rating(1399, "sess-abc")
                req = calls[0]
                self.assertEqual(req.method, "DELETE")
                self.assertEqual(req.url.path, self._full_path("/tv/1399/rating"))
                self.assertEqual(req.url.params.get("session_id"), "sess-abc")

        _run(run())

    def test_write_endpoint_raises_http_error_status(self):
        def handler(request):
            return httpx.Response(401, json={"status_message": "denied"})

        async def run():
            provider, _, _ = self._make_provider(handler)
            async with provider.http:
                with self.assertRaises(httpx.HTTPStatusError):
                    await provider.rate_movie(550, 8.5, "sess-abc")

        _run(run())


class TMDBHttpClientFactoryTests(SimpleTestCase):
    def test_factory_binds_base_url_bearer_and_timeout(self):
        client = get_http_client()
        try:
            # httpx normalizes base_url to a trailing-slash form on construction.
            self.assertEqual(client.base_url, httpx.URL(f"{TMDBProvider.BASE_URL}/"))
            self.assertEqual(client.headers["Authorization"], f"Bearer {settings.TMDB_RAT}")
            self.assertEqual(client.headers["Accept"], "application/json")
            self.assertEqual(client.timeout.read, settings.TMDB_REQUEST_TIMEOUT_SECONDS)
        finally:
            _run(client.aclose())
            tmdb_module._shared_client = None
            tmdb_module._shared_client_loop_id = None

    @override_settings(TMDB_RAT="rat-override-token", TMDB_REQUEST_TIMEOUT_SECONDS=9.0)
    def test_factory_reads_overridden_settings(self):
        client = get_http_client()
        try:
            self.assertEqual(client.headers["Authorization"], "Bearer rat-override-token")
            self.assertEqual(client.timeout.read, 9.0)
        finally:
            _run(client.aclose())
            tmdb_module._shared_client = None
            tmdb_module._shared_client_loop_id = None
