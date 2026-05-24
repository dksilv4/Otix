"""Tests for KarmaService — voting, removing votes, fetching vote counts, and adjusting karma with mocked DB session."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest
from datetime import datetime, timezone

from otix.domain.karma_transaction import KarmaTransaction
from otix.domain.review_vote import ReviewVote
from otix.domain.user import User
from otix.services.karma_service import KarmaService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> KarmaService:
    return KarmaService(mock_db_session)


def _make_user(user_id: str, username: str, karma: int = 10) -> User:
    u = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password="hashedpassword",
    )
    u.id = user_id
    u.karma = karma
    return u


def _make_vote(user_id: str, review_user_id: str, media_item_id: str, vote_type: str) -> ReviewVote:
    v = ReviewVote(
        user_id=user_id,
        review_user_id=review_user_id,
        review_media_item_id=media_item_id,
        vote_type=vote_type,
    )
    return v


class TestKarmaVote:
    async def test_vote_new_upvote(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None  # No existing vote

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "up")

        assert vote_type == "up"
        mock_db_session.add.assert_called()  # Vote added
        # Flush was called twice (one inside _adjust_karma and one at end of vote)
        assert mock_db_session.flush.call_count >= 1

    async def test_vote_new_downvote(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "down")

        assert vote_type == "down"
        mock_db_session.add.assert_called()

    async def test_vote_toggle_off_upvote(self, service: KarmaService, mock_db_session: AsyncMock):
        existing = _make_vote("user-voter", "user-reviewer", "oti_med01", "up")
        mock_db_session.scalar.return_value = existing

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "up")

        assert vote_type is None
        mock_db_session.delete.assert_called_once_with(existing)

    async def test_vote_toggle_off_downvote(self, service: KarmaService, mock_db_session: AsyncMock):
        existing = _make_vote("user-voter", "user-reviewer", "oti_med01", "down")
        mock_db_session.scalar.return_value = existing

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "down")

        assert vote_type is None
        mock_db_session.delete.assert_called_once_with(existing)

    async def test_vote_flip_down_to_up(self, service: KarmaService, mock_db_session: AsyncMock):
        existing = _make_vote("user-voter", "user-reviewer", "oti_med01", "down")
        mock_db_session.scalar.return_value = existing

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "up")

        assert vote_type == "up"
        assert existing.vote_type == "up"

    async def test_vote_flip_up_to_down(self, service: KarmaService, mock_db_session: AsyncMock):
        existing = _make_vote("user-voter", "user-reviewer", "oti_med01", "up")
        mock_db_session.scalar.return_value = existing

        vote_type = await service.vote("user-voter", "user-reviewer", "oti_med01", "down")

        assert vote_type == "down"
        assert existing.vote_type == "down"


class TestKarmaRemoveVote:
    async def test_remove_vote_not_found(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        result = await service.remove_vote("voter", "reviewer", "med")
        assert result is False

    async def test_remove_upvote_success(self, service: KarmaService, mock_db_session: AsyncMock):
        vote = _make_vote("voter", "reviewer", "med", "up")
        mock_db_session.scalar.return_value = vote

        result = await service.remove_vote("voter", "reviewer", "med")

        assert result is True
        mock_db_session.delete.assert_called_once_with(vote)

    async def test_remove_downvote_success(self, service: KarmaService, mock_db_session: AsyncMock):
        vote = _make_vote("voter", "reviewer", "med", "down")
        mock_db_session.scalar.return_value = vote

        result = await service.remove_vote("voter", "reviewer", "med")

        assert result is True
        mock_db_session.delete.assert_called_once_with(vote)


class TestKarmaGetQueries:
    async def test_get_vote_counts(self, service: KarmaService, mock_db_session: AsyncMock):
        class Row:
            def __init__(self, vote_type, cnt):
                self.vote_type = vote_type
                self.cnt = cnt

        mock_db_session.execute.return_value = [Row("up", 5), Row("down", 2)]
        counts = await service.get_vote_counts("reviewer", "med")
        assert counts == {"up": 5, "down": 2}

    async def test_get_my_vote(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = "up"
        vote_type = await service.get_my_vote("voter", "reviewer", "med")
        assert vote_type == "up"

    async def test_get_karma_balance_found(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = _make_user("user-1", "user1", karma=42)
        balance = await service.get_karma_balance("user-1")
        assert balance == 42

    async def test_get_karma_balance_not_found(self, service: KarmaService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        balance = await service.get_karma_balance("user-nonexistent")
        assert balance == 0


class TestKarmaTransactions:
    async def test_get_karma_transactions_basic(self, service: KarmaService, mock_db_session: AsyncMock):
        tx1 = KarmaTransaction(user_id="user-1", amount=10, reason="test")
        tx1.created_at = datetime.now(timezone.utc)
        mock_db_session.scalars.return_value = iter([tx1])

        result, next_cursor = await service.get_karma_transactions("user-1", limit=10)

        assert len(result) == 1
        assert next_cursor is None

    async def test_get_karma_transactions_has_more(self, service: KarmaService, mock_db_session: AsyncMock):
        tx1 = KarmaTransaction(user_id="user-1", amount=10, reason="test1")
        tx1.created_at = datetime(2026, 5, 24, 12, 0, 0)
        tx2 = KarmaTransaction(user_id="user-1", amount=5, reason="test2")
        tx2.created_at = datetime(2026, 5, 24, 11, 0, 0)

        mock_db_session.scalars.return_value = iter([tx1, tx2])

        result, next_cursor = await service.get_karma_transactions("user-1", limit=1)

        assert len(result) == 1
        assert next_cursor == "2026-05-24T12:00:00"

    async def test_get_karma_transactions_with_cursor(self, service: KarmaService, mock_db_session: AsyncMock):
        tx1 = KarmaTransaction(user_id="user-1", amount=10, reason="test")
        tx1.created_at = datetime.now(timezone.utc)
        mock_db_session.scalars.return_value = iter([tx1])

        result, next_cursor = await service.get_karma_transactions("user-1", cursor="2026-05-24T12:00:00", limit=10)

        assert len(result) == 1
        assert next_cursor is None
