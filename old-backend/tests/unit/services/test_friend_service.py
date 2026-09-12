"""Tests for FriendService — sending requests, accepting/rejecting, listing, removing, and checking status with mocked DB session."""

from __future__ import annotations

from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from otix.domain.friend import FriendRequest
from otix.domain.user import User
from otix.services.friend_service import FriendService


@pytest.fixture(autouse=True)
def mock_celery_app():
    with patch("otix.services.friend_service.app.send_task") as mock_send:
        yield mock_send


@pytest.fixture
def service(mock_db_session: AsyncMock) -> FriendService:
    return FriendService(mock_db_session)


def _make_user(user_id: str, username: str) -> User:
    u = User(
        email=f"{username}@example.com",
        username=username,
        hashed_password="hashedpassword",
    )
    u.id = user_id
    return u


def _make_request(req_id: str, sender_id: str, receiver_id: str, status: str = "pending") -> FriendRequest:
    r = FriendRequest(
        sender_id=sender_id,
        receiver_id=receiver_id,
        status=status,
    )
    r.id = req_id
    r.updated_at = datetime.utcnow()
    return r


class TestFriendSendRequest:
    async def test_send_request_success(self, service: FriendService, mock_db_session: AsyncMock):
        sender = _make_user("user-1", "sender")
        mock_db_session.scalar.side_effect = [
            None,  # No existing request
            sender,  # Sender details for notification
        ]

        req = await service.send_request("user-1", "user-2")

        assert req.sender_id == "user-1"
        assert req.receiver_id == "user-2"
        assert req.status == "pending"
        mock_db_session.add.assert_called()  # request and notification added
        mock_db_session.flush.assert_awaited_once()

    async def test_send_request_self(self, service: FriendService):
        with pytest.raises(ValueError, match="Cannot send friend request to yourself"):
            await service.send_request("user-1", "user-1")

    async def test_send_request_already_friends(self, service: FriendService, mock_db_session: AsyncMock):
        existing_req = _make_request("req-1", "user-1", "user-2", "accepted")
        mock_db_session.scalar.return_value = existing_req

        with pytest.raises(ValueError, match="Already friends"):
            await service.send_request("user-1", "user-2")

    async def test_send_request_already_pending(self, service: FriendService, mock_db_session: AsyncMock):
        existing_req = _make_request("req-1", "user-1", "user-2", "pending")
        mock_db_session.scalar.return_value = existing_req

        with pytest.raises(ValueError, match="A pending request already exists"):
            await service.send_request("user-1", "user-2")


class TestFriendAcceptRequest:
    async def test_accept_request_success(self, service: FriendService, mock_db_session: MagicMock):
        req = _make_request("req-1", "user-1", "user-2", "pending")
        req.receiver = _make_user("user-2", "receiver")
        mock_db_session.scalar.return_value = req

        # Mock Celery send_task to prevent actual task dispatch errors
        with MagicMock():
            mock_db_session.scalar.return_value = req

            accepted_req = await service.accept_request("req-1", "user-2")

            assert accepted_req.status == "accepted"
            mock_db_session.add.assert_called_once()  # Notification added
            mock_db_session.flush.assert_awaited_once()

    async def test_accept_request_not_found(self, service: FriendService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        with pytest.raises(ValueError, match="Friend request not found"):
            await service.accept_request("req-99", "user-2")

    async def test_accept_request_wrong_receiver(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "pending")
        mock_db_session.scalar.return_value = req
        with pytest.raises(PermissionError, match="You can only accept requests sent to you"):
            await service.accept_request("req-1", "user-3")

    async def test_accept_request_not_pending(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "accepted")
        mock_db_session.scalar.return_value = req
        with pytest.raises(ValueError, match="Request is no longer pending"):
            await service.accept_request("req-1", "user-2")


class TestFriendRejectRequest:
    async def test_reject_request_success(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "pending")
        req.sender = _make_user("user-1", "sender")
        mock_db_session.scalar.return_value = req

        rejected_req = await service.reject_request("req-1", "user-2")

        assert rejected_req.status == "rejected"
        mock_db_session.add.assert_called_once()  # Notification added
        mock_db_session.flush.assert_awaited_once()

    async def test_reject_request_not_found(self, service: FriendService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        with pytest.raises(ValueError, match="Friend request not found"):
            await service.reject_request("req-99", "user-2")

    async def test_reject_request_wrong_receiver(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "pending")
        mock_db_session.scalar.return_value = req
        with pytest.raises(PermissionError, match="You can only reject requests sent to you"):
            await service.reject_request("req-1", "user-3")

    async def test_reject_request_not_pending(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "rejected")
        mock_db_session.scalar.return_value = req
        with pytest.raises(ValueError, match="Request is no longer pending"):
            await service.reject_request("req-1", "user-2")


class TestFriendGetListsAndStatus:
    async def test_get_friends(self, service: FriendService, mock_db_session: AsyncMock):
        friends = [
            _make_user("user-2", "friend1"),
            _make_user("user-3", "friend2"),
        ]
        mock_db_session.scalars.return_value = iter(friends)

        result = await service.get_friends("user-1")

        assert len(result) == 2
        assert result[0].username == "friend1"

    async def test_get_friendship_status_none(self, service: FriendService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        status_info = await service.get_friendship_status("user-1", "user-2")
        assert status_info == {"status": "none", "request_id": None}

    async def test_get_friendship_status_friends(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-123", "user-1", "user-2", "accepted")
        mock_db_session.scalar.return_value = req
        status_info = await service.get_friendship_status("user-1", "user-2")
        assert status_info == {"status": "friends", "request_id": "req-123"}

    async def test_get_friendship_status_pending_sent(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-123", "user-1", "user-2", "pending")
        mock_db_session.scalar.return_value = req
        status_info = await service.get_friendship_status("user-1", "user-2")
        assert status_info == {"status": "pending_sent", "request_id": "req-123"}

    async def test_get_friendship_status_pending_received(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-123", "user-2", "user-1", "pending")
        mock_db_session.scalar.return_value = req
        status_info = await service.get_friendship_status("user-1", "user-2")
        assert status_info == {"status": "pending_received", "request_id": "req-123"}

    async def test_get_pending_received(self, service: FriendService, mock_db_session: AsyncMock):
        reqs = [_make_request("req-1", "user-2", "user-1")]
        mock_db_session.scalars.return_value = iter(reqs)
        result = await service.get_pending_received("user-1")
        assert len(result) == 1

    async def test_get_pending_sent(self, service: FriendService, mock_db_session: AsyncMock):
        reqs = [_make_request("req-1", "user-1", "user-2")]
        mock_db_session.scalars.return_value = iter(reqs)
        result = await service.get_pending_sent("user-1")
        assert len(result) == 1

    async def test_get_friends_since_found(self, service: FriendService, mock_db_session: AsyncMock):
        req = _make_request("req-1", "user-1", "user-2", "accepted")
        mock_db_session.scalar.return_value = req
        result = await service.get_friends_since("user-1", "user-2")
        assert result == req.updated_at

    async def test_get_friends_since_not_found(self, service: FriendService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None
        result = await service.get_friends_since("user-1", "user-2")
        assert result is None


class TestFriendRemoveFriend:
    async def test_remove_friend_success(self, service: FriendService, mock_db_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.rowcount = 1
        mock_db_session.execute.return_value = mock_result
        mock_db_session.scalar.return_value = _make_user("user-1", "remover")

        result = await service.remove_friend("user-1", "user-2")

        assert result is True
        mock_db_session.add.assert_called_once()  # Notification added
        mock_db_session.flush.assert_awaited_once()

    async def test_remove_friend_not_friends(self, service: FriendService, mock_db_session: AsyncMock):
        mock_result = MagicMock()
        mock_result.rowcount = 0
        mock_db_session.execute.return_value = mock_result

        result = await service.remove_friend("user-1", "user-2")

        assert result is False
        mock_db_session.add.assert_not_called()
