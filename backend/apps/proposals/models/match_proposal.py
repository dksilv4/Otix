"""Match proposals (legacy ``old-backend/otix/domain/match_proposal.py``).

An admin-reviewed proposal linking an external source game (store + store id)
to a catalog :class:`media.MediaItem`. Source/target titles are denormalised
snapshots frozen at proposal time, exactly as the legacy scanner wrote them.
"""

from django.db import models

from core.models import TimestampedModel


class MatchProposal(TimestampedModel):
    """Admin-reviewed proposal matching an external game to a catalog item."""

    source = models.CharField(max_length=50)
    source_game_id = models.CharField(max_length=200)
    source_title = models.CharField(max_length=1000)
    developer = models.CharField(max_length=500, null=True, blank=True)
    release_year = models.IntegerField(null=True, blank=True)
    poster_url = models.CharField(max_length=2000, null=True, blank=True)

    # Matched Otix catalog side.
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.CASCADE,
        related_name="match_proposals",
    )
    otix_title = models.CharField(max_length=1000)
    otix_confidence = models.FloatField()
    match_type = models.CharField(max_length=50)
    proposed_by = models.CharField(max_length=50, default="auto")
    status = models.CharField(max_length=20, default="pending")
    reviewed_by = models.CharField(max_length=50, null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "match_proposals"

    def __str__(self) -> str:
        return f"{self.source}:{self.source_game_id} -> {self.otix_title}"
