"""Tests for NotificationService — create, get_for_user, mark_read, mark_all_read, and get_unread_count."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock
import pytest
from datetime import datetime, timezone

from otix.domain.notification import Notification
from otix.services.notification_service import NotificationService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> NotificationService:
    return NotificationService(mock_db_session)


def _make_notification(id_suffix: str, user_id: str, type_: str, title: str) -> Notification:
    n = Notification(
        user_id=user_id,
        type=type_,
        title=title,
        body="Body of the notification",
        metadata_json={},
        is_read=False,
    )
    n.id = f"oti_notif{id_suffix}"
    n.created_at = datetime.now(timezone.utc)
    return n


class TestCreateNotification:
    async def test_create_success(self, service: NotificationService, mock_db_session: AsyncMock):
        notification = await service.create(
            user_id="user-123",
            type_="like",
            title="Your post was liked",
            body="Someone liked your post",
            metadata_json={"post_id": "post-1"},
        )

        assert notification.user_id == "user-123"
        assert notification.type == "like"
        assert notification.title == "Your post was liked"
        assert notification.body == "Someone liked your post"
        assert notification.metadata_json == {"post_id": "post-1"}
        mock_db_session.add.assert_called_once_with(notification)
        mock_db_session.flush.assert_awaited_once()


class TestGetForUser:
    async def test_get_for_user_basic(self, service: NotificationService, mock_db_session: AsyncMock):
        notifs = [
            _make_notification("01", "user-123", "follow", "Follower 1"),
            _make_notification("02", "user-123", "like", "Like 1"),
        ]
        mock_db_session.scalars.return_value = iter(notifs)

        result, has_more = await service.get_for_user("user-123", limit=10)

        assert len(result) == 2
        assert result[0].title == "Follower 1"
        assert has_more is False

    async def test_get_for_user_with_cursor(self, service: NotificationService, mock_db_session: AsyncMock):
        notifs = [
            _make_notification("02", "user-123", "like", "Like 1"),
        ]
        mock_db_session.scalars.return_value = iter(notifs)

        result, has_more = await service.get_for_user("user-123", cursor="2026-05-24T12:00:00", limit=10)

        assert len(result) == 1
        assert has_more is False

    async def test_get_for_user_has_more(self, service: NotificationService, mock_db_session: AsyncMock):
        notifs = [
            _make_notification("01", "user-123", "follow", "Follower 1"),
            _make_notification("02", "user-123", "like", "Like 1"),
            _make_notification("03", "user-123", "comment", "Comment 1"),
        ]
        mock_db_session.scalars.return_value = iter(notifs)

        result, has_more = await service.get_for_user("user-123", limit=2)

        assert len(result) == 2
        assert has_more is True


class TestMarkRead:
    async def test_mark_read_found(self, service: NotificationService, mock_db_session: AsyncMock):
        notif = _make_notification("01", "user-123", "follow", "Follower 1")
        assert notif.is_read is False
        mock_db_session.scalar.return_value = notif

        result = await service.mark_read("oti_notif01", "user-123")

        assert result is notif
        assert notif.is_read is True
        assert notif.read_at is not None
        mock_db_session.flush.assert_awaited_once()

    async def test_mark_read_not_found(self, service: NotificationService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        result = await service.mark_read("oti_notif99", "user-123")

        assert result is None
        mock_db_session.flush.assert_not_called()


class TestMarkAllRead:
    async def test_mark_all_read(self, service: NotificationService, mock_db_session: AsyncMock):
        await service.mark_all_read("user-123")
        mock_db_session.execute.assert_called_once()
        mock_db_session.flush.assert_awaited_once()


class TestGetUnreadCount:
    async def test_get_unread_count(self, service: NotificationService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = 5
        count = await service.get_unread_count("user-123")
        assert count == 5
