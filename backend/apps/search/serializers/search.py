"""Search read serializers.

Field-listed read shapes (never ``__all__``) mirroring the legacy FastAPI
schemas in ``old-backend/otix/schemas/media.py``:

- ``MediaSummarySerializer``   -> legacy ``MediaItemSummary`` (title search rows)
- ``TrackSearchSerializer``    -> legacy ``TrackSearchResult`` (album tracks)
- ``PersonSearchResultSerializer`` -> legacy ``PersonSearchResult`` (grouped people)
- ``CompanySearchSerializer``  -> legacy ``CompanyOut`` (company search rows)
- ``ProviderResultSerializer`` -> legacy ``ProviderSearchResult`` (unified provider rows)

Embeddings/pgvector are deferred in this migration (see ARCHITECTURE §9); the
media summaries carry only fields the greenfield relational schema can answer.
Asset URLs (poster/backdrop/logo/icon) are read off ``MediaAsset`` rows and
``tmdb_id`` off the generic ``media.ExternalID`` table.
"""

from rest_framework import serializers

from apps.company.models import Company
from apps.media.models import MediaItem
from apps.people.models import Person

MEDIA_SUMMARY_FIELDS = (
    "id",
    "media_type",
    "title",
    "slug",
    "tmdb_id",
    "poster_url",
    "textless_poster_url",
    "backdrop_url",
    "logo_url",
    "icon_url",
    "release_date",
    "popularity",
    "avg_rating",
    "rating_count",
    "overall_rating",
    "overall_rating_source",
    "like_count",
    "watchlist_count",
    "watched_count",
    "played_count",
    "started_count",
    "listened_count",
    "view_count",
    "is_adult",
)


def _asset_url(obj: MediaItem, asset_type: str) -> str | None:
    """Return the first URL for ``obj``'s asset of the given type, if any."""
    for asset in obj.assets.all():
        if (asset.asset_type or "").lower() == asset_type:
            return asset.url
    return None


def _external_id(obj: MediaItem, provider: str) -> str | None:
    """Resolve a provider-specific external id from the generic ExternalID rows."""
    for ext in obj.external_ids.all():
        if ext.provider == provider:
            return ext.external_id
    return None


class MediaSummarySerializer(serializers.ModelSerializer):
    """Title-search result row (legacy ``MediaItemSummary``)."""

    tmdb_id = serializers.SerializerMethodField()
    poster_url = serializers.SerializerMethodField()
    textless_poster_url = serializers.SerializerMethodField()
    backdrop_url = serializers.SerializerMethodField()
    logo_url = serializers.SerializerMethodField()
    icon_url = serializers.SerializerMethodField()

    class Meta:
        model = MediaItem
        fields = MEDIA_SUMMARY_FIELDS
        read_only_fields = fields

    def get_tmdb_id(self, obj: MediaItem) -> str | None:
        return _external_id(obj, "tmdb")

    def get_poster_url(self, obj: MediaItem) -> str | None:
        return _asset_url(obj, "poster")

    def get_textless_poster_url(self, obj: MediaItem) -> str | None:
        return _asset_url(obj, "textless_poster")

    def get_backdrop_url(self, obj: MediaItem) -> str | None:
        return _asset_url(obj, "backdrop")

    def get_logo_url(self, obj: MediaItem) -> str | None:
        return _asset_url(obj, "logo")

    def get_icon_url(self, obj: MediaItem) -> str | None:
        return _asset_url(obj, "icon")


class TrackSearchSerializer(serializers.Serializer):
    """Track row inside music search results (legacy ``TrackSearchResult``)."""

    id = serializers.IntegerField(read_only=True)
    title = serializers.CharField(read_only=True)
    track_number = serializers.IntegerField(read_only=True, default=1)
    disc_number = serializers.IntegerField(read_only=True, default=1)
    duration_ms = serializers.IntegerField(read_only=True, default=0)
    preview_url = serializers.CharField(read_only=True, default=None)
    avg_rating = serializers.FloatField(read_only=True, default=None)
    rating_count = serializers.IntegerField(read_only=True, default=0)
    media_type = serializers.CharField(read_only=True, default="track")
    album_id = serializers.IntegerField(read_only=True, default=None)
    album_title = serializers.CharField(read_only=True, default=None)
    album_poster_url = serializers.CharField(read_only=True, default=None)
    album_artist_name = serializers.CharField(read_only=True, default=None)
    album_slug = serializers.CharField(read_only=True, default=None)


class PersonSearchResultSerializer(serializers.ModelSerializer):
    """Minimal person row for grouped search (legacy ``PersonSearchResult``)."""

    media_type = serializers.SerializerMethodField()

    class Meta:
        model = Person
        fields = ("id", "name", "photo_url", "media_type")
        read_only_fields = fields

    def get_media_type(self, _obj: Person) -> str:
        return "person"


class CompanySearchSerializer(serializers.ModelSerializer):
    """Company row for ``/search/companies`` (legacy ``CompanyOut``).

    The legacy company search returned the detail ``CompanyOut`` shape but did
    not compute per-row aggregates; follower/rating keys keep their schema
    defaults (0 / None / None / None) exactly as legacy emitted them.
    """

    follower_count = serializers.SerializerMethodField()
    is_followed = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()

    class Meta:
        model = Company
        fields = (
            "id",
            "name",
            "slug",
            "logo_url",
            "origin_country",
            "follower_count",
            "is_followed",
            "avg_rating",
            "user_rating",
        )
        read_only_fields = fields

    def get_follower_count(self, _obj: Company) -> int:
        return 0

    def get_is_followed(self, _obj: Company) -> None:
        return None

    def get_avg_rating(self, _obj: Company) -> None:
        return None

    def get_user_rating(self, _obj: Company) -> None:
        return None


class ProviderResultSerializer(serializers.Serializer):
    """A single provider row for ``/search/providers`` (legacy ProviderSearchResult)."""

    provider = serializers.CharField()
    id = serializers.CharField()
    title = serializers.CharField()
    poster_url = serializers.CharField(allow_null=True)
    slug = serializers.CharField(allow_null=True)
    confidence = serializers.FloatField(allow_null=True)


class ProviderSearchRequestSerializer(serializers.Serializer):
    """Request body for ``POST /search/providers`` (legacy ``ProviderSearchRequest``)."""

    query = serializers.CharField(required=True, allow_blank=False)
    limit = serializers.IntegerField(default=12, min_value=1, max_value=50)


class SteamGridSearchRequestSerializer(serializers.Serializer):
    """Request body for ``POST /search/steamgrid`` (legacy ``SteamGridSearchRequest``)."""

    query = serializers.CharField(required=True, allow_blank=False)
