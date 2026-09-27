"""Sharing permissions for self-hosted Otix Nodes with friends and via share links."""

import secrets

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


def generate_node_share_token() -> str:
    """Generate a clean, URL-safe 10-char share token for node links."""
    return secrets.token_urlsafe(8)[:10]


class UserNodeShare(TimestampedModel):
    """Share record granting an Otix friend or link-holder access to a UserNode.

    Allows friends to browse, stream, and download game installers/ROMs hosted
    on this Otix Node.
    """

    node = models.ForeignKey(
        "library.UserNode",
        on_delete=models.CASCADE,
        related_name="shares",
    )
    shared_with = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="shared_nodes",
    )
    share_token = models.CharField(
        max_length=32,
        unique=True,
        db_index=True,
        default=generate_node_share_token,
    )
    is_public_link = models.BooleanField(default=False)
    allow_all_libraries = models.BooleanField(default=True)
    allowed_libraries = models.JSONField(default=list, blank=True)
    permission = models.CharField(
        max_length=20,
        choices=(("read", "Read / Download"), ("admin", "Manage")),
        default="read",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "user_node_shares"
        constraints = [
            models.UniqueConstraint(
                fields=["node", "shared_with"],
                condition=models.Q(shared_with__isnull=False),
                name="uq_user_node_share_node_user",
            )
        ]

    def __str__(self) -> str:
        target = self.shared_with.username if self.shared_with else f"link:{self.share_token}"
        return f"Node {self.node_id} shared with {target} ({self.permission})"
