"""Per-user 1-10 media ratings and the aggregate columns they drive.

Port of the legacy ``MediaRatingService``: upsert keeps the ``MediaItem``
``avg_rating``/``rating_count`` columns in sync (``reviews`` list reuses the
per-reviewer rating rows for its ``rating`` embed).
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Avg, Count

from apps.media.models import ExternalRating, MediaItem
from apps.social.models import MediaItemRating, Review

_CRITIC_USER_PAIRS: dict[str, tuple[str, str]] = {
    "igdb": ("igdb_critic", "igdb_user"),
}
_CRITIC_GAP_THRESHOLD = 3.0
_USER_HIGH_BOOST = 1.05


def _normalize(score: float, max_score: float) -> float:
    return score / max_score * 10


def _blend_pair(critic_score: float, user_score: float) -> float:
    """Blend a critic+user pair using gap-based logic. All values on 1–10 scale."""
    gap = abs(critic_score - user_score)

    if gap >= _CRITIC_GAP_THRESHOLD:
        if user_score > critic_score:
            return min(user_score * _USER_HIGH_BOOST, 10.0)
        return user_score

    if gap == 0:
        return (critic_score + user_score) / 2

    critic_weight = max(0.0, 0.5 * (1 - gap / _CRITIC_GAP_THRESHOLD))
    user_weight = 1.0 - critic_weight
    return critic_weight * critic_score + user_weight * user_score


def _compute_external_composite(normalized: list[dict]) -> float | None:
    """Average all external provider scores into a single 1–10 value."""
    if not normalized:
        return None

    provider_scores: dict[str, float] = {}
    consumed: set[str] = set()

    for pair_key, (critic_prov, user_prov) in _CRITIC_USER_PAIRS.items():
        critic = next((r for r in normalized if r["provider"] == critic_prov), None)
        user = next((r for r in normalized if r["provider"] == user_prov), None)

        if critic and user:
            provider_scores[pair_key] = _blend_pair(critic["score"], user["score"])
            consumed.update({critic_prov, user_prov})
        elif user:
            provider_scores[pair_key] = user["score"]
            consumed.add(user_prov)
        elif critic:
            provider_scores[pair_key] = critic["score"]
            consumed.add(critic_prov)

    for r in normalized:
        if r["provider"] not in consumed:
            provider_scores[r["provider"]] = r["score"]

    if not provider_scores:
        return None

    return sum(provider_scores.values()) / len(provider_scores)


def compute_overall_rating(media_item_id: int) -> tuple[float | None, str | None]:
    """Compute overall Otix rating for *media_item_id*.

    Returns a 0–100 (score, source) where source is 'community'
    when real Otix user ratings exist, or 'external' when derived from
    external sources only.
    """
    item = MediaItem.objects.filter(pk=media_item_id).first()
    if item is None:
        return None, "empty"

    raw = list(
        ExternalRating.objects.filter(
            media_item_id=media_item_id,
            max_score__gt=0,
        ).values("provider", "score", "max_score")
    )

    normalized = [
        {"provider": r["provider"], "score": _normalize(float(r["score"]), float(r["max_score"]))}
        for r in raw
        if r.get("score") is not None
    ]
    external_composite = _compute_external_composite(normalized)

    has_community = bool(item.rating_count and item.avg_rating is not None)

    if has_community and external_composite is not None:
        overall = 0.9 * float(item.avg_rating) + 0.1 * external_composite
        source = "community"
    elif has_community:
        overall = float(item.avg_rating)
        source = "community"
    elif external_composite is not None:
        overall = external_composite
        source = "external"
    else:
        return None, "empty"

    raw_score = max(1.0, min(10.0, overall))
    return round(raw_score * 10, 1), source


def compute_and_store_overall_rating(media_item_id: int) -> tuple[float | None, str | None]:
    """Compute overall rating for *media_item_id* and persist on MediaItem."""
    score, source = compute_overall_rating(media_item_id)
    MediaItem.objects.filter(pk=media_item_id).update(
        overall_rating=score,
        overall_rating_source=source,
    )
    return score, source


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
    row = (
        MediaItem.objects.filter(pk=media_item_id)
        .values("avg_rating", "rating_count", "overall_rating", "overall_rating_source")
        .first()
    )
    return {
        "avg_rating": row["avg_rating"] if row else None,
        "rating_count": row["rating_count"] if row else 0,
        "overall_rating": row["overall_rating"] if row else None,
        "overall_rating_source": row["overall_rating_source"] if row else None,
    }


def _recalc(media_item_id: int) -> None:
    aggregate = MediaItemRating.objects.filter(media_item_id=media_item_id).aggregate(
        avg=Avg("score"), count=Count("id")
    )
    avg = round(float(aggregate["avg"]), 2) if aggregate["avg"] is not None else None
    MediaItem.objects.filter(pk=media_item_id).update(
        avg_rating=avg, rating_count=aggregate["count"] or 0
    )
    compute_and_store_overall_rating(media_item_id)


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
