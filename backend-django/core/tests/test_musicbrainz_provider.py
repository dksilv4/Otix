"""Tests for the MusicBrainz async client (``core.providers.musicbrainz``).

Same doubles as the sibling provider tests: an in-memory async-Redis double
transcribing the token bucket and an ``httpx.MockTransport`` (no sockets). The
MusicBrainz base client is bound to ``…/ws/2``; the one non-MusicBrainz call,
``get_cover_art``, hits an absolute coverartarchive URL directly.

The headline behaviour under test is the provider's ``(429, 503)``
rate-limit override: MusicBrainz signals throttling with 503, which the
increment-33 ``BaseProvider`` treats as a rate limit (drain + ``RateLimitError``)
rather than a 5xx circuit-breaker failure.
"""

from __future__ import annotations

import asyncio
import time
from urllib.parse import urlparse

import httpx
from django.conf import settings
from django.test import SimpleTestCase, override_settings

from core.providers import musicbrainz as mbz_module
from core.providers.api_cache import ApiCache
from core.providers.base import BaseProvider, RateLimitError
from core.providers.musicbrainz import (
    BASE_URL,
    USER_AGENT,
    MusicBrainzProvider,
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


class MusicBrainzProviderTests(SimpleTestCase):
    """Drive ``MusicBrainzProvider`` methods and assert the issued requests."""

    # Base client is bound to MusicBrainz BASE_URL (…/ws/2); httpx merges the
    # relative method paths onto that prefix, so "/release/<id>" lands on
    # "/ws/2/release/<id>".
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
        provider = MusicBrainzProvider(redis=fake, http_client=client)
        return provider, fake, calls

    def _assert_get(self, request, path, **expected_params):
        self.assertEqual(request.method, "GET")
        self.assertEqual(request.url.path, self._full_path(path))
        params = request.url.params
        for key, value in expected_params.items():
            self.assertEqual(params.get(key), value)

    def test_provider_identity_and_throttle(self):
        provider, _, _ = self._make_provider(lambda req: httpx.Response(200, json={}))
        self.assertEqual(provider.name, "musicbrainz")
        self.assertEqual(BASE_URL, "https://musicbrainz.org/ws/2")
        # MBZ etiquette: ~1 req/s (rate == burst token bucket).
        self.assertEqual(provider.rate_limiter.default_rate, settings.MUSICBRAINZ_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider.rate_limiter.default_burst, settings.MUSICBRAINZ_GLOBAL_RPS_LIMIT)
        self.assertEqual(provider._rate_limit_statuses, (429, 503))

    def test_get_release_sends_inc_and_json_fmt(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"id": "mbid-1"})
            )
            async with provider.http:
                data = await provider.get_release("mbid-1", inc="recordings+labels")
                self.assertEqual(data, {"id": "mbid-1"})
                self._assert_get(
                    calls[0],
                    "/release/mbid-1",
                    inc="recordings+labels",
                    fmt="json",  # auto-merged by the client's _get.
                )

        _run(run())

    def test_browse_releases_by_artist_returns_list(self):
        async def run():
            payload = {"releases": [{"id": "r1"}, {"id": "r2"}]}
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json=payload))
            async with provider.http:
                releases = await provider.browse_releases_by_artist("artist-1", limit=25, offset=10)
                self.assertEqual([r["id"] for r in releases], ["r1", "r2"])
                self._assert_get(
                    calls[0],
                    "/release",
                    artist="artist-1",
                    limit="25",
                    offset="10",
                    inc="labels+genres",
                )

        _run(run())

    def test_search_artist_passes_encoded_query(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"artists": [{"id": "a1"}]})
            )
            async with provider.http:
                artists = await provider.search_artist("the cure")
                self.assertEqual(len(artists), 1)
                # httpx encodes the raw query once; params come back decoded.
                self._assert_get(calls[0], "/artist", query="the cure", limit="10")

        _run(run())

    def test_get_artist_sends_default_inc(self):
        async def run():
            provider, _, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"id": "a1"})
            )
            async with provider.http:
                await provider.get_artist("a1")
                self._assert_get(calls[0], "/artist/a1", inc="tags+genres+url-rels")

        _run(run())

    def test_browse_recordings_by_release(self):
        async def run():
            payload = {"recordings": [{"id": "rec-1"}]}
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json=payload))
            async with provider.http:
                recordings = await provider.browse_recordings_by_release("rel-1")
                self.assertEqual(recordings, [{"id": "rec-1"}])
                self._assert_get(calls[0], "/recording", release="rel-1", limit="100")

        _run(run())

    def test_get_cover_art_hits_absolute_url(self):
        async def run():
            payload = {"images": [{"thumbnails": {"small": "http://x/1.jpg"}}]}
            provider, _, calls = self._make_provider(lambda req: httpx.Response(200, json=payload))
            async with provider.http:
                data = await provider.get_cover_art("mbid-1")
                self.assertEqual(data["images"][0]["thumbnails"]["small"], "http://x/1.jpg")
                self.assertEqual(str(calls[0].url), "https://coverartarchive.org/release/mbid-1")
                self.assertEqual(calls[0].method, "GET")

        _run(run())

    def test_get_cover_art_returns_none_on_failure(self):
        async def run():
            provider, _, _ = self._make_provider(
                lambda req: httpx.Response(404, json={"error": "not found"})
            )
            async with provider.http:
                data = await provider.get_cover_art("mbid-missing")
                self.assertIsNone(data)

        _run(run())

    def test_503_is_rate_limit_not_circuit_failure(self):
        """MusicBrainz rate-limits with 503 — drain + RateLimitError, no open cb."""

        def handler(request):
            return httpx.Response(503, headers={"Retry-After": "5"}, json={})

        async def run():
            provider, fake, _ = self._make_provider(handler)
            async with provider.http:
                with self.assertRaises(RateLimitError) as cm:
                    await provider.get_release("mbid-1")
            self.assertEqual(cm.exception.retry_after, 5)
            # Rate-limit branch runs before the >=500 branch: no cb failure.
            self.assertEqual(provider.circuit_breaker._failure_count, 0)
            # Cooldown key set from Retry-After and token bucket drained.
            cooldown = await fake.ttl("ratelimit:musicbrainz:cooldown")
            self.assertGreater(cooldown, 0)
            self.assertLessEqual(cooldown, 5)
            bucket = "ratelimit:musicbrainz:musicbrainz"
            self.assertEqual(fake.storage[f"{bucket}:tokens"], 0)

        _run(run())

    def test_real_429_still_rate_limited(self):
        async def run():
            provider, _, _ = self._make_provider(lambda req: httpx.Response(429, json={}))
            async with provider.http:
                with self.assertRaises(RateLimitError):
                    await provider.search_artist("the cure")
            self.assertEqual(provider.circuit_breaker._failure_count, 0)

        _run(run())


class MusicBrainzHttpClientFactoryTests(SimpleTestCase):
    def test_factory_binds_base_url_user_agent_redirects_timeout(self):
        client = get_http_client()
        try:
            # httpx normalizes base_url to a trailing-slash form on construction.
            self.assertEqual(client.base_url, httpx.URL(f"{BASE_URL}/"))
            self.assertEqual(client.headers["User-Agent"], USER_AGENT)
            self.assertEqual(client.headers["Accept"], "application/json")
            self.assertTrue(client.follow_redirects)
            self.assertEqual(client.timeout.read, settings.MUSICBRAINZ_REQUEST_TIMEOUT_SECONDS)
        finally:
            _run(client.aclose())
            mbz_module._shared_client = None
            mbz_module._shared_client_loop_id = None

    @override_settings(MUSICBRAINZ_REQUEST_TIMEOUT_SECONDS=7.0)
    def test_factory_reads_overridden_timeout(self):
        client = get_http_client()
        try:
            self.assertEqual(client.timeout.read, 7.0)
        finally:
            _run(client.aclose())
            mbz_module._shared_client = None
            mbz_module._shared_client_loop_id = None
