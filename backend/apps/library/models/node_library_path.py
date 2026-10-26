"""Library scan locations and content roles configured per Otix node."""

from django.db import models

from core.models import TimestampedModel


class NodeLibraryPath(TimestampedModel):
    """A filesystem directory configured as a library on a specific Otix node.

    Synchronized two-way with the Node's config.yaml. May be linked to a
    StorageShare to correlate paths across multiple nodes.
    """

    node = models.ForeignKey(
        "library.UserNode",
        on_delete=models.CASCADE,
        related_name="library_paths",
    )
    storage_share = models.ForeignKey(
        "library.StorageShare",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="node_paths",
    )
    name = models.CharField(max_length=255)
    path = models.CharField(max_length=2048)
    kind = models.CharField(max_length=50, default="game")
    roles = models.JSONField(default=list, blank=True)
    allowed_extensions = models.JSONField(default=list, blank=True)
    is_download_target = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    total_files = models.IntegerField(default=0)
    last_scanned_at = models.DateTimeField(null=True, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "node_library_paths"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["node", "path"],
                name="uq_node_library_path",
            )
        ]

    def __str__(self) -> str:
        return f"{self.node.name}:{self.name} -> {self.path}"
