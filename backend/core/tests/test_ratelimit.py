"""Tests for the Redis token-bucket rate limiter (``core.ratelimit``).

Redis is never touched: ``core.ratelimit.get_async_client`` is patched with an
in-memory double whose ``register_script`` returns a callable that transcribes
``TOKEN_BUCKET_SCRIPT``'s bucket math over a shared store. That keeps the suite
portable (no broker) while exercising the observable contract — allow/deny up to
burst, refill over elapsed time, per-bucket isolation, reset, wait-until-available
and timeout. The real Lua runs against a live Redis in the dev stack; its logic
is what the fake mirrors here.
"""

from __future__ import annotations

import asyncio
import math
import time
from unittest import mock

from django.test import SimpleTestCase

from core import ratelimit
from core.ratelimit import RateLimiter


def _run(coro):
    return asyncio.run(coro)


class _FakeScript:
    """Transcribe ``TOKEN_BUCKET_SCRIPT`` over ``redis.storage``.

    Reads/writes the same ``{key}:tokens``/``{key}:last`` keys and applies the
    same refill-and-consume arithmetic the Lua runs on a real Redis.
    """

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
        window = math.ceil(burst / rate)
        ttl = max(window + 300, 300)
        self._redis.ttl[f"{key}:tokens"] = ttl
        self._redis.ttl[f"{key}:last"] = ttl
        return [allowed, str(tokens), str(wait)]


class FakeAsyncRedis:
    """Async ``redis.asyncio.Redis`` stand-in: ``register_script`` + ``delete``."""

    def __init__(self):
        self.storage: dict[str, float] = {}
        self.ttl: dict[str, int] = {}
        self.registered: list[str] = []

    def register_script(self, script):
        self.registered.append(script)
        return _FakeScript(self)

    async def delete(self, *keys):
        for key in keys:
            self.storage.pop(key, None)
            self.ttl.pop(key, None)
        return len(keys)


def _patched_limiter(**kwargs):
    fake = FakeAsyncRedis()
    limiter = RateLimiter(**kwargs)
    patcher = mock.patch.object(ratelimit, "get_async_client", return_value=fake)
    patcher.start()
    return limiter, fake, patcher


class RateLimiterBurstTests(SimpleTestCase):
    def test_allows_up_to_default_burst_then_denies(self):
        limiter, fake, patcher = _patched_limiter(default_rate=10.0, default_burst=3)

        async def run():
            results = [await limiter.acquire("tmdb") for _ in range(3)]
            denied = await limiter.acquire("tmdb")
            return results, denied

        results, denied = _run(run())
        patcher.stop()
        self.assertEqual([allowed for allowed, _ in results], [True, True, True])
        self.assertFalse(denied[0])
        self.assertGreater(denied[1], 0.0)
        # Every bucket key auto-expires (auto-expire is part of the script).
        # TTL = ceil(burst / rate) + 300 -> ceil(3 / 10) + 300 = 301.
        self.assertEqual(fake.ttl["ratelimit:tmdb:tokens"], 301)

    def test_per_call_burst_overrides_default(self):
        limiter, _fake, patcher = _patched_limiter(default_rate=1.0, default_burst=10)

        async def run():
            first = await limiter.acquire("steam", burst=1)
            second = await limiter.acquire("steam", burst=1)
            return first, second

        first, second = _run(run())
        patcher.stop()
        self.assertEqual(first, (True, 0.0))
        # No real time elapses between the two calls, so no refill accrues.
        self.assertFalse(second[0])

    def test_refill_accrues_with_elapsed_time(self):
        limiter, fake, patcher = _patched_limiter(default_rate=2.0, default_burst=5)

        async def run():
            results = [await limiter.acquire("igdb") for _ in range(5)]
            denied = await limiter.acquire("igdb")
            # Backdate the last refill by 1s at 2 tokens/s -> bucket refills +2.
            key = "ratelimit:igdb"
            fake.storage[f"{key}:last"] = time.monotonic() - 1.0
            replenished = await limiter.acquire("igdb")
            return results, denied, replenished

        results, denied, replenished = _run(run())
        patcher.stop()
        self.assertTrue(all(a for a, _ in results))
        self.assertFalse(denied[0])
        self.assertTrue(replenished[0])

    def test_wait_reported_when_denied_scales_with_rate(self):
        limiter, fake, patcher = _patched_limiter(default_rate=10.0, default_burst=1)

        async def run():
            await limiter.acquire("mb")
            allowed, wait = await limiter.acquire("mb")
            return allowed, wait

        allowed, wait = _run(run())
        patcher.stop()
        self.assertFalse(allowed)
        # Real time elapses between the two acquires, so a hair of the token
        # has refilled and wait is just under 0.1; a couple-decimal tolerance
        # still pins it to "roughly one refill period at this rate".
        self.assertAlmostEqual(wait, (1.0 / 10.0), places=2)


class RateLimiterIsolationTests(SimpleTestCase):
    def test_buckets_are_independent(self):
        limiter, _fake, patcher = _patched_limiter(default_rate=10.0, default_burst=1)

        async def run():
            first = await limiter.acquire("a")
            # Different bucket still has its own full burst available.
            other = await limiter.acquire("b")
            exhausted = await limiter.acquire("a")
            return first, other, exhausted

        first, other, exhausted = _run(run())
        patcher.stop()
        self.assertEqual(first, (True, 0.0))
        self.assertEqual(other, (True, 0.0))
        self.assertFalse(exhausted[0])

    def test_key_prefix_namespaces_keys(self):
        limiter, fake, patcher = _patched_limiter(key_prefix="ratelimit:youtube")

        async def run():
            await limiter.acquire("liked")
            return sorted(fake.storage)

        keys = _run(run())
        patcher.stop()
        self.assertEqual(keys, ["ratelimit:youtube:liked:last", "ratelimit:youtube:liked:tokens"])

    def test_reset_clears_only_that_bucket(self):
        limiter, fake, patcher = _patched_limiter(default_rate=10.0, default_burst=1)

        async def run():
            await limiter.acquire("a")
            await limiter.acquire("b")
            await limiter.reset("a")
            refreshed = await limiter.acquire("a")
            untouched = await limiter.acquire("b")
            return refreshed, untouched

        refreshed, untouched = _run(run())
        patcher.stop()
        self.assertTrue(refreshed[0])
        self.assertFalse(untouched[0])


class RateLimiterWaitTests(SimpleTestCase):
    def test_wait_and_acquire_blocks_until_refill(self):
        limiter, _fake, patcher = _patched_limiter(default_rate=10.0, default_burst=1)

        async def run():
            await limiter.acquire("plex")
            # First attempt inside wait_and_acquire is denied (~0.1s wait); the
            # real sleep lets a token refill, so the loop then succeeds.
            return await limiter.wait_and_acquire("plex", timeout=5.0)

        acquired = _run(run())
        patcher.stop()
        self.assertTrue(acquired)

    def test_wait_and_acquire_times_out_when_refill_too_slow(self):
        # rate 0.1 tokens/s -> a single token needs ~10s; a 0.1s timeout gives up.
        limiter, _fake, patcher = _patched_limiter(default_rate=0.1, default_burst=1)

        async def run():
            await limiter.acquire("slow")
            return await limiter.wait_and_acquire("slow", timeout=0.1)

        acquired = _run(run())
        patcher.stop()
        self.assertFalse(acquired)

    def test_client_seam_injects_the_fake(self):
        limiter, fake, patcher = _patched_limiter()

        async def run():
            await limiter.acquire("seam")
            return None

        _run(run())
        patcher.stop()
        # The limiter built its script from the patched client, not a real Redis.
        self.assertEqual(len(fake.registered), 1)


class RateLimiterExplicitClientTests(SimpleTestCase):
    def test_explicit_client_bypasses_the_seam(self):
        fake = FakeAsyncRedis()
        limiter = RateLimiter(client=fake)

        async def run():
            await limiter.acquire("direct")
            return None

        _run(run())
        self.assertIn("ratelimit:direct:tokens", fake.storage)
