"""Server machines (homelab computers, NAS, baremetal/VM hosts)."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel

OS_CHOICES = (
    ("unraid", "Unraid"),
    ("truenas", "TrueNAS"),
    ("ubuntu", "Ubuntu"),
    ("debian", "Debian"),
    ("proxmox", "Proxmox VE"),
    ("windows_server", "Windows Server"),
    ("arch", "Arch Linux"),
    ("macos", "macOS"),
    ("synology", "Synology DSM"),
    ("other", "Other / Custom"),
)


class UserServerMachine(TimestampedModel):
    """A physical or virtual server machine / homelab computer."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="server_machines",
    )
    home = models.ForeignKey(
        "library.UserHome",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="server_machines",
    )
    name = models.CharField(max_length=255)
    os = models.CharField(max_length=64, choices=OS_CHOICES, default="other")
    os_version = models.CharField(max_length=64, blank=True, default="")
    host = models.CharField(max_length=255, blank=True, default="")

    # Hosted node (node running directly on this server machine)
    hosted_node = models.ForeignKey(
        "library.UserNode",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hosted_server_machines",
    )

    # SMB communication settings
    smb_enabled = models.BooleanField(default=True)
    smb_host = models.CharField(max_length=255, blank=True, default="")
    smb_port = models.IntegerField(default=445)
    smb_share_name = models.CharField(max_length=255, blank=True, default="")
    smb_username = models.CharField(max_length=255, blank=True, default="")
    smb_password = models.CharField(max_length=255, blank=True, default="")
    smb_workgroup = models.CharField(max_length=64, default="WORKGROUP")
    smb_mount_path = models.CharField(max_length=1024, blank=True, default="")
    smb_shares = models.JSONField(default=list, blank=True)

    # Nodes configured to communicate with this server through SMB
    smb_nodes = models.ManyToManyField(
        "library.UserNode",
        blank=True,
        related_name="smb_accessible_servers",
    )

    # Hard drive configuration: list of { drive, label, file_system, total_bytes, free_bytes, used_bytes, type, mount_point }
    drives_config = models.JSONField(default=list, blank=True)
    total_storage_bytes = models.BigIntegerField(default=0)
    free_storage_bytes = models.BigIntegerField(default=0)

    is_online = models.BooleanField(default=True)
    notes = models.TextField(blank=True, default="")

    class Meta(TimestampedModel.Meta):
        db_table = "user_server_machines"
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name} ({self.os})"

    def recalculate_storage(self) -> None:
        """Aggregate total and free storage from drives_config if present."""
        if isinstance(self.drives_config, list):
            tot = sum(
                int(d.get("total_bytes") or d.get("totalBytes") or 0)
                for d in self.drives_config
                if isinstance(d, dict)
            )
            free = sum(
                int(d.get("free_bytes") or d.get("freeBytes") or 0)
                for d in self.drives_config
                if isinstance(d, dict)
            )
            if tot > 0:
                self.total_storage_bytes = tot
                self.free_storage_bytes = free
