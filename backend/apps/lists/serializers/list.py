"""List serializers: output, detail, collaborators, items and history.

Field-listed read serializers mirroring the legacy FastAPI schemas in
``old-backend/otix/schemas/list.py``:

- ``UserListOut`` carries placeholder ``like_count``/``is_liked`` keys that the
  legacy routers left at their defaults; the detail route replaces them with the
  real like state.
- Detail items are ``MediaItemSummary`` slices; collaborators embed a ``UserRef``.
- Request bodies match the legacy ``UserListCreate``/``UserListUpdate``/
  ``ListItemAdd``/``ListItemReorder``/``CollaboratorInvite`` payloads.
"""

from rest_framework import serializers

from apps.accounts.models import User
from apps.lists.models import ListItemRankHistory, MediaListCollaborator, UserList
from apps.lists.models.user_list import LIST_COLLABORATOR_PERMISSIONS
from apps.media.models import MediaItem

_COLLABORATOR_CHOICES = [(permission, permission) for permission in LIST_COLLABORATOR_PERMISSIONS]


class UserRefSerializer(serializers.ModelSerializer):
    """Minimal public user identity (legacy ``UserRef``)."""

    class Meta:
        model = User
        fields = ("id", "username", "avatar_url")
        read_only_fields = fields


class MediaItemSummarySerializer(serializers.ModelSerializer):
    """Media item slice embedded in a list detail / history row.

    Mirrors the legacy ``MediaItemSummary`` for the columns the hub model
    carries. ``poster_url``/``backdrop_url`` come from the item's ``MediaAsset``
    rows and ``tmdb_id`` from the polymorphic ``ExternalID`` table (the legacy
    TMDB column was removed from the hub row).
    """

    poster_url = serializers.SerializerMethodField()
    backdrop_url = serializers.SerializerMethodField()
    tmdb_id = serializers.SerializerMethodField()

    class Meta:
        model = MediaItem
        fields = (
            "id",
            "media_type",
            "title",
            "slug",
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
            "poster_url",
            "backdrop_url",
            "tmdb_id",
        )
        read_only_fields = fields

    def get_poster_url(self, obj: MediaItem) -> str | None:
        return next(
            (a.url for a in obj.assets.all() if (a.asset_type or "").lower() == "poster"),
            None,
        )

    def get_backdrop_url(self, obj: MediaItem) -> str | None:
        return next(
            (a.url for a in obj.assets.all() if (a.asset_type or "").lower() == "backdrop"),
            None,
        )

    def get_tmdb_id(self, obj: MediaItem) -> str | None:
        return next(
            (e.external_id for e in obj.external_ids.all() if e.provider == "tmdb"),
            None,
        )


class UserListOutSerializer(serializers.ModelSerializer):
    """A list as returned by list/create/update/item routes (legacy ``UserListOut``).

    The service layer attaches ``like_count``/``is_liked`` to each instance;
    list endpoints keep the legacy placeholders (0/False) while the detail route
    sets the real like state.
    """

    like_count = serializers.IntegerField(read_only=True)
    is_liked = serializers.BooleanField(read_only=True)
    item_count = serializers.IntegerField(read_only=True, default=0)

    class Meta:
        model = UserList
        fields = (
            "id",
            "user_id",
            "name",
            "description",
            "is_public",
            "like_count",
            "is_liked",
            "item_count",
            "created_at",
            "updated_at",
        )
        read_only_fields = (
            "id",
            "user_id",
            "name",
            "description",
            "is_public",
            "item_count",
            "created_at",
            "updated_at",
        )


class UserListDetailSerializer(UserListOutSerializer):
    """Full list detail (legacy ``UserListDetailOut``) with items + collaborators.

    ``items`` and ``collaborators`` are SerializerMethods fed from attributes the
    detail service attaches (``ordered_media_items`` / ``collaborator_rows``), so
    the nested data is prefetched once rather than queried per object.
    """

    items = serializers.SerializerMethodField()
    collaborators = serializers.SerializerMethodField()

    class Meta(UserListOutSerializer.Meta):
        fields = UserListOutSerializer.Meta.fields + ("items", "collaborators")
        read_only_fields = UserListOutSerializer.Meta.read_only_fields + ("items", "collaborators")

    def get_items(self, obj: UserList) -> list[dict]:
        return MediaItemSummarySerializer(getattr(obj, "ordered_media_items", []), many=True).data

    def get_collaborators(self, obj: UserList) -> list[dict]:
        return CollaboratorOutSerializer(
            getattr(obj, "collaborator_rows", []), many=True, context=self.context
        ).data


class UserListCreateSerializer(serializers.Serializer):
    """Create-list request body (legacy ``UserListCreate``)."""

    name = serializers.CharField(min_length=1, max_length=200)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_public = serializers.BooleanField(required=False, default=False)


class UserListUpdateSerializer(serializers.Serializer):
    """Update-list request body (legacy ``UserListUpdate``).

    A ``None`` description/visibility means "leave unchanged", matching the
    legacy Pydantic defaults (a description can never be explicitly cleared).
    """

    name = serializers.CharField(min_length=1, max_length=200, required=False)
    description = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    is_public = serializers.BooleanField(required=False, allow_null=True)


class CollaboratorOutSerializer(serializers.ModelSerializer):
    """One list collaborator (legacy ``CollaboratorOut``).

    The nested ``user`` is a ``UserRef`` for list/detail reads; the invite
    response passes ``context={"include_user": False}`` so ``user`` stays null,
    mirroring the legacy create route which omitted the joined user.
    """

    user = serializers.SerializerMethodField()

    class Meta:
        model = MediaListCollaborator
        fields = ("id", "user_id", "permission", "status", "created_at", "user")
        read_only_fields = ("id", "user_id", "permission", "status", "created_at")

    def get_user(self, obj: MediaListCollaborator) -> dict | None:
        if not self.context.get("include_user", True):
            return None
        user = getattr(obj, "user", None)
        if user is None:
            return None
        return UserRefSerializer(user).data


class CollaboratorInviteSerializer(serializers.Serializer):
    """Invite request body (legacy ``CollaboratorInvite``)."""

    user_id = serializers.IntegerField()
    permission = serializers.ChoiceField(choices=_COLLABORATOR_CHOICES, default="VIEW")

    def validate_user_id(self, value: int) -> int:
        if not User.objects.filter(pk=value).exists():
            raise serializers.ValidationError("User not found.")
        return value


class ListItemAddSerializer(serializers.Serializer):
    """Add-item request body (legacy ``ListItemAdd``)."""

    media_item_id = serializers.IntegerField()

    def validate_media_item_id(self, value: int) -> int:
        if not MediaItem.objects.filter(pk=value).exists():
            raise serializers.ValidationError("Media item does not exist.")
        return value


class ListItemReorderSerializer(serializers.Serializer):
    """Reorder request body (legacy ``ListItemReorder``)."""

    media_item_ids = serializers.ListField(child=serializers.IntegerField())


class ListLikeStatusSerializer(serializers.Serializer):
    """Like/unlike response body (legacy ``ListLikeStatus``)."""

    like_count = serializers.IntegerField()
    is_liked = serializers.BooleanField()


class RankHistoryOutSerializer(serializers.ModelSerializer):
    """One rank-change history row (legacy ``RankHistoryOut``)."""

    media_item = MediaItemSummarySerializer(read_only=True, allow_null=True)

    class Meta:
        model = ListItemRankHistory
        fields = (
            "id",
            "media_item_id",
            "user_id",
            "old_sort_order",
            "new_sort_order",
            "changed_at",
            "media_item",
        )
        read_only_fields = fields
