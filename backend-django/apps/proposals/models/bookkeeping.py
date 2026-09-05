"""Matching/admin bookkeeping rows (ported from legacy ``media.py``).

These two plain-Base tables track matching state, not catalog content:
:class:`MatchSkip` records permanently-rejected match candidates so a re-scan
does not re-suggest them, and :class:`TMDBDeletedID` records TMDB ids whose
rows were deleted upstream so sync does not recreate them. Neither carries the
created/updated timestamp mixin; each owns its single timestamp column.
"""

from django.conf import settings
from django.db import models

from core.models import BaseModel


class MatchSkip(BaseModel):
    """A match candidate permanently rejected by a user (or globally)."""

    provider = models.CharField(max_length=30)  # "epic", "steam", ...
    external_id = models.CharField(max_length=100)
    skipped_at = models.DateTimeField(auto_now_add=True, editable=False, db_index=True)
    # None = global skip across all users.
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="match_skips",
    )

    class Meta(BaseModel.Meta):
        db_table = "match_skips"
        constraints = [
            models.UniqueConstraint(
                fields=["provider", "external_id"],
                name="uq_match_skip_provider_ext",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.external_id}"


class TMDBDeletedID(BaseModel):
    """A TMDB id detected as deleted upstream, to avoid re-import."""

    tmdb_id = models.IntegerField()
    media_type = models.CharField(max_length=10)
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="tmdb_deleted_ids",
    )
    title = models.CharField(max_length=1000, null=True, blank=True)
    detection_date = models.DateTimeField(auto_now_add=True, editable=False, db_index=True)

    class Meta(BaseModel.Meta):
        db_table = "tmdb_deleted_ids"
        constraints = [
            models.UniqueConstraint(
                fields=["tmdb_id", "media_type"],
                name="uq_tmdb_deleted_id",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.media_type}:{self.tmdb_id}"
