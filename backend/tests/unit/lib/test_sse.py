"""Tests for the reusable SSE framework (otix.lib.sse)."""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock

import pytest
from fastapi.responses import StreamingResponse

from otix.lib.redis_progress import RedisProgress
from otix.lib.sse import SseStreamConfig, create_sse_response, sse_headers
from otix.lib.sse._core import _format_sse, _normalize_stored_result, sse_event_generator

# ═══════════════════════════════════════════════════════════════════════════════
# Helpers
# ═══════════════════════════════════════════════════════════════════════════════


def _fake_request(is_disconnected: bool = False) -> AsyncMock:
    """Create a minimal mock ``Request`` for the event generator."""
    req = AsyncMock()
    req.is_disconnected = AsyncMock(return_value=is_disconnected)
    return req


async def _drain(generator, max_events: int = 10) -> list[str]:
    """Collect up to *max_events* chunks from an async generator."""
    events: list[str] = []
    async for chunk in generator:
        events.append(chunk)
        if len(events) >= max_events:
            break
    return events


async def _drain_with_publish(
    generator,
    fake,
    channel: str,
    messages: list[str],
    *,
    max_events: int = 10,
    delay: float = 0.05,
) -> list[str]:
    """Start draining *generator*, then publish *messages* with a delay so the
    generator has time to subscribe before messages are sent."""
    async def publish_all():
        for msg in messages:
            await asyncio.sleep(delay)
            await fake.publish(channel, msg)

    drain_task = asyncio.create_task(_drain(generator, max_events=max_events))
    publish_task = asyncio.create_task(publish_all())
    await asyncio.gather(drain_task, publish_task)
    return drain_task.result()


def _parse_data(chunk: str) -> dict | None:
    """Extract the JSON payload from a ``data: {...}\n\n`` chunk, or return None."""
    if chunk.startswith("data: "):
        payload = chunk[6:].strip()
        if payload:
            return json.loads(payload)
    return None


def _data_events(events: list[str]) -> list[str]:
    return [e for e in events if e.startswith("data:")]


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests – pure functions
# ═══════════════════════════════════════════════════════════════════════════════


class TestFormatSse:
    def test_basic(self) -> None:
        assert _format_sse({"type": "ping"}) == 'data: {"type":"ping"}\n\n'

    def test_unicode(self) -> None:
        result = _format_sse({"message": "héllo"})
        assert "héllo" in result
        assert result.startswith("data: ")

    def test_non_serializable_default(self) -> None:
        """Non-serializable types fall back to ``str()``."""
        from datetime import datetime

        result = _format_sse({"ts": datetime(2025, 1, 1)})
        assert "2025" in result


class TestSseHeaders:
    def test_returns_correct_dict(self) -> None:
        headers = sse_headers()
        assert headers["Cache-Control"] == "no-cache"
        assert headers["Connection"] == "keep-alive"
        assert headers["X-Accel-Buffering"] == "no"


class TestNormalizeStoredResult:
    def test_adds_type_when_missing(self) -> None:
        result = {"progress": 100}
        normalized = _normalize_stored_result(result, ("sync_complete",))
        assert normalized["type"] == "sync_complete"
        assert normalized["progress"] == 100

    def test_preserves_existing_type(self) -> None:
        result = {"type": "already_set", "progress": 100}
        normalized = _normalize_stored_result(result, ("sync_complete",))
        assert normalized["type"] == "already_set"

    def test_no_terminal_events_does_not_add_type(self) -> None:
        result = {"progress": 100}
        normalized = _normalize_stored_result(result, ())
        assert "type" not in normalized

    def test_empty_terminal_events_does_not_mutate(self) -> None:
        result = {"a": 1}
        normalized = _normalize_stored_result(result, ())
        assert normalized == {"a": 1}

    def test_rehydrate_error_pattern(self) -> None:
        """Rehydrate tasks store errors without a ``type`` key.

        The normalizer should assign ``"type": "error"`` when the stored
        result has an ``"error"`` key but no ``"type"`` key.
        """
        result = {"error": "Provider timeout", "media_item_id": "oti_xxx"}
        normalized = _normalize_stored_result(result, ("rehydrate_complete", "error"))
        assert normalized["type"] == "error"
        assert normalized["error"] == "Provider timeout"

    def test_rehydrate_success_pattern(self) -> None:
        """Rehydrate success has no ``"error"`` key → use first terminal event."""
        result = {"media_item_id": "oti_xxx", "title": "Test"}
        normalized = _normalize_stored_result(result, ("rehydrate_complete", "error"))
        assert normalized["type"] == "rehydrate_complete"
        assert normalized["title"] == "Test"

    def test_rehydrate_error_without_terminal_error(self) -> None:
        """``"error"`` key but terminal_events doesn't include ``"error"`` → fallback."""
        result = {"error": "fail"}
        normalized = _normalize_stored_result(result, ("done",))
        assert normalized["type"] == "done"


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests – sse_event_generator (with fakeredis)
# ═══════════════════════════════════════════════════════════════════════════════


class TestSseEventGenerator:
    """These tests use *fakeredis* pub/sub so they need an event loop."""

    CHANNEL = "test:channel:events"

    @pytest.fixture(autouse=True)
    async def _setup_fakeredis(self, monkeypatch):
        import fakeredis.aioredis

        fake = await fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr("otix.lib.sse._core.get_redis", AsyncMock(return_value=fake))
        self._fake = fake

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Persistent streams
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Persistent streams
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_persistent_stream_yields_live_events(self) -> None:
        """Persistent stream delivers a published event."""
        gen = sse_event_generator(channel=self.CHANNEL, request=_fake_request())
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"hello"}'],
            max_events=2,
        )
        parsed = [_parse_data(e) for e in events if _parse_data(e)]
        assert any(d.get("type") == "hello" for d in parsed)

    async def test_persistent_stream_includes_keepalive(self) -> None:
        """Keepalive frames are yielded when no messages arrive."""
        gen = sse_event_generator(channel=self.CHANNEL, timeout=3, request=_fake_request())
        frames = await _drain(gen, max_events=3)
        assert any(f == ":keepalive\n\n" for f in frames)

    async def test_persistent_stream_times_out(self) -> None:
        """Persistent stream closes after ``timeout`` seconds of silence."""
        gen = sse_event_generator(channel=self.CHANNEL, timeout=1, request=_fake_request())
        collected = await _drain(gen, max_events=50)
        # Generator should have returned after ~1s — not too many frames
        assert len(collected) < 10

    async def test_persistent_stream_resets_deadline_on_event(self) -> None:
        """Receiving an event resets the deadline, keeping the stream alive."""
        gen = sse_event_generator(channel=self.CHANNEL, timeout=1, request=_fake_request())
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"ping"}', '{"type":"pong"}'],
            max_events=10,
            # First message has extra delay since subscribe + first get_message
            # takes a bit longer on the initial tick
            delay=0.05,
        )
        data = _data_events(events)
        assert len(data) >= 2

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Task streams (terminal events)
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_task_stream_terminates_on_matching_event(self) -> None:
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("sync_complete", "error"),
            request=_fake_request(),
        )
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"sync_complete"}'],
            max_events=20,
        )
        assert len(_data_events(events)) == 1

    async def test_task_stream_ignores_non_terminal_events(self) -> None:
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("completed",),
            request=_fake_request(),
        )
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"progress","pct":50}', '{"type":"progress","pct":75}', '{"type":"completed"}'],
            max_events=20,
            delay=0.02,
        )
        assert len(_data_events(events)) == 3

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Replay paths
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_result_replay_short_circuits(self) -> None:
        """When a stored result exists the generator yields it and returns."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("sync_complete",),
            result_replay=AsyncMock(return_value={"items_synced": 42}),
            request=_fake_request(),
        )
        events = await _drain(gen, max_events=5)
        # Generator should have yielded the stored result and returned
        assert len(events) == 1
        payload = _parse_data(events[0])
        assert payload is not None
        assert payload["type"] == "sync_complete"
        assert payload["items_synced"] == 42

    async def test_result_replay_with_existing_type(self) -> None:
        """Stored result with an existing type is NOT normalised."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("sync_complete", "error"),
            result_replay=AsyncMock(return_value={"type": "custom_done", "ok": True}),
            request=_fake_request(),
        )
        events = await _drain(gen, max_events=5)
        payload = _parse_data(events[0])
        assert payload["type"] == "custom_done"

    async def test_result_replay_with_none_falls_through(self) -> None:
        """When ``result_replay`` returns ``None`` the generator subscribes live."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            result_replay=AsyncMock(return_value=None),
            request=_fake_request(),
        )
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"live"}'],
            max_events=5,
        )
        assert any("live" in e for e in _data_events(events))

    async def test_progress_replay_yields_before_subscribe(self) -> None:
        """Latest progress is yielded *before* the generator subscribes to Redis."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            progress_replay=AsyncMock(return_value={"type": "progress", "pct": 50}),
            request=_fake_request(),
        )
        # Also publish a live event to test ordering
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"progress","pct":100}'],
            max_events=5,
        )
        data = _data_events(events)
        assert len(data) >= 1
        first = _parse_data(data[0])
        assert first is not None and first.get("pct") == 50

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Client disconnect
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_client_disconnect_cleanup(self) -> None:
        request = _fake_request(is_disconnected=True)
        gen = sse_event_generator(channel=self.CHANNEL, request=request)
        events = await _drain(gen, max_events=20)
        # Generator detects disconnect immediately and exits without data events
        assert not any(e.startswith("data:") for e in events)

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Malformed event handling
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_malformed_json_does_not_crash(self) -> None:
        """A non-JSON pubsub message is forwarded and does not crash the generator."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("complete",),
            request=_fake_request(),
        )
        events = await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ["not-json", '{"type":"progress"}'],
            max_events=10,
            delay=0.05,
        )
        data = _data_events(events)
        # Both messages arrive — malformed is forwarded as-is, terminal check skips it
        assert len(data) == 2

    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -
    # Cleanup guarantee
    # - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - - -

    async def test_finally_unsubscribes_on_exit(self) -> None:
        """The generator always unsubscribes from the channel after exit."""
        gen = sse_event_generator(
            channel=self.CHANNEL,
            terminal_events=("stop",),
            request=_fake_request(),
        )
        await _drain_with_publish(
            gen, self._fake, self.CHANNEL,
            ['{"type":"stop"}'],
            max_events=5,
        )

        # After generator exits, no remaining subscriptions on the channel
        channels = await self._fake.pubsub_channels()
        assert self.CHANNEL not in channels


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests – create_sse_response
# ═══════════════════════════════════════════════════════════════════════════════


class TestCreateSseResponse:
    async def test_returns_streaming_response(self, monkeypatch) -> None:
        import fakeredis.aioredis

        fake = await fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr("otix.lib.sse._core.get_redis", AsyncMock(return_value=fake))

        response = await create_sse_response(
            SseStreamConfig(channel="test:ch"),
            _fake_request(),
        )
        assert isinstance(response, StreamingResponse)
        assert response.media_type == "text/event-stream"

    async def test_has_correct_headers(self, monkeypatch) -> None:
        import fakeredis.aioredis

        fake = await fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr("otix.lib.sse._core.get_redis", AsyncMock(return_value=fake))

        response = await create_sse_response(
            SseStreamConfig(channel="test:ch"),
            _fake_request(),
        )
        assert response.headers.get("cache-control") == "no-cache"
        assert response.headers.get("connection") == "keep-alive"
        assert response.headers.get("x-accel-buffering") == "no"


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests – SseStreamConfig
# ═══════════════════════════════════════════════════════════════════════════════


class TestSseStreamConfig:
    def test_persistent_defaults(self) -> None:
        config = SseStreamConfig(channel="x")
        assert config.channel == "x"
        assert config.terminal_events == ()
        assert config.timeout == 300
        assert config.result_replay is None
        assert config.progress_replay is None

    def test_task_config(self) -> None:
        config = SseStreamConfig(
            channel="x",
            terminal_events=("done", "error"),
            timeout=60,
        )
        assert config.terminal_events == ("done", "error")
        assert config.timeout == 60

    def test_is_frozen(self) -> None:
        config = SseStreamConfig(channel="x")
        with pytest.raises(AttributeError):
            config.channel = "y"  # type: ignore[misc]


# ═══════════════════════════════════════════════════════════════════════════════
# Unit tests – RedisProgress
# ═══════════════════════════════════════════════════════════════════════════════


class TestRedisProgress:
    NS = "test:progress"
    TASK_ID = "task_abc"

    @pytest.fixture(autouse=True)
    async def _setup_fakeredis(self, monkeypatch):
        import fakeredis.aioredis

        self._fake = await fakeredis.aioredis.FakeRedis(decode_responses=True)
        monkeypatch.setattr("otix.lib.redis_progress.get_redis", AsyncMock(return_value=self._fake))

    async def _make_progress(self) -> RedisProgress:
        return RedisProgress(self.NS)

    async def test_publish(self) -> None:
        progress = await self._make_progress()
        channel = progress.channel_name(self.TASK_ID)

        # Subscribe first, then publish, then read — Redis pub/sub requires
        # an active subscriber for the message to be delivered.
        pubsub = self._fake.pubsub()
        await pubsub.subscribe(channel)
        # Drain the subscribe confirmation message
        await pubsub.get_message(ignore_subscribe_messages=True, timeout=0.2)

        await progress.publish(self.TASK_ID, "progress", current=5, total=10)
        msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
        assert msg is not None
        assert msg["type"] == "message"
        payload = json.loads(msg["data"])
        assert payload["type"] == "progress"
        assert payload["current"] == 5

    async def test_store_and_get_result(self) -> None:
        progress = await self._make_progress()
        await progress.store_result(self.TASK_ID, {"synced": 42})
        result = await progress.get_stored_result(self.TASK_ID)
        assert result == {"synced": 42}

    async def test_get_stored_result_returns_none_when_missing(self) -> None:
        progress = await self._make_progress()
        assert await progress.get_stored_result("nonexistent") is None

    async def test_store_and_get_progress(self) -> None:
        progress = await self._make_progress()
        await progress.store_progress(self.TASK_ID, "progress", pct=50)
        latest = await progress.get_latest_progress(self.TASK_ID)
        assert latest == {"type": "progress", "pct": 50}

    def test_namespace_property(self) -> None:
        progress = RedisProgress("custom:ns")
        assert progress.namespace == "custom"

    def test_channel_name(self) -> None:
        progress = RedisProgress("ns")
        assert progress.channel_name("abc") == "ns:abc:events"

    async def test_ttl_expiry(self) -> None:
        """Stored values should expire after TTL (fakeredis respects expiry)."""
        progress = RedisProgress("short", ttl=1)
        await progress.store_result(self.TASK_ID, {"data": "x"})
        assert await progress.get_stored_result(self.TASK_ID) is not None

        await asyncio.sleep(1.5)
        assert await progress.get_stored_result(self.TASK_ID) is None


# ═══════════════════════════════════════════════════════════════════════════════
# Pre-built instances
# ═══════════════════════════════════════════════════════════════════════════════


class TestPrebuiltInstances:
    def test_plex_progress(self) -> None:
        from otix.lib.redis_progress import plex_progress

        assert plex_progress.namespace == "plex"
        assert plex_progress.channel_name("t1") == "plex:sync:t1:events"

    def test_youtube_progress(self) -> None:
        from otix.lib.redis_progress import youtube_progress

        assert youtube_progress.namespace == "youtube"

    def test_media_rehydrate_progress(self) -> None:
        from otix.lib.redis_progress import media_rehydrate_progress

        assert media_rehydrate_progress.namespace == "media"
