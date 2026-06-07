from __future__ import annotations

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from pydantic import ValidationError

from otix.api.user.mood import dismiss_mood_checkin, get_today_mood_checkin, submit_mood_checkin
from otix.domain.mood import UserMoodCheckIn
from otix.domain.user import User
from otix.lib.xp import MOOD_CHECKIN
from otix.schemas.mood import MoodCheckInCreate


def make_user() -> User:
    user = User(email="test@example.com", username="test", hashed_password="hash")
    user.id = "oti_user000001"
    user.daily_mood_checkins_enabled = True
    return user


def make_checkin(status: str = "submitted", mood: str | None = "good") -> UserMoodCheckIn:
    checkin = UserMoodCheckIn(
        user_id="oti_user000001",
        checkin_date=datetime.now(UTC).date(),
        status=status,
        mood=mood,
        feeling="calm" if mood else None,
        note=None,
    )
    checkin.id = "oti_mood000001"
    checkin.created_at = datetime.now(UTC)
    checkin.updated_at = datetime.now(UTC)
    return checkin


@pytest.fixture
def mock_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    return session


async def test_today_due_when_no_checkin(mock_session: AsyncMock):
    mock_session.scalar.return_value = None

    response = await get_today_mood_checkin(MagicMock(), mock_session, make_user())

    assert response.due is True
    assert response.checkin is None


async def test_today_not_due_when_checkin_exists(mock_session: AsyncMock):
    checkin = make_checkin()
    mock_session.scalar.return_value = checkin

    response = await get_today_mood_checkin(MagicMock(), mock_session, make_user())

    assert response.due is False
    assert response.checkin is not None
    assert response.checkin.id == checkin.id
    assert response.checkin.mood == checkin.mood


async def test_today_not_due_when_feature_disabled(mock_session: AsyncMock):
    user = make_user()
    user.daily_mood_checkins_enabled = False

    response = await get_today_mood_checkin(MagicMock(), mock_session, user)

    assert response.due is False
    assert response.checkin is None
    mock_session.scalar.assert_not_called()


async def test_submit_creates_today_checkin(mock_session: AsyncMock):
    mock_session.scalar.return_value = None

    with patch("otix.api.user.mood.app.send_task") as send_task:
        result = await submit_mood_checkin(
            MoodCheckInCreate(mood="great", feeling="focused", note="  Clear headed  "),
            MagicMock(),
            mock_session,
            make_user(),
        )

    assert result.status == "submitted"
    assert result.mood == "great"
    assert result.feeling == "focused"
    assert result.note == "Clear headed"
    mock_session.add.assert_called_once_with(result)
    mock_session.flush.assert_awaited_once()
    send_task.assert_called_once_with("xp.award", args=["oti_user000001", MOOD_CHECKIN])


async def test_submit_updates_existing_today_checkin(mock_session: AsyncMock):
    existing = make_checkin(status="dismissed", mood=None)
    mock_session.scalar.return_value = existing

    with patch("otix.api.user.mood.app.send_task") as send_task:
        result = await submit_mood_checkin(
            MoodCheckInCreate(mood="okay", feeling="tired", note=None),
            MagicMock(),
            mock_session,
            make_user(),
        )

    assert result is existing
    assert existing.status == "submitted"
    assert existing.mood == "okay"
    assert existing.feeling == "tired"
    assert existing.note is None
    mock_session.add.assert_not_called()
    send_task.assert_called_once_with("xp.award", args=["oti_user000001", MOOD_CHECKIN])


async def test_submit_updates_existing_submitted_checkin_without_duplicate_xp(mock_session: AsyncMock):
    existing = make_checkin(status="submitted", mood="good")
    mock_session.scalar.return_value = existing

    with patch("otix.api.user.mood.app.send_task") as send_task:
        result = await submit_mood_checkin(
            MoodCheckInCreate(mood="bad", feeling="heartbroken", note="Updated"),
            MagicMock(),
            mock_session,
            make_user(),
        )

    assert result is existing
    assert existing.status == "submitted"
    assert existing.mood == "bad"
    assert existing.feeling == "heartbroken"
    assert existing.note == "Updated"
    send_task.assert_not_called()


async def test_dismiss_creates_today_checkin(mock_session: AsyncMock):
    mock_session.scalar.return_value = None

    result = await dismiss_mood_checkin(MagicMock(), mock_session, make_user())

    assert result.status == "dismissed"
    assert result.mood is None
    assert result.feeling is None
    assert result.note is None
    mock_session.add.assert_called_once_with(result)
    mock_session.flush.assert_awaited_once()


async def test_dismiss_updates_existing_today_checkin(mock_session: AsyncMock):
    existing = make_checkin(status="submitted", mood="bad")
    existing.note = "Long day"
    mock_session.scalar.return_value = existing

    result = await dismiss_mood_checkin(MagicMock(), mock_session, make_user())

    assert result is existing
    assert existing.status == "dismissed"
    assert existing.mood is None
    assert existing.feeling is None
    assert existing.note is None
    mock_session.add.assert_not_called()


def test_mood_payload_rejects_long_notes():
    with pytest.raises(ValidationError):
        MoodCheckInCreate(mood="good", note="x" * 281)


def test_mood_payload_rejects_unknown_feelings():
    with pytest.raises(ValidationError):
        MoodCheckInCreate(mood="bad", feeling="conflicted")
