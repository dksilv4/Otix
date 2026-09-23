"""Game characters and media links."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import MediaItem
from core.models import BaseModel


class Character(BaseModel):
    """A fictional character appearing in games (and other media)."""

    name = models.CharField(max_length=500)
    slug = models.CharField(max_length=500, db_index=True)
    description = models.TextField(null=True, blank=True)
    gender = models.CharField(max_length=50, null=True, blank=True)
    species = models.CharField(max_length=50, null=True, blank=True)
    mug_shot_url = models.CharField(max_length=2000, null=True, blank=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="character",
    )

    class Meta(BaseModel.Meta):
        db_table = "characters"

    def __str__(self) -> str:
        return self.name


class MediaCharacter(BaseModel):
    """Link: a media item (game) features a character."""

    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="characters")
    character = models.ForeignKey(
        Character, on_delete=models.CASCADE, related_name="media_characters"
    )
    order = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "media_characters"
        constraints = [
            models.UniqueConstraint(fields=["media_item", "character"], name="uq_media_character")
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.character_id}"


class CharacterAsset(BaseModel):
    """An image variant, portrait, or gallery asset for a character."""

    character = models.ForeignKey(Character, on_delete=models.CASCADE, related_name="assets")
    asset_type = models.CharField(
        max_length=20, default="gallery"
    )  # mugshot, gallery, concept_art, render
    url = models.CharField(max_length=2000)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    provider = models.CharField(
        max_length=50, null=True, blank=True
    )  # fandom, wikidata, commons, igdb
    caption = models.CharField(max_length=500, null=True, blank=True)
    order = models.IntegerField(default=0)

    class Meta(BaseModel.Meta):
        db_table = "character_assets"
        constraints = [
            models.UniqueConstraint(
                fields=["character", "url"],
                name="uq_character_assets_char_url",
            )
        ]

    def __str__(self) -> str:
        return f"{self.character_id}:{self.asset_type}:{self.url}"
