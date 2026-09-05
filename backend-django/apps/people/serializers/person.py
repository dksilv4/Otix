"""Person serializers.

Follows the accounts golden pattern: read serializers are field-listed (never
``fields = "__all__"``) and grouped by audience (summary vs detail vs request
bodies). Keys mirror the legacy FastAPI schemas in
``backend/otix/schemas/people.py`` as closely as our models allow.

The detail serializer reads scalar aggregates and per-user state from
``context["person_context"]`` — populated once by the detail view from
``apps.people.services.build_person_context`` — so serializer methods stay
one-line lookups and the querying lives in services.
"""

from django.core.exceptions import ObjectDoesNotExist
from rest_framework import serializers

from apps.media.models import Episode, MediaItem, Season
from apps.people.models import MediaCredit, Person


class PersonSummarySerializer(serializers.ModelSerializer):
    """List/search item shape (legacy ``PersonSummary``)."""

    class Meta:
        model = Person
        fields = ("id", "name", "photo_url", "birthday", "place_of_birth")
        read_only_fields = fields


class EpisodeOutSerializer(serializers.ModelSerializer):
    """Episode slice shown inside a show credit's season."""

    class Meta:
        model = Episode
        fields = ("episode_number", "name", "air_date")
        read_only_fields = fields


class SeasonOutSerializer(serializers.Serializer):
    """One season of a show credit, with derived first/last air dates.

    Only episodes that carry an ``air_date`` are listed (legacy behaviour).
    """

    season_number = serializers.SerializerMethodField()
    name = serializers.SerializerMethodField()
    first_air_date = serializers.SerializerMethodField()
    last_air_date = serializers.SerializerMethodField()
    episodes = serializers.SerializerMethodField()

    def _aired_episodes(self, obj: Season) -> list[Episode]:
        episodes = sorted(obj.episodes.all(), key=lambda e: e.episode_number)
        return [e for e in episodes if e.air_date is not None]

    def get_season_number(self, obj: Season) -> int:
        return obj.season_number

    def get_name(self, obj: Season) -> str | None:
        return obj.name

    def get_first_air_date(self, obj: Season) -> str | None:
        episodes = self._aired_episodes(obj)
        return min(e.air_date for e in episodes).isoformat() if episodes else None

    def get_last_air_date(self, obj: Season) -> str | None:
        episodes = self._aired_episodes(obj)
        return max(e.air_date for e in episodes).isoformat() if episodes else None

    def get_episodes(self, obj: Season) -> list[dict]:
        return EpisodeOutSerializer(self._aired_episodes(obj), many=True).data


class CreditMediaItemSerializer(serializers.ModelSerializer):
    """Media item embedded in a person credit (legacy ``PersonCreditMediaOut``).

    ``poster_url`` does not exist on our hub row; it is approximated from the
    item's poster ``MediaAsset``. Shows additionally embed their season tree.
    """

    poster_url = serializers.SerializerMethodField()
    seasons = serializers.SerializerMethodField()

    class Meta:
        model = MediaItem
        fields = ("id", "media_type", "title", "slug", "poster_url", "release_date", "seasons")
        read_only_fields = fields

    def get_poster_url(self, obj: MediaItem) -> str | None:
        poster = next(
            (a for a in obj.assets.all() if (a.asset_type or "").lower() == "poster"), None
        )
        return poster.url if poster else None

    def get_seasons(self, obj: MediaItem) -> list[dict] | None:
        if obj.media_type != "show":
            return None
        try:
            show = obj.show
        except ObjectDoesNotExist:
            return None
        seasons = sorted(show.seasons.all(), key=lambda s: s.season_number)
        return SeasonOutSerializer(seasons, many=True).data


class PersonCreditSerializer(serializers.ModelSerializer):
    """One credited role on a person's detail (legacy ``PersonCreditOut``)."""

    media_item = CreditMediaItemSerializer(read_only=True)

    class Meta:
        model = MediaCredit
        fields = ("id", "media_item", "role", "character_name", "sort_order")
        read_only_fields = fields


class PersonDetailSerializer(serializers.ModelSerializer):
    """Full public person detail (legacy ``PersonDetail``).

    Aggregate/external-id/per-user fields come from ``person_context`` in the
    serializer context (built by ``services.build_person_context``); ``None``
    for ``is_followed``/``user_rating`` means the request was unauthenticated,
    matching legacy's optional-user behaviour.
    """

    tmdb_id = serializers.SerializerMethodField()
    imdb_id = serializers.SerializerMethodField()
    follower_count = serializers.SerializerMethodField()
    is_followed = serializers.SerializerMethodField()
    avg_rating = serializers.SerializerMethodField()
    user_rating = serializers.SerializerMethodField()
    rating_count = serializers.SerializerMethodField()
    credits = PersonCreditSerializer(many=True, read_only=True)

    class Meta:
        model = Person
        fields = (
            "id",
            "name",
            "tmdb_id",
            "imdb_id",
            "photo_url",
            "biography",
            "birthday",
            "deathday",
            "place_of_birth",
            "synced_at",
            "follower_count",
            "is_followed",
            "avg_rating",
            "user_rating",
            "rating_count",
            "credits",
        )
        read_only_fields = fields

    def _context_value(self, key: str):
        context = self.context.get("person_context") or {}
        return context.get(key)

    def get_tmdb_id(self, _obj: Person) -> int | None:
        return self._context_value("tmdb_id")

    def get_imdb_id(self, _obj: Person) -> str | None:
        return self._context_value("imdb_id")

    def get_follower_count(self, _obj: Person) -> int:
        return self._context_value("follower_count")

    def get_is_followed(self, _obj: Person) -> bool | None:
        return self._context_value("is_followed")

    def get_avg_rating(self, _obj: Person) -> float | None:
        return self._context_value("avg_rating")

    def get_user_rating(self, _obj: Person) -> int | None:
        return self._context_value("user_rating")

    def get_rating_count(self, _obj: Person) -> int:
        return self._context_value("rating_count")


class PersonFollowResponseSerializer(serializers.Serializer):
    """Response body for follow/unfollow (legacy ``PersonFollowResponse``)."""

    followed = serializers.BooleanField()
    follower_count = serializers.IntegerField()


class PersonRatingBodySerializer(serializers.Serializer):
    """Request body for rating a person (legacy ``PersonRatingBody``, 1-5)."""

    score = serializers.IntegerField(min_value=1, max_value=5)
