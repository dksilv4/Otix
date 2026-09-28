"""Text review CRUD plus the public per-media review listing.

Port of the legacy ``ReviewService``. The 15-minute cooldown column exists on
the greenfield row; the legacy upsert semantics are preserved (a PUT during the
cooldown window rewrites the review and extends the window; once it lapses the
row is locked until deleted) and PATCH edits are ignored while in cooldown.
"""

from __future__ import annotations

from datetime import timedelta

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Q
from django.utils import timezone

from apps.social.models import MediaItemRating, Review

REVIEW_COOLDOWN_MINUTES = 15


def my_review(user_id: int, media_item_id: int) -> Review | None:
    return Review.objects.filter(user_id=user_id, media_item_id=media_item_id).first()


def upsert_review(
    user: AbstractBaseUser,
    media_item_id: int,
    *,
    title: str | None,
    content: str | None,
    is_spoiler: bool,
    is_private: bool,
) -> Review:
    """Create or (during cooldown) rewrite a user's review of a media item."""
    existing = my_review(user.id, media_item_id)
    now = timezone.now()
    cooldown_until = now + timedelta(minutes=REVIEW_COOLDOWN_MINUTES)
    if existing is None:
        return Review.objects.create(
            user=user,
            media_item_id=media_item_id,
            title=title,
            content=content,
            is_spoiler=is_spoiler,
            is_private=is_private,
            cooldown_until=cooldown_until,
        )
    in_cooldown = existing.cooldown_until is not None and existing.cooldown_until > now
    if in_cooldown:
        existing.title = title
        existing.content = content
        existing.is_spoiler = is_spoiler
        existing.is_private = is_private
        existing.cooldown_until = cooldown_until
        existing.save(
            update_fields=(
                "title",
                "content",
                "is_spoiler",
                "is_private",
                "cooldown_until",
                "updated_at",
            )
        )
    return existing


def update_review(user_id: int, media_item_id: int, update_data: dict) -> Review | None:
    """Patch fields once the cooldown window has lapsed; ``None`` if no review."""
    existing = my_review(user_id, media_item_id)
    if existing is None:
        return None
    now = timezone.now()
    in_cooldown = existing.cooldown_until is not None and existing.cooldown_until > now
    fields = []
    for field, value in update_data.items():
        if field == "is_spoiler" and value is None:
            continue
        if field == "is_private" and value is None:
            continue
        if not in_cooldown and hasattr(existing, field):
            setattr(existing, field, value)
            fields.append(field)
    if fields:
        existing.save(update_fields=[*fields, "updated_at"])
    return existing


def delete_review(user_id: int, media_item_id: int) -> bool:
    deleted, _ = Review.objects.filter(user_id=user_id, media_item_id=media_item_id).delete()
    return bool(deleted)


def list_reviews_with_ratings(
    media_item_id: int, *, viewer_id: int | None = None, limit: int = 20
) -> list[dict]:
    """Public reviews of a media item, each with its author and their rating.

    Filters out private/empty reviews and (for non-authors) reviews still inside
    their cooldown window, mirroring ``get_reviews_for_media_with_ratings``.
    Returns payload dicts directly (a review row plus its embedded author and
    rating shapes) so the view only has to pass them through the serializer.
    """
    now = timezone.now()
    qs = (
        Review.objects.filter(
            media_item_id=media_item_id,
            content__isnull=False,
            is_private=False,
        )
        .order_by("-created_at", "user_id")
        .select_related("user")
        .only(
            "id",
            "user_id",
            "media_item_id",
            "title",
            "content",
            "is_spoiler",
            "is_private",
            "created_at",
            "updated_at",
            "cooldown_until",
            "user__id",
            "user__username",
            "user__is_staff",
        )
    )
    if viewer_id is not None:
        qs = qs.filter(Q(cooldown_until__lte=now) | Q(user_id=viewer_id))
    else:
        qs = qs.filter(cooldown_until__lte=now)
    reviews = list(qs[:limit])
    user_ids = [r.user_id for r in reviews]
    ratings = {
        r.user_id: r
        for r in MediaItemRating.objects.filter(user_id__in=user_ids, media_item_id=media_item_id)
    }
    out = []
    for review in reviews:
        rating = ratings.get(review.user_id)
        payload = {
            "user_id": review.user_id,
            "media_item_id": review.media_item_id,
            "title": review.title,
            "content": review.content,
            "is_spoiler": review.is_spoiler,
            "is_private": review.is_private,
            "created_at": review.created_at,
            "updated_at": review.updated_at,
            "cooldown_until": review.cooldown_until,
            "user": {
                "id": review.user.id,
                "username": review.user.username,
                "is_admin": review.user.is_staff,
            },
            "rating": (
                {
                    "user_id": rating.user_id,
                    "media_item_id": rating.media_item_id,
                    "score": rating.score,
                    "created_at": rating.created_at,
                    "updated_at": rating.updated_at,
                }
                if rating is not None
                else None
            ),
        }
        out.append(payload)
    return out
