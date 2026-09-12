"""Catalog collections and their ordered media-item membership.

Legacy ``Collection`` is a ``HasExternalIDs`` entity: its TMDB collection id
lived in the polymorphic ``external_ids`` table, so the Django model re-attaches
the matching ``GenericRelation`` reverse (no ``ExternalID`` model is recreated).
"""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.models import BaseModel


class Collection(BaseModel):
    """A curated collection of movies/media titles (e.g. a TMDB collection)."""

    name = models.CharField(max_length=1000)
    overview = models.TextField(null=True, blank=True)
    poster_url = models.CharField(max_length=2000, null=True, blank=True)
    backdrop_url = models.CharField(max_length=2000, null=True, blank=True)
    content_hash = models.CharField(max_length=64, null=True, blank=True)
    franchise = models.ForeignKey(
        "media.Franchise",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="collections",
    )

    # Movies (via the subtype FK on ``media.Movie.collection``) and ordered
    # membership rows are reverse accessors created on the hub models.
    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="collection",
    )

    class Meta(BaseModel.Meta):
        db_table = "collections"

    def __str__(self) -> str:
        return self.name


class CollectionItem(BaseModel):
    """Ordered membership of a media item within a collection.

    Legacy table used a composite PK on ``(collection_id, media_item_id)``; the
    hub join-table convention is a surrogate ``id`` PK plus a unique constraint
    over the natural key.
    """

    collection = models.ForeignKey(Collection, on_delete=models.CASCADE, related_name="items")
    media_item = models.ForeignKey(
        "media.MediaItem", on_delete=models.CASCADE, related_name="collection_items"
    )
    sort_order = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "collection_items"
        constraints = [
            models.UniqueConstraint(
                fields=["collection", "media_item"],
                name="uq_collection_item_collection_media",
            )
        ]

    def __str__(self) -> str:
        return f"{self.collection_id}:{self.media_item_id}"
