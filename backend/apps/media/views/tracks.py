"""Music track-rating endpoints (legacy ``track/rating/router.py``).

Both routes are authenticated and mirror the media rating family but target a
``media.Track`` rather than a hub ``MediaItem``. ``GET`` returns ``null`` for an
existing-but-unrated track (legacy ``TrackRatingOut | None``); the write route
upserts and returns the aggregate-laden ``TrackRatingOut`` payload.
"""

from __future__ import annotations

from rest_framework.exceptions import NotFound
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.media.serializers.tracks import (
    TrackRatingBodySerializer,
    TrackRatingOutSerializer,
)
from apps.media.services.track_rating import (
    my_track_rating,
    track_or_none,
    track_rating_out,
    upsert_track_rating,
)

TRACK_NOT_FOUND = "Track not found"


class TrackRatingView(APIView):
    """``GET``/``PUT`` ``/tracks/{track_id}/rating``."""

    def get(self, request, track_id: int) -> Response:
        track = track_or_none(track_id)
        if track is None:
            raise NotFound(TRACK_NOT_FOUND)
        rating = my_track_rating(request.user.id, track_id)
        if rating is None:
            return Response(None)
        payload = track_rating_out(track, rating)
        return Response(TrackRatingOutSerializer(payload).data)

    def put(self, request, track_id: int) -> Response:
        track = track_or_none(track_id)
        if track is None:
            raise NotFound(TRACK_NOT_FOUND)
        body = TrackRatingBodySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        payload = upsert_track_rating(request.user, track_id, body.validated_data["score"])
        return Response(TrackRatingOutSerializer(payload).data)
