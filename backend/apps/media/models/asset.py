"""Asset/video/release/rating rows attached to media items."""

from django.db import models

from apps.media.models.media_item import Episode, MediaItem
from core.models import BaseModel


class MediaAsset(BaseModel):
    """A poster/backdrop/logo image variant for a media item."""

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="assets"
    )
    asset_type = models.CharField(max_length=20)
    url = models.CharField(max_length=2000)
    width = models.IntegerField(null=True, blank=True)
    height = models.IntegerField(null=True, blank=True)
    lang = models.CharField(max_length=10, null=True, blank=True)
    style = models.CharField(max_length=20, null=True, blank=True)
    label = models.CharField(max_length=30, null=True, blank=True)
    score = models.IntegerField(null=True, blank=True)
    provider = models.CharField(max_length=20, null=True, blank=True)
    color_guess = models.CharField(max_length=20, null=True, blank=True)

    # Mirrored local copy on the backend's own disk. ``local_name`` is the
    # unguessable filename under ``MEDIA_DIR/assets``; when set, catalog
    # ``_pick_asset`` returns the local ``/api/v1/assets/<name>`` URL instead of
    # the provider's remote ``url``. Null until downloaded.
    local_name = models.CharField(
        max_length=64, null=True, blank=True, db_index=True
    )
    local_size = models.BigIntegerField(null=True, blank=True)
    downloaded_at = models.DateTimeField(null=True, blank=True)

    # Serve-count for max-storage-budget eviction (least-used discarded first).
    usage_count = models.PositiveIntegerField(default=0)
    last_used_at = models.DateTimeField(null=True, blank=True)

    # Admin-pinned artwork. A null/blank pin means the automatic scoring pick is
    # used; ``general`` is an explicit default served to every viewer (and the
    # fallback when no ``dark``/``light`` pin exists). Catalog ``_best_asset``
    # ranks the pinned row ahead of score/mirror/pk, so serving AND mirroring
    # follow the choice. One-pin-per-(media_item, asset_type, context) is
    # enforced by the selection service (``assets.select_asset``), not a DB
    # constraint.
    selected_context = models.CharField(max_length=10, null=True, blank=True)

    # Admin "keep" set: mirrors this variant even though it isn't the resolution
    # winner for its type, and exempts it from the mirror reconcile's stale-copy
    # discard. Used to keep several localized language variants (posters with an
    # ``en``/``fr``/... lang) downloaded alongside the single served pick.
    keep_local = models.BooleanField(default=False)

    class Meta(BaseModel.Meta):
        db_table = "media_assets"
        constraints = [
            models.UniqueConstraint(
                fields=["media_item", "url", "asset_type"],
                name="uq_media_assets_item_url_type",
            )
        ]

    def __str__(self) -> str:
        return f"{self.asset_type}:{self.url}"


class MediaVideo(BaseModel):
    """A trailer/teaser video for a media item."""

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="videos"
    )
    video_type = models.CharField(max_length=50, null=True, blank=True)
    url = models.CharField(max_length=2000)
    provider = models.CharField(max_length=20, null=True, blank=True)
    provider_id = models.CharField(max_length=100, null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "media_videos"

    def __str__(self) -> str:
        return self.url


class MediaRelease(BaseModel):
    """Country-scoped release date / certification for a media item."""

    media_item = models.ForeignKey(
        MediaItem, on_delete=models.CASCADE, related_name="releases"
    )
    country_code = models.CharField(max_length=2)
    release_date = models.DateField(null=True, blank=True)
    certification = models.CharField(max_length=20, null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "media_releases"

    def __str__(self) -> str:
        return f"{self.country_code}:{self.media_item_id}"


class ExternalRating(BaseModel):
    """An aggregated rating pulled from an external provider (Rotten Tomatoes...).

    Targets either a media item or an episode (exactly one must be set).
    """

    media_item = models.ForeignKey(
        MediaItem,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="external_ratings",
    )
    episode = models.ForeignKey(
        Episode,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name="external_ratings",
    )
    provider = models.CharField(max_length=20)
    score = models.FloatField()
    max_score = models.FloatField(default=10.0)
    vote_count = models.IntegerField(null=True, blank=True)

    class Meta(BaseModel.Meta):
        db_table = "external_ratings"
        constraints = [
            models.CheckConstraint(
                condition=models.Q(media_item__isnull=False)
                | models.Q(episode__isnull=False),
                name="ck_external_rating_target",
            )
        ]

    def __str__(self) -> str:
        return f"{self.provider}:{self.score}"
