from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_db, get_optional_user
from otix.api.schemas.friend import FriendshipStatusOut
from otix.api.schemas.review import ReviewWithUserOut
from otix.api.schemas.user import PlexIntegrationPublic, SteamIntegrationPublic, UserProfileOut
from otix.domain.review import Review
from otix.domain.user import User
from otix.services.friend_service import FriendService
from otix.services.review_service import ReviewService
from otix.services.steam_auth_service import get_steam_user_info

user_router = APIRouter(prefix="/users", tags=["users"])


def _visibility_allows(visibility: dict, provider: str, is_friend: bool) -> bool:
    level = visibility.get(provider)
    if not level or level == "hidden":
        return False
    if level == "everyone":
        return True
    if level == "friends" and is_friend:
        return True
    return False


@user_router.get("/{username}", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> UserProfileOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    review_count = await db.scalar(
        select(func.count()).select_from(Review).where(
            Review.user_id == user.id,
            Review.content.isnot(None),
            Review.is_private == False,  # noqa: E712
        )
    )

    is_own_profile = current_user is not None and current_user.id == user.id
    is_friend = False
    friendship_status = None

    if current_user and not is_own_profile:
        friend_service = FriendService(db)
        status_data = await friend_service.get_friendship_status(current_user.id, user.id)
        friendship_status = FriendshipStatusOut(**status_data)
        is_friend = status_data["status"] == "friends"

    visibility = user.integration_visibility or {}

    steam = None
    if user.steam_id and (is_own_profile or _visibility_allows(visibility, "steam", is_friend)):
        profile = await get_steam_user_info(user.steam_id)
        if profile:
            steam = SteamIntegrationPublic(
                personaname=profile.get("personaname"),
                avatarfull=profile.get("avatarfull"),
                profileurl=profile.get("profileurl"),
                loccountrycode=profile.get("loccountrycode"),
                personastate=profile.get("personastate"),
            )

    plex = None
    if user.plex_id and (is_own_profile or _visibility_allows(visibility, "plex", is_friend)):
        plex = PlexIntegrationPublic(
            username=user.plex_username,
            thumb=user.plex_thumb,
        )

    tmdb_username = None
    if user.tmdb_session_id and (is_own_profile or _visibility_allows(visibility, "tmdb", is_friend)):
        tmdb_username = user.tmdb_username

    return UserProfileOut(
        id=user.id,
        username=user.username,
        avatar_url=user.avatar_url,
        bio=user.bio,
        background_url=user.background_url,
        created_at=user.created_at,
        review_count=review_count or 0,
        total_xp=user.total_xp,
        steam=steam,
        plex=plex,
        tmdb_username=tmdb_username,
        friendship_status=friendship_status,
    )


@user_router.get("/{username}/reviews", response_model=list[ReviewWithUserOut])
async def get_user_reviews(
    username: str,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[ReviewWithUserOut]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = ReviewService(db)
    items, _ = await service.get_reviews_by_user(user.id, cursor=cursor, limit=limit)
    return [ReviewWithUserOut.model_validate(item) for item in items]
