from __future__ import annotations

import asyncio

import structlog
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api._utils import get_current_user, get_db, get_optional_user
from otix.schemas.review import ReviewWithUserOut
from otix.schemas.user import (
    PlexIntegrationPublic,
    SteamIntegrationPublic,
    UserProfileOut,
)
from otix.schemas.friend import FriendshipStatusOut
from otix.domain.admin_edit import MediaEditProposal
from otix.domain.media import MediaItem
from otix.domain.notification import Notification
from otix.domain.review import Review
from otix.domain.user import User
from otix.domain.user_streak import UserStreak
from otix.lib.levels import compute_level_info
from otix.services.follow_service import FollowService
from otix.services.friend_service import FriendService
from otix.services.review_service import ReviewService
from otix.services.steam_auth_service import get_steam_user_info
from otix.services.user_rating_service import UserRatingService

logger = structlog.get_logger()

router = APIRouter()


def _visibility_allows(visibility: dict, provider: str, is_friend: bool) -> bool:
    level = visibility.get(provider)
    if not level or level == "hidden":
        return False
    if level == "everyone":
        return True
    if level == "friends" and is_friend:
        return True
    return False


@router.get("/{username}", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> UserProfileOut:
    """Get a user's public profile."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user profile", username=username, ip=ip)
        raise

    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_own_profile = current_user is not None and current_user.id == user.id

    steam_task = None
    if user.steam_id:
        steam_task = asyncio.create_task(get_steam_user_info(user.steam_id))

    counts = await db.execute(
        select(
            select(func.count())
            .select_from(Review)
            .where(Review.user_id == user.id, Review.content.isnot(None), Review.is_private == False)  # noqa: E712
            .scalar_subquery(),
            select(func.count()).select_from(User).where(User.total_xp > user.total_xp).scalar_subquery(),
            select(func.count()).select_from(User).scalar_subquery(),
            select(func.count())
            .select_from(MediaEditProposal)
            .where(MediaEditProposal.proposer_user_id == user.id)
            .scalar_subquery(),
            select(func.count())
            .select_from(MediaEditProposal)
            .where(MediaEditProposal.proposer_user_id == user.id, MediaEditProposal.status == "approved")
            .scalar_subquery(),
        )
    )
    review_count, higher_count, total_users_count, proposal_count, approved_count = counts.one()
    streak = await db.scalar(select(UserStreak).where(UserStreak.user_id == user.id))

    rating_service = UserRatingService(db)
    reputation = await rating_service.compute_composite_score(user.id)
    follow_service = FollowService(db)
    follow_counts = await follow_service.get_counts(user.id)

    is_following = False
    if current_user and not is_own_profile:
        is_following = await follow_service.is_following(current_user.id, user.id)

    status_data = None
    if current_user and not is_own_profile:
        friend_service = FriendService(db)
        status_data = await friend_service.get_friendship_status(current_user.id, user.id)

    steam_profile = await steam_task if steam_task else None

    is_friend = False
    friendship_status = None
    if status_data:
        friendship_status = FriendshipStatusOut(**status_data)
        is_friend = status_data["status"] == "friends"

    visibility = user.integration_visibility or {}

    steam = None
    if steam_profile and (is_own_profile or _visibility_allows(visibility, "steam", is_friend)):
        steam = SteamIntegrationPublic(
            personaname=steam_profile.get("personaname"),
            avatarfull=steam_profile.get("avatarfull"),
            profileurl=steam_profile.get("profileurl"),
            loccountrycode=steam_profile.get("loccountrycode"),
            personastate=steam_profile.get("personastate"),
        )

    plex = None
    if user.plex_id and (is_own_profile or _visibility_allows(visibility, "plex", is_friend)):
        plex = PlexIntegrationPublic(username=user.plex_username, thumb=user.plex_thumb)

    tmdb_username = None
    if user.tmdb_session_id and (is_own_profile or _visibility_allows(visibility, "tmdb", is_friend)):
        tmdb_username = user.tmdb_username

    gamification = compute_level_info(user.total_xp)
    higher_count = higher_count or 0
    xp_rank = higher_count + 1
    total_users_count = total_users_count or 0
    xp_percentile = (
        round((total_users_count - higher_count) / total_users_count * 100, 1) if total_users_count > 0 else 100.0
    )
    proposal_count = proposal_count or 0
    approved_count = approved_count or 0
    proposal_approval_rate = round(approved_count / proposal_count * 100, 1) if proposal_count > 0 else None

    logger.info("user profile fetched", username=username, ip=ip)
    return UserProfileOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        created_at=user.created_at,
        review_count=review_count or 0,
        total_xp=user.total_xp,
        avg_user_rating=user.avg_user_rating,
        user_rating_count=user.user_rating_count,
        is_admin=user.is_admin,
        composite_score=reputation.get("composite_score"),
        profile_sections=user.profile_sections if user.profile_sections else None,
        hall_of_fame_media_ids=user.hof_ids,
        steam=steam,
        plex=plex,
        tmdb_username=tmdb_username,
        friendship_status=friendship_status,
        is_following=is_following or False,
        is_private=user.is_private,
        follower_count=follow_counts["followers"],
        following_count=follow_counts["following"],
        level=gamification["level"],
        level_title=gamification["level_title"],
        xp_rank=xp_rank,
        xp_percentile=xp_percentile,
        proposal_count=proposal_count,
        proposal_approval_rate=proposal_approval_rate,
        current_login_streak=streak.current_login_streak if streak else 0,
        longest_login_streak=streak.longest_login_streak if streak else 0,
        current_review_streak=streak.current_review_streak if streak else 0,
        longest_review_streak=streak.longest_review_streak if streak else 0,
    )


@router.get("/{username}/reviews", response_model=list[ReviewWithUserOut])
async def get_user_reviews(
    username: str,
    request: Request,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[ReviewWithUserOut]:
    """Get a user's reviews."""
    ip = request.client.host if request.client else None

    try:
        user = await db.scalar(select(User).where(User.username == username))
        if user is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        service = ReviewService(db)
        items, _ = await service.get_reviews_by_user(
            user.id, cursor=cursor, limit=limit,
            current_user_id=current_user.id if current_user else None,
        )
    except HTTPException:
        raise
    except Exception:
        await db.rollback()
        logger.exception("failed to fetch user reviews", username=username, ip=ip)
        raise

    logger.info("user reviews fetched", username=username, count=len(items), ip=ip)
    return [ReviewWithUserOut.model_validate(item) for item in items]
