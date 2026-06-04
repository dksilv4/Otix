from __future__ import annotations

import pytest
from fastapi import HTTPException
from starlette.datastructures import Headers
from starlette.requests import Request

from otix.api.rate_limit import AuthRateLimiter, client_ip
from otix.lib.concurrency import run_async
from otix.lib.metrics import Counter, Gauge, Histogram, MetricsRegistry, track_api_call, track_rate_limit_wait


async def _async_value() -> str:
    return "done"


def test_run_async_runs_coroutine_in_fresh_loop() -> None:
    assert run_async(_async_value()) == "done"


def test_metrics_counter_histogram_gauge_and_snapshot() -> None:
    registry = MetricsRegistry()
    counter = registry.counter("requests_total")
    histogram = registry.histogram("latency_seconds", buckets=(0.1, 1.0))
    gauge = registry.gauge("active_jobs")

    assert registry.counter("requests_total") is counter
    assert isinstance(counter, Counter)
    assert isinstance(histogram, Histogram)
    assert isinstance(gauge, Gauge)

    counter.inc(2, provider="tmdb", status="ok")
    counter.inc()
    histogram.observe(0.05)
    histogram.observe(2.0)
    gauge.set(3, provider="tmdb")

    assert counter.value() == 3
    assert counter.value(provider="tmdb", status="ok") == 2
    assert histogram.count == 2
    assert histogram.avg_seconds == pytest.approx(1.025)
    assert gauge.value(provider="tmdb") == 3
    assert registry.snapshot()["counters"]["requests_total"]["value"] == 3


def test_tracking_context_managers_record_elapsed_time(monkeypatch: pytest.MonkeyPatch) -> None:
    times = iter([10.0, 10.25, 20.0, 20.5])
    monkeypatch.setattr("otix.lib.metrics.time.monotonic", lambda: next(times))

    with track_api_call("tmdb"):
        pass
    with track_rate_limit_wait("tmdb"):
        pass

    from otix.lib.metrics import SYNC_API_CALL_DURATION, SYNC_RATE_LIMIT_WAIT

    assert SYNC_API_CALL_DURATION.count >= 1
    assert SYNC_RATE_LIMIT_WAIT.count >= 1


def _request(headers: dict[str, str] | None = None, client: tuple[str, int] | None = ("127.0.0.1", 1234)) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": Headers(headers or {}).raw,
    }
    if client is not None:
        scope["client"] = client
    return Request(scope)


def test_client_ip_prefers_forwarded_for_and_falls_back_to_client_or_unknown() -> None:
    assert client_ip(_request({"X-Forwarded-For": "203.0.113.10, 10.0.0.1"})) == "203.0.113.10"
    assert client_ip(_request()) == "127.0.0.1"
    assert client_ip(_request(client=None)) == "unknown"


@pytest.mark.asyncio
async def test_auth_rate_limiter_raises_429_after_burst(fakeredis) -> None:
    limiter = AuthRateLimiter(fakeredis)

    for _ in range(10):
        await limiter.check_login_by_identity("User@Example.com")

    with pytest.raises(HTTPException) as exc:
        await limiter.check_login_by_identity("user@example.com")

    assert exc.value.status_code == 429
    assert int(exc.value.headers["Retry-After"]) >= 1


@pytest.mark.asyncio
async def test_rate_limiter_handles_missing_last_field(fakeredis) -> None:
    from otix.lib.rate_limiter import RateLimiter
    limiter = RateLimiter(fakeredis)

    # Simulate partial Redis state where tokens exists but last is missing/evicted
    key = limiter._key("test_bucket")
    await fakeredis.set(f"{key}:tokens", "10")
    # key:last is intentionally not set

    # Should work without raising redis.exceptions.ResponseError
    allowed, wait = await limiter.acquire("test_bucket", tokens=1)
    assert allowed is True
    assert wait == 0.0
