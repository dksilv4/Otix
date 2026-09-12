"""Badge progress/earning reads and the badge-claim mutation.

Port of the read half of ``backend/otix/services/gamification_service.py``
(``get_user_badges``). ``accounts.User`` has no ``total_xp`` column, so the
level/XP-derived badge metrics stay at their zero value; ``UserBadge`` rows are
the earned signal and are written by the future gamification worker, exactly as
legacy only persisted earned badges.
"""

from __future__ import annotations

from django.db.models import Q, Sum

from apps.lists.models import UserList
from apps.social.models import (
    FriendRequest,
    KarmaTransaction,
    Review,
    ReviewVote,
    UserBadge,
    UserMediaInteraction,
    UserStreak,
)
from apps.social.services.badge_registry import BADGE_DEFS, ordered_badge_defs
from apps.social.services.user_rating import peer_rating_aggregates
from apps.workout.models import Workout

FR_ACCEPTED = "accepted"


def build_badge_context(user_id: int) -> dict:
    """Scalar stats used as badge metric inputs (legacy ``BadgeContext``)."""
    streak = UserStreak.objects.filter(pk=user_id).first()
    ratings = peer_rating_aggregates(user_id)
    review_count = Review.objects.filter(user_id=user_id, is_private=False).count()
    interaction_count = UserMediaInteraction.objects.filter(user_id=user_id).count()
    friend_count = FriendRequest.objects.filter(
        Q(sender_id=user_id) | Q(receiver_id=user_id), status=FR_ACCEPTED
    ).count()
    distinct_media_types = (
        UserMediaInteraction.objects.filter(user_id=user_id)
        .values("media_item__media_type")
        .distinct()
        .count()
    )
    upvotes_received = ReviewVote.objects.filter(review__user_id=user_id, vote_type="up").count()
    karma_total = KarmaTransaction.objects.filter(user_id=user_id).aggregate(
        total=Sum("amount")
    )["total"] or 0
    return {
        "review_count": review_count,
        "interaction_count": interaction_count,
        "list_count": UserList.objects.filter(user_id=user_id).count(),
        "workout_count": Workout.objects.filter(user_id=user_id).count(),
        "total_xp": 0,
        "level": 1,
        "login_streak": streak.current_login_streak if streak else 0,
        "review_streak": streak.current_review_streak if streak else 0,
        "workout_streak": streak.current_workout_streak if streak else 0,
        "distinct_media_types": distinct_media_types,
        "review_upvotes_received": upvotes_received,
        "user_rating_count": ratings["user_rating_count"],
        "avg_user_rating": ratings["avg_user_rating"],
        "friend_count": friend_count,
        "karma": karma_total,
    }


def get_user_badges(user_id: int) -> list[dict]:
    """All badge definitions merged with the user's earned/claimed state."""
    context = build_badge_context(user_id)
    earned = {
        badge.badge_key: badge
        for badge in UserBadge.objects.filter(user_id=user_id).order_by("-created_at")
    }
    entries = []
    for badge_def in ordered_badge_defs():
        current_val = min(float(context.get(badge_def.metric, 0)), badge_def.target)
        badge = earned.get(badge_def.key)
        entries.append(
            {
                "badge_key": badge_def.key,
                "label": badge_def.label,
                "description": badge_def.description,
                "icon": badge_def.icon,
                "tier": badge_def.tier,
                "earned": badge is not None,
                "earned_at": badge.created_at if badge else None,
                "current_value": current_val,
                "target_value": float(badge_def.target),
                "claimed": badge.claimed if badge else False,
                "xp_reward": badge_def.xp_reward,
            }
        )
    return entries


def claim_badge(user_id: int, badge_key: str) -> int:
    """Mark an earned badge claimed; returns its ``xp_reward``.

    Raises ``ValueError`` with a legacy detail string when the badge is not yet
    earned or was already claimed.
    """
    badge = UserBadge.objects.filter(user_id=user_id, badge_key=badge_key).first()
    if badge is None:
        raise ValueError("Badge not earned yet")
    if badge.claimed:
        raise ValueError("Badge reward already claimed")
    badge.claimed = True
    badge.save(update_fields=["claimed", "updated_at"])
    badge_def = BADGE_DEFS.get(badge_key)
    return badge_def.xp_reward if badge_def else 0
