"""User streak tracking: login, review, and workout streaks.

Port of streak logic from legacy gamification service. Tracks consecutive days/weeks
and awards bonus milestone XP for streak persistence.
"""

from __future__ import annotations

from datetime import timedelta

from django.utils import timezone

from apps.social.models import UserStreak
from apps.social.services.xp import (
    LOGIN_STREAK_MILESTONES,
    WORKOUT_STREAK_MILESTONES,
    award_xp,
)


def update_login_streak(user_id: int) -> dict:
    """Called on user activity. Tracks consecutive days of activity."""
    today = timezone.localdate()
    streak, _ = UserStreak.objects.get_or_create(user_id=user_id)

    if streak.last_activity_date == today:
        return {"streak": streak.current_login_streak, "milestone_hit": False, "bonus_xp": 0}

    if streak.last_activity_date and (today - streak.last_activity_date).days == 1:
        streak.current_login_streak += 1
    else:
        streak.current_login_streak = 1

    streak.last_activity_date = today
    streak.longest_login_streak = max(streak.longest_login_streak, streak.current_login_streak)

    bonus_xp = LOGIN_STREAK_MILESTONES.get(streak.current_login_streak, 0)
    streak.save(
        update_fields=[
            "current_login_streak",
            "longest_login_streak",
            "last_activity_date",
            "updated_at",
        ]
    )

    if bonus_xp > 0:
        award_xp(user_id, bonus_xp, reason=f"login_streak_{streak.current_login_streak}")

    return {
        "streak": streak.current_login_streak,
        "milestone_hit": bonus_xp > 0,
        "bonus_xp": bonus_xp,
    }


def update_review_streak(user_id: int) -> dict:
    """Called when a review is created. Tracks consecutive weeks with a review."""
    today = timezone.localdate()
    current_week_monday = today - timedelta(days=today.weekday())

    streak, _ = UserStreak.objects.get_or_create(user_id=user_id)

    if streak.last_review_week == current_week_monday:
        return {"streak": streak.current_review_streak}

    expected_monday = streak.last_review_week + timedelta(weeks=1) if streak.last_review_week else None
    if expected_monday and current_week_monday == expected_monday:
        streak.current_review_streak += 1
    else:
        streak.current_review_streak = 1

    streak.last_review_week = current_week_monday
    streak.longest_review_streak = max(streak.longest_review_streak, streak.current_review_streak)
    streak.save(
        update_fields=[
            "current_review_streak",
            "longest_review_streak",
            "last_review_week",
            "updated_at",
        ]
    )

    return {"streak": streak.current_review_streak}


def update_workout_streak(user_id: int) -> dict:
    """Called when a workout is completed. Tracks consecutive days with a workout."""
    today = timezone.localdate()
    streak, _ = UserStreak.objects.get_or_create(user_id=user_id)

    if streak.last_workout_date == today:
        return {"streak": streak.current_workout_streak, "bonus_xp": 0}

    if streak.last_workout_date and (today - streak.last_workout_date).days == 1:
        streak.current_workout_streak += 1
    else:
        streak.current_workout_streak = 1

    streak.last_workout_date = today
    streak.longest_workout_streak = max(streak.longest_workout_streak, streak.current_workout_streak)

    bonus_xp = WORKOUT_STREAK_MILESTONES.get(streak.current_workout_streak, 0)
    streak.save(
        update_fields=[
            "current_workout_streak",
            "longest_workout_streak",
            "last_workout_date",
            "updated_at",
        ]
    )

    if bonus_xp > 0:
        award_xp(user_id, bonus_xp, reason=f"workout_streak_{streak.current_workout_streak}")

    return {
        "streak": streak.current_workout_streak,
        "bonus_xp": bonus_xp,
    }
