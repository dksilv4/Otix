"""People: cast/crew persons and their photo assets."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.models import BaseModel


class Person(BaseModel):
    """A real person (actor, director, artist, ...) in the catalog."""

    name = models.CharField(max_length=500)
    youtube_channel_title = models.CharField(max_length=500, null=True, blank=True)
    photo_url = models.CharField(max_length=2000, null=True, blank=True)
    logo_url = models.CharField(max_length=2000, null=True, blank=True)
    biography = models.TextField(null=True, blank=True)
    birthday = models.DateField(null=True, blank=True)
    deathday = models.DateField(null=True, blank=True)
    place_of_birth = models.CharField(max_length=500, null=True, blank=True)
    synced_at = models.DateTimeField(null=True, blank=True)
    next_sync_at = models.DateTimeField(null=True, blank=True)
    content_hash = models.CharField(max_length=64, null=True, blank=True)
    hash_match_count = models.IntegerField(default=0)
    avg_rating = models.FloatField(null=True, blank=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="person",
    )

    class Meta(BaseModel.Meta):
        db_table = "people"

    def __str__(self) -> str:
        return self.name


class PersonAsset(BaseModel):
    """A photo/logo image variant for a person."""

    person = models.ForeignKey(Person, on_delete=models.CASCADE, related_name="assets")
    url = models.CharField(max_length=2000, unique=True)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    provider = models.CharField(max_length=20, null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "person_assets"

    def __str__(self) -> str:
        return f"{self.person_id}:{self.url}"
