from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException, status

from otix.api.user import claim_badge, get_user_badges
from otix.domain.user import User
from otix.domain.user_badge import UserBadge
from otix.lib.badges import BADGES, BadgeContext


def make_user() -> User:
    user = User(email="test@example.com", username="test", hashed_password="hash")
    user.id = "oti_user000001"
    return user


@pytest.fixture
def mock_session() -> AsyncMock:
    session = AsyncMock()
    session.add = MagicMock()
    session.flush = AsyncMock()
    session.refresh = AsyncMock()
    session.commit = AsyncMock()
    return session


async def test_get_user_badges_returns_claimed_and_xp_reward(mock_session: AsyncMock):
    user = make_user()
    
    # Mocking User model returning
    mock_session.scalar.return_value = user
    
    # Mocking user badges database query
    earned_badge = UserBadge(user_id=user.id, badge_key="first_review", claimed=True)
    mock_session.scalars.return_value = [earned_badge]

    # Patch the context retrieval to return a real BadgeContext
    with patch("otix.services.gamification_service.GamificationService._get_badge_context") as mock_ctx:
        mock_ctx.return_value = BadgeContext(review_count=5)
        
        badges = await get_user_badges(username="test", db=mock_session)
        
        # Verify fields are exposed
        first_review_badge = next(b for b in badges if b.badge_key == "first_review")
        assert first_review_badge.claimed is True
        assert first_review_badge.xp_reward == 150  # Special tier
        
        locked_badge = next(b for b in badges if b.badge_key == "reviews_10")
        assert locked_badge.claimed is False
        assert locked_badge.xp_reward == 50  # Bronze tier


async def test_claim_badge_success(mock_session: AsyncMock):
    user = make_user()
    
    # UserBadge is found and unclaimed
    user_badge = UserBadge(user_id=user.id, badge_key="first_review", claimed=False)
    mock_session.scalar.return_value = user_badge

    with patch("otix.infrastructure.celery.app.send_task") as send_task:
        result = await claim_badge(
            badge_key="first_review",
            db=mock_session,
            current_user=user,
        )

    assert result == {"status": "ok", "xp_awarded": 150}
    assert user_badge.claimed is True
    mock_session.commit.assert_awaited_once()
    send_task.assert_called_once_with("xp.award", args=["oti_user000001", 150])


async def test_claim_badge_not_found(mock_session: AsyncMock):
    user = make_user()

    with pytest.raises(HTTPException) as exc_info:
        await claim_badge(
            badge_key="invalid_key",
            db=mock_session,
            current_user=user,
        )

    assert exc_info.value.status_code == status.HTTP_404_NOT_FOUND
    assert "Badge definition not found" in exc_info.value.detail


async def test_claim_badge_not_earned(mock_session: AsyncMock):
    user = make_user()
    
    # No UserBadge in database
    mock_session.scalar.return_value = None

    with pytest.raises(HTTPException) as exc_info:
        await claim_badge(
            badge_key="first_review",
            db=mock_session,
            current_user=user,
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "Badge not earned yet" in exc_info.value.detail


async def test_claim_badge_already_claimed(mock_session: AsyncMock):
    user = make_user()
    
    # UserBadge is found but already claimed
    user_badge = UserBadge(user_id=user.id, badge_key="first_review", claimed=True)
    mock_session.scalar.return_value = user_badge

    with pytest.raises(HTTPException) as exc_info:
        await claim_badge(
            badge_key="first_review",
            db=mock_session,
            current_user=user,
        )

    assert exc_info.value.status_code == status.HTTP_400_BAD_REQUEST
    assert "Badge reward already claimed" in exc_info.value.detail
