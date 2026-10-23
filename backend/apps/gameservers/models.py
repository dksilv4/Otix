"""Models for dedicated game server tracking, monitoring, and sharing."""

import secrets

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

SERVER_TYPE_CHOICES = (
    ("steam_source", "Steam / Source (A2S)"),
    ("minecraft", "Minecraft"),
    ("generic", "Generic"),
)

STATUS_CHOICES = (
    ("online", "Online"),
    ("offline", "Offline"),
    ("unknown", "Unknown"),
)

PERMISSION_CHOICES = (
    ("viewer", "Viewer"),
    ("moderator", "Moderator"),
    ("admin", "Admin"),
)


def generate_invite_code() -> str:
    """Generate a clean, URL-safe 10-char invite token."""
    return secrets.token_urlsafe(8)[:10]


class DedicatedGameServer(TimestampedModel):
    """A dedicated game server instance associated with a game.

    Owned by a user, optionally linked to a catalog MediaItem, and queried
    periodically via A2S, Minecraft ping, or TCP socket.
    """

    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="owned_game_servers",
    )
    media_item = models.ForeignKey(
        "media.MediaItem",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dedicated_game_servers",
    )
    server_machine = models.ForeignKey(
        "library.UserServerMachine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="game_servers",
    )
    name = models.CharField(max_length=255)
    game_title = models.CharField(max_length=255, blank=True, default="")
    server_type = models.CharField(
        max_length=50,
        choices=SERVER_TYPE_CHOICES,
        default="generic",
    )
    host = models.CharField(max_length=255)
    port = models.PositiveIntegerField()
    query_port = models.PositiveIntegerField(null=True, blank=True)
    password = models.CharField(max_length=255, blank=True, default="")
    description = models.TextField(blank=True, default="")

    # Sharing toggle: when True, anyone with the server invite link can view/join
    is_public_link = models.BooleanField(default=False)

    # Live queried state
    status = models.CharField(max_length=50, choices=STATUS_CHOICES, default="unknown")
    current_players = models.PositiveIntegerField(default=0)
    max_players = models.PositiveIntegerField(default=0)
    player_list = models.JSONField(default=list, blank=True)
    current_map = models.CharField(max_length=255, blank=True, default="")
    version = models.CharField(max_length=100, blank=True, default="")
    ping_ms = models.PositiveIntegerField(null=True, blank=True)
    last_queried_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "dedicated_game_servers"
        indexes = [
            models.Index(fields=["owner"], name="ix_dgs_owner"),
            models.Index(fields=["media_item"], name="ix_dgs_media_item"),
        ]

    def __str__(self) -> str:
        return f"{self.name} ({self.host}:{self.port}) - {self.server_type}"

    @property
    def effective_query_port(self) -> int:
        return self.query_port if self.query_port is not None else self.port

    @property
    def connection_address(self) -> str:
        return f"{self.host}:{self.port}"


class GameServerShare(TimestampedModel):
    """Direct sharing of a dedicated game server with an Otix friend."""

    server = models.ForeignKey(
        DedicatedGameServer,
        on_delete=models.CASCADE,
        related_name="shares",
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="shared_game_servers",
    )
    permission = models.CharField(
        max_length=20,
        choices=PERMISSION_CHOICES,
        default="viewer",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "game_server_shares"
        constraints = [
            models.UniqueConstraint(
                fields=["server", "user"],
                name="uq_game_server_share_server_user",
            )
        ]

    def __str__(self) -> str:
        return f"{self.server_id} shared with user {self.user_id} ({self.permission})"


class GameServerInvite(TimestampedModel):
    """Shareable invite link allowing anyone with the link to access the server."""

    code = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        default=generate_invite_code,
    )
    server = models.ForeignKey(
        DedicatedGameServer,
        on_delete=models.CASCADE,
        related_name="invites",
    )
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="created_server_invites",
    )
    is_active = models.BooleanField(default=True)
    expires_at = models.DateTimeField(null=True, blank=True)
    max_uses = models.PositiveIntegerField(null=True, blank=True)
    uses = models.PositiveIntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "game_server_invites"

    def __str__(self) -> str:
        return f"Invite {self.code} for server {self.server_id}"

    @property
    def is_valid(self) -> bool:
        if not self.is_active:
            return False
        if self.max_uses is not None and self.uses >= self.max_uses:
            return False
        if self.expires_at is not None:
            from django.utils import timezone

            if timezone.now() > self.expires_at:
                return False
        return True
