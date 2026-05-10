from __future__ import annotations

import base64
import re

import pytest

from otix.lib import progress
from otix.lib.circuit_breaker import CircuitBreaker, State
from otix.lib.pagination import decode_cursor, encode_cursor
from otix.lib.rate_limiter import RateLimiter
from otix.lib.slug import slugify
from otix.lib.totp import _hotp, generate_qr_svg, generate_totp_secret, totp_provisioning_uri, verify_totp


def test_slugify_normalizes_punctuation_whitespace_and_repeated_separators() -> None:
    assert slugify("  Spider-Man: Across_the Spider-Verse!!!  ") == "spider-man-across-the-spider-verse"


def test_slugify_truncates_at_word_boundary_under_200_chars() -> None:
    slug = slugify("word " * 80)

    assert len(slug) <= 200
    assert slug.endswith("word")
    assert not slug.endswith("-")


def test_cursor_round_trips_json_payload_without_padding() -> None:
    encoded = encode_cursor({"id": "abc", "score": 9.5, "offset": 12})

    assert "=" not in encoded
    assert decode_cursor(encoded) == {"id": "abc", "score": 9.5, "offset": 12}


@pytest.mark.parametrize("cursor", ["", "not base64", "eyJpZCI6"])
def test_decode_cursor_returns_none_for_empty_or_malformed_values(cursor: str) -> None:
    assert decode_cursor(cursor) is None


def test_circuit_breaker_opens_after_threshold_and_allows_limited_half_open_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 100.0
    monkeypatch.setattr("otix.lib.circuit_breaker.time.monotonic", lambda: now)
    breaker = CircuitBreaker("tmdb", failure_threshold=2, recovery_timeout=10, half_open_max_requests=1)

    assert breaker.allow_request() is True
    breaker.record_failure()
    assert breaker.state is State.CLOSED

    breaker.record_failure()
    assert breaker.state is State.OPEN
    assert breaker.allow_request() is False

    now = 111.0
    assert breaker.state is State.HALF_OPEN
    assert breaker.allow_request() is True
    assert breaker.allow_request() is False

    breaker.record_success()
    assert breaker.state is State.CLOSED
    assert breaker.allow_request() is True


def test_circuit_breaker_reopens_when_half_open_probe_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    now = 10.0
    monkeypatch.setattr("otix.lib.circuit_breaker.time.monotonic", lambda: now)
    breaker = CircuitBreaker("igdb", failure_threshold=1, recovery_timeout=5)
    breaker.record_failure()

    now = 16.0
    assert breaker.allow_request() is True
    breaker.record_failure()

    assert breaker.state is State.OPEN
    assert breaker.allow_request() is False


def test_totp_secret_generation_and_verification(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = generate_totp_secret()
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    monkeypatch.setattr("otix.lib.totp.time.time", lambda: 60.0)
    code = _hotp(key, 2)

    assert re.fullmatch(r"[A-Z2-7]{32}", secret)
    assert verify_totp(secret, code, window=0) is True
    assert verify_totp(secret, "000000", window=0) is False
    assert verify_totp("not a secret", code) is False
    assert verify_totp(secret, "abc123") is False


def test_totp_accepts_adjacent_time_window(monkeypatch: pytest.MonkeyPatch) -> None:
    secret = "JBSWY3DPEHPK3PXP"
    key = base64.b32decode(secret + "=" * (-len(secret) % 8))
    monkeypatch.setattr("otix.lib.totp.time.time", lambda: 90.0)
    previous_code = _hotp(key, 2)

    assert verify_totp(secret, previous_code, window=1) is True
    assert verify_totp(secret, previous_code, window=0) is False


def test_totp_provisioning_uri_escapes_labels_and_qr_svg_is_data_uri() -> None:
    uri = totp_provisioning_uri("ABC123", "user+test@example.com", issuer="Otix App")

    assert uri.startswith("otpauth://totp/Otix%20App:user%2Btest%40example.com?")
    assert "secret=ABC123" in uri
    assert "issuer=Otix%20App" in uri

    svg = generate_qr_svg(uri)
    assert svg.startswith("data:image/svg+xml;base64,")
    decoded = base64.b64decode(svg.removeprefix("data:image/svg+xml;base64,")).decode()
    assert "<svg" in decoded


@pytest.mark.asyncio
async def test_rate_limiter_consumes_burst_and_reports_wait(fakeredis) -> None:
    limiter = RateLimiter(fakeredis, key_prefix="test", default_rate=1, default_burst=2)

    assert await limiter.acquire("tmdb") == (True, 0.0)
    assert await limiter.acquire("tmdb") == (True, 0.0)

    allowed, wait = await limiter.acquire("tmdb")
    assert allowed is False
    assert wait > 0

    await limiter.reset("tmdb")
    assert await limiter.acquire("tmdb") == (True, 0.0)


@pytest.mark.asyncio
async def test_progress_snapshot_and_reset_uses_redis_pipeline(monkeypatch: pytest.MonkeyPatch, fakeredis) -> None:
    async def fake_get_redis():
        return fakeredis

    monkeypatch.setattr(progress, "get_redis", fake_get_redis)

    await progress.incr("movies")
    await progress.incr("movies", 2)
    await progress.incr("shows", 4)

    assert await progress.snapshot_and_reset() == {"movies": 3, "shows": 4}
    assert await progress.snapshot_and_reset() == {}
