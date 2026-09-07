"""A user's public reviews (port of ``ReviewService.get_reviews_by_user``).

Mirrors legacy filtering: only reviews with content, not private, and (for
viewers other than the author) not inside their cooldown window.
"""

from __future__ import annotations

from django.db.models import Q
from django.utils import timezone

from apps.social.models import Review


def get_user_reviews(user_id: int, viewer_id: int | None):
    """A user's public reviews, newest first.

    When ``viewer_id`` is the author the cooldown filter is skipped so the author
    sees their own in-cooldown reviews (legacy behaviour).
    """
    queryset = Review.objects.filter(
        user_id=user_id, content__isnull=False, is_private=False
    ).select_related("user", "media_item")
    if viewer_id != user_id:
        now = timezone.now()
        queryset = queryset.filter(Q(cooldown_until__isnull=True) | Q(cooldown_until__lte=now))
    return queryset.order_by("-created_at", "-id")
