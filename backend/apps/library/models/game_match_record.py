"""Pure database match records, candidates, and user overrides for scanned games."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

MATCH_STATUSES = (
    ("matched", "Matched"),
    ("needs_review", "Needs Review"),
    ("unmatched", "Unmatched"),
    ("ignored", "Ignored"),
)


class GameMatchRecord(TimestampedModel):
    """Catalog match state and candidate suggestions for a game file.

    Persists match resolution in the database without modifying files on disk.
    Correlates across nodes using the storage share and relative subpath.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="game_matches",
    )
    storage_share = models.ForeignKey(
        "library.StorageShare",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_matches",
    )
    node = models.ForeignKey(
        "library.UserNode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_matches",
    )
    canonical_key = models.CharField(max_length=512, db_index=True)
    raw_title = models.CharField(max_length=1000)
    cleaned_title = models.CharField(max_length=1000)
    relative_path = models.CharField(max_length=2048)
    format_category = models.CharField(max_length=50, default="game")
    filesize = models.BigIntegerField(default=0)
    sha256_head = models.CharField(max_length=64, blank=True, default="")
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_matches",
    )
    match_status = models.CharField(
        max_length=32,
        choices=MATCH_STATUSES,
        default="unmatched",
        db_index=True,
    )
    confidence = models.FloatField(default=0.0)
    candidates = models.JSONField(default=list, blank=True)
    user_override = models.BooleanField(default=False)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta(TimestampedModel.Meta):
        db_table = "game_match_records"
        ordering = ["-updated_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "canonical_key"],
                name="uq_user_game_canonical_key",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.cleaned_title} ({self.match_status}, {self.confidence:.2f})"
