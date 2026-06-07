"""Tests for FollowService — follow, unfollow, get_followers, get_following, get_counts, and is_following."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.follow import Follow
from otix.domain.user import User
from otix.services.follow_service import FollowService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> FollowService:
    return FollowService(mock_db_session)


def _make_user(user_id: str, username: str) -> User:
    u = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password="hashedpassword",
    )
    u.id = user_id
    return u


class TestFollow:
    async def test_follow_success(self, service: FollowService, mock_db_session: AsyncMock):
        follower = _make_user("user-1", "follower")
        _make_user("user-2", "followed")

        # Mock the checks
        mock_db_session.scalar.side_effect = [
            None,  # No existing follow record
            follower,  # The follower user details for the notification
        ]

        follow = await service.follow("user-1", "user-2")

        assert follow.follower_id == "user-1"
        assert follow.followed_id == "user-2"
        mock_db_session.add.assert_called()  # Follow and Notification added
        mock_db_session.flush.assert_awaited_once()

    async def test_cannot_follow_self(self, service: FollowService):
        with pytest.raises(ValueError, match="Cannot follow yourself"):
            await service.follow("user-1", "user-1")

    async def test_already_following(self, service: FollowService, mock_db_session: AsyncMock):
        existing_follow = Follow(follower_id="user-1", followed_id="user-2")
        mock_db_session.scalar.return_value = existing_follow

        with pytest.raises(ValueError, match="Already following this user"):
            await service.follow("user-1", "user-2")


class TestUnfollow:
    async def test_unfollow_success(self, service: FollowService, mock_db_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db_session.execute.return_value = mock_result
        result = await service.unfollow("user-1", "user-2")
        assert result is True
        mock_db_session.flush.assert_awaited_once()

    async def test_unfollow_not_following(self, service: FollowService, mock_db_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_db_session.execute.return_value = mock_result
        result = await service.unfollow("user-1", "user-2")
        assert result is False


class TestGetFollowers:
    async def test_get_followers_basic(self, service: FollowService, mock_db_session: AsyncMock):
        followers = [
            (_make_user("user-2", "user2"), datetime(2026, 5, 24, 12, 0, 0)),
            (_make_user("user-3", "user3"), datetime(2026, 5, 23, 12, 0, 0)),
        ]
        mock_db_session.execute.return_value = followers

        result, next_cursor = await service.get_followers("user-1", limit=10)

        assert len(result) == 2
        assert result[0].username == "user2"
        assert next_cursor is None

    async def test_get_followers_with_cursor(self, service: FollowService, mock_db_session: AsyncMock):
        followers = [
            (_make_user("user-2", "user2"), datetime(2026, 5, 24, 12, 0, 0)),
        ]
        mock_db_session.execute.return_value = followers

        result, next_cursor = await service.get_followers("user-1", cursor="2026-05-24T12:00:00", limit=10)

        assert len(result) == 1
        assert next_cursor is None

    async def test_get_followers_has_more(self, service: FollowService, mock_db_session: AsyncMock):
        dt1 = datetime(2026, 5, 24, 12, 0, 0)
        dt2 = datetime(2026, 5, 23, 12, 0, 0)
        dt3 = datetime(2026, 5, 22, 12, 0, 0)
        followers = [
            (_make_user("user-2", "user2"), dt1),
            (_make_user("user-3", "user3"), dt2),
            (_make_user("user-4", "user4"), dt3),
        ]
        mock_db_session.execute.return_value = followers

        result, next_cursor = await service.get_followers("user-1", limit=2)

        assert len(result) == 2
        assert next_cursor == "2026-05-23T12:00:00"

    async def test_get_followers_has_more_fallback(self, service: FollowService, mock_db_session: AsyncMock):
        dt1 = datetime(2026, 5, 24, 12, 0, 0)
        dt2 = datetime(2026, 5, 23, 12, 0, 0)
        dt3 = datetime(2026, 5, 22, 12, 0, 0)
        followers = [
            (_make_user("user-2", "user2"), dt1),
            (_make_user("user-3", "user3"), dt2),
            (_make_user("user-4", "user4"), dt3),
        ]
        mock_db_session.execute.return_value = followers

        result, next_cursor = await service.get_followers("user-1", limit=2)

        assert len(result) == 2
        assert next_cursor == "2026-05-23T12:00:00"


class TestGetFollowing:
    async def test_get_following_basic(self, service: FollowService, mock_db_session: AsyncMock):
        following = [
            (_make_user("user-2", "user2"), datetime(2026, 5, 24, 12, 0, 0)),
            (_make_user("user-3", "user3"), datetime(2026, 5, 23, 12, 0, 0)),
        ]
        mock_db_session.execute.return_value = following

        result, next_cursor = await service.get_following("user-1", limit=10)

        assert len(result) == 2
        assert next_cursor is None

    async def test_get_following_has_more(self, service: FollowService, mock_db_session: AsyncMock):
        dt1 = datetime(2026, 5, 24, 12, 0, 0)
        dt2 = datetime(2026, 5, 23, 12, 0, 0)
        dt3 = datetime(2026, 5, 22, 12, 0, 0)
        following = [
            (_make_user("user-2", "user2"), dt1),
            (_make_user("user-3", "user3"), dt2),
            (_make_user("user-4", "user4"), dt3),
        ]
        mock_db_session.execute.return_value = following

        result, next_cursor = await service.get_following("user-1", limit=2)

        assert len(result) == 2
        assert next_cursor == "2026-05-23T12:00:00"


class TestGetCounts:
    async def test_get_counts(self, service: FollowService, mock_db_session: AsyncMock):
        mock_db_session.scalar.side_effect = [5, 10]
        counts = await service.get_counts("user-1")
        assert counts == {"followers": 5, "following": 10}


class TestIsFollowing:
    async def test_is_following_true(self, service: FollowService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = Follow(follower_id="user-1", followed_id="user-2")
        result = await service.is_following("user-1", "user-2")
        assert result is True

    async def test_is_following_false(self, service: FollowService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        result = await service.is_following("user-1", "user-2")
        assert result is False
