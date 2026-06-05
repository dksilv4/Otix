from __future__ import annotations

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from otix.api.deps import get_current_user, get_db, get_optional_user
from otix.domain.admin_edit import MediaEditProposal
from otix.infrastructure.database import async_session
from otix.api.schemas.friend import FriendshipStatusOut
from otix.api.schemas.review import ReviewWithUserOut
from otix.api.schemas.user import (
    HallOfFameItem,
    LibraryStatsOut,
    MoodCheckinOut,
    MoodTimelineOut,
    PlexIntegrationPublic,
    RatingDistributionItem,
    RatingDistributionOut,
    SteamIntegrationPublic,
    UserProfileOut,
    UserSearchListResponse,
    UserSearchResult,
)
from otix.services.episode_interaction_service import EpisodeInteractionService
from otix.api.schemas.karma import KarmaOut, KarmaTransactionOut
from otix.api.schemas.user_badge import BadgeDefOut, BadgeOut
from otix.lib.badges import BADGES
from otix.api.schemas.user_rating import UserRatingCreate, UserRatingOut, UserReputationOut
from otix.domain.episode_interaction import UserEpisodeInteraction
from otix.domain.interaction import UserMediaInteraction
from otix.domain.list import UserList
from otix.domain.media import Episode, MediaItem, Season
from otix.domain.media_rating import MediaItemRating
from otix.domain.notification import Notification
from otix.domain.review import Review
from otix.domain.mood import UserMoodCheckIn
from otix.domain.user import User, UserRating
from otix.domain.user_streak import UserStreak
from otix.domain.workout import Workout
from otix.lib.levels import compute_level_info
from otix.services.follow_service import FollowService
from otix.services.friend_service import FriendService
from otix.services.gamification_service import GamificationService
from otix.services.karma_service import KarmaService
from otix.services.media_service import MediaService
from otix.services.review_service import ReviewService
from otix.services.steam_auth_service import get_steam_user_info
from otix.services.user_rating_service import UserRatingService

user_router = APIRouter(prefix="/users", tags=["users"])


@user_router.get("/search", response_model=UserSearchListResponse)
async def search_users(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> UserSearchListResponse:
    stmt = (
        select(User)
        .where(User.username.ilike(f"%{q}%"), User.is_active == True)  # noqa: E712
        .order_by(User.username)
        .limit(limit)
    )
    result = await db.scalars(stmt)
    users = list(result)

    items: list[UserSearchResult] = []
    for user in users:
        gamification = compute_level_info(user.total_xp)
        items.append(
            UserSearchResult(
                id=user.id,
                username=user.username,
                avatar_url=user.avatar_url,
                bio=user.bio,
                level=gamification["level"],
                level_title=gamification["level_title"],
                is_admin=user.is_admin,
            )
        )

    return UserSearchListResponse(
        items=items,
        has_more=False,
    )


def _visibility_allows(visibility: dict, provider: str, is_friend: bool) -> bool:
    level = visibility.get(provider)
    if not level or level == "hidden":
        return False
    if level == "everyone":
        return True
    if level == "friends" and is_friend:
        return True
    return False


@user_router.get("/achievements", response_model=list[BadgeDefOut])
async def get_achievement_defs() -> list[BadgeDefOut]:
    return [
        BadgeDefOut(
            badge_key=b.key,
            label=b.label,
            description=b.description,
            icon=b.icon,
            tier=b.tier,
            target=float(b.target),
            xp_reward=b.xp_reward,
        )
        for b in BADGES.values()
    ]


@user_router.get("/{username}", response_model=UserProfileOut)
async def get_user_profile(
    username: str,
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> UserProfileOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_own_profile = current_user is not None and current_user.id == user.id

    # Kick off the external Steam API call early so it overlaps with DB queries
    steam_task = None
    if user.steam_id:
        steam_task = asyncio.create_task(get_steam_user_info(user.steam_id))

    # Fetch review_count, xp_rank, total_users, proposal stats in a single round-trip.
    # Streak is fetched separately because select(UserStreak) has multiple columns
    # and can't be used as a scalar_subquery.
    counts = await db.execute(
        select(
            select(func.count())
            .select_from(Review)
            .where(
                Review.user_id == user.id,
                Review.content.isnot(None),
                Review.is_private == False,  # noqa: E712
            )
            .scalar_subquery(),
            select(func.count()).select_from(User).where(User.total_xp > user.total_xp).scalar_subquery(),
            select(func.count()).select_from(User).scalar_subquery(),
            select(func.count())
            .select_from(MediaEditProposal)
            .where(MediaEditProposal.proposer_user_id == user.id)
            .scalar_subquery(),
            select(func.count())
            .select_from(MediaEditProposal)
            .where(
                MediaEditProposal.proposer_user_id == user.id,
                MediaEditProposal.status == "approved",
            )
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

    # Await the Steam API call (already running during DB queries)
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
        plex = PlexIntegrationPublic(
            username=user.plex_username,
            thumb=user.plex_thumb,
        )

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


@user_router.get("/{username}/reviews", response_model=list[ReviewWithUserOut])
async def get_user_reviews(
    username: str,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
) -> list[ReviewWithUserOut]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = ReviewService(db)
    items, _ = await service.get_reviews_by_user(
        user.id,
        cursor=cursor,
        limit=limit,
        current_user_id=current_user.id if current_user else None,
    )
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
    # Self-check only applies to modifying ratings, not viewing them.
    if user.id == current_user.id:
        return None

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

    existing = await db.scalar(
        select(UserRating).where(
            UserRating.rater_id == current_user.id,
            UserRating.rated_user_id == user.id,
        )
    )

    service = UserRatingService(db)
    rating = await service.upsert_rating(current_user.id, user.id, body.score)

    notification = Notification(
        user_id=user.id,
        type="user_rating",
        title="New Rating",
        body=f"{current_user.username} rated you {body.score}/10",
        metadata_json={
            "rater_id": current_user.id,
            "rater_username": current_user.username,
            "score": body.score,
            "is_new": existing is None,
            "prev_score": existing.score if existing else None,
        },
    )
    db.add(notification)

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
        components=result.get("components", {}),
    )


# ── Rating Distribution ──


@user_router.get("/{username}/rating-distribution", response_model=RatingDistributionOut)
async def get_user_rating_distribution(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> RatingDistributionOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    rows = await db.execute(
        select(
            MediaItemRating.score,
            MediaItem.media_type,
            func.count().label("cnt"),
        )
        .join(MediaItem, MediaItemRating.media_item_id == MediaItem.id)
        .where(
            MediaItemRating.user_id == user.id,
        )
        .group_by(MediaItemRating.score, MediaItem.media_type)
        .order_by(MediaItemRating.score)
    )

    # Seed a map: score -> { movie: 0, show: 0, game: 0, music: 0 }
    by_score: dict[int, dict[str, int]] = {
        score: {"movie": 0, "show": 0, "game": 0, "music": 0} for score in range(1, 11)
    }
    total = 0
    for score, media_type, cnt in rows:
        by_score[score][media_type] = cnt
        total += cnt

    distribution = [RatingDistributionItem(score=s, **by_score[s]) for s in range(1, 11)]

    return RatingDistributionOut(distribution=distribution, total_ratings=total)


# ── Badges ──


@user_router.get("/{username}/badges", response_model=list[BadgeOut])
async def get_user_badges(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> list[BadgeOut]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = GamificationService(db)
    badges = await service.get_user_badges(user.id)
    return [BadgeOut(**b) for b in badges]


@user_router.post("/me/badges/{badge_key}/claim")
async def claim_badge(
    badge_key: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    from otix.domain.user_badge import UserBadge
    from otix.infrastructure.celery import app
    from otix.lib.badges import BADGES

    badge_def = BADGES.get(badge_key)
    if not badge_def:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Badge definition not found")

    # Check if user earned this badge
    user_badge = await db.scalar(
        select(UserBadge).where(
            UserBadge.user_id == current_user.id,
            UserBadge.badge_key == badge_key,
        )
    )
    if not user_badge:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Badge not earned yet")

    if user_badge.claimed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Badge reward already claimed")

    # Set claimed
    user_badge.claimed = True

    # Award XP
    app.send_task("xp.award", args=[current_user.id, badge_def.xp_reward])

    await db.commit()
    return {"status": "ok", "xp_awarded": badge_def.xp_reward}


# ── Profile Sections Data ──


@user_router.get("/{username}/stats")
async def get_user_stats(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Single query with scalar subqueries instead of 4 round-trips
    counts = (
        await db.execute(
            select(
                func.coalesce(
                    select(func.count())
                    .select_from(Review)
                    .where(
                        Review.user_id == user.id,
                        Review.content.isnot(None),
                        Review.is_private == False,  # noqa: E712
                    )
                    .scalar_subquery(),
                    0,
                ).label("review_count"),
                func.coalesce(
                    select(func.count())
                    .select_from(UserMediaInteraction)
                    .where(UserMediaInteraction.user_id == user.id)
                    .scalar_subquery(),
                    0,
                ).label("interaction_count"),
                func.coalesce(
                    select(func.count()).select_from(Workout).where(Workout.user_id == user.id).scalar_subquery(),
                    0,
                ).label("workout_count"),
                func.coalesce(
                    select(func.count()).select_from(UserList).where(UserList.user_id == user.id).scalar_subquery(),
                    0,
                ).label("list_count"),
            )
        )
    ).one()

    review_count = counts.review_count
    interaction_count = counts.interaction_count
    workout_count = counts.workout_count
    list_count = counts.list_count

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
        select(MediaItemRating, MediaItem)
        .join(MediaItem, MediaItemRating.media_item_id == MediaItem.id)
        .where(
            MediaItemRating.user_id == user.id,
        )
        .order_by(MediaItemRating.score.desc(), MediaItemRating.created_at.desc())
        .limit(limit)
    )
    rows = result.all()

    return [
        {
            "rating": {
                "score": rating.score,
                "created_at": rating.created_at.isoformat(),
            },
            "media_item": {
                "id": media.id,
                "title": media.title,
                "media_type": media.media_type,
                "poster_url": media.poster_url,
                "release_year": media.release_year,
            },
        }
        for rating, media in rows
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

    user_id = user.id

    async def _fetch_reviews():
        async with async_session() as s:
            result = await s.execute(
                select(Review, MediaItem)
                .join(MediaItem, Review.media_item_id == MediaItem.id)
                .where(
                    Review.user_id == user_id,
                    Review.content.isnot(None),
                    Review.is_private == False,  # noqa: E712
                )
                .order_by(Review.created_at.desc())
                .limit(limit)
            )
            return result.all()

    async def _fetch_interactions():
        async with async_session() as s:
            result = await s.execute(
                select(UserMediaInteraction, MediaItem)
                .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
                .where(UserMediaInteraction.user_id == user_id)
                .order_by(UserMediaInteraction.created_at.desc())
                .limit(limit)
            )
            return result.all()

    async def _fetch_episode_interactions():
        async with async_session() as s:
            result = await s.execute(
                select(UserEpisodeInteraction, Episode, Season, MediaItem)
                .join(Episode, Episode.id == UserEpisodeInteraction.episode_id)
                .join(Season, Season.id == Episode.season_id)
                .join(MediaItem, MediaItem.id == Season.show_id)
                .where(UserEpisodeInteraction.user_id == user_id)
                .order_by(UserEpisodeInteraction.created_at.desc())
                .limit(limit)
            )
            return result.all()

    review_rows, interaction_rows, episode_rows = await asyncio.gather(
        _fetch_reviews(),
        _fetch_interactions(),
        _fetch_episode_interactions(),
    )

    # Build unified timeline
    events: list[dict] = []

    for review, media in review_rows:
        events.append(
            {
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
            }
        )

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
        events.append(
            {
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
            }
        )

    for ei, episode, season, media in episode_rows:
        events.append(
            {
                "type": "episode_watched",
                "timestamp": ei.created_at.isoformat(),
                "summary": f"Watched S{season.season_number}E{episode.episode_number} of {media.title}",
                "media_item": {
                    "id": media.id,
                    "title": media.title,
                    "media_type": media.media_type,
                    "poster_url": media.poster_url,
                },
            }
        )

    # Sort merged timeline by timestamp desc
    events.sort(key=lambda e: e["timestamp"], reverse=True)
    return events[:limit]


# ── Karma ──


@user_router.get("/{username}/karma", response_model=KarmaOut)
async def get_user_karma(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> KarmaOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = KarmaService(db)
    balance = await service.get_karma_balance(user.id)
    return KarmaOut(balance=balance)


@user_router.get("/{username}/karma/transactions", response_model=list[KarmaTransactionOut])
async def get_user_karma_transactions(
    username: str,
    cursor: str | None = Query(None),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
) -> list[KarmaTransactionOut]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    service = KarmaService(db)
    items, _ = await service.get_karma_transactions(user.id, cursor=cursor, limit=limit)
    return [
        KarmaTransactionOut(
            amount=item.amount,
            reason=item.reason,
            created_at=item.created_at,
        )
        for item in items
    ]


# ── Hall of Fame ──


@user_router.get("/{username}/hall-of-fame", response_model=list[HallOfFameItem])
async def get_user_hall_of_fame(
    username: str,
    media_type: str | None = Query(None, description="Filter by media type (movie, show, game, music)"),
    db: AsyncSession = Depends(get_db),
) -> list[HallOfFameItem]:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    hof = user.hof_ids

    if media_type:
        media_ids = hof.get(media_type, [])
    else:
        media_ids = []
        for ids in hof.values():
            if isinstance(ids, list):
                media_ids.extend(ids)

    if not media_ids:
        return []

    service = MediaService(db)
    items = await service.get_media_items_by_ids(media_ids)

    return [
        HallOfFameItem(
            id=item.id,
            title=item.title,
            media_type=item.media_type,
            poster_url=item.poster_url,
            release_year=item.release_date.year if item.release_date else None,
        )
        for item in items
    ]


# ── Library Stats ──


@user_router.get("/{username}/library-stats", response_model=LibraryStatsOut)
async def get_user_library_stats(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> LibraryStatsOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Count interactions by media type + compute completion counts in one pass
    type_result = await db.execute(
        select(
            MediaItem.media_type,
            UserMediaInteraction.interaction_type,
            func.count(),
        )
        .join(UserMediaInteraction, UserMediaInteraction.media_item_id == MediaItem.id)
        .where(UserMediaInteraction.user_id == user.id)
        .group_by(MediaItem.media_type, UserMediaInteraction.interaction_type)
    )
    by_media_type: dict[str, int] = {}
    total = 0
    watched_played = 0
    started = 0
    for media_type, interaction_type, cnt in type_result:
        by_media_type[media_type] = by_media_type.get(media_type, 0) + cnt
        total += cnt
        if interaction_type in ("watched", "played", "listened"):
            watched_played += cnt
        elif interaction_type == "started":
            started += cnt
    completed_total = watched_played + started
    completion_rate = watched_played / completed_total if completed_total > 0 else 0.0

    # Most active day + hour in a single round-trip
    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_hour = await db.execute(
        select(
            select(func.extract("dow", UserMediaInteraction.created_at))
            .where(UserMediaInteraction.user_id == user.id)
            .group_by(func.extract("dow", UserMediaInteraction.created_at))
            .order_by(func.count().desc())
            .limit(1)
            .scalar_subquery(),
            select(func.extract("hour", UserMediaInteraction.created_at))
            .where(UserMediaInteraction.user_id == user.id)
            .group_by(func.extract("hour", UserMediaInteraction.created_at))
            .order_by(func.count().desc())
            .limit(1)
            .scalar_subquery(),
        )
    )
    day_val, hour_val = day_hour.one()
    most_active_day = day_names[int(day_val)] if day_val is not None else None
    most_active_hour = int(hour_val) if hour_val is not None else None

    episode_service = EpisodeInteractionService(db)
    total_watch_time_minutes = await episode_service.get_user_watch_time_minutes(user.id)

    return LibraryStatsOut(
        total_items=total,
        by_media_type=by_media_type,
        total_watch_time_minutes=total_watch_time_minutes,
        completion_rate=round(completion_rate, 2),
        most_active_day=most_active_day,
        most_active_hour=most_active_hour,
    )


# ── Mood Timeline ──


@user_router.get("/{username}/mood-timeline", response_model=MoodTimelineOut)
async def get_user_mood_timeline(
    username: str,
    db: AsyncSession = Depends(get_db),
) -> MoodTimelineOut:
    user = await db.scalar(select(User).where(User.username == username))
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    checkins_result = await db.scalars(
        select(UserMoodCheckIn)
        .where(
            UserMoodCheckIn.user_id == user.id,
            UserMoodCheckIn.status == "submitted",
        )
        .order_by(UserMoodCheckIn.checkin_date.desc())
        .limit(30)
    )
    checkins = list(checkins_result)

    return MoodTimelineOut(
        checkins=[
            MoodCheckinOut(
                date=c.checkin_date.isoformat(),
                mood=c.mood,
                feeling=c.feeling,
                note=c.note,
            )
            for c in checkins
        ]
    )
