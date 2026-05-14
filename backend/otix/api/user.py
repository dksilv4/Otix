from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.api.schemas.friend import FriendshipStatusOut
from otix.api.schemas.review import ReviewWithUserOut
from otix.api.schemas.user import PlexIntegrationPublic, SteamIntegrationPublic, UserProfileOut
from otix.api.schemas.user_rating import UserRatingCreate, UserRatingOut, UserReputationOut
from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import UserList
from otix.domain.media import MediaItem
from otix.domain.review import Review
from otix.domain.user import User
from otix.domain.workout import Workout
from otix.services.friend_service import FriendService
from otix.services.review_service import ReviewService
from otix.services.steam_auth_service import get_steam_user_info
from otix.services.user_rating_service import UserRatingService

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

    # Compute composite reputation score
    rating_service = UserRatingService(db)
    reputation = await rating_service.compute_composite_score(user.id)

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
        composite_score=reputation.get("composite_score"),
        profile_sections=user.profile_sections if user.profile_sections else None,
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


# ── User-to-User Ratings ──


@user_router.get("/{username}/rating", response_model=UserRatingOut | None)
async def get_my_user_rating(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRatingOut | None:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rate yourself")

    service = UserRatingService(db)
    rating = await service.get_my_rating(current_user.id, user.id)
    return UserRatingOut.model_validate(rating) if rating else None


@user_router.put("/{username}/rating", response_model=UserRatingOut)
async def rate_user(
    username: str,
    body: UserRatingCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserRatingOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot rate yourself")

    service = UserRatingService(db)
    rating = await service.upsert_rating(current_user.id, user.id, body.score)
    await db.commit()
    return UserRatingOut.model_validate(rating)


@user_router.delete("/{username}/rating", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user_rating(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = UserRatingService(db)
    deleted = await service.delete_rating(current_user.id, user.id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rating not found")
    await db.commit()


# ── Reputation ──


@user_router.get("/{username}/reputation", response_model=UserReputationOut)
async def get_user_reputation(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> UserReputationOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = UserRatingService(db)
    result = await service.compute_composite_score(user.id)
    return UserReputationOut(
        avg_user_rating=user.avg_user_rating,
        user_rating_count=user.user_rating_count,
        composite_score=result.get("composite_score"),
        activity_score=result.get("activity_score"),
        direct_rating=result.get("direct_rating"),
        components=result.get("components", {}),
    )


# ── Profile Sections Data ──


@user_router.get("/{username}/stats")
async def get_user_stats(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    review_count = await db.scalar(
        select(func.count()).select_from(Review).where(
            Review.user_id == user.id,
            Review.content.isnot(None),
            Review.is_private == False,  # noqa: E712
        )
    ) or 0

    interaction_count = await db.scalar(
        select(func.count()).select_from(UserMediaInteraction).where(
            UserMediaInteraction.user_id == user.id,
        )
    ) or 0

    workout_count = await db.scalar(
        select(func.count()).select_from(Workout).where(Workout.user_id == user.id)
    ) or 0

    list_count = await db.scalar(
        select(func.count()).select_from(UserList).where(UserList.user_id == user.id)
    ) or 0

    return {
        "review_count": review_count,
        "interaction_count": interaction_count,
        "workout_count": workout_count,
        "list_count": list_count,
        "total_xp": user.total_xp,
    }


@user_router.get("/{username}/top-rated")
async def get_user_top_rated(
    username: str,
    limit: int = Query(12, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    result = await db.execute(
        select(Review, MediaItem)
        .join(MediaItem, Review.media_item_id == MediaItem.id)
        .where(
            Review.user_id == user.id,
            Review.score.isnot(None),
            Review.is_private == False,  # noqa: E712
        )
        .order_by(Review.score.desc(), Review.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        {
            "review": ReviewWithUserOut.model_validate(review).model_dump(),
            "media_item": {
                "id": media.id,
                "title": media.title,
                "media_type": media.media_type,
                "poster_url": media.poster_url,
                "release_year": media.release_year,
            },
        }
        for review, media in rows
    ]


@user_router.get("/{username}/activity")
async def get_user_activity(
    username: str,
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[dict]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Fetch recent reviews (public, with content)
    reviews = await db.execute(
        select(Review, MediaItem)
        .join(MediaItem, Review.media_item_id == MediaItem.id)
        .where(
            Review.user_id == user.id,
            Review.content.isnot(None),
            Review.is_private == False,  # noqa: E712
        )
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    review_rows = reviews.all()

    # Fetch recent interactions
    interactions = await db.execute(
        select(UserMediaInteraction, MediaItem)
        .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
        .where(UserMediaInteraction.user_id == user.id)
        .order_by(UserMediaInteraction.created_at.desc())
        .limit(limit)
    )
    interaction_rows = interactions.all()

    # Build unified timeline
    events: list[dict] = []

    for review, media in review_rows:
        events.append({
            "type": "review",
            "timestamp": review.created_at.isoformat(),
            "summary": f"Reviewed {media.title}",
            "score": review.score,
            "content": review.content[:200] if review.content else None,
            "media_item": {
                "id": media.id,
                "title": media.title,
                "media_type": media.media_type,
                "poster_url": media.poster_url,
            },
        })

    for interaction, media in interaction_rows:
        action = interaction.interaction_type
        past_tense = {
            "like": "Liked",
            "watched": "Watched",
            "played": "Played",
            "watchlist": "Added to watchlist",
            "started": "Started",
            "completed": "Completed",
            "dropped": "Dropped",
        }.get(action, action.capitalize())
        events.append({
            "type": "interaction",
            "timestamp": interaction.created_at.isoformat(),
            "summary": f"{past_tense} {media.title}",
            "interaction_type": action,
            "media_item": {
                "id": media.id,
                "title": media.title,
                "media_type": media.media_type,
                "poster_url": media.poster_url,
            },
        })

    # Sort merged timeline by timestamp desc
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]
