"""Peer user ratings, reputation and a user's media-rating aggregates.

Port of ``old-backend/otix/services/user_rating_service.py``. The peer-rating table
(``workout.UserRating``) is read cross-app exactly as the legacy ``user_ratings``
table was a users-domain table: a rater scores another user 1-10. Reputation
(``composite_score``) reproduces the legacy log2-scaled pillar math; XP-derived
inputs (``total_xp``/``is_admin``) are absent from the greenfield ``User`` so the
admin base (1000) is unreachable and karma is aggregated from the transaction
ledger instead of a stored column.
"""

from __future__ import annotations

import math

from django.contrib.auth import get_user_model
from django.db.models import Avg, Count, Sum
from django.utils import timezone

from apps.lists.models import UserList
from apps.media.models import MediaItem
from apps.social.models import KarmaTransaction, MediaItemRating, Notification, Review, UserStreak
from apps.workout.models import UserRating, Workout

User = get_user_model()


def get_my_rating(rater_id: int, rated_user_id: int):
    """The current user's rating of another user, or ``None``."""
    return UserRating.objects.filter(rater_id=rater_id, rated_user_id=rated_user_id).first()


def upsert_rating(rater_id: int, rated_user_id: int, score: int) -> UserRating:
    """Create or update the rater's score of a user and notify the rated user."""
    rating, created = UserRating.objects.get_or_create(
        rater_id=rater_id, rated_user_id=rated_user_id, defaults={"score": score}
    )
    if not created and rating.score != score:
        rating.score = score
        rating.save(update_fields=["score", "updated_at"])
    if created:
        rater = User.objects.filter(pk=rater_id).first()
        Notification.objects.create(
            user_id=rated_user_id,
            type="user_rating",
            title="New Rating",
            body=f"{rater.username if rater else 'Someone'} rated you {score}/10",
            metadata_json={
                "rater_id": rater_id,
                "rater_username": rater.username if rater else None,
                "score": score,
            },
        )
    return rating


def delete_rating(rater_id: int, rated_user_id: int) -> bool:
    """Remove the rater's score of a user; ``False`` when none existed."""
    deleted, _ = UserRating.objects.filter(rater_id=rater_id, rated_user_id=rated_user_id).delete()
    return deleted > 0


def peer_rating_aggregates(user_id: int) -> dict:
    """Average and count of peer 1-10 ratings received by ``user_id``."""
    row = UserRating.objects.filter(rated_user_id=user_id).aggregate(
        avg=Avg("score"), cnt=Count("id")
    )
    return {
        "avg_user_rating": round(float(row["avg"]), 2) if row["avg"] is not None else None,
        "user_rating_count": row["cnt"] or 0,
    }


def _log2s(value: float) -> float:
    return math.log2(value + 1)


def compute_composite_score(user_id: int) -> dict:
    """Legacy 0-1000 ``composite_score`` with its four pillar components."""
    user = User.objects.filter(pk=user_id).first()
    if user is None:
        return {"composite_score": None, "components": {}}

    aggregates = peer_rating_aggregates(user_id)
    avg_rating = aggregates["avg_user_rating"]
    rating_count = aggregates["user_rating_count"]
    karma = KarmaTransaction.objects.filter(user_id=user_id).aggregate(
        total=Sum("amount")
    )["total"] or 0
    streak = UserStreak.objects.filter(user_id=user_id).first()

    content_reviews = Review.objects.filter(
        user_id=user_id, content__isnull=False, is_private=False
    ).count()
    score_only_reviews = MediaItemRating.objects.filter(user_id=user_id).count()
    list_count = UserList.objects.filter(user_id=user_id).count()
    workout_count = Workout.objects.filter(user_id=user_id).count()

    contribution = min(
        _log2s(content_reviews) * 12
        + _log2s(score_only_reviews) * 4
        + _log2s(list_count) * 10
        + _log2s(workout_count) * 6,
        250,
    )

    trust = 0.0
    if avg_rating is not None and rating_count > 0:
        rating_factor = (avg_rating - 5.0) / 5.0
        confidence = min(1.0, rating_count / 20.0)
        trust = rating_factor * confidence * 400

    now = timezone.now()
    years = max(0.0, (now - user.created_at).total_seconds() / (365.25 * 24 * 3600))
    tenure_score = _log2s(years) * 30
    longest_login = streak.longest_login_streak if streak else 0
    longest_review = streak.longest_review_streak if streak else 0
    streak_score = _log2s(longest_login / 7.0) * 10
    review_streak_score = _log2s(longest_review) * 8
    tenure_total = min(tenure_score + streak_score + review_streak_score, 150)

    impact = min(_log2s(max(0, karma)) * 25, 200)

    raw = 100 + contribution + trust + tenure_total + impact
    aura = min(1000, round(raw))

    return {
        "composite_score": aura,
        "components": {
            "contribution": round(contribution, 1),
            "trust": round(trust, 1),
            "tenure": round(tenure_total, 1),
            "impact": round(impact, 1),
        },
    }


def get_rating_distribution(user_id: int) -> tuple[list[dict], int]:
    """Per-score/per-media-type distribution of a user's media ratings."""
    rows = (
        MediaItemRating.objects.filter(user_id=user_id)
        .values("score", "media_item__media_type")
        .annotate(cnt=Count("id"))
        .order_by("score")
    )
    buckets = {
        score: {"movie": 0, "show": 0, "game": 0, "music": 0} for score in range(1, 11)
    }
    total = 0
    for row in rows:
        score = row["score"]
        media_type = row["media_item__media_type"]
        if media_type in buckets[score]:
            buckets[score][media_type] += row["cnt"]
        total += row["cnt"]
    distribution = [{"score": score, **buckets[score]} for score in range(1, 11)]
    return distribution, total


def media_asset_url(media_item: MediaItem, asset_type: str) -> str | None:
    """First asset URL of a given type attached to a media item."""
    asset = next(
        (a for a in media_item.assets.all() if (a.asset_type or "").lower() == asset_type),
        None,
    )
    return asset.url if asset else None


def top_rated(user_id: int, limit: int) -> list[dict]:
    """A user's highest-scored media ratings (score desc, newest first)."""
    rows = (
        MediaItemRating.objects.filter(user_id=user_id)
        .select_related("media_item")
        .order_by("-score", "-created_at", "-id")[:limit]
    )
    items = []
    for rating in rows:
        media = rating.media_item
        items.append(
            {
                "rating": {"score": rating.score, "created_at": rating.created_at.isoformat()},
                "media_item": {
                    "id": media.id,
                    "title": media.title,
                    "media_type": media.media_type,
                    "poster_url": media_asset_url(media, "poster"),
                    "release_year": media.release_date.year if media.release_date else None,
                },
            }
        )
    return items
