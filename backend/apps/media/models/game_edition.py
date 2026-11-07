"""GameEdition model representing edition variants (GOTY, Deluxe, etc.) of a canonical Game."""

from django.db import models

from core.models import TimestampedModel


class GameEdition(TimestampedModel):
    """Edition variant linked to a canonical Game subtype."""

    game = models.ForeignKey(
        "media.Game",
        on_delete=models.CASCADE,
        related_name="editions",
    )
    name = models.CharField(max_length=255)
    raw_title = models.CharField(max_length=1000)
    igdb_id = models.CharField(max_length=64, null=True, blank=True, db_index=True)
    release_date = models.DateField(null=True, blank=True)
    external_ids = models.JSONField(default=dict, blank=True)
    cover_image_id = models.CharField(max_length=255, null=True, blank=True)
    summary = models.TextField(null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta(TimestampedModel.Meta):
        db_table = "game_editions"
        indexes = [
            models.Index(fields=["game", "name"], name="game_editions_game_name_idx"),
            models.Index(fields=["igdb_id"], name="game_editions_igdb_id_idx"),
        ]

    def __str__(self) -> str:
        return f"{self.game}: {self.name}"
