"""Music track-rating serializers (legacy ``old-backend/otix/schemas/track.py``).

Request body mirrors ``TrackRatingCreate`` (score 1-10); the response mirrors
``TrackRatingOut`` including the track-level aggregates the legacy service
attached on top of the per-user row.
"""

from rest_framework import serializers


class TrackRatingBodySerializer(serializers.Serializer):
    """Request body for rating a track (score 1-10, legacy ``TrackRatingCreate``)."""

    score = serializers.IntegerField(min_value=1, max_value=10)


class TrackRatingOutSerializer(serializers.Serializer):
    """A user's track rating plus the track aggregate columns (``TrackRatingOut``)."""

    user_id = serializers.IntegerField()
    track_id = serializers.IntegerField()
    score = serializers.IntegerField()
    avg_rating = serializers.FloatField(allow_null=True)
    rating_count = serializers.IntegerField()
    created_at = serializers.DateTimeField()
    updated_at = serializers.DateTimeField()
