"""Tests for the async provider-client HTTP machinery (``core.providers``).

No Redis broker or real network: the circuit breaker and ``ApiCache`` are pure
Python; ``BaseProvider`` runs against an ``httpx.MockTransport`` (canned
responses, no sockets) with an in-memory async-Redis double transcribing the
``TOKEN_BUCKET_SCRIPT`` math over a dict store (the same convention as
``core/tests/test_ratelimit.py``) so rate-limit cooldown/drain keys are
observable. Redis is never touched.
"""

from __future__ import annotations

import asyncio
import os
import tempfile
import time
from pathlib import Path

import httpx
from django.test import SimpleTestCase

from core.providers.api_cache import ApiCache
from core.providers.base import (
    BaseProvider,
    CircuitOpenError,
    ProviderError,
    RateLimitError,
)
from core.providers.circuit_breaker import CircuitBreaker, State


def _run(coro):
    return asyncio.run(coro)


# ── In-memory async Redis double (script transcription + cooldown/drain) ──


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


class CircuitBreakerTests(SimpleTestCase):
    def test_closed_flows_until_failure_threshold_opens(self):
        cb = CircuitBreaker(name="tmdb", failure_threshold=3, recovery_timeout=30.0)
        for _ in range(2):
            cb.record_failure()
        # Below threshold still CLOSED and allowing.
        self.assertEqual(cb.state, State.CLOSED)
        self.assertTrue(cb.allow_request())
        cb.record_failure()
        self.assertEqual(cb.state, State.OPEN)
        self.assertFalse(cb.allow_request())

    def test_success_in_closed_resets_failure_count(self):
        cb = CircuitBreaker(name="tmdb", failure_threshold=3)
        cb.record_failure()
        cb.record_failure()
        cb.record_success()
        self.assertEqual(cb._failure_count, 0)
        # Two more failures don't open (count restarted from 0).
        cb.record_failure()
        cb.record_failure()
        self.assertEqual(cb.state, State.CLOSED)

    def test_half_open_recovery_probe_after_timeout(self):
        cb = CircuitBreaker(name="tmdb", failure_threshold=1, recovery_timeout=30.0)
        cb.record_failure()
        self.assertEqual(cb.state, State.OPEN)
        # Backdate so the recovery window has elapsed -> next access is HALF_OPEN.
        cb._opened_at = time.monotonic() - 31.0
        self.assertEqual(cb.state, State.HALF_OPEN)
        # One probe is allowed; a second within the window is refused.
        self.assertTrue(cb.allow_request())
        self.assertFalse(cb.allow_request())
        # A successful probe closes the breaker.
        cb.record_success()
        self.assertEqual(cb.state, State.CLOSED)

    def test_half_open_failure_reopens_immediately(self):
        cb = CircuitBreaker(name="tmdb", failure_threshold=1, recovery_timeout=30.0)
        cb.record_failure()
        cb._opened_at = time.monotonic() - 31.0
        self.assertEqual(cb.state, State.HALF_OPEN)
        self.assertTrue(cb.allow_request())
        cb.record_failure()
        self.assertEqual(cb.state, State.OPEN)


class ApiCacheTests(SimpleTestCase):
    def setUp(self):
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.cache_dir = Path(self._tmp.name)

    def _cache(self, **kwargs):
        kwargs.setdefault("cache_dir", self.cache_dir)
        return ApiCache(**kwargs)

    def test_set_then_get_roundtrips_json(self):
        cache = self._cache()
        cache.set("tmdb", "https://x/movie/1", {"id": 1, "title": "Alien"})
        data = cache.get("tmdb", "https://x/movie/1")
        self.assertEqual(data, {"id": 1, "title": "Alien"})
        # A different URL is a miss.
        self.assertIsNone(cache.get("tmdb", "https://x/movie/2"))

    def test_disabled_cache_is_transparent(self):
        cache = self._cache(enabled=False)
        cache.set("tmdb", "https://x/movie/1", {"id": 1})
        self.assertIsNone(cache.get("tmdb", "https://x/movie/1"))
        self.assertFalse(list(self.cache_dir.rglob("*.json")))

    def test_expired_entry_returns_none(self):
        cache = self._cache(ttl_hours=1)
        cache.set("tmdb", "https://x/movie/1", {"id": 1})
        path = cache._cache_path("tmdb", "https://x/movie/1")
        # Backdate the file past the 1h TTL.
        past = time.time() - 2 * 3600
        os.utime(path, (past, past))
        self.assertIsNone(cache.get("tmdb", "https://x/movie/1"))

    def test_corrupt_file_returns_none(self):
        cache = self._cache()
        path = cache._cache_path("tmdb", "https://x/movie/1")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("{not json")
        self.assertIsNone(cache.get("tmdb", "https://x/movie/1"))

    def test_clear_counts_removed_files(self):
        cache = self._cache()
        cache.set("tmdb", "https://x/1", {"id": 1})
        cache.set("tmdb", "https://x/2", {"id": 2})
        self.assertEqual(cache.clear("tmdb"), 2)
        self.assertIsNone(cache.get("tmdb", "https://x/1"))


class BaseProviderTests(SimpleTestCase):
    """Drive ``BaseProvider._get`` against canned ``httpx.MockTransport`` responses."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        # Pin the shared ApiCache OFF so ordinary provider tests always hit the
        # transport (no accidental cross-test cache pollution from settings).
        cls._orig_cache = BaseProvider._api_cache
        BaseProvider._api_cache = ApiCache(enabled=False)

    @classmethod
    def tearDownClass(cls):
        BaseProvider._api_cache = cls._orig_cache
        super().tearDownClass()

    def _make_provider(self, handler, **provider_kwargs):
        """Build a provider over a MockTransport; return (provider, fake_redis, transport)."""
        fake = FakeAsyncRedis()
        calls = []

        def counting_handler(request):
            calls.append(request)
            return handler(request)

        transport = httpx.MockTransport(handler=counting_handler)
        kwargs = {"rate": 100.0, "burst": 100, "circuit_threshold": 3, "circuit_recovery": 5.0}
        kwargs.update(provider_kwargs)
        client = httpx.AsyncClient(transport=transport)
        provider = BaseProvider("tmdb", client, redis=fake, **kwargs)
        return provider, fake, calls

    def test_success_returns_json_and_tracks_success(self):
        async def run():
            provider, fake, calls = self._make_provider(
                lambda req: httpx.Response(200, json={"ok": True})
            )
            async with provider.http:
                response = await provider._get("https://api.example.test/movie/1")
                self.assertEqual(response.json(), {"ok": True})
                self.assertEqual(len(calls), 1)
                self.assertEqual(provider.circuit_breaker.state, State.CLOSED)
                self.assertEqual(provider.circuit_breaker._failure_count, 0)

        _run(run())

    def test_429_sets_cooldown_and_drains_bucket(self):
        async def run():
            provider, fake, _ = self._make_provider(
                lambda req: httpx.Response(429, json={}, headers={"Retry-After": "5"})
            )
            async with provider.http:
                with self.assertRaises(RateLimitError) as ctx:
                    await provider._get("https://api.example.test/movie/1")
                self.assertEqual(ctx.exception.retry_after, 5)
                # Cooldown key written with ~5s TTL; bucket drained to zero.
                cooldown_key = f"ratelimit:{provider.name}:cooldown"
                bucket_key = f"{provider.rate_limiter.key_prefix}:{provider.name}"
                self.assertEqual(await fake.get(cooldown_key), "1")
                remaining = await fake.ttl(cooldown_key)
                self.assertGreater(remaining, 0)
                self.assertLessEqual(remaining, 5)
                self.assertEqual(fake.storage[f"{bucket_key}:tokens"], 0)
                # check_cooldown reports the remaining window.
                self.assertGreater(await BaseProvider.check_cooldown(fake, "tmdb"), 0)

        _run(run())

    def test_server_errors_open_circuit_then_reject_before_http(self):
        async def run():
            provider, fake, calls = self._make_provider(lambda req: httpx.Response(500, json={}))
            async with provider.http:
                for _ in range(3):
                    with self.assertRaises(httpx.HTTPStatusError):
                        await provider._get("https://api.example.test/fail")
                self.assertEqual(provider.circuit_breaker.state, State.OPEN)
                self.assertEqual(len(calls), 3)
                # Next request is refused without touching the transport.
                with self.assertRaises(CircuitOpenError):
                    await provider._get("https://api.example.test/fail")
                self.assertEqual(len(calls), 3)

        _run(run())

    def test_client_error_passes_through_without_recording(self):
        async def run():
            provider, fake, calls = self._make_provider(lambda req: httpx.Response(404, json={}))
            async with provider.http:
                response = await provider._get("https://api.example.test/missing")
                self.assertEqual(response.status_code, 404)
                # 4xx neither records success nor failure.
                self.assertEqual(provider.circuit_breaker.state, State.CLOSED)
                self.assertEqual(provider.circuit_breaker._failure_count, 0)

        _run(run())

    def test_network_exception_records_failure_and_raises_provider_error(self):
        def boom_handler(request):
            raise RuntimeError("boom")

        async def run():
            provider, fake, _ = self._make_provider(boom_handler)
            async with provider.http:
                with self.assertRaises(ProviderError):
                    await provider._get("https://api.example.test/down")
                self.assertEqual(provider.circuit_breaker._failure_count, 1)

        _run(run())

    def test_cache_hit_serves_response_without_network(self):
        with tempfile.TemporaryDirectory() as tmp:
            cache = ApiCache(cache_dir=tmp)
            BaseProvider._api_cache = cache
            self.addCleanup(self._restore_cache)

            async def run():
                provider, fake, calls = self._make_provider(
                    lambda req: httpx.Response(200, json={"id": 1})
                )
                async with provider.http:
                    first = await provider._get("https://api.example.test/movie/1")
                    self.assertEqual(first.json(), {"id": 1})
                    second = await provider._get("https://api.example.test/movie/1")
                    self.assertEqual(second.json(), {"id": 1})
                    # Only the first call reached the transport.
                    self.assertEqual(len(calls), 1)

            _run(run())

    def test_cache_key_folds_query_params_so_pages_do_not_collide(self):
        with tempfile.TemporaryDirectory() as tmp:
            BaseProvider._api_cache = ApiCache(cache_dir=tmp)
            self.addCleanup(self._restore_cache)

            def page_handler(request):
                page = request.url.params.get("page")
                return httpx.Response(200, json={"page": int(page), "id": int(page)})

            async def run():
                provider, fake, calls = self._make_provider(page_handler)
                async with provider.http:
                    seen = []
                    for n in (1, 2, 3):
                        resp = await provider._get(
                            "https://api.example.test/movie/popular", params={"page": n}
                        )
                        seen.append(resp.json())
                    # Every distinct page reached the transport (no cache collision).
                    self.assertEqual(len(calls), 3)
                    self.assertEqual([r["page"] for r in seen], [1, 2, 3])

            _run(run())

    def test_half_open_cache_probe_resolves_breaker(self):
        with tempfile.TemporaryDirectory() as tmp:
            BaseProvider._api_cache = ApiCache(cache_dir=tmp)
            self.addCleanup(self._restore_cache)

            def handler(request):
                if request.url.path.endswith("/movie/1"):
                    return httpx.Response(200, json={"id": 1})
                return httpx.Response(500, json={})

            async def run():
                provider, fake, calls = self._make_provider(handler, circuit_recovery=0.05)
                async with provider.http:
                    # Prime the cache and drive the breaker OPEN.
                    await provider._get("https://api.example.test/movie/1")
                    for _ in range(3):
                        with self.assertRaises(httpx.HTTPStatusError):
                            await provider._get("https://api.example.test/down")
                    self.assertEqual(provider.circuit_breaker.state, State.OPEN)
                    # Recovery window elapses -> next access is HALF_OPEN and the
                    # cached response is treated as a healthy probe (no network).
                    provider.circuit_breaker._opened_at = time.monotonic() - 0.1
                    calls_before = len(calls)
                    probe = await provider._get("https://api.example.test/movie/1")
                    self.assertEqual(probe.json(), {"id": 1})
                    self.assertEqual(len(calls), calls_before)  # served from cache
                    self.assertEqual(provider.circuit_breaker.state, State.CLOSED)

            _run(run())

    def test_posts_are_never_cached(self):
        with tempfile.TemporaryDirectory() as tmp:
            BaseProvider._api_cache = ApiCache(cache_dir=tmp)
            self.addCleanup(self._restore_cache)

            async def run():
                provider, fake, calls = self._make_provider(
                    lambda req: httpx.Response(200, json={"ok": True})
                )
                async with provider.http:
                    await provider._post("https://api.example.test/write")
                    await provider._post("https://api.example.test/write")
                    self.assertEqual(len(calls), 2)

            _run(run())

    def _restore_cache(self):
        BaseProvider._api_cache = ApiCache(enabled=False)


class ProviderMetricsTests(SimpleTestCase):
    def test_circuit_breaker_gauge_tracks_state_by_provider(self):
        from core.providers.metrics import CIRCUIT_BREAKER_STATE

        CIRCUIT_BREAKER_STATE.set(0.0, provider="tmdb")
        CIRCUIT_BREAKER_STATE.set(1.0, provider="igdb")
        self.assertEqual(CIRCUIT_BREAKER_STATE.value(provider="tmdb"), 0.0)
        self.assertEqual(CIRCUIT_BREAKER_STATE.value(provider="igdb"), 1.0)
        # Label-independent value returns the default (0) — labels are isolated.
        self.assertEqual(CIRCUIT_BREAKER_STATE.value(), 0.0)

    def test_track_api_call_records_latency(self):
        from core.providers.metrics import SYNC_API_CALL_DURATION, track_api_call

        before = SYNC_API_CALL_DURATION.count
        with track_api_call("tmdb"):
            pass
        self.assertEqual(SYNC_API_CALL_DURATION.count, before + 1)
        self.assertGreaterEqual(SYNC_API_CALL_DURATION.avg_seconds, 0.0)
