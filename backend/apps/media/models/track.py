"""Music catalog rows: tracks (children of albums) and per-user track ratings."""

from django.conf import settings
from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import Album
from core.models import TimestampedModel


class Track(TimestampedModel):
    """A single track on an :class:`~apps.media.models.media_item.Album`."""

    album = models.ForeignKey(Album, on_delete=models.CASCADE, related_name="tracks")
    track_number = models.IntegerField()
    disc_number = models.IntegerField(default=1)
    title = models.CharField(max_length=500)
    duration_ms = models.IntegerField(null=True, blank=True)
    preview_url = models.CharField(max_length=500, null=True, blank=True)
    audio_features = models.JSONField(null=True, blank=True)
    lyrics = models.TextField(null=True, blank=True)
    avg_rating = models.FloatField(null=True, blank=True)
    rating_count = models.IntegerField(default=0)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="track",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "tracks"

    def __str__(self) -> str:
        return self.title


class TrackRating(TimestampedModel):
    """Per-user score for a track. Score is 1-10."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="track_ratings",
    )
    track = models.ForeignKey(Track, on_delete=models.CASCADE, related_name="ratings")
    score = models.IntegerField()

    class Meta(TimestampedModel.Meta):
        db_table = "track_ratings"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "track"],
                name="uq_track_rating_user_track",
            ),
            models.CheckConstraint(
                condition=models.Q(score__gte=1, score__lte=10),
                name="ck_track_rating_score_range",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.track_id}={self.score}"
