"""Franchises and their ordered media-item membership."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import MediaItem
from core.models import BaseModel, TimestampedModel


class Franchise(TimestampedModel):
    """A media franchise (MCU, Final Fantasy, ...)."""

    name = models.CharField(max_length=1000)
    slug = models.CharField(max_length=1000)
    overview = models.TextField(null=True, blank=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="franchise",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "franchises"

    def __str__(self) -> str:
        return self.name


class FranchiseItem(BaseModel):
    """Ordered membership of a media item in a franchise."""

    franchise = models.ForeignKey(Franchise, on_delete=models.CASCADE, related_name="items")
    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="franchise_items"
    )
    sort_order = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "franchise_items"
        constraints = [
            models.UniqueConstraint(
                fields=["franchise", "media_item"], name="uq_franchise_item_franchise_media"
            )
        ]

    def __str__(self) -> str:
        return f"{self.franchise_id}:{self.media_item_id}"
