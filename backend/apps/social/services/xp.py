"""Experience Points (XP) awarding and level progression service.

Computes levels, titles, and percentiles based on user experience points.
Handles atomic XP mutations, streak rewards, and badge evaluation triggers.
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db.models import F
from django.utils import timezone

if TYPE_CHECKING:
    from apps.accounts.models import User

logger = logging.getLogger(__name__)

# ── XP Award Values ──────────────────────────────────────────────────────────
XP_PER_LEVEL = 300

# Reviews
REVIEW_WITH_CONTENT = 150
REVIEW_SCORE_ONLY = 50

# Media Interactions
INTERACTION_WATCHED_PLAYED_LISTENED = 30
INTERACTION_LIKE_WATCHLIST_STARTED = 10

# Gaming Activities: 1 XP per minute (60 seconds) awarded at the end of the session
GAMING_SECONDS_PER_XP = 60
GAMING_XP_PER_MINUTE = 1
GAMING_HEARTBEAT_INTERVAL_SECONDS = 300  # Periodic heartbeat ping interval
GAMING_XP_PER_TICK = 5                   # Legacy alias (5 minutes = 5 XP)

# Activities & Checks
WORKOUT_COMPLETE = 100
LIST_CREATE = 50
MOOD_CHECKIN = 10
RATING_SUBMIT = 20

# Streak Milestones
LOGIN_STREAK_MILESTONES = {
    7: 50,
    30: 200,
    100: 1000,
}

WORKOUT_STREAK_MILESTONES = {
    7: 50,
    30: 200,
}

# Level Titles (aligned with frontend LEVEL_TITLES)
LEVEL_TITLES: tuple[tuple[int, int, str], ...] = (
    (100, 999999, "Transcendent"),
    (75, 99, "Legend"),
    (50, 74, "Grandmaster"),
    (35, 49, "Master"),
    (20, 34, "Expert"),
    (10, 19, "Adept"),
    (5, 9, "Apprentice"),
    (1, 4, "Novice"),
)


def calculate_level(total_xp: int) -> tuple[int, str]:
    """Calculate current level (1-indexed, 300 XP/level) and level title."""
    safe_xp = max(0, total_xp)
    level = (safe_xp // XP_PER_LEVEL) + 1

    level_title = "Novice"
    for min_lvl, max_lvl, title in LEVEL_TITLES:
        if min_lvl <= level <= max_lvl:
            level_title = title
            break

    return level, level_title


def calculate_xp_rank_and_percentile(user: User) -> tuple[int | None, float | None]:
    """Calculate the user's global XP rank (1st, 2nd, etc.) and percentile.

    Returns (xp_rank, xp_percentile).
    """
    user_model = get_user_model()
    total_users = user_model.objects.filter(is_active=True).count()
    if total_users == 0:
        return 1, 100.0

    # Users with strictly more XP
    ahead = user_model.objects.filter(is_active=True, total_xp__gt=user.total_xp).count()
    rank = ahead + 1

    # Users with less or equal XP
    behind_or_equal = user_model.objects.filter(is_active=True, total_xp__lte=user.total_xp).count()
    percentile = round((behind_or_equal / total_users) * 100.0, 1)

    return rank, percentile


def award_xp(user_id: int, amount: int, reason: str | None = None) -> int:
    """Atomically increment a user's total_xp, trigger badge checks, and return the new total."""
    if amount <= 0:
        user_model = get_user_model()
        user = user_model.objects.filter(pk=user_id).first()
        return user.total_xp if user else 0

    user_model = get_user_model()
    user_model.objects.filter(pk=user_id).update(total_xp=F("total_xp") + amount)

    user = user_model.objects.filter(pk=user_id).first()
    new_total = user.total_xp if user else amount

    # Check for newly unlocked badges
    try:
        from apps.social.services.user_badges import check_and_award_badges

        check_and_award_badges(user_id)
    except Exception as exc:  # pragma: no cover
        logger.warning("Failed checking badges after awarding XP to user %s: %s", user_id, exc)

    return new_total


def record_gaming_heartbeat(
    user_id: int,
    game_id: str,
    game_title: str,
    duration_seconds: int,
    session_id: str | None = None,
    is_final: bool = False,
) -> dict:
    """Record an active gaming heartbeat, award XP for qualified time chunks, and enforce caps."""
    user_model = get_user_model()
    user = user_model.objects.filter(pk=user_id).first()
    if not user:
        return {
            "status": "error",
            "message": "User not found",
            "xp_awarded": 0,
            "total_xp": 0,
            "level": 1,
            "level_title": "Novice",
            "session_xp": 0,
            "daily_xp": 0,
        }

    duration_seconds = max(0, int(duration_seconds))
    sess_key_id = session_id or f"{game_id}_{user_id}"
    cache_sess_key = f"gaming_sess:{user_id}:{sess_key_id}"

    today_str = timezone.now().strftime("%Y-%m-%d")
    cache_daily_key = f"gaming_daily:{user_id}:{today_str}"

    sess_data = cache.get(cache_sess_key) or {
        "last_awarded_seconds": 0,
        "session_xp": 0,
        "awarded_xp": 0,
    }
    # 1 XP per minute (60 seconds)
    session_xp = duration_seconds // GAMING_SECONDS_PER_XP
    already_awarded_xp = int(sess_data.get("awarded_xp", 0))

    daily_xp = int(cache.get(cache_daily_key, 0))
    new_total_xp = user.total_xp
    xp_to_award = 0

    # Only reward XP at the end of the session (is_final=True)
    if is_final:
        xp_to_award = max(0, session_xp - already_awarded_xp)
        if xp_to_award > 0:
            new_total_xp = award_xp(user_id, xp_to_award, reason=f"gaming_{game_title[:30]}")
            already_awarded_xp += xp_to_award
            daily_xp += xp_to_award
            cache.set(cache_daily_key, daily_xp, timeout=86400)

            # Update login streak for active gaming
            try:
                from apps.social.services.streak import update_login_streak

                update_login_streak(user_id)
            except Exception as exc:  # pragma: no cover
                logger.warning("Failed updating login streak during gaming heartbeat: %s", exc)

    cache.set(
        cache_sess_key,
        {
            "last_awarded_seconds": duration_seconds,
            "session_xp": session_xp,
            "awarded_xp": already_awarded_xp,
        },
        timeout=86400,
    )

    new_level, new_title = calculate_level(new_total_xp)

    return {
        "status": "ok",
        "xp_awarded": xp_to_award,
        "total_xp": new_total_xp,
        "level": new_level,
        "level_title": new_title,
        "session_xp": session_xp,
        "daily_xp": daily_xp,
    }
