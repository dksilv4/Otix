"""MediaItem hub plus the concrete movie/show/game/album subtypes.

The legacy ``media_items`` hub row carried a ``media_type`` discriminator and
1:1 child rows (``movies``/``shows``/``games``/``albums``) whose primary key was
also the FK back to the hub. That subtype pattern is preserved here as a
``OneToOneField(primary_key=True)`` on each child: the child's PK *is* the media
item id, and ``media_item.movie`` / ``media_item.show`` work natively as reverse
accessors.

All columns shared by every media type live on :class:`MediaItem`; the subtype
tables hold only subtype-specific columns.
"""

from django.contrib.contenttypes.fields import GenericRelation
from django.db import models

from core.models import TimestampedModel

# Allowed values for MediaItem.media_type. ``season``/``episode`` mirror future
# unified-catalog rows; movies/shows/games/albums map to the subtype tables.
MEDIA_TYPE_VALUES = ["movie", "show", "season", "episode", "game", "music"]


class MediaItem(TimestampedModel):
    """Hub row shared by every catalog title.

    ``media_type`` discriminates the concrete subtype stored in ``movies``,
    ``shows``, ``games`` or ``albums``.
    """

    media_type = models.CharField(max_length=10)
    title = models.CharField(max_length=1000)
    overview = models.TextField(null=True, blank=True)
    slug = models.CharField(max_length=1000)
    release_date = models.DateField(null=True, blank=True)
    popularity = models.FloatField(default=0.0)
    original_language = models.CharField(max_length=10, null=True, blank=True)
    completeness_score = models.FloatField(default=0.0)
    synced_at = models.DateTimeField(null=True, blank=True)
    next_sync_at = models.DateTimeField(null=True, blank=True)
    avg_rating = models.FloatField(null=True, blank=True)
    rating_count = models.IntegerField(default=0)
    overall_rating = models.FloatField(null=True, blank=True)
    overall_rating_source = models.CharField(max_length=20, null=True, blank=True)
    like_count = models.IntegerField(default=0)
    watchlist_count = models.IntegerField(default=0)
    watched_count = models.IntegerField(default=0)
    played_count = models.IntegerField(default=0)
    started_count = models.IntegerField(default=0)
    listened_count = models.IntegerField(default=0)
    view_count = models.IntegerField(default=0)
    is_adult = models.BooleanField(default=False)

    # Convenience reverse into the external_ids table (GenericForeignKey).
    external_ids = GenericRelation(
        "media.ExternalID",
        content_type_field="content_type",
        object_id_field="object_id",
        related_query_name="mediaitem",
    )

    class Meta(TimestampedModel.Meta):
        db_table = "media_items"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(media_type__in=MEDIA_TYPE_VALUES),
                name="ck_media_type",
            ),
            models.CheckConstraint(
                condition=models.Q(completeness_score__gte=0.0, completeness_score__lte=1.0),
                name="ck_completeness_score",
            ),
        ]

    def __str__(self) -> str:
        return self.title


class Movie(models.Model):
    """Film subtype; PK equals the ``media_items.id`` it extends."""

    media_item = models.OneToOneField(
        MediaItem,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="movie",
    )
    runtime = models.IntegerField(null=True, blank=True)
    budget = models.BigIntegerField(null=True, blank=True)
    revenue = models.BigIntegerField(null=True, blank=True)
    tagline = models.CharField(max_length=1000, null=True, blank=True)
    is_anime = models.BooleanField(default=False)
    collection = models.ForeignKey(
        "lists.Collection",
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name="movies",
    )

    class Meta:
        db_table = "movies"

    def __str__(self) -> str:
        return self.media_item.title


class Show(models.Model):
    """Television series subtype; PK equals the ``media_items.id`` it extends."""

    media_item = models.OneToOneField(
        MediaItem,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="show",
    )
    status = models.CharField(max_length=50, null=True, blank=True)
    first_air_date = models.DateField(null=True, blank=True)
    last_air_date = models.DateField(null=True, blank=True)
    is_anime = models.BooleanField(default=False)
    number_of_seasons = models.IntegerField(null=True, blank=True)
    number_of_episodes = models.IntegerField(null=True, blank=True)

    class Meta:
        db_table = "shows"

    def __str__(self) -> str:
        return self.media_item.title


class Season(models.Model):
    """A season of a show. Standalone row keyed to the :class:`Show` subtype."""

    show = models.ForeignKey(Show, on_delete=models.CASCADE, related_name="seasons")
    season_number = models.IntegerField()
    name = models.CharField(max_length=1000, null=True, blank=True)
    overview = models.TextField(null=True, blank=True)
    poster_url = models.CharField(max_length=2000, null=True, blank=True)
    air_date = models.DateField(null=True, blank=True, db_index=True)

    class Meta:
        db_table = "seasons"
        indexes = [
            models.Index(fields=["show", "season_number"], name="seasons_show_num_idx"),
        ]

    def __str__(self) -> str:
        name = self.name or f"Season {self.season_number}"
        return f"{self.show}: {name}"


class Episode(models.Model):
    """An episode of a season."""

    season = models.ForeignKey(Season, on_delete=models.CASCADE, related_name="episodes")
    episode_number = models.IntegerField()
    name = models.CharField(max_length=1000, null=True, blank=True)
    overview = models.TextField(null=True, blank=True)
    runtime = models.IntegerField(null=True, blank=True)
    air_date = models.DateField(null=True, blank=True)
    still_url = models.CharField(max_length=2000, null=True, blank=True)

    class Meta:
        db_table = "episodes"

    def __str__(self) -> str:
        return self.name or f"Episode {self.episode_number}"


class Game(models.Model):
    """Game subtype; PK equals the ``media_items.id`` it extends."""

    media_item = models.OneToOneField(
        MediaItem,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="game",
    )
    release_status = models.CharField(max_length=50, null=True, blank=True)
    website = models.CharField(max_length=2000, null=True, blank=True)
    current_players = models.IntegerField(null=True, blank=True)
    price_json = models.JSONField(null=True, blank=True)
    time_to_beat = models.JSONField(null=True, blank=True)
    recommendations = models.IntegerField(null=True, blank=True)
    review_summary = models.CharField(max_length=200, null=True, blank=True)
    is_free = models.BooleanField(default=False)
    has_multiplayer = models.BooleanField(default=False)
    franchise = models.ForeignKey(
        "media.Franchise",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="games",
    )
    game_type = models.CharField(max_length=50, null=True, blank=True, default="main_game")
    parent_game = models.ForeignKey(
        MediaItem,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="child_games",
    )
    parent_game_title = models.CharField(max_length=1000, null=True, blank=True)

    class Meta:
        db_table = "games"

    def __str__(self) -> str:
        return self.media_item.title


class Album(models.Model):
    """Music release subtype; PK equals the ``media_items.id`` it extends."""

    media_item = models.OneToOneField(
        MediaItem,
        on_delete=models.CASCADE,
        primary_key=True,
        related_name="album",
    )
    release_type = models.CharField(max_length=20, default="album")
    format = models.CharField(max_length=50, null=True, blank=True)
    catalog_number = models.CharField(max_length=100, null=True, blank=True)
    barcode = models.CharField(max_length=50, null=True, blank=True)
    track_count = models.IntegerField(default=0)
    disc_count = models.IntegerField(default=0)
    duration_ms = models.IntegerField(null=True, blank=True)
    preview_url = models.CharField(max_length=500, null=True, blank=True)
    audio_features = models.JSONField(null=True, blank=True)

    class Meta:
        db_table = "albums"

    def __str__(self) -> str:
        return self.media_item.title
