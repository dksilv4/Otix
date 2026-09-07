"""Polymorphic external-id registry.

Replaces the legacy string ``entity_type``/``entity_id`` polymorphism with a
Django ``GenericForeignKey`` (``target``): any model in the hub can be the
target of an external id (TMDB/IMDB/Steam/MusicBrainz/...) by having an
ExternalID row whose ``content_type``/``object_id`` point at it.

Uniqueness is scoped to ``(content_type, provider, external_id, media_type)``
so TMDB movie vs TV ids coexist (``media_type`` disambiguates) and non-media
entities (people/companies/...) attach their own ids without colliding.
"""

from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.db import models

from core.models import TimestampedModel


class ExternalID(TimestampedModel):
    """A provider-assigned id for some catalog entity."""

    content_type = models.ForeignKey(
        ContentType,
        on_delete=models.CASCADE,
        db_index=True,
    )
    object_id = models.BigIntegerField(db_index=True)
    target = GenericForeignKey("content_type", "object_id")

    provider = models.CharField(max_length=50)
    external_id = models.CharField(max_length=100)
    media_type = models.CharField(max_length=10, null=True, blank=True)
    is_adult = models.BooleanField(default=False)
    # Providers whose id was confirmed by at least this many humans.
    confirmed_by = models.JSONField(default=list, blank=True)

    class Meta(TimestampedModel.Meta):
        db_table = "external_ids"
        constraints = [
            models.UniqueConstraint(
                fields=["content_type", "provider", "external_id", "media_type"],
                name="uq_external_id_content_provider_ext_media_type",
            )
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.external_id}"
