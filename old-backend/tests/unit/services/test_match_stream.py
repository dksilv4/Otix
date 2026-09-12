"""Tests for the SSE match stream endpoint and GameMatcher.match_batch_stream.

Tests the async generator directly by mocking ``match_single`` so the
full pipeline is not invoked — only the streaming envelope is verified.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock

import pytest

from otix.schemas.media import (
    GameMatchCandidate,
    GameMatchRequest,
    GameMatchResponse,
    MatchType,
    StreamCompleteEvent,
    StreamMatchEvent,
)
from otix.services.game_matcher import GameMatcher


def _parse_sse_events(raw_events: list[str]) -> list[dict]:
    """Parse a list of SSE chunk strings into a list of event dicts.

    Each SSE chunk may be of the form::

        event: game-progress\ndata: {...}\n\n

    or just ``data: {...}\n\n``.

    Returns a list of dicts with ``event`` (str | None) and ``data`` (dict).
    """
    parsed: list[dict] = []
    current_event: str | None = None

    for chunk in raw_events:
        for line in chunk.split("\n"):
            if line.startswith("event: "):
                current_event = line[7:].strip()
            elif line.startswith("data: "):
                payload = line[6:].strip()
                if payload and payload != "null":
                    parsed.append({"event": current_event, "data": json.loads(payload)})
                current_event = None  # reset after consuming
    return parsed


def _make_mock_response(
    title: str,
    match: bool = True,
    query_id: str = "",
) -> GameMatchResponse:
    """Build a canned ``GameMatchResponse`` for a single game."""
    candidates = []
    auto_match = None
    if match:
        candidate = GameMatchCandidate(
            media_item_id="oti_mock00001",
            title=title,
            confidence=1.0,
            match_type=MatchType.DIRECT,
        )
        candidates = [candidate]
        auto_match = candidate
    return GameMatchResponse(
        query_id=query_id,
        query_title=title,
        candidates=candidates,
        auto_match=auto_match,
    )


# ═══════════════════════════════════════════════════════════════════════════════
# Direct unit tests for GameMatcher.match_batch_stream
# ═══════════════════════════════════════════════════════════════════════════════


class TestMatchBatchStream:
    """Tests that exercise ``match_batch_stream`` directly.

    The ``match_single`` method is mocked so the full matching pipeline
    is never invoked — only the streaming envelope logic is tested.
    """

    @pytest.fixture(autouse=True)
    def _setup(self, monkeypatch):
        import fakeredis.aioredis

        fake_redis = fakeredis.aioredis.FakeRedis(decode_responses=True)
        self._fake_redis = fake_redis

    async def _make_matcher(self) -> GameMatcher:
        from sqlalchemy.ext.asyncio import AsyncSession

        session = AsyncMock(spec=AsyncSession)
        return GameMatcher(session, self._fake_redis)

    async def test_yields_game_progress_and_complete(self):
        """Happy path: 3 games yield 3 progress + 1 complete event."""
        matcher = await self._make_matcher()
        matcher.match_single = AsyncMock(
            side_effect=[
                _make_mock_response("Game A", match=True, query_id="a:1"),
                _make_mock_response("Game B", match=False, query_id="b:2"),
                _make_mock_response("Game C", match=True, query_id="c:3"),
            ]
        )

        requests = [
            GameMatchRequest(query_id="a:1", title="Game A"),
            GameMatchRequest(query_id="b:2", title="Game B"),
            GameMatchRequest(query_id="c:3", title="Game C"),
        ]

        chunks: list[str] = []
        async for chunk in matcher.match_batch_stream(requests):
            chunks.append(chunk)

        events = _parse_sse_events(chunks)

        # Should have 4 events: 3 game-progress + 1 complete
        assert len(events) == 4

        # First three are game-progress
        for i, ev in enumerate(events[:3]):
            assert ev["event"] == "game-progress"
            data = ev["data"]
            assert isinstance(data, dict)
            assert data["game_index"] == i
            assert "query_id" in data
            assert "query_title" in data

        # Game A (index 0) -> matched
        assert events[0]["data"]["status"] == "matched"
        assert events[0]["data"]["auto_match"] is True

        # Game B (index 1) -> unmatched
        assert events[1]["data"]["status"] == "unmatched"

        # Game C (index 2) -> matched
        assert events[2]["data"]["status"] == "matched"

        # Last event is complete
        assert events[3]["event"] == "complete"
        complete: dict = events[3]["data"]
        assert complete["total_games"] == 3
        assert complete["matched_count"] == 2
        assert complete["unmatched_count"] == 1
        assert complete["errored_count"] == 0
        assert isinstance(complete["duration_ms"], int)
        assert complete["duration_ms"] >= 0

    async def test_error_event_on_exception(self):
        """When match_single raises, an error game-progress event is emitted."""
        matcher = await self._make_matcher()

        async def _raise_match_single(_req: object) -> object:
            raise ValueError("IGDB timeout")

        matcher.match_single = _raise_match_single  # type: ignore[method-assign]

        requests = [GameMatchRequest(query_id="err:1", title="Broken Game")]

        chunks: list[str] = []
        async for chunk in matcher.match_batch_stream(requests):
            chunks.append(chunk)

        events = _parse_sse_events(chunks)

        # 1 game-progress error + 1 complete
        assert len(events) == 2

        assert events[0]["event"] == "game-progress"
        assert events[0]["data"]["status"] == "error"
        assert "IGDB timeout" in events[0]["data"]["error"]
        assert events[0]["data"]["candidates_count"] == 0
        assert events[0]["data"]["auto_match"] is False

        assert events[1]["event"] == "complete"
        assert events[1]["data"]["errored_count"] == 1
        assert events[1]["data"]["matched_count"] == 0

    async def test_empty_batch(self):
        """Empty request list yields a complete event with zero counts."""
        matcher = await self._make_matcher()

        chunks: list[str] = []
        async for chunk in matcher.match_batch_stream([]):
            chunks.append(chunk)

        events = _parse_sse_events(chunks)

        assert len(events) == 1
        assert events[0]["event"] == "complete"
        assert events[0]["data"]["total_games"] == 0
        assert events[0]["data"]["matched_count"] == 0
        assert events[0]["data"]["unmatched_count"] == 0
        assert events[0]["data"]["errored_count"] == 0

    async def test_sse_format_has_event_prefix(self):
        """Raw SSE chunks contain the ``event:`` prefix in the expected format."""
        matcher = await self._make_matcher()
        matcher.match_single = AsyncMock(return_value=_make_mock_response("Game X", match=True, query_id="x:1"))

        requests = [GameMatchRequest(query_id="x:1", title="Game X")]

        chunks: list[str] = []
        async for chunk in matcher.match_batch_stream(requests):
            chunks.append(chunk)

        assert len(chunks) == 2

        # First chunk: game-progress
        assert chunks[0].startswith("event: game-progress\n")
        assert "data: " in chunks[0]
        assert chunks[0].endswith("\n\n")

        # Second chunk: complete
        assert chunks[1].startswith("event: complete\n")
        assert "data: " in chunks[1]
        assert chunks[1].endswith("\n\n")

    async def test_candidates_count_reflected(self):
        """candidates_count in the event reflects the number of candidates."""
        matcher = await self._make_matcher()

        resp = GameMatchResponse(
            query_id="m:1",
            query_title="Multi Match",
            candidates=[
                GameMatchCandidate(title="Result1", confidence=0.9, match_type=MatchType.ILIKE),
                GameMatchCandidate(title="Result2", confidence=0.5, match_type=MatchType.TRIGRAM),
            ],
            auto_match=None,
        )
        matcher.match_single = AsyncMock(return_value=resp)

        requests = [GameMatchRequest(query_id="m:1", title="Multi Match")]

        chunks: list[str] = []
        async for chunk in matcher.match_batch_stream(requests):
            chunks.append(chunk)

        events = _parse_sse_events(chunks)
        assert events[0]["data"]["candidates_count"] == 2
        assert events[0]["data"]["auto_match"] is False


# ═══════════════════════════════════════════════════════════════════════════════
# Schema validation tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestStreamMatchEventSchema:
    def test_minimal(self) -> None:
        ev = StreamMatchEvent(
            game_index=0,
            total_games=1,
            query_id="epic:Jaguar",
            query_title="Jaguar",
            status="matched",
        )
        assert ev.candidates_count == 0
        assert ev.auto_match is False
        assert ev.error is None

    def test_with_error(self) -> None:
        ev = StreamMatchEvent(
            game_index=0,
            total_games=1,
            query_id="epic:Fail",
            query_title="Fail",
            status="error",
            error="Something broke",
        )
        assert ev.error == "Something broke"

    def test_serializes_via_model_dump_json(self) -> None:
        ev = StreamMatchEvent(
            game_index=0,
            total_games=1,
            query_id="x:1",
            query_title="Test",
            status="matched",
        )
        raw = ev.model_dump_json()
        assert isinstance(raw, str)
        parsed = json.loads(raw)
        assert parsed["game_index"] == 0
        assert parsed["status"] == "matched"


class TestStreamCompleteEventSchema:
    def test_default(self) -> None:
        ev = StreamCompleteEvent(
            total_games=0,
            matched_count=0,
            unmatched_count=0,
            errored_count=0,
            duration_ms=0,
        )
        assert ev.total_games == 0
        assert ev.model_dump() == {
            "total_games": 0,
            "matched_count": 0,
            "unmatched_count": 0,
            "errored_count": 0,
            "duration_ms": 0,
        }

    def test_serializes_via_model_dump_json(self) -> None:
        ev = StreamCompleteEvent(
            total_games=5,
            matched_count=3,
            unmatched_count=1,
            errored_count=1,
            duration_ms=1234,
        )
        raw = ev.model_dump_json()
        parsed = json.loads(raw)
        assert parsed["total_games"] == 5
        assert parsed["duration_ms"] == 1234
