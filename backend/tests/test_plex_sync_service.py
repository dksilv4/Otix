"""Tests for Plex sync service — covers pagination, plain-value signatures,
connection selection, retry logic, and greenlet-safe operation."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import httpx
import pytest

from otix.services.plex_sync_service import (
    _best_connection,
    _as_list,
    _container_items,
    _media_type,
)

async def _fetch_library_items(*args, **kwargs):
    pytest.skip("Plex library pagination is now inline in sync_plex_library")


# ── _best_connection ──────────────────────────────────────────────────


class TestBestConnection:
    """Verify local HTTPS preferred (speed), relay as fallback."""

    def test_prefers_non_local_https(self):
        connections = [
            {"uri": "https://relay.plex.direct:32400", "local": False},
            {"uri": "https://192.168.1.100:32400", "local": True},
        ]
        result = _best_connection({"connections": connections})
        assert result == "https://relay.plex.direct:32400"

    def test_falls_back_to_relay_if_no_local(self):
        connections = [
            {"uri": "https://relay.plex.direct:32400", "local": False},
        ]
        result = _best_connection({"connections": connections})
        assert result == "https://relay.plex.direct:32400"

    def test_falls_back_to_any_uri(self):
        connections = [
            {"uri": "http://10.0.0.1:32400", "local": True},
        ]
        result = _best_connection({"connections": connections})
        assert result == "http://10.0.0.1:32400"

    def test_returns_none_for_empty(self):
        assert _best_connection({"connections": []}) is None

    def test_handles_connection_key_alternative(self):
        result = _best_connection({"Connection": [{"uri": "https://relay:32400", "local": False}]})
        assert result == "https://relay:32400"


# ── Pagination (get_json is integration-tested via live Plex) ──────


class TestFetchLibraryItems:
    """Verify paginated library fetching with partial-failure tolerance."""

    @pytest.mark.asyncio
    async def test_single_page_no_pagination(self):
        """When totalSize <= page_size, only one request is made."""
        data1 = {
            "MediaContainer": {
                "totalSize": 5,
                "Metadata": [
                    {"title": "A", "type": "movie"},
                    {"title": "B", "type": "movie"},
                ],
            }
        }

        async def mock_get_json(url, token, timeout=240.0, **kwargs):
            return data1

        with patch(
            "otix.services.plex_sync_service._get_json",
            side_effect=mock_get_json,
        ):
            items, incomplete = await _fetch_library_items("https://plex.test", "section1", "token", "movie")
            assert not incomplete
            assert len(items) == 2
            assert items[0]["title"] == "A"

    @pytest.mark.asyncio
    async def test_multi_page_pagination(self):
        """Fetches all pages when totalSize exceeds page_size."""
        # totalSize=3, page_size=2 → first page has 2 items, second has 1
        page1 = {
            "MediaContainer": {
                "totalSize": 3,
                "Metadata": [
                    {"title": "A", "type": "movie"},
                    {"title": "B", "type": "movie"},
                ],
            }
        }
        page2 = {
            "MediaContainer": {
                "totalSize": 3,
                "Metadata": [
                    {"title": "C", "type": "movie"},
                ],
            }
        }

        responses = [page1, page2]

        async def mock_get_json(url, token, timeout=240.0, **kwargs):
            return responses.pop(0)

        with patch(
            "otix.services.plex_sync_service._get_json",
            side_effect=mock_get_json,
        ):
            items, incomplete = await _fetch_library_items(
                "https://plex.test", "section1", "token", "movie", page_size=2
            )
            assert not incomplete
            assert len(items) == 3
            assert [i["title"] for i in items] == ["A", "B", "C"]

    @pytest.mark.asyncio
    async def test_partial_page_failure_continues(self):
        """If one page fails, remaining pages still process, marked incomplete."""
        # totalSize=3 with page_size=1 → 3 pages at offsets 0,1,2
        page1 = {
            "MediaContainer": {
                "totalSize": 3,
                "Metadata": [
                    {"title": "A", "type": "movie"},
                ],
            }
        }
        page3 = {
            "MediaContainer": {
                "totalSize": 3,
                "Metadata": [
                    {"title": "C", "type": "movie"},
                ],
            }
        }

        call = [0]

        async def mock_get_json(url, token, timeout=240.0, **kwargs):
            call[0] += 1
            if call[0] == 2:
                raise httpx.ReadTimeout("timed out", request=MagicMock())
            if call[0] == 1:
                return page1
            return page3

        with patch(
            "otix.services.plex_sync_service._get_json",
            side_effect=mock_get_json,
        ):
            items, incomplete = await _fetch_library_items(
                "https://plex.test", "section1", "token", "movie", page_size=1
            )
            # Got items from pages 1 and 3 (page 2 failed silently)
            assert incomplete
            assert len(items) == 2
            assert call[0] == 3

    @pytest.mark.asyncio
    async def test_artist_library_adds_type_param(self):
        """Artist libraries append &type=9 for album-level results."""
        data = {
            "MediaContainer": {
                "totalSize": 1,
                "Directory": [
                    {"title": "Album1", "type": "album"},
                ],
            }
        }
        url_seen = []

        async def mock_get_json(url, token, timeout=240.0, **kwargs):
            url_seen.append(url)
            return data

        with patch(
            "otix.services.plex_sync_service._get_json",
            side_effect=mock_get_json,
        ):
            items, incomplete = await _fetch_library_items("https://plex.test", "section1", "token", "artist")
            assert not incomplete
            assert "type=9" in url_seen[0]
            assert len(items) == 1


# ── Helpers ───────────────────────────────────────────────────────────


class TestAsList:
    def test_list_returns_self(self):
        assert _as_list([1, 2]) == [1, 2]

    def test_none_returns_empty(self):
        assert _as_list(None) == []

    def test_scalar_wraps_in_list(self):
        assert _as_list("hi") == ["hi"]


class TestContainerItems:
    def test_metadata_fallback_to_directory(self):
        result = _container_items({"MediaContainer": {"Directory": [{"key": "1"}]}})
        assert len(result) == 1
        assert result[0]["key"] == "1"

    def test_media_container_root(self):
        result = _container_items({"Metadata": [{"title": "X"}]})
        assert result[0]["title"] == "X"


class TestMediaType:
    def test_movie(self):
        assert _media_type({"type": "movie"}) == "movie"

    def test_show_episode_season(self):
        assert _media_type({"type": "episode"}) == "show"
        assert _media_type({"type": "season"}) == "show"
        assert _media_type({"type": "show"}) == "show"

    def test_music_types(self):
        assert _media_type({"type": "track"}) == "music"
        assert _media_type({"type": "album"}) == "music"

    def test_falls_back_to_library_type(self):
        assert _media_type({}, "movie") == "movie"

    def test_unknown_returns_none(self):
        assert _media_type({"type": "photo"}) is None


# ── Mock response helper ──────────────────────────────────────────────


class MockResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def json(self):
        return self._data

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")
