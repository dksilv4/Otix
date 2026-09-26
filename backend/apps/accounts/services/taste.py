"""Taste-profile helpers for For You / recommendation personalization."""

from __future__ import annotations

from django.utils import timezone

from apps.accounts.models import User


def reset_user_taste(user: User) -> User:
    """Mark a fresh taste epoch and clear explicit preference taste seeds.

    Ratings, watch history, and library interactions are kept — For You only
    uses activity after ``taste_reset_at``. Preferred genres / discover
    emphases are cleared because they are explicit taste signals.
    """
    user.taste_reset_at = timezone.now()
    user.preferred_genres = []
    user.discover_emphases = []
    user.save(
        update_fields=[
            "taste_reset_at",
            "preferred_genres",
            "discover_emphases",
            "updated_at",
        ]
    )
    return user
