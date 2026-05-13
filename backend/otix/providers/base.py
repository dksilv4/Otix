"""Base classes for provider integrations.

Every provider follows the same three-stage pipeline:

    fetch → transform → hydrate

1. BaseProvider   — HTTP layer with rate limiting, circuit breaking, retries
2. BaseTransformer — maps raw provider data → domain models (stateless)
3. BaseHydrator    — fills in relations after core entities are in the DB

Usage in a Celery task:

    provider = TMDBProvider(redis, http_client)
    transformer = TMDBTransformer()
    hydrator = TMDBHydrator(provider, db_session)

    raw = await provider.fetch_movie(tmdb_id)
    movie = transformer.to_movie(raw)
    await hydrator.hydrate_credits(movie, raw)
"""

from __future__ import annotations

import asyncio
from abc import ABC
import httpx
import structlog
from redis.asyncio import Redis

from otix.lib.circuit_breaker import CircuitBreaker, State as CBState
from otix.lib.metrics import CIRCUIT_BREAKER_STATE, track_api_call
from otix.lib.rate_limiter import RateLimiter

logger = structlog.get_logger()


class ProviderError(Exception):
    pass


class RateLimitError(ProviderError):
    pass


class CircuitOpenError(ProviderError):
    def __init__(self, provider: str):
        super().__init__(f"Circuit breaker is OPEN for {provider}")


class BaseProvider(ABC):
    """Async HTTP client wrapper with rate limiting and circuit breaking."""

    # HTTP status codes that indicate rate limiting for this provider.
    # Most APIs use 429; some (e.g. MusicBrainz) return 503 for rate limits.
    _rate_limit_statuses: tuple[int, ...] = (429,)

    def __init__(
        self,
        name: str,
        redis: Redis,
        http_client: httpx.AsyncClient,
        *,
        rate: float = 10.0,
        burst: int = 20,
        circuit_threshold: int = 5,
        circuit_recovery: float = 30.0,
    ):
        self.name = name
        self.http = http_client
        self.rate_limiter = RateLimiter(redis, key_prefix=f"ratelimit:{name}", default_rate=rate, default_burst=burst)
        self.circuit_breaker = CircuitBreaker(
            name=name,
            failure_threshold=circuit_threshold,
            recovery_timeout=circuit_recovery,
        )

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        return await self._request("GET", url, **kwargs)

    async def _post(self, url: str, **kwargs) -> httpx.Response:
        return await self._request("POST", url, **kwargs)

    async def _request(self, method: str, url: str, **kwargs) -> httpx.Response:
        if not self.circuit_breaker.allow_request():
            self._update_cb_gauge()
            raise CircuitOpenError(self.name)

        # Block until a rate-limit token is available.  This serialises
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
                raise ProviderError(f"{self.name} request failed: {exc}") from exc

        if response.status_code in self._rate_limit_statuses:
            self._handle_rate_limit(response)
            await self._drain_rate_bucket()
            raise RateLimitError(f"{self.name} rate limited ({response.status_code})")

        if response.status_code >= 500:
            self.circuit_breaker.record_failure()
            self._update_cb_gauge()
            response.raise_for_status()

        self.circuit_breaker.record_success()
        self._update_cb_gauge()
        return response

    def _handle_rate_limit(self, response: httpx.Response) -> None:
        retry_after = response.headers.get("Retry-After")
        if retry_after and retry_after.isdigit():
            wait = int(retry_after)
            logger.warning("rate limited by provider", provider=self.name, retry_after=wait)

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
