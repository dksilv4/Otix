"""Genre/keyword tagging vocabulary plus its media-item links."""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from apps.media.models.media_item import MediaItem
from core.models import BaseModel


class Genre(BaseModel):
    """A taxonomy label (Action, Comedy, RPG, ...)."""

    name = models.CharField(max_length=200, unique=True)
    slug = models.CharField(max_length=200, unique=True)

    class Meta(BaseModel.Meta):
        db_table = "genres"

    def __str__(self) -> str:
        return self.name


class MediaGenreType(BaseModel):
    """Which media types a genre applies to (some genres are media-type specific).

    TMDB keeps separate genre id spaces for movies vs TV, so the media type is
    recorded at link time rather than assumed global.
    """

    genre = models.ForeignKey(Genre, on_delete=models.CASCADE, related_name="media_types")
    media_type = models.CharField(max_length=10)

    class Meta(BaseModel.Meta):
        db_table = "genre_media_types"
        constraints = [
            models.UniqueConstraint(fields=["genre", "media_type"], name="uq_genre_media_type"),
            models.CheckConstraint(
                condition=models.Q(media_type__in=["movie", "show", "game", "music"]),
                name="ck_genre_media_type",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.genre}:{self.media_type}"


class Keyword(BaseModel):
    """A free-form topic keyword attached to media items."""

    name = models.CharField(max_length=200, unique=True)

    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="keyword",
    )

    class Meta(BaseModel.Meta):
        db_table = "keywords"

    def __str__(self) -> str:
        return self.name


class MediaGenre(BaseModel):
    """Link a media item to a genre."""

    media_item = models.ForeignKey(MediaItem, on_delete=models.CASCADE, related_name="media_genres")
    genre = models.ForeignKey(Genre, on_delete=models.CASCADE, related_name="media_genres")

    class Meta(BaseModel.Meta):
        db_table = "media_genres"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "genre"], name="uq_media_genre_item_genre"
            )
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.genre_id}"


class MediaKeyword(BaseModel):
    """Link a media item to a keyword."""

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="media_keywords"
    )
    keyword = models.ForeignKey(
        Keyword, on_delete=models.CASCADE, related_name="media_keywords"
    )

    class Meta(BaseModel.Meta):
        db_table = "media_keywords"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "keyword"], name="uq_media_keyword_item_keyword"
            )
        ]

    def __str__(self) -> str:
        return f"{self.media_item_id}:{self.keyword_id}"
