"""Tests for ReviewService and MediaRatingService."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from otix.domain.media_rating import MediaItemRating
from otix.domain.review import Review
from otix.services.media_rating_service import MediaRatingService
from otix.services.review_service import ReviewService

# ── ReviewService Tests ──


@pytest.fixture(autouse=True)
def mock_celery_app():
    with patch("otix.services.review_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def review_service(mock_db_session: AsyncMock) -> ReviewService:
    return ReviewService(mock_db_session)


def _make_review(user_id: str, media_item_id: str, content: str) -> Review:
    r = Review(
        user_id=user_id,
        media_item_id=media_item_id,
        title="Review Title",
        content=content,
        is_spoiler=False,
        is_private=False,
        cooldown_until=datetime.now(UTC) + timedelta(minutes=30),
    )
    r.created_at = datetime.now(UTC)
    return r


class TestReviewUpsert:
    async def test_upsert_new_review_with_content(self, review_service: ReviewService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        review = await review_service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            title="Great",
            content="Highly recommended",
            is_spoiler=False,
            is_private=False,
        )

        assert review.content == "Highly recommended"
        assert review.title == "Great"
        mock_db_session.add.assert_called_once_with(review)
        assert mock_db_session.flush.call_count >= 1

    async def test_upsert_existing_review(self, review_service: ReviewService, mock_db_session: AsyncMock):
        existing = _make_review("user-123", "oti_med01", "Original text")
        mock_db_session.scalar.return_value = existing

        review = await review_service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            title="Updated Title",
            content="Updated Content",
            is_spoiler=True,
            is_private=True,
        )

        assert review == existing
        assert review.content == "Updated Content"
        assert review.is_spoiler is True
        assert review.is_private is True
        mock_db_session.add.assert_not_called()

    async def test_upsert_locked_after_cooldown(self, review_service: ReviewService, mock_db_session: AsyncMock):
        """After cooldown expires, text fields are locked."""
        existing = _make_review("user-123", "oti_med01", "Original")
        existing.cooldown_until = datetime.now(UTC) - timedelta(minutes=1)
        mock_db_session.scalar.return_value = existing

        review = await review_service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            title="New Title",
            content="New Content",
            is_spoiler=True,
            is_private=True,
        )

        # Text fields remain unchanged after cooldown
        assert review.content == "Original"
        assert review.title == "Review Title"
        assert review.is_spoiler is False
        assert review.is_private is False

    async def test_upsert_during_cooldown_allows_edit(self, review_service: ReviewService, mock_db_session: AsyncMock):
        """During cooldown, text fields can still be edited."""
        existing = _make_review("user-123", "oti_med01", "Original")
        existing.cooldown_until = datetime.now(UTC) + timedelta(minutes=5)
        mock_db_session.scalar.return_value = existing

        review = await review_service.upsert_review(
            user_id="user-123",
            media_item_id="oti_med01",
            title="Edited Title",
            content="Edited Content",
            is_spoiler=True,
            is_private=True,
        )

        assert review.content == "Edited Content"
        assert review.title == "Edited Title"
        assert review.is_spoiler is True


class TestReviewGetQueries:
    async def test_get_my_review(self, review_service: ReviewService, mock_db_session: AsyncMock):
        existing = _make_review("user-123", "oti_med01", "Great")
        mock_db_session.scalar.return_value = existing

        result = await review_service.get_my_review("user-123", "oti_med01")
        assert result == existing

    async def test_get_reviews_for_media_basic(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
            _make_review("user-2", "oti_med01", "Good"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_for_media("oti_med01", limit=10)

        assert len(result) == 2
        assert has_more is False

    async def test_get_reviews_for_media_has_more(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
            _make_review("user-2", "oti_med01", "Good"),
            _make_review("user-3", "oti_med01", "Okay"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_for_media("oti_med01", limit=2)

        assert len(result) == 2
        assert has_more is True

    async def test_get_reviews_for_media_with_cursor(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_for_media(
            "oti_med01",
            cursor="2026-05-24T12:00:00__user-2",
            limit=10,
        )

        assert len(result) == 1
        assert has_more is False

    async def test_get_reviews_by_user_basic(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
            _make_review("user-1", "oti_med02", "Good"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_by_user("user-1", limit=10)

        assert len(result) == 2
        assert has_more is False

    async def test_get_reviews_by_user_has_more(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
            _make_review("user-1", "oti_med02", "Good"),
            _make_review("user-1", "oti_med03", "Okay"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_by_user("user-1", limit=2)

        assert len(result) == 2
        assert has_more is True

    async def test_get_reviews_by_user_with_cursor(self, review_service: ReviewService, mock_db_session: AsyncMock):
        reviews = [
            _make_review("user-1", "oti_med01", "Great"),
        ]
        mock_db_session.scalars.return_value = iter(reviews)

        result, has_more = await review_service.get_reviews_by_user(
            "user-1",
            cursor="2026-05-24T12:00:00",
            limit=10,
        )

        assert len(result) == 1
        assert has_more is False


class TestReviewDelete:
    async def test_delete_review_success(self, review_service: ReviewService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 1
        mock_db_session.execute.return_value = mock_res

        result = await review_service.delete_review("user-123", "oti_med01")

        assert result is True

    async def test_delete_review_not_found(self, review_service: ReviewService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db_session.execute.return_value = mock_res

        result = await review_service.delete_review("user-123", "oti_med01")

        assert result is False


# ── MediaRatingService Tests ──


@pytest.fixture(autouse=True)
def mock_celery_app_rating():
    with patch("otix.services.media_rating_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def rating_service(mock_db_session: AsyncMock) -> MediaRatingService:
    return MediaRatingService(mock_db_session)


def _make_rating(user_id: str, media_item_id: str, score: int) -> MediaItemRating:
    r = MediaItemRating(
        user_id=user_id,
        media_item_id=media_item_id,
        score=score,
    )
    return r


class TestRatingUpsert:
    async def test_upsert_new_rating(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        # Mock recalc aggregates
        mock_row = MagicMock()
        mock_row.avg = 5.0
        mock_row.cnt = 1
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        rating = await rating_service.upsert_rating(
            user_id="user-123",
            media_item_id="oti_med01",
            score=8,
        )

        assert rating.user_id == "user-123"
        assert rating.media_item_id == "oti_med01"
        assert rating.score == 8
        mock_db_session.add.assert_called_once()
        assert mock_db_session.flush.call_count >= 1

    async def test_upsert_existing_rating(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        existing = _make_rating("user-123", "oti_med01", 7)
        mock_db_session.scalar.return_value = existing

        mock_row = MagicMock()
        mock_row.avg = 8.0
        mock_row.cnt = 10
        mock_execute_result = MagicMock()
        mock_execute_result.one_or_none.return_value = mock_row
        mock_db_session.execute.return_value = mock_execute_result

        rating = await rating_service.upsert_rating(
            user_id="user-123",
            media_item_id="oti_med01",
            score=9,
        )

        assert rating == existing
        assert rating.score == 9
        mock_db_session.add.assert_not_called()


class TestRatingGetQueries:
    async def test_get_my_rating(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        rating = _make_rating("user-123", "oti_med01", 8)
        mock_db_session.scalar.return_value = rating

        result = await rating_service.get_my_rating("user-123", "oti_med01")
        assert result == rating

    async def test_get_my_rating_not_found(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        result = await rating_service.get_my_rating("user-123", "oti_med01")
        assert result is None


class TestRatingDelete:
    async def test_delete_rating_success(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        # execute is called for: DELETE, recalc SELECT, recalc UPDATE
        delete_result = MagicMock()
        delete_result.rowcount = 1
        select_result = MagicMock()
        select_result.one_or_none.return_value = None
        update_result = MagicMock()
        mock_db_session.execute.side_effect = [delete_result, select_result, update_result]

        result = await rating_service.delete_rating("user-123", "oti_med01")
        assert result is True

    async def test_delete_rating_not_found(self, rating_service: MediaRatingService, mock_db_session: AsyncMock):
        mock_res = MagicMock()
        mock_res.rowcount = 0
        mock_db_session.execute.return_value = mock_res

        result = await rating_service.delete_rating("user-123", "oti_med01")
        assert result is False
