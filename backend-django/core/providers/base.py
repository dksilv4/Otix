"""Base classes for provider integrations (port of ``otix.providers.base``).

Every provider follows the same three-stage pipeline: ``fetch -> transform ->
hydrate``. ``BaseProvider`` is the HTTP layer with rate limiting, circuit
breaking, and a local dev/test response cache; the concrete clients ported
later (TMDB/IGDB/SteamGrid/MusicBrainz) subclass it and add typed ``fetch_*``
methods. The token bucket comes from ``core.ratelimit``; cooldown and drain
keys are written on the same async Redis client so a 429 backpressure signal is
visible to upstream schedulers.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import httpx
from django.conf import settings as django_settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

from core.providers.api_cache import ApiCache
from core.providers.circuit_breaker import CircuitBreaker
from core.providers.circuit_breaker import State as CBState
from core.providers.metrics import CIRCUIT_BREAKER_STATE, track_api_call
from core.ratelimit import RateLimiter
from core.redis import get_async_client

logger = logging.getLogger(__name__)


class ProviderError(Exception):
    pass


class RateLimitError(ProviderError):
    def __init__(self, message: str = "", retry_after: int = 0):
        super().__init__(message)
        self.retry_after = retry_after


class CircuitOpenError(ProviderError):
    def __init__(self, provider: str):
        super().__init__(f"Circuit breaker is OPEN for {provider}")


class BaseProvider:
    """Async HTTP client wrapper with rate limiting and circuit breaking."""

    # Class-level cache instance (shared by all providers)
    _api_cache: ApiCache | None = None

    # HTTP status codes that indicate rate limiting for this provider.
    # Most APIs use 429; some (e.g. MusicBrainz) return 503 for rate limits.
    _rate_limit_statuses: tuple[int, ...] = (429,)

    def __init__(
        self,
        name: str,
        http_client: httpx.AsyncClient,
        *,
        redis: Redis | None = None,
        rate: float = 10.0,
        burst: int = 20,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ):
        self.name = name
        self.http = http_client
        # An explicit async Redis client (tests, shared connections) wins over
        # the core.redis seam; the limiter exposes it back via ``.redis``.
        client = redis if redis is not None else get_async_client()
        self.rate_limiter = RateLimiter(
            client=client,
            key_prefix=f"ratelimit:{name}",
            default_rate=rate,
            default_burst=burst,
        )
        self.circuit_breaker = CircuitBreaker(
            name=name,
            failure_threshold=circuit_threshold,
            recovery_timeout=circuit_recovery,
        )

    @classmethod
    def _get_cache(cls) -> ApiCache | None:
        if cls._api_cache is None:
            try:
                cache = ApiCache(
                    cache_dir=getattr(django_settings, "API_CACHE_DIR", "./.api_cache"),
                    ttl_hours=getattr(django_settings, "API_CACHE_TTL_HOURS", 24),
                    enabled=getattr(django_settings, "API_CACHE_ENABLED", True),
                )
                # Only cache responses in local/dev/test environments. Staging
                # and production must always hit the real provider APIs so users
                # never see stale (up to TTL) responses.
                app_env = getattr(django_settings, "APP_ENV", "local")
                if app_env not in ("local", "development", "test"):
                    cache.enabled = False
                cls._api_cache = cache
            except Exception:
                cls._api_cache = ApiCache(enabled=False)
        return cls._api_cache

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        return await self._request("GET", url, **kwargs)

    async def _post(self, url: str, **kwargs) -> httpx.Response:
        return await self._request("POST", url, **kwargs)

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        if not self.circuit_breaker.allow_request():
            self._update_cb_gauge()
            raise CircuitOpenError(self.name)

        # ── Local API cache (GET only, dev/test) — checked before the rate
        # limiter so cached responses don't consume provider quota or block
        # on the token bucket. ──
        _cache = self._get_cache()
        if method == "GET" and _cache and _cache.enabled:
            cached = _cache.get(self.name, url)
            if cached is not None:
                # A HALF_OPEN recovery probe that lands on a cached response
                # never resolves the breaker state (no success/failure is
                # recorded), leaving it permanently half-open and refusing every
                # subsequent request. Treat a cached response as a healthy probe.
                # Only in HALF_OPEN: in CLOSED, resetting on cache hits would
                # mask a real outage behind a hot cache.
                if self.circuit_breaker.state == CBState.HALF_OPEN:
                    self.circuit_breaker.record_success()
                return httpx.Response(
                    status_code=200,
                    json=cached,
                    request=httpx.Request(method, url),
                )

        # Block until a rate-limit token is available. This serialises
        # concurrent callers so the provider never sees a burst above the
        # configured rate.
        acquired = await self.rate_limiter.wait_and_acquire(self.name)
        if not acquired:
            raise RateLimitError(f"{self.name} rate limit timeout")

        with track_api_call(self.name):
            try:
                response = await self.http.request(method, url, **kwargs)
            except Exception as exc:
                self.circuit_breaker.record_failure()
                self._update_cb_gauge()
                if str(exc):
                    msg = f"{self.name} request failed: {exc}"
                else:
                    msg = f"{self.name} request failed: {type(exc).__name__}"
                raise ProviderError(msg) from exc

        # ── Cache successful GET responses ──
        if method == "GET" and _cache and _cache.enabled and response.status_code < 400:
            try:
                data = response.json()
                _cache.set(self.name, url, data)
            except Exception:
                pass

        if response.status_code in self._rate_limit_statuses:
            retry_after = await self._handle_rate_limit(response)
            await self._drain_rate_bucket()
            raise RateLimitError(
                f"{self.name} rate limited ({response.status_code})", retry_after=retry_after
            )

        if response.status_code >= 500:
            self.circuit_breaker.record_failure()
            self._update_cb_gauge()
            response.raise_for_status()

        if response.status_code >= 400:
            # Client error — don't record success or failure; let caller decide
            return response

        self.circuit_breaker.record_success()
        self._update_cb_gauge()
        return response

    async def _handle_rate_limit(self, response: httpx.Response) -> int:
        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            wait = int(retry_after)
            logger.warning("rate limited by provider: provider=%s retry_after=%s", self.name, wait)
            # Set cooldown so upstream schedulers can back off
            await self._set_cooldown(wait)
            return wait
        return 0

    async def _set_cooldown(self, seconds: int) -> None:
        """Set a Redis key to signal that this provider is rate limited."""
        try:
            await self.rate_limiter.redis.set(f"ratelimit:{self.name}:cooldown", "1", ex=seconds)
        except Exception:
            pass

    @staticmethod
    async def check_cooldown(redis: Redis, provider_name: str) -> int:
        """Return remaining cooldown seconds for a provider, or 0 if not rate limited."""
        try:
            remaining = await redis.ttl(f"ratelimit:{provider_name}:cooldown")
            return remaining if remaining > 0 else 0
        except Exception:
            return 0

    async def _drain_rate_bucket(self) -> None:
        """Drain the token bucket so subsequent requests are throttled."""
        import time as _time

        key = f"{self.rate_limiter.key_prefix}:{self.name}"
        now = _time.monotonic()
        await self.rate_limiter.redis.set(f"{key}:tokens", 0)
        await self.rate_limiter.redis.set(f"{key}:last", now)

    def _update_cb_gauge(self) -> None:
        state_map = {CBState.CLOSED: 0, CBState.OPEN: 1, CBState.HALF_OPEN: 2}
        CIRCUIT_BREAKER_STATE.set(float(state_map[self.circuit_breaker.state]), provider=self.name)
