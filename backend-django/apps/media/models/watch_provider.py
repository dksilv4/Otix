"""Streaming/rental/purchase watch providers and their media links."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import MediaItem
from core.models import BaseModel


class WatchProvider(BaseModel):
    """Streaming/rental/purchase provider (Netflix, Prime, Hulu, ...)."""

    name = models.CharField(max_length=200)
    slug = models.CharField(max_length=200)
    logo_url = models.CharField(max_length=2000, null=True, blank=True)
    display_priority = models.IntegerField(default=0)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="watchprovider",
    )

    class Meta(BaseModel.Meta):
        db_table = "watch_providers"
        constraints = [
            models.UniqueConstraint(fields=["slug"], name="uq_watch_provider_slug")
        ]

    def __str__(self) -> str:
        return self.name


class MediaWatchProvider(BaseModel):
    """Link: a media item is available on a provider in a country.

    ``offering_type`` is one of flatrate, rent, buy, free, ads.
    """

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="watch_providers"
    )
    watch_provider = models.ForeignKey(
        WatchProvider, on_delete=models.CASCADE, related_name="media_links"
    )
    country_code = models.CharField(max_length=2)
    offering_type = models.CharField(max_length=20)
    url = models.CharField(max_length=2000, null=True, blank=True)
    display_priority = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "media_watch_providers"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "watch_provider", "country_code", "offering_type"],
                name="uq_media_watch_provider",
            )
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.watch_provider_id}"
