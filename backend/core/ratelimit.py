"""Redis-backed token-bucket rate limiter (async, atomic via Lua).

Mirrors the legacy ``otix.lib.rate_limiter`` (backend/) so the async provider
clients that throttle through it port over without changing semantics. Each
bucket gets its own key (``{key_prefix}:{bucket}``) so rate limits are
independent across integrations, and refill/consume runs in one atomic Lua
script so concurrent workers cannot oversubscribe a shared quota.

Like the rest of ``core`` this is app-agnostic infra: nothing here is an
installed app. The async Redis client comes from ``core.redis.get_async_client``
(patched with a fake in tests, per the core.sse/core.progress convention); a
caller that already holds a client may pass it explicitly.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any

from core.redis import get_async_client

logger = logging.getLogger(__name__)

# Single atomic check-and-consume: read state, refill on elapsed time, take
# tokens or return the estimated wait, persist, and expire idle keys.
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

-- Auto-expire so inactive rate-limit keys don't accumulate in Redis
local window = math.ceil(burst / rate)
local ttl = math.max(window + 300, 300)
redis.call('EXPIRE', key .. ':tokens', ttl)
redis.call('EXPIRE', key .. ':last', ttl)

return {allowed, tostring(tokens), tostring(wait)}
"""


class RateLimiter:
    """Per-provider token bucket backed by an async Redis client.

    ``default_rate`` (tokens/second refill) and ``default_burst`` (ceiling)
    apply unless overridden per ``acquire`` call — a provider with a burstier
    API passes its own ``rate``/``burst`` without a separate instance.
    """

    def __init__(
        self,
        *,
        key_prefix: str = "ratelimit",
        default_rate: float = 10.0,
        default_burst: int = 20,
        client: Any | None = None,
    ) -> None:
        self.key_prefix = key_prefix
        self.default_rate = default_rate
        self.default_burst = default_burst
        self._client = client
        self._script: Any | None = None

    def _get_client(self) -> Any:
        # Cache on the instance: opening a fresh pool per op would leak
        # connections. An explicit client (legacy DI) wins over the seam.
        if self._client is None:
            self._client = get_async_client()
        return self._client

    async def _get_script(self) -> Any:
        if self._script is None:
            self._script = self._get_client().register_script(TOKEN_BUCKET_SCRIPT)
        return self._script

    def _key(self, bucket: str) -> str:
        return f"{self.key_prefix}:{bucket}"

    @property
    def redis(self) -> Any:
        """Resolve the underlying async Redis client.

        The provider layer (``core.providers.base``) writes cooldown/drain keys
        on the *same* client the token bucket uses, so it reaches through this
        accessor just like the legacy ``rate_limiter.redis`` attribute.
        """
        return self._get_client()

    async def acquire(
        self,
        bucket: str,
        tokens: int = 1,
        rate: float | None = None,
        burst: int | None = None,
    ) -> tuple[bool, float]:
        """Try to consume *tokens* from *bucket*.

        Returns ``(allowed, wait_seconds)``. When ``allowed`` is False,
        ``wait_seconds`` is the estimated time until enough tokens refill.
        """
        try:
            script = await self._get_script()
            key = self._key(bucket)
            now = time.monotonic()
            r = rate if rate is not None else self.default_rate
            b = burst if burst is not None else self.default_burst
            allowed, _remaining, wait = await script(
                keys=[key], args=[now, r, b, tokens]
            )
            return bool(int(allowed)), float(wait)
        except Exception as exc:
            logger.warning("Rate limiter Redis unavailable for bucket '%s' (%s); failing open", bucket, exc)
            return True, 0.0

    async def wait_and_acquire(
        self,
        bucket: str,
        tokens: int = 1,
        rate: float | None = None,
        burst: int | None = None,
        timeout: float = 30.0,
    ) -> bool:
        """Block until tokens are available or *timeout* expires (then False)."""
        deadline = time.monotonic() + timeout
        while True:
            allowed, wait = await self.acquire(bucket, tokens, rate, burst)
            if allowed:
                return True
            if time.monotonic() + wait > deadline:
                return False
            await asyncio.sleep(wait)

    async def reset(self, bucket: str) -> None:
        """Clear *bucket*'s state so the next acquire starts with a full burst."""
        key = self._key(bucket)
        await self._get_client().delete(f"{key}:tokens", f"{key}:last")
