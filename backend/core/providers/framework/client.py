"""Base async HTTP client machinery for provider integrations.

Every provider client uses ``BaseProviderClient`` to handle HTTP requests with
standardized rate limiting, circuit breaking, local dev caching, and execution
timeline tracing.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import TYPE_CHECKING, Any

import httpx
from django.conf import settings as django_settings

if TYPE_CHECKING:
    from redis.asyncio import Redis

from contextlib import nullcontext

from core.providers.framework.cache import ApiCache, url_for_cache
from core.providers.framework.circuit_breaker import CircuitBreaker, CircuitState
from core.providers.framework.errors import (
    CircuitOpenError,
    ProviderAuthError,
    ProviderError,
    ProviderNotFoundError,
    RateLimitError,
)
from core.providers.framework.metrics import CIRCUIT_BREAKER_STATE, track_api_call
from core.providers.framework.telemetry import ExecutionTimeline
from core.ratelimit import RateLimiter

logger = logging.getLogger(__name__)


class BaseProviderClient:
    """Async HTTP client wrapper with rate limiting, circuit breaking, caching, and telemetry."""

    # Class-level cache instance (shared across provider instances)
    _api_cache: ApiCache | None = None

    # HTTP status codes that indicate rate limiting for this provider (typically 429)
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
    ) -> None:
        self.name = name
        self.http = http_client
        self.rate_limiter = RateLimiter(
            client=redis,
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
        """Resolve the shared ApiCache instance, automatically configuring based on environment."""
        if cls._api_cache is not None:
            return cls._api_cache

        try:
            from core.providers.base import BaseProvider as LegacyBaseProvider

            if LegacyBaseProvider._api_cache is not None:
                return LegacyBaseProvider._api_cache
        except Exception:
            pass

        try:
            cache = ApiCache(
                cache_dir=getattr(django_settings, "API_CACHE_DIR", "./.api_cache"),
                ttl_hours=getattr(django_settings, "API_CACHE_TTL_HOURS", 24),
                enabled=getattr(django_settings, "API_CACHE_ENABLED", True),
            )
            app_env = getattr(django_settings, "APP_ENV", "local")
            if app_env not in ("local", "development", "test"):
                cache.enabled = False
            cls._api_cache = cache
        except Exception:
            cls._api_cache = ApiCache(enabled=False)
        return cls._api_cache

    async def _get(self, url: str, **kwargs: Any) -> httpx.Response:
        """Perform a rate-limited, circuit-broken GET request."""
        return await self._request("GET", url, **kwargs)

    async def _post(self, url: str, **kwargs: Any) -> httpx.Response:
        """Perform a rate-limited, circuit-broken POST request."""
        return await self._request("POST", url, **kwargs)

    async def _request(self, method: str, url: str, **kwargs: Any) -> httpx.Response:
        """Execute an HTTP request through the resiliency pipeline.

        Pipeline stages:
          1. Circuit breaker check (raises CircuitOpenError if OPEN).
          2. Dev/test cache lookup (GET only).
          3. Token-bucket rate limiting wait.
          4. Execution with latency telemetry and error tracking.
          5. Response caching and status code handling (429, 5xx, 4xx).
        """
        timeline: ExecutionTimeline | None = kwargs.pop("timeline", None)
        raise_for_status: bool = kwargs.pop("raise_for_status", False)

        if not self.circuit_breaker.allow_request():
            self._update_cb_gauge()
            raise CircuitOpenError(self.name)

        measure_ctx = (
            timeline.measure(f"HTTP {method} {url}", method=method, url=url)
            if timeline is not None
            else nullcontext()
        )

        with measure_ctx as span:
            # ── Local API cache (GET only, dev/test) ──
            _cache = self._get_cache()
            _cache_key = url_for_cache(url, kwargs)
            if method == "GET" and _cache and _cache.enabled:
                cached = _cache.get(self.name, _cache_key)
                if cached is not None:
                    if span is not None:
                        span.metadata["cached"] = True
                    if self.circuit_breaker.state == CircuitState.HALF_OPEN:
                        self.circuit_breaker.record_success()
                    return httpx.Response(
                        status_code=200,
                        json=cached,
                        request=httpx.Request(method, url),
                    )

            # ── Rate Limiter ──
            acquired = await self.rate_limiter.wait_and_acquire(self.name)
            if not acquired:
                raise RateLimitError(f"{self.name} rate limit timeout")

            # ── Dispatch HTTP Request ──
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
                _cache.set(self.name, _cache_key, data)
            except Exception:
                pass

        # ── Rate limit handling ──
        if response.status_code in self._rate_limit_statuses:
            retry_after = await self._handle_rate_limit(response)
            await self._drain_rate_bucket()
            raise RateLimitError(
                f"{self.name} rate limited ({response.status_code})", retry_after=retry_after
            )

        # ── 5xx Server errors trip circuit breaker ──
        if response.status_code >= 500:
            self.circuit_breaker.record_failure()
            self._update_cb_gauge()
            response.raise_for_status()

        # ── 4xx Client errors ──
        if response.status_code >= 400:
            if raise_for_status:
                if response.status_code in (401, 403):
                    raise ProviderAuthError(
                        f"{self.name} authentication failed ({response.status_code})",
                        status_code=response.status_code,
                    )
                if response.status_code == 404:
                    raise ProviderNotFoundError(
                        f"{self.name} resource not found ({url})",
                        status_code=404,
                    )
                response.raise_for_status()
            return response

        # ── Successful response ──
        self.circuit_breaker.record_success()
        self._update_cb_gauge()
        return response

    async def _handle_rate_limit(self, response: httpx.Response) -> int:
        """Parse Retry-After header and persist cooldown in Redis."""
        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            wait = int(retry_after)
            logger.warning("Rate limited by provider: provider=%s retry_after=%s", self.name, wait)
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
        key = f"{self.rate_limiter.key_prefix}:{self.name}"
        now = time.monotonic()
        try:
            await self.rate_limiter.redis.set(f"{key}:tokens", 0)
            await self.rate_limiter.redis.set(f"{key}:last", now)
        except Exception:
            pass

    def _update_cb_gauge(self) -> None:
        """Sync circuit breaker state to observability gauge."""
        state_map = {CircuitState.CLOSED: 0.0, CircuitState.OPEN: 1.0, CircuitState.HALF_OPEN: 2.0}
        CIRCUIT_BREAKER_STATE.set(state_map[self.circuit_breaker.state], provider=self.name)


# Backwards compatibility alias
BaseProvider = BaseProviderClient


def resolve_shared_http_client(
    current_client: httpx.AsyncClient | None,
    current_loop_id: int | None,
    *,
    base_url: str,
    timeout: float,
    headers: dict[str, str] | None = None,
    follow_redirects: bool = False,
) -> tuple[httpx.AsyncClient, int | None]:
    """Return a process-shared AsyncClient bound to base_url.

    Safely resets on event-loop changes (e.g. Celery prefork child processes).
    """
    try:
        active_loop = asyncio.get_running_loop()
        active_loop_id = id(active_loop)
    except RuntimeError:
        active_loop = None
        active_loop_id = None

    if current_client is not None and (
        current_loop_id != active_loop_id or current_client.is_closed
    ):
        if not current_client.is_closed:
            if (
                active_loop is not None
                and active_loop.is_running()
                and current_loop_id == active_loop_id
            ):
                try:
                    active_loop.create_task(current_client.aclose())
                except Exception:
                    pass
            else:
                try:
                    transport = getattr(current_client, "_transport", None)
                    pool = getattr(transport, "_pool", None)
                    if pool is not None:
                        conns = list(getattr(pool, "_connections", []))
                        if not conns and hasattr(pool, "connections"):
                            try:
                                conns = list(pool.connections)
                            except Exception:
                                pass
                        for conn in conns:
                            try:
                                stream = getattr(conn, "_network_stream", None)
                                sock = None
                                if hasattr(stream, "get_extra_info"):
                                    sock = stream.get_extra_info("socket")
                                if sock is None:
                                    sock = getattr(stream, "_raw_stream", None)
                                if sock is not None and hasattr(sock, "close"):
                                    sock.close()
                                if hasattr(stream, "close"):
                                    stream.close()
                            except Exception:
                                pass
                except Exception:
                    pass
        current_client = None

    if current_client is None or current_client.is_closed:
        kwargs: dict[str, Any] = {
            "base_url": base_url,
            "timeout": timeout,
            "follow_redirects": follow_redirects,
        }
        if headers:
            kwargs["headers"] = headers
        current_client = httpx.AsyncClient(**kwargs)
        current_loop_id = active_loop_id

    return current_client, current_loop_id
