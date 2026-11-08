"""Relational multi-source models for canonical user games and physical node sources."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserGame(TimestampedModel):
    """Canonical game entity in the user's library.

    Aggregates one or more physical sources across nodes (e.g. desktop install,
    NAS archive, SMB share).
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="canonical_games",
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="user_canonical_games",
    )
    clean_title = models.CharField(max_length=1000, db_index=True)
    platform = models.CharField(max_length=64, db_index=True)
    cover_image_url = models.CharField(max_length=2048, blank=True, default="")
    is_favorite = models.BooleanField(default=False)
    is_hidden = models.BooleanField(default=False)
    last_played_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "user_games"
        ordering = ["clean_title"]
        indexes = [
            models.Index(fields=["user", "is_hidden", "is_favorite"], name="ix_ug_usr_hid_fav"),
            models.Index(fields=["user", "-last_played_at"], name="ix_ug_usr_lastplay"),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "clean_title", "platform"],
                name="uq_user_game_title_platform",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.clean_title} ({self.platform})"


class NodeGameSource(TimestampedModel):
    """A physical game instance or file package located on a specific Otix node."""

    SOURCE_STATE_CHOICES = (
        ("installed", "Installed"),
        ("installer", "Installer / Setup Package"),
        ("iso", "Disc Image (ISO)"),
        ("rom", "ROM File"),
        ("archive", "Compressed Archive"),
    )

    user_game = models.ForeignKey(
        UserGame,
        on_delete=models.CASCADE,
        related_name="sources",
    )
    node = models.ForeignKey(
        "library.UserNode",
        on_delete=models.CASCADE,
        related_name="game_sources",
    )
    storage_share = models.ForeignKey(
        "library.StorageShare",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_sources",
    )
    canonical_path = models.CharField(max_length=2048)
    relative_path = models.CharField(max_length=2048, blank=True, default="")
    source_state = models.CharField(
        max_length=32,
        choices=SOURCE_STATE_CHOICES,
        default="installed",
        db_index=True,
    )
    file_size = models.BigIntegerField(default=0)
    sha256_head = models.CharField(max_length=64, blank=True, default="")
    is_available = models.BooleanField(default=True, db_index=True)
    format_details = models.JSONField(
        default=dict,
        blank=True,
        help_text="Metadata details: exePath, dlcList, romHeader, multiDisc, version, releaseGroup",
    )
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta(TimestampedModel.Meta):
        db_table = "node_game_sources"
        ordering = ["-last_seen_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["node", "canonical_path"],
                name="uq_node_canonical_path_source",
            )
        ]

    def __str__(self) -> str:
        return f"{self.node_id}:{self.canonical_path} [{self.source_state}]"
