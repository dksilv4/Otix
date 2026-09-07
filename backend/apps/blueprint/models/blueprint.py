"""Blueprint domain models: user blueprint strings and likes.

Ported from the legacy FastAPI ``backend/otix/domain/blueprint.py``. A
blueprint belongs to a user and stores the raw share string plus optional
parsed payload and tags; likes are deduplicated per user via ``uq_blueprint_like``.
"""

from django.conf import settings
from django.db import models

from core.models import BaseModel, TimestampedModel


class Blueprint(TimestampedModel):
    """A user's shared blueprint (raw string + parsed metadata)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blueprints",
    )
    title = models.CharField(max_length=200)
    description = models.TextField(null=True, blank=True)
    blueprint_string = models.TextField()
    parsed_data = models.JSONField(null=True, blank=True)
    tags = models.JSONField(null=True, blank=True)
    downloads = models.IntegerField(default=0)

    class Meta(TimestampedModel.Meta):
        db_table = "blueprints"

    def __str__(self) -> str:
        return self.title


class BlueprintLike(BaseModel):
    """A user liked a blueprint. Legacy table has its own ``id`` PK plus a
    unique ``(user_id, blueprint_id)`` (named ``uq_blueprint_like``) and a
    ``created_at`` timestamp only (no ``updated_at``)."""

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="blueprint_likes",
    )
    blueprint = models.ForeignKey(
        Blueprint,
        on_delete=models.CASCADE,
        related_name="likes",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(BaseModel.Meta):
        db_table = "blueprint_likes"
        constraints = [
            models.UniqueConstraint(
                fields=["user", "blueprint"],
                name="uq_blueprint_like",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.user_id}:{self.blueprint_id}"
