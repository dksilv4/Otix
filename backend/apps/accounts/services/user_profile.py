"""Public profile hub reads: detail context and username search.

Port of the legacy ``/users/{username}`` detail and ``/users/search`` handlers.
Profile columns (``bio``/``background_url``/``is_private``/``total_xp``/
``profile_sections``/``hall_of_fame_media_ids``) now read straight off
``accounts.User``; the social aggregates are computed from the
social/workout/proposals apps read-only. Engagement stand-ins that still need a
later pass: ``level``/``level_title``/``xp_rank``/``xp_percentile`` and the
steam/plex/tmdb integration blocks.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model

from apps.accounts.models import User
from apps.proposals.models import MediaEditProposal
from apps.social.models import Review, UserStreak
from apps.social.services import count_friends, get_counts, get_friendship_status, is_following
from apps.social.services.user_rating import compute_composite_score, peer_rating_aggregates

LEVEL_TITLE = "Novice"


def get_user_by_username(username: str):
    """Resolve an active user by username; ``None`` when missing."""
    return User.objects.filter(username=username).first()


def build_user_profile(user: User, viewer) -> dict:
    """Assemble the legacy ``UserProfileOut`` payload for one user.

    ``viewer`` may be an authenticated user or an anonymous request. Social
    keys that require a viewer (``is_following``/``friendship_status``) are
    omitted (None/False) for anonymous or self requests.
    """
    is_own_profile = viewer is not None and viewer.is_authenticated and viewer.id == user.id
    viewer_id = viewer.id if viewer is not None and viewer.is_authenticated else None

    counts = get_counts(user.id)
    reputation = compute_composite_score(user.id)
    rating_aggregates = peer_rating_aggregates(user.id)
    streak = UserStreak.objects.filter(pk=user.id).first()

    review_count = Review.objects.filter(
        user_id=user.id, content__isnull=False, is_private=False
    ).count()
    proposal_qs = MediaEditProposal.objects.filter(proposer_id=user.id)
    proposal_count = proposal_qs.count()
    approved_count = proposal_qs.filter(status="approved").count()
    proposal_approval_rate = (
        round(approved_count / proposal_count * 100, 1) if proposal_count > 0 else None
    )

    is_following_viewer = False
    friendship_status = None
    if viewer_id is not None and not is_own_profile:
        is_following_viewer = is_following(viewer_id, user.id)
        friendship_status = get_friendship_status(viewer_id, user.id)

    return {
        "id": user.id,
        "username": user.username,
        "avatar_url": user.avatar_url,
        "bio": user.bio,
        "background_url": user.background_url,
        "created_at": user.created_at,
        "review_count": review_count,
        "total_xp": user.total_xp,
        "avg_user_rating": rating_aggregates["avg_user_rating"],
        "user_rating_count": rating_aggregates["user_rating_count"],
        "is_admin": bool(user.is_staff or user.is_superuser),
        "composite_score": reputation["composite_score"],
        "profile_sections": user.profile_sections,
        "hall_of_fame_media_ids": user.hall_of_fame_media_ids,
        "steam": None,
        "plex": None,
        "tmdb_username": None,
        "friendship_status": friendship_status,
        "is_following": is_following_viewer,
        "is_private": user.is_private,
        "follower_count": counts["followers"],
        "following_count": counts["following"],
        "friend_count": count_friends(user.id),
        "level": 1,
        "level_title": LEVEL_TITLE,
        "xp_rank": None,
        "xp_percentile": None,
        "proposal_count": proposal_count,
        "proposal_approval_rate": proposal_approval_rate,
        "current_login_streak": streak.current_login_streak if streak else 0,
        "longest_login_streak": streak.longest_login_streak if streak else 0,
        "current_review_streak": streak.current_review_streak if streak else 0,
        "longest_review_streak": streak.longest_review_streak if streak else 0,
    }


def search_users(query: str, limit: int) -> list[dict]:
    """Username substring search over active users (legacy order: prefix first)."""
    user_model = get_user_model()
    users = user_model.objects.filter(username__icontains=query, is_active=True).order_by(
        "username", "id"
    )[:limit]
    return [
        {
            "id": user.id,
            "username": user.username,
            "avatar_url": user.avatar_url,
            "bio": user.bio,
            "level": 1,
            "level_title": LEVEL_TITLE,
            "is_admin": bool(user.is_staff or user.is_superuser),
            "media_type": "user",
        }
        for user in users
    ]
