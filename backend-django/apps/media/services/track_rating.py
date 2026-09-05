"""Per-user 1-10 track ratings and the track aggregate columns they drive.

Port of the legacy ``TrackRatingService`` (``backend/otix/services/
track_rating_service.py``). Upsert keeps the ``media.Track``
``avg_rating``/``rating_count`` columns in sync so the read route can serve the
same ``TrackRatingOut`` payload as the write route.
"""

from __future__ import annotations

from django.contrib.auth.models import AbstractBaseUser
from django.db.models import Avg, Count

from apps.media.models import Track, TrackRating


def track_or_none(track_id: int) -> Track | None:
    """Resolve a track by primary key; ``None`` when missing."""
    return Track.objects.filter(pk=track_id).first()


def my_track_rating(user_id: int, track_id: int) -> TrackRating | None:
    return TrackRating.objects.filter(user_id=user_id, track_id=track_id).first()


def track_rating_out(track: Track, rating: TrackRating) -> dict:
    """Shape a rating row like the legacy ``TrackRatingOut`` GET response."""
    return _payload(rating, track.avg_rating, track.rating_count)


def upsert_track_rating(user: AbstractBaseUser, track_id: int, score: int) -> dict:
    """Create/update a rating, refresh the aggregates, return the response payload."""
    rating, _ = TrackRating.objects.update_or_create(
        user=user,
        track_id=track_id,
        defaults={"score": score},
    )
    avg, count = _recalc(track_id)
    return _payload(rating, avg, count)


def _recalc(track_id: int) -> tuple[float | None, int]:
    aggregate = TrackRating.objects.filter(track_id=track_id).aggregate(
        avg=Avg("score"), count=Count("id")
    )
    avg = round(float(aggregate["avg"]), 2) if aggregate["avg"] is not None else None
    count = aggregate["count"] or 0
    Track.objects.filter(pk=track_id).update(avg_rating=avg, rating_count=count)
    return avg, count


def _payload(rating: TrackRating, avg: float | None, count: int) -> dict:
    return {
        "user_id": rating.user_id,
        "track_id": rating.track_id,
        "score": rating.score,
        "avg_rating": avg,
        "rating_count": count,
        "created_at": rating.created_at,
        "updated_at": rating.updated_at,
    }
