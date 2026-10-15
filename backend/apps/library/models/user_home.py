"""Per-user Home / Homelab locations."""

from django.conf import settings
from django.db import models

from core.models import TimestampedModel


class UserHome(TimestampedModel):
    """A home or homelab environment grouping nodes, servers, and devices."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="homes",
    )
    name = models.CharField(max_length=255)
    description = models.TextField(blank=True, default="")
    is_default = models.BooleanField(default=False)
    subnet_cidr = models.CharField(max_length=64, blank=True, default="")

    class Meta(TimestampedModel.Meta):
        db_table = "user_homes"
        ordering = ["-is_default", "name"]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.name}"
