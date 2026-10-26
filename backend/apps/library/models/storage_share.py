"""Logical storage shares (e.g. SMB / NFS network shares, local pools) shared across nodes."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

SHARE_PROTOCOLS = (
    ("smb", "Samba / SMB"),
    ("nfs", "NFS"),
    ("local", "Local Drive / Pool"),
    ("other", "Other / Network"),
)


class StorageShare(TimestampedModel):
    """A logical storage share or volume accessible across one or more Otix Nodes.

    Allows Otix to detect when multiple nodes (e.g. a local desktop PC via SMB
    and a NAS server directly on disk) point to the same underlying game files.
    """

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="storage_shares",
    )
    server_machine = models.ForeignKey(
        "library.UserServerMachine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="storage_shares",
    )
    name = models.CharField(max_length=255)
    protocol = models.CharField(max_length=32, choices=SHARE_PROTOCOLS, default="smb")
    host = models.CharField(max_length=255, blank=True, default="")
    export_path = models.CharField(max_length=1024, blank=True, default="")
    notes = models.TextField(blank=True, default="")
    is_active = models.BooleanField(default=True)

    class Meta(TimestampedModel.Meta):
        db_table = "storage_shares"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["user", "name"],
                name="uq_user_storage_share_name",
            )
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name} ({self.protocol})"
