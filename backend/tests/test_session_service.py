"""Tests for SessionService — creating, touching, listing, and revoking user sessions."""

from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.user import User, UserSession
from otix.services.session_service import SessionService


@pytest.fixture
def service(mock_db_session: AsyncMock) -> SessionService:
    return SessionService(mock_db_session)


def _make_user(user_id: str) -> User:
    u = User(email="test@example.com", username="testuser")
    u.id = user_id
    return u


def _make_session(sess_id: str, user_id: str) -> UserSession:
    s = UserSession(
        user_id=user_id,
        session_key=sess_id,
        ip_address="127.0.0.1",
        user_agent="Firefox",
    )
    s.last_seen_at = datetime.now(UTC)
    s.created_at = datetime.now(UTC)
    return s


class TestSessionService:
    async def test_create_session(self, service: SessionService, mock_db_session: AsyncMock):
        user = _make_user("user-123")
        key = await service.create_session(user, "127.0.0.1", "Chrome")

        assert key is not None
        mock_db_session.add.assert_called_once()
        mock_db_session.flush.assert_awaited()

    async def test_touch_session_found(self, service: SessionService, mock_db_session: AsyncMock):
        sess = _make_session("key-123", "user-123")
        mock_db_session.scalar.return_value = sess

        await service.touch_session("key-123")
        mock_db_session.flush.assert_awaited()

    async def test_touch_session_not_found(self, service: SessionService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        await service.touch_session("key-999")
        mock_db_session.flush.assert_not_called()

    async def test_list_user_sessions(self, service: SessionService, mock_db_session: AsyncMock):
        sess = _make_session("key-123", "user-123")
        mock_result = MagicMock()
        mock_result.scalars.return_value.all.return_value = [sess]
        mock_db_session.execute.return_value = mock_result

        res = await service.list_user_sessions("user-123")
        assert len(res) == 1
        assert res[0]["session_key"] == "key-123"

    async def test_revoke_session_success(self, service: SessionService, mock_db_session: AsyncMock):
        sess = _make_session("key-123", "user-123")
        mock_db_session.scalar.return_value = sess

        res = await service.revoke_session("key-123", user_id="user-123", reason="logged_out")
        assert res is True
        assert sess.revoked_at is not None
        assert sess.revoked_reason == "logged_out"

    async def test_revoke_session_ownership_mismatch(self, service: SessionService, mock_db_session: AsyncMock):
        """Session belongs to a different user — should not revoke."""
        mock_db_session.scalar.return_value = None

        res = await service.revoke_session("key-123", user_id="other-user")
        assert res is False
        mock_db_session.flush.assert_not_called()

    async def test_revoke_session_not_found(self, service: SessionService, mock_db_session: AsyncMock):
        mock_db_session.scalar.return_value = None

        res = await service.revoke_session("key-999")
        assert res is False

    async def test_revoke_other_sessions(self, service: SessionService, mock_db_session: AsyncMock):
        sess = _make_session("key-abc", "user-123")
        mock_result = MagicMock()
        mock_result.scalars.return_value = [sess]
        mock_db_session.execute.return_value = mock_result

        count = await service.revoke_other_sessions("user-123", "key-current")
        assert count == 1
        assert sess.revoked_at is not None
