"""Tests for ReviewService — upserting, retrieving, listing, and deleting reviews with rating aggregate calculations and mocked DB session."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch
import pytest
from datetime import datetime, timedelta, timezone

from otix.domain.media import MediaItem
from otix.domain.review import Review
from otix.services.review_service import ReviewService


@pytest.fixture(autouse=True)
def mock_celery_app():
    with patch("otix.services.review_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def service(mock_db_session: AsyncMock) -> ReviewService:
    return ReviewService(mock_db_session)


def _make_review(user_id: str, media_item_id: str, score: int, content: str | None = None) -> Review:
    r = Review(
        user_id=user_id,
        media_item_id=media_item_id,
        score=score,
        title="Review Title" if content else None,
        content=content,
        is_spoiler=False,
        is_private=False,
        cooldown_until=datetime.now(timezone.utc) + timedelta(minutes=30),
    )
    r.created_at = datetime.now(timezone.utc)
    return r


class TestReviewUpsert:
    async def test_upsert_new_review_score_only(self, service: ReviewService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None  # No existing review
        
        # Mock database execute for recalc aggregates
        mock_row = MagicMock()
        mock_row.avg = 4.5
        mock_row.cnt = 1
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        review = await service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            score=9,
            title=None,
            content=None,
            is_spoiler=False,
            is_private=False,
        )

        assert review.user_id == "user-123"
        assert review.score == 9
        assert review.content is None
        mock_db_session.add.assert_called_once_with(review)
        assert mock_db_session.flush.call_count >= 1

    async def test_upsert_new_review_with_content(self, service: ReviewService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        mock_row = MagicMock()
        mock_row.avg = 5.0
        mock_row.cnt = 1
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        review = await service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            score=10,
            title="Great",
            content="Highly recommended",
            is_spoiler=False,
            is_private=False,
        )

        assert review.content == "Highly recommended"
        mock_db_session.add.assert_called_once_with(review)

    async def test_upsert_existing_review(self, service: ReviewService, mock_db_session: AsyncMock):
        existing = _make_review("user-123", "oti_med01", 8, "Original")
        mock_db_session.scalar.return_value = existing

        mock_row = MagicMock()
        mock_row.avg = 8.5
        mock_row.cnt = 10
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        review = await service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            score=9,
            title="Updated Title",
            content="Updated Content",
            is_spoiler=True,
            is_private=True,
        )

        assert review == existing
        assert review.score == 9
        assert review.content == "Updated Content"
        assert review.is_spoiler is True
        assert review.is_private is True
        mock_db_session.add.assert_not_called()

    async def test_upsert_locked_after_cooldown(self, service: ReviewService, mock_db_session: AsyncMock):
        """After cooldown expires, only score can change — text fields are locked."""
        existing = _make_review("user-123", "oti_med01", 8, "Original")
        existing.cooldown_until = datetime.now(timezone.utc) - timedelta(minutes=1)
        mock_db_session.scalar.return_value = existing

        mock_row = MagicMock()
        mock_row.avg = 8.5
        mock_row.cnt = 10
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        review = await service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            score=9,
            title="New Title",
            content="New Content",
            is_spoiler=True,
            is_private=True,
        )

        assert review.score == 9
        # Text fields remain unchanged after cooldown
        assert review.content == "Original"
        assert review.title == "Review Title"
        assert review.is_spoiler is False
        assert review.is_private is False


class TestReviewGetQueries:
    async def test_get_my_review(self, service: ReviewService, mock_db_session: AsyncMock):
        review = _make_review("user-123", "oti_med01", 8)
        mock_db_session.scalar.return_value = review

        result = await service.get_my_review("user-123", "oti_med01")
        assert result == review

    async def test_get_reviews_for_media_basic(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
            _make_review("user-2", "oti_med01", 7, "Good"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_for_media("oti_med01", limit=10)

        assert len(result) == 2
        assert has_more is False

    async def test_get_reviews_for_media_has_more(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
            _make_review("user-2", "oti_med01", 7, "Good"),
            _make_review("user-3", "oti_med01", 6, "Okay"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_for_media("oti_med01", limit=2)

        assert len(result) == 2
        assert has_more is True

    async def test_get_reviews_for_media_with_cursor(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_for_media(
            "oti_med01",
            cursor="2026-05-24T12:00:00__user-2",
            limit=10,
        )

        assert len(result) == 1
        assert has_more is False

    async def test_get_reviews_by_user_basic(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
            _make_review("user-1", "oti_med02", 7, "Good"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_by_user("user-1", limit=10)

        assert len(result) == 2
        assert has_more is False

    async def test_get_reviews_by_user_has_more(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
            _make_review("user-1", "oti_med02", 7, "Good"),
            _make_review("user-1", "oti_med03", 6, "Okay"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_by_user("user-1", limit=2)

        assert len(result) == 2
        assert has_more is True

    async def test_get_reviews_by_user_with_cursor(self, service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", 8, "Great"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await service.get_reviews_by_user(
            "user-1",
            cursor="2026-05-24T12:00:00",
            limit=10,
        )

        assert len(result) == 1
        assert has_more is False


class TestReviewDelete:
    async def test_delete_review_success(self, service: ReviewService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res
        
        # Second execute is for recalc rating aggregates
        mock_row = MagicMock()
        mock_row.avg = 5.0
        mock_row.cnt = 2
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.side_effect = [
            mock_res,  # delete query
            mock_execute_result,  # recalc select query
            None,  # recalc update query
        ]

        result = await service.delete_review("user-123", "oti_med01")

        assert result is True

    async def test_delete_review_not_found(self, service: ReviewService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db_session.execute.return_value = mock_res

        result = await service.delete_review("user-123", "oti_med01")

        assert result is False
