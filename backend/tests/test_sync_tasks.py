"""Unit tests for sync task helpers — hash, scheduling, filtering, enqueuing."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from otix.domain.sync import ProviderState
from otix.tasks.sync import (
    _compute_game_next_sync_at,
    _compute_hash,
    _compute_next_sync_at,
    _enqueue_list_items,
    _filter_stale_ids,
    _get_last_change_check,
    _set_last_change_check,
    _sync_tmdb_discover_list,
)


# ── Pure function tests ──────────────────────────────────────────────


class TestComputeHash:
    def test_identical_raw_same_hash(self):
        raw = {"id": 1, "title": "Test", "popularity": 99.9}
        assert _compute_hash(raw) == _compute_hash(raw)

    def test_different_raw_different_hash(self):
        assert _compute_hash({"id": 1}) != _compute_hash({"id": 2})

    def test_popularity_excluded(self):
        """Changing popularity should NOT change the hash."""
        h1 = _compute_hash({"id": 1, "popularity": 1.0})
        h2 = _compute_hash({"id": 1, "popularity": 999.0})
        assert h1 == h2

    def test_hypes_excluded(self):
        """Changing hypes should NOT change the hash (IGDB volatility)."""
        h1 = _compute_hash({"id": 1, "name": "Zelda", "hypes": 0})
        h2 = _compute_hash({"id": 1, "name": "Zelda", "hypes": 999})
        assert h1 == h2

    def test_key_ordering_independent(self):
        """Hashes should be the same regardless of key insertion order."""
        h1 = _compute_hash({"a": 1, "b": 2})
        h2 = _compute_hash({"b": 2, "a": 1})
        assert h1 == h2

    def test_nested_structures(self):
        h1 = _compute_hash({"credits": {"cast": [{"id": 1}]}})
        h2 = _compute_hash({"credits": {"cast": [{"id": 1}]}})
        assert h1 == h2

    def test_person_data(self):
        raw = {"id": 287, "name": "Brad Pitt", "popularity": 25.0, "biography": "..."}
        h = _compute_hash(raw)
        assert len(h) == 64
        assert _compute_hash(raw) == h


class TestComputeNextSyncAt:
    """Test adaptive scheduling based on media lifecycle."""

    # ── Movies ──

    def test_new_movie_12h(self):
        """Recently released movies sync every 12 hours."""
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        next_sync = _compute_next_sync_at("movie", {"release_date": today})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=11) < delta <= timedelta(hours=13)

    def test_recent_movie_7d(self):
        """Movies released within 2 years sync every 7 days."""
        recent = (datetime.now(timezone.utc) - timedelta(days=500)).strftime("%Y-%m-%d")
        next_sync = _compute_next_sync_at("movie", {"release_date": recent})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=8)

    def test_classic_movie_30d(self):
        """Old movies sync every 30 days."""
        old = "1999-10-15"
        next_sync = _compute_next_sync_at("movie", {"release_date": old})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    def test_movie_no_release_date_defaults_to_classic(self):
        next_sync = _compute_next_sync_at("movie", {})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    # ── Shows ──

    def test_airing_show_6h(self):
        """Airing shows sync every 6 hours."""
        next_sync = _compute_next_sync_at("show", {"status": "Returning Series"})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=5) < delta <= timedelta(hours=7)

    def test_in_production_show_6h(self):
        next_sync = _compute_next_sync_at("show", {"status": "In Production"})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=5) < delta <= timedelta(hours=7)

    def test_ended_recent_show_7d(self):
        """Shows that ended within 2 years sync every 7 days."""
        recent = (datetime.now(timezone.utc) - timedelta(days=500)).strftime("%Y-%m-%d")
        next_sync = _compute_next_sync_at("show", {
            "status": "Ended",
            "last_air_date": recent,
        })
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=8)

    def test_ended_old_show_30d(self):
        """Shows that ended long ago sync every 30 days."""
        next_sync = _compute_next_sync_at("show", {
            "status": "Ended",
            "last_air_date": "2019-05-19",
        })
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    def test_canceled_show_same_as_ended(self):
        next_sync = _compute_next_sync_at("show", {
            "status": "Canceled",
            "last_air_date": "2019-05-19",
        })
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    def test_unknown_status_show_7d(self):
        next_sync = _compute_next_sync_at("show", {"status": "Unknown"})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=8)

    # ── People ──

    def test_popular_person_7d(self):
        next_sync = _compute_next_sync_at("person", {"popularity": 10.0})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=8)

    def test_unpopular_person_30d(self):
        next_sync = _compute_next_sync_at("person", {"popularity": 1.0})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    def test_person_zero_popularity_30d(self):
        next_sync = _compute_next_sync_at("person", {"popularity": 0})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    # ── Escalation ──

    def test_escalation_doubles_base_interval(self):
        """hash_match_count=1 should double the interval."""
        base = _compute_next_sync_at("person", {"popularity": 1.0}, hash_match_count=0)
        doubled = _compute_next_sync_at("person", {"popularity": 1.0}, hash_match_count=1)
        base_delta = base - datetime.now(timezone.utc)
        doubled_delta = doubled - datetime.now(timezone.utc)
        # doubled interval should be ~2x (within 10% tolerance)
        ratio = doubled_delta / base_delta
        assert 1.9 < ratio < 2.1

    def test_escalation_capped_at_max(self):
        """hash_match_count=10 should not exceed max_escalation_days."""
        from otix.infrastructure.config import settings

        max_hours = settings.tmdb_sync_max_escalation_days * 24
        next_sync = _compute_next_sync_at("person", {"popularity": 1.0}, hash_match_count=10)
        delta = next_sync - datetime.now(timezone.utc)
        assert delta <= timedelta(hours=max_hours)

    def test_escalation_stops_at_5(self):
        """hash_match_count=5 and 6 should give same delta (2^5 = 32x, max)."""
        now = datetime.now(timezone.utc)
        h5 = _compute_next_sync_at("person", {"popularity": 1.0}, hash_match_count=5)
        h6 = _compute_next_sync_at("person", {"popularity": 1.0}, hash_match_count=6)
        delta5 = h5 - now
        delta6 = h6 - now
        assert abs((delta5 - delta6).total_seconds()) < 5  # within 5s tolerance


# ── DB-dependent tests ────────────────────────────────────────────────


def _make_async_session_mock(scalars_result=None):
    """Create an AsyncMock that supports async context manager protocol."""
    session = AsyncMock()
    session.__aenter__ = AsyncMock(return_value=session)
    session.__aexit__ = AsyncMock(return_value=None)
    session.scalars.return_value = scalars_result if scalars_result is not None else []
    session.commit = AsyncMock()
    session.add = MagicMock()
    return session


class TestFilterStaleIds:
    async def test_returns_stale_ids(self):
        """IDs with next_sync_at in the past should be returned."""
        mock_session = _make_async_session_mock(scalars_result=[])

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            result = await _filter_stale_ids("tmdb", {"550", "680"})
            assert result == {"550", "680"}

    async def test_skips_fresh_ids(self):
        """IDs with next_sync_at in the future should be filtered out."""
        mock_session = _make_async_session_mock(scalars_result=["550"])

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            result = await _filter_stale_ids("tmdb", {"550", "680"})
            assert result == {"680"}

    async def test_empty_input(self):
        result = await _filter_stale_ids("tmdb", set())
        assert result == set()


class TestEnqueueListItems:
    async def test_enqueues_stale_only(self):
        """Should enqueue tasks for stale IDs, skip fresh ones."""
        with (
            patch("otix.tasks.sync._filter_stale_ids", return_value={"680"}),
            patch("otix.tasks.sync.app.send_task") as mock_send,
        ):
            enqueued, skipped = await _enqueue_list_items("tmdb", "movie", {"550", "680"})
            assert enqueued == 1
            assert skipped == 1
            mock_send.assert_called_once_with("sync.tmdb.movie", args=[680])

    async def test_correct_task_name_for_show(self):
        with (
            patch("otix.tasks.sync._filter_stale_ids", return_value={"1399"}),
            patch("otix.tasks.sync.app.send_task") as mock_send,
        ):
            await _enqueue_list_items("tmdb", "show", {"1399"})
            mock_send.assert_called_once_with("sync.tmdb.show", args=[1399])

    async def test_all_stale(self):
        with (
            patch("otix.tasks.sync._filter_stale_ids", return_value={"550", "680"}),
            patch("otix.tasks.sync.app.send_task") as mock_send,
        ):
            enqueued, skipped = await _enqueue_list_items("tmdb", "movie", {"550", "680"})
            assert enqueued == 2
            assert skipped == 0
            assert mock_send.call_count == 2


class TestProviderStateHelpers:
    async def test_get_last_change_check_no_state(self):
        """Without stored state, defaults to 24h ago."""
        mock_session = _make_async_session_mock()
        mock_session.get.return_value = None

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            result = await _get_last_change_check("tmdb")
            expected = datetime.now(timezone.utc) - timedelta(hours=24)
            assert abs((result - expected).total_seconds()) < 5

    async def test_get_last_change_check_with_state(self):
        """Returns stored timestamp when available."""
        mock_session = _make_async_session_mock()
        state = ProviderState(provider="tmdb")
        state.last_sync_at = datetime(2026, 4, 30, 12, 0, 0, tzinfo=timezone.utc)
        mock_session.get.return_value = state

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            result = await _get_last_change_check("tmdb")
            assert result == state.last_sync_at

    async def test_set_last_change_check_new(self):
        """Creates new ProviderState if none exists."""
        mock_session = _make_async_session_mock()
        mock_session.get.return_value = None

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            now = datetime.now(timezone.utc)
            await _set_last_change_check("tmdb", now)
            added = mock_session.add.call_args[0][0]
            assert isinstance(added, ProviderState)
            assert added.provider == "tmdb"
            assert added.last_sync_at == now
            mock_session.commit.assert_called_once()

    async def test_set_last_change_check_update(self):
        """Updates existing ProviderState."""
        mock_session = _make_async_session_mock()
        state = ProviderState(provider="tmdb")
        state.last_sync_at = datetime(2026, 4, 30, tzinfo=timezone.utc)
        mock_session.get.return_value = state

        def _factory():
            return mock_session

        with patch("otix.tasks.sync.async_session_factory", _factory):
            now = datetime.now(timezone.utc)
            await _set_last_change_check("tmdb", now)
            assert state.last_sync_at == now


class TestDiscoverListDispatch:
    @pytest.mark.parametrize(
        "list_type,media_type",
        [
            ("popular", "movie"),
            ("popular", "show"),
            ("top_rated", "movie"),
            ("top_rated", "show"),
            ("upcoming", "movie"),
            ("now_playing", "movie"),
            ("on_the_air", "show"),
            ("airing_today", "show"),
            ("trending", "movie"),
            ("trending", "show"),
        ],
    )
    async def test_discover_list_dispatch_does_not_raise(
        self, list_type, media_type
    ):
        """Verify each valid list_type + media_type combo dispatches without error."""
        with (
            patch("otix.tasks.sync.get_redis"),
            patch("otix.tasks.sync.TMDBProvider") as mock_provider_cls,
            patch("otix.tasks.sync._enqueue_list_items", return_value=(0, 0)),
        ):
            mock_provider = MagicMock()

            async def _page_response(**kwargs):
                return {"page": 1, "total_pages": 1, "results": []}

            for m in [
                "get_movie_popular", "get_movie_top_rated", "get_movie_upcoming",
                "get_movie_now_playing", "get_show_popular", "get_show_top_rated",
                "get_show_on_the_air", "get_show_airing_today", "get_trending",
            ]:
                setattr(mock_provider, m, _page_response)

            mock_provider_cls.return_value = mock_provider

            result = await _sync_tmdb_discover_list(list_type, media_type, pages=1)
            assert result["list_type"] == list_type
            assert result["media_type"] == media_type

    async def test_invalid_list_type_raises(self):
        """Unknown list type should raise KeyError."""
        with (
            patch("otix.tasks.sync.get_redis"),
            patch("otix.tasks.sync.TMDBProvider") as mock_provider_cls,
        ):
            mock_provider = MagicMock()
            mock_provider_cls.return_value = mock_provider
            with pytest.raises(KeyError):
                await _sync_tmdb_discover_list("nonexistent", "movie", pages=1)


# ── Game sync scheduling tests ──────────────────────────────────────


class TestComputeGameNextSyncAt:
    """Test game-specific sync scheduling based on release lifecycle."""

    def test_unreleased_no_date(self):
        """Games with no release date sync every 12 hours."""
        next_sync = _compute_game_next_sync_at({})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=11) < delta <= timedelta(hours=13)

    def test_future_release(self):
        """Games releasing in the future sync every 12 hours."""
        future_ts = int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp())
        next_sync = _compute_game_next_sync_at({"first_release_date": future_ts})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=11) < delta <= timedelta(hours=13)

    def test_recently_released(self):
        """Games released within 90 days sync every 24 hours."""
        recent_ts = int((datetime.now(timezone.utc) - timedelta(days=30)).timestamp())
        next_sync = _compute_game_next_sync_at({"first_release_date": recent_ts})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(hours=23) < delta <= timedelta(hours=25)

    def test_released_within_2_years(self):
        """Games released within 2 years sync every 7 days."""
        ts = int((datetime.now(timezone.utc) - timedelta(days=500)).timestamp())
        next_sync = _compute_game_next_sync_at({"first_release_date": ts})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=6) < delta <= timedelta(days=8)

    def test_classic_game(self):
        """Games older than 2 years sync every 30 days."""
        old_ts = int(datetime(2015, 5, 19, tzinfo=timezone.utc).timestamp())
        next_sync = _compute_game_next_sync_at({"first_release_date": old_ts})
        delta = next_sync - datetime.now(timezone.utc)
        assert timedelta(days=29) < delta <= timedelta(days=31)

    def test_escalation_doubles_interval(self):
        """hash_match_count=1 should double the base interval."""
        old_ts = int(datetime(2015, 5, 19, tzinfo=timezone.utc).timestamp())
        base = _compute_game_next_sync_at({"first_release_date": old_ts}, hash_match_count=0)
        doubled = _compute_game_next_sync_at({"first_release_date": old_ts}, hash_match_count=1)
        base_delta = base - datetime.now(timezone.utc)
        doubled_delta = doubled - datetime.now(timezone.utc)
        ratio = doubled_delta / base_delta
        assert 1.9 < ratio < 2.1

    def test_escalation_capped(self):
        """hash_match_count=10 should not exceed max_escalation_days."""
        from otix.infrastructure.config import settings

        max_hours = settings.tmdb_sync_max_escalation_days * 24
        next_sync = _compute_game_next_sync_at({}, hash_match_count=10)
        delta = next_sync - datetime.now(timezone.utc)
        assert delta <= timedelta(hours=max_hours)
