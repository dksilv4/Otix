"""Tests for MediaService — listing, details fetching with revenue ranks, hybrid searches, and multi-ID sorting."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import date

from otix.domain.media import MediaItem, Movie, Show, Album
from otix.services.media_service import MediaService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> MediaService:
    return MediaService(mock_db_session)


def _make_media(item_id: str, media_type: str, title: str, popularity: float = 10.0) -> MediaItem:
    item = MediaItem(
        media_type=media_type,
        title=title,
        popularity=popularity,
        original_language="en",
    )
    item.id = item_id
    if media_type == "movie":
        item.movie = Movie(media_item_id=item_id, revenue=1000000, budget=500000)
    elif media_type == "show":
        item.show = Show(media_item_id=item_id)
        item.show.seasons = []
    elif media_type == "music":
        item.album = Album(media_item_id=item_id)
    return item


class TestMediaList:
    async def test_list_media_basic(self, service: MediaService, mock_db_session: AsyncMock):
        items = [_make_media("m-1", "movie", "Movie A"), _make_media("m-2", "movie", "Movie B")]
        mock_db_session.scalars.return_value = items

        res, has_more, total = await service.list_media(media_type="movie", limit=2)
        assert len(res) == 2
        assert has_more is False
        assert total is None

    async def test_list_media_with_total(self, service: MediaService, mock_db_session: AsyncMock):
        items = [_make_media("m-1", "movie", "Movie A")]
        mock_db_session.scalars.return_value = items
        mock_db_session.scalar.return_value = 10  # total count

        res, has_more, total = await service.list_media(media_type="movie", include_total=True, limit=10)
        assert len(res) == 1
        assert total == 10


class TestMediaGet:
    async def test_get_media_item_not_found(self, service: MediaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        item = await service.get_media_item("m-99")
        assert item is None

    async def test_get_media_item_movie_with_ranks(self, service: MediaService, mock_db_session: AsyncMock):
        item = _make_media("m-1", "movie", "Movie A")
        mock_db_session.scalar.side_effect = [
            item,  # main media item fetch
            5,     # revenue rank count
            2,     # higher profit rank count
            3,     # lower profit rank count
        ]

        result = await service.get_media_item("m-1")
        assert result == item
        assert result.movie.revenue_rank == 6
        assert result.movie.profit_rank == 3
        assert result.movie.loss_rank == 4


class TestMediaSearch:
    async def test_search_media_basic(self, service: MediaService, mock_db_session: AsyncMock):
        items = [_make_media("m-1", "movie", "Movie Search Result")]
        mock_execute_result = MagicMock()
        mock_execute_result.scalar_one.return_value = 1  # total count for search
        mock_db_session.execute.return_value = mock_execute_result
        mock_db_session.scalars.return_value = items

        res, total, has_more = await service.search_media("Movie", page=1, page_size=10)
        assert res == items
        assert total == 1
        assert has_more is False


class TestGetByIds:
    async def test_get_media_items_by_ids(self, service: MediaService, mock_db_session: AsyncMock):
        items = [_make_media("m-2", "movie", "Movie B"), _make_media("m-1", "movie", "Movie A")]
        mock_db_session.scalars.return_value = items

        # Fetch in order [m-1, m-2]
        res = await service.get_media_items_by_ids(["m-1", "m-2"])
        assert len(res) == 2
        # Verify returned list is sorted according to the requested ids order
        assert res[0].id == "m-1"
        assert res[1].id == "m-2"
