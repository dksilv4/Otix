# TODO: Review this file
from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import User
from otix.domain.user_badge import UserBadge
from otix.domain.user_streak import UserStreak
from otix.infrastructure.celery import app
from otix.lib.badges import BADGES, BadgeContext


class GamificationService:
    def __init__(self, session: AsyncSession):
        self.session = session

    # ── Streaks ──

    async def update_login_streak(self, user_id: str) -> dict:
        """Called on any user activity. Tracks consecutive days."""
        today = date.today()
        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        if not streak:
            streak = UserStreak(user_id=user_id)
            self.session.add(streak)

        if streak.last_activity_date == today:
            return {"streak": streak.current_login_streak, "milestone_hit": False}

        if streak.last_activity_date and (today - streak.last_activity_date).days == 1:
            streak.current_login_streak += 1
        else:
            streak.current_login_streak = 1

        streak.last_activity_date = today
        streak.longest_login_streak = max(streak.longest_login_streak, streak.current_login_streak)

        bonus_xp = 0
        if streak.current_login_streak == 7:
            bonus_xp = 50
        elif streak.current_login_streak == 30:
            bonus_xp = 200
        elif streak.current_login_streak == 100:
            bonus_xp = 1000

        if bonus_xp > 0:
            app.send_task("xp.award", args=[user_id, bonus_xp])

        await self.session.flush()
        return {
            "streak": streak.current_login_streak,
            "milestone_hit": bonus_xp > 0,
            "bonus_xp": bonus_xp,
        }

    async def update_review_streak(self, user_id: str) -> dict:
        """Called when a review is created. Tracks consecutive weeks."""
        today = date.today()
        current_week_monday = today - timedelta(days=today.weekday())

        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        if not streak:
            streak = UserStreak(user_id=user_id)
            self.session.add(streak)

        if streak.last_review_week == current_week_monday:
            return {"streak": streak.current_review_streak}

        expected_monday = streak.last_review_week + timedelta(weeks=1) if streak.last_review_week else None
        if expected_monday and current_week_monday == expected_monday:
            streak.current_review_streak += 1
        else:
            streak.current_review_streak = 1

        streak.last_review_week = current_week_monday
        streak.longest_review_streak = max(streak.longest_review_streak, streak.current_review_streak)

        await self.session.flush()
        return {"streak": streak.current_review_streak}

    async def update_workout_streak(self, user_id: str) -> dict:
        """Called when a workout is logged. Tracks consecutive days with a workout."""
        today = date.today()
        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        if not streak:
            streak = UserStreak(user_id=user_id)
            self.session.add(streak)

        if streak.last_workout_date == today:
            return {"streak": streak.current_workout_streak}

        if streak.last_workout_date and (today - streak.last_workout_date).days == 1:
            streak.current_workout_streak += 1
        else:
            streak.current_workout_streak = 1

        streak.last_workout_date = today
        streak.longest_workout_streak = max(streak.longest_workout_streak, streak.current_workout_streak)

        bonus_xp = 0
        if streak.current_workout_streak == 7:
            bonus_xp = 50
        elif streak.current_workout_streak == 30:
            bonus_xp = 200

        if bonus_xp > 0:
            app.send_task("xp.award", args=[user_id, bonus_xp])

        await self.session.flush()
        return {
            "streak": streak.current_workout_streak,
            "milestone_hit": bonus_xp > 0,
            "bonus_xp": bonus_xp,
        }

    async def recalculate_workout_streak(self, user_id: str) -> dict:
        """Recalculate workout streak after an undo/delete. Walks backwards from today."""
        from datetime import timedelta

        from otix.domain.workout import Workout

        today = date.today()
        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        if not streak:
            streak = UserStreak(user_id=user_id)
            self.session.add(streak)

        # Get all workout dates for this user, ordered descending
        result = await self.session.execute(
            select(Workout.started_at)
            .where(Workout.user_id == user_id)
            .order_by(Workout.started_at.desc())
        )
        workout_dates = [row[0].date() for row in result.all()]

        if not workout_dates:
            streak.current_workout_streak = 0
            streak.last_workout_date = None
            await self.session.flush()
            return {"streak": 0}

        # Calculate streak backwards from today
        current_streak = 0
        check_date = today
        for wd in sorted(set(workout_dates), reverse=True):
            if wd == check_date:
                current_streak += 1
                check_date = check_date - timedelta(days=1)
            elif wd < check_date:
                break

        # Also check if the most recent workout was today (for the check_date start)
        if current_streak == 0:
            most_recent = max(workout_dates)
            if most_recent == today:
                current_streak = 1

        streak.current_workout_streak = current_streak
        streak.last_workout_date = today if current_streak > 0 else streak.last_workout_date
        streak.longest_workout_streak = max(streak.longest_workout_streak, current_streak)

        await self.session.flush()
        return {"streak": current_streak}

    async def get_streaks(self, user_id: str) -> dict:
        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )
        if not streak:
            return {
                "current_login_streak": 0,
                "longest_login_streak": 0,
                "current_review_streak": 0,
                "longest_review_streak": 0,
            }
        return {
            "current_login_streak": streak.current_login_streak,
            "longest_login_streak": streak.longest_login_streak,
            "current_review_streak": streak.current_review_streak,
            "longest_review_streak": streak.longest_review_streak,
            "current_workout_streak": streak.current_workout_streak,
            "longest_workout_streak": streak.longest_workout_streak,
        }

    # ── Badges ──

    async def _get_badge_context(self, user_id: str) -> BadgeContext | None:
        """Gathers stats from database to construct BadgeContext."""
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if not user:
            return None

        from sqlalchemy import or_

        from otix.domain.friend import FriendRequest
        from otix.domain.interaction import UserMediaInteraction
        from otix.domain.list import UserList
        from otix.domain.media import MediaItem
        from otix.domain.review import Review
        from otix.domain.review_vote import ReviewVote
        from otix.domain.workout import Workout

        streak = await self.session.scalar(
            select(UserStreak).where(UserStreak.user_id == user_id)
        )

        # Fetch all counts in a single round-trip via scalar subqueries
        counts = await self.session.execute(
            select(
                select(func.count()).select_from(Review).where(
                    Review.user_id == user_id,
                    Review.is_private == False,  # noqa: E712
                ).scalar_subquery(),
                select(func.count()).select_from(UserMediaInteraction).where(
                    UserMediaInteraction.user_id == user_id,
                ).scalar_subquery(),
                select(func.count()).select_from(UserList).where(
                    UserList.user_id == user_id,
                ).scalar_subquery(),
                select(func.count()).select_from(Workout).where(
                    Workout.user_id == user_id,
                ).scalar_subquery(),
                select(func.count()).select_from(FriendRequest).where(
                    FriendRequest.status == "accepted",
                    or_(
                        FriendRequest.sender_id == user_id,
                        FriendRequest.receiver_id == user_id,
                    ),
                ).scalar_subquery(),
                select(func.count(func.distinct(MediaItem.media_type)))
                .select_from(UserMediaInteraction)
                .join(MediaItem, UserMediaInteraction.media_item_id == MediaItem.id)
                .where(UserMediaInteraction.user_id == user_id)
                .scalar_subquery(),
                select(func.count()).select_from(ReviewVote).where(
                    ReviewVote.review_user_id == user_id,
                    ReviewVote.vote_type == "up",
                ).scalar_subquery(),
            )
        )
        (
            review_count,
            interaction_count,
            list_count,
            workout_count,
            friend_count,
            distinct_media_types,
            upvotes_received,
        ) = counts.one()

        return BadgeContext(
            review_count=review_count or 0,
            interaction_count=interaction_count or 0,
            list_count=list_count or 0,
            workout_count=workout_count or 0,
            total_xp=user.total_xp,
            level=(user.total_xp // 300) + 1,
            login_streak=streak.current_login_streak if streak else 0,
            review_streak=streak.current_review_streak if streak else 0,
            workout_streak=streak.current_workout_streak if streak else 0,
            distinct_media_types=distinct_media_types or 0,
            review_upvotes_received=upvotes_received or 0,
            user_rating_count=user.user_rating_count,
            avg_user_rating=user.avg_user_rating,
            friend_count=friend_count or 0,
        )

    async def check_and_award_badges(self, user_id: str) -> list[str]:
        """Check all badge conditions and award any newly unlocked ones."""
        ctx = await self._get_badge_context(user_id)
        if not ctx:
            return []

        # Get already earned badges
        earned = await self.session.scalars(
            select(UserBadge.badge_key).where(UserBadge.user_id == user_id)
        )
        earned_keys = set(earned.all())

        # Check all badge conditions
        new_badges: list[str] = []
        for key, badge_def in BADGES.items():
            if key in earned_keys:
                continue
            try:
                if badge_def.condition(ctx):
                    new_badge = UserBadge(user_id=user_id, badge_key=key)
                    self.session.add(new_badge)
                    new_badges.append(key)
            except Exception:
                pass

        if new_badges:
            await self.session.flush()

        return new_badges

    async def get_user_badges(self, user_id: str) -> list[dict]:
        ctx = await self._get_badge_context(user_id)
        if not ctx:
            return []

        earned = await self.session.scalars(
            select(UserBadge).where(UserBadge.user_id == user_id)
        )
        earned_keys = {b.badge_key: b for b in earned}

        result = []
        for key, badge_def in BADGES.items():
            current_val = badge_def.metric_fn(ctx)
            # Cap progress current_val at target
            current_val = min(current_val, badge_def.target)

            entry = {
                "badge_key": key,
                "label": badge_def.label,
                "description": badge_def.description,
                "icon": badge_def.icon,
                "tier": badge_def.tier,
                "earned": key in earned_keys,
                "earned_at": earned_keys[key].created_at if key in earned_keys else None,
                "current_value": float(current_val),
                "target_value": float(badge_def.target),
                "claimed": earned_keys[key].claimed if key in earned_keys else False,
                "xp_reward": badge_def.xp_reward,
            }

            result.append(entry)

        return result
