"""Redis-backed token bucket rate limiter.

Uses a Lua script for atomic check-and-consume. Each provider gets its own
bucket key so limits are independent across integrations.
"""

from __future__ import annotations

import time

import redis.asyncio as aioredis

TOKEN_BUCKET_SCRIPT = """
local key = KEYS[1]
local now = tonumber(ARGV[1])
local rate = tonumber(ARGV[2])
local burst = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

-- Read current state
local tokens = tonumber(redis.call('GET', key .. ':tokens'))
local last = tonumber(redis.call('GET', key .. ':last'))

if tokens == nil or last == nil then
    tokens = burst
    last = now
end

-- Refill tokens based on elapsed time
local elapsed = now - last
if elapsed > 0 then
    tokens = math.min(burst, tokens + (elapsed * rate))
end

local allowed = 0
local wait = 0

if tokens >= requested then
    tokens = tokens - requested
    allowed = 1
else
    wait = (requested - tokens) / rate
end

redis.call('SET', key .. ':tokens', tokens)
redis.call('SET', key .. ':last', now)

return {allowed, tostring(tokens), tostring(wait)}
"""


class RateLimiter:
    def __init__(
        self,
        redis: aioredis.Redis,
        key_prefix: str = "ratelimit",
        default_rate: float = 10.0,
        default_burst: int = 20,
    ):
        self.redis = redis
        self.key_prefix = key_prefix
        self.default_rate = default_rate
        self.default_burst = default_burst
        self._script: aioredis.Script | None = None

    async def _get_script(self) -> aioredis.Script:
        if self._script is None:
            self._script = self.redis.register_script(TOKEN_BUCKET_SCRIPT)
        return self._script

    def _key(self, bucket: str) -> str:
        return f"{self.key_prefix}:{bucket}"

    async def acquire(
        self,
        bucket: str,
        tokens: int = 1,
        rate: float | None = None,
        burst: int | None = None,
    ) -> tuple[bool, float]:
        """Try to consume *tokens* from *bucket*.

        Returns (allowed, wait_seconds). When allowed is False, wait_seconds is
        the estimated time until enough tokens are available.
        """
        script = await self._get_script()
        key = self._key(bucket)
        now = time.monotonic()
        r = rate if rate is not None else self.default_rate
        b = burst if burst is not None else self.default_burst

        allowed, remaining, wait = await script(
            keys=[key],
            args=[now, r, b, tokens],
        )
        return bool(int(allowed)), float(wait)

    async def wait_and_acquire(
        self,
        bucket: str,
        tokens: int = 1,
        rate: float | None = None,
        burst: int | None = None,
        timeout: float = 30.0,
    ) -> bool:
        """Block until tokens are available or *timeout* expires."""
        import asyncio

        deadline = time.monotonic() + timeout
        while True:
            allowed, wait = await self.acquire(bucket, tokens, rate, burst)
            if allowed:
                return True
            if time.monotonic() + wait > deadline:
                return False
            await asyncio.sleep(wait)

    async def reset(self, bucket: str) -> None:
        key = self._key(bucket)
        await self.redis.delete(f"{key}:tokens", f"{key}:last")
