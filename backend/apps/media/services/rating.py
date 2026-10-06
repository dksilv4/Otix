"""Per-user 1-10 media ratings and the aggregate columns they drive.

Port of the legacy ``MediaRatingService``: upsert keeps the ``MediaItem``
``avg_rating``/``rating_count`` columns in sync (``reviews`` list reuses the
per-reviewer rating rows for its ``rating`` embed).
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Avg, Count

from apps.media.models import MediaItem
from apps.social.models import MediaItemRating, Review


def my_rating(user_id: int, media_item_id: int) -> MediaItemRating | None:
    return MediaItemRating.objects.filter(user_id=user_id, media_item_id=media_item_id).first()


def upsert_rating(user: AbstractBaseUser, media_item_id: int, score: int) -> dict:
    """Create/update a rating and return the aggregate response payload."""
    rating, created = MediaItemRating.objects.update_or_create(
        user=user,
        media_item_id=media_item_id,
        defaults={"score": score},
    )
    _recalc(media_item_id)
    if created:
        from apps.social.services.streak import update_login_streak
        from apps.social.services.xp import RATING_SUBMIT, award_xp

        award_xp(user.id, RATING_SUBMIT, reason="media_rating_created")
        update_login_streak(user.id)
    aggregate = _aggregates(media_item_id)
    return {"score": rating.score, **aggregate}


def delete_rating(user: AbstractBaseUser, media_item_id: int) -> bool:
    deleted, _ = MediaItemRating.objects.filter(user=user, media_item_id=media_item_id).delete()
    if deleted:
        _recalc(media_item_id)
    return bool(deleted)


def _aggregates(media_item_id: int) -> dict:
    row = MediaItem.objects.filter(pk=media_item_id).values("avg_rating", "rating_count").first()
    return {
        "avg_rating": row["avg_rating"] if row else None,
        "rating_count": row["rating_count"] if row else 0,
    }


def _recalc(media_item_id: int) -> None:
    aggregate = MediaItemRating.objects.filter(media_item_id=media_item_id).aggregate(
        avg=Avg("score"), count=Count("id")
    )
    avg = round(float(aggregate["avg"]), 2) if aggregate["avg"] is not None else None
    MediaItem.objects.filter(pk=media_item_id).update(
        avg_rating=avg, rating_count=aggregate["count"] or 0
    )


def list_ratings_with_users(media_item_id: int, *, limit: int = 50) -> list[dict]:
    """Public ratings of a media item with user profile and review presence flag."""
    ratings = list(
        MediaItemRating.objects.filter(media_item_id=media_item_id)
        .order_by("-updated_at", "-created_at")
        .select_related("user")
        .only(
            "id",
            "user_id",
            "media_item_id",
            "score",
            "created_at",
            "updated_at",
            "user__id",
            "user__username",
            "user__is_staff",
        )[:limit]
    )
    user_ids = [r.user_id for r in ratings]
    users_with_reviews = set(
        Review.objects.filter(
            media_item_id=media_item_id,
            user_id__in=user_ids,
            content__isnull=False,
            is_private=False,
        ).values_list("user_id", flat=True)
    )
    out = []
    for r in ratings:
        out.append(
            {
                "user_id": r.user_id,
                "media_item_id": r.media_item_id,
                "score": r.score,
                "created_at": r.created_at,
                "updated_at": r.updated_at,
                "user": {
                    "id": r.user.id,
                    "username": r.user.username,
                    "is_admin": r.user.is_staff,
                },
                "has_review": r.user_id in users_with_reviews,
            }
        )
    return out
