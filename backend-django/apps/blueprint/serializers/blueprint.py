"""Blueprint serializers: response shapes and create/update request bodies.

Read serializers are field-listed (never ``__all__``) and mirror the legacy
FastAPI schemas (``backend/otix/schemas/blueprint.py``): ``BlueprintListOut``
excludes the raw ``blueprint_string`` and ``updated_at``, while the detail shape
adds them. ``likes_count``/``has_liked`` are read off the model instance after
the service layer annotates them; ``author_name`` resolves through the
``select_related`` author row.
"""

from rest_framework import serializers

from apps.blueprint.models import Blueprint


class BlueprintListSerializer(serializers.ModelSerializer):
    """List-item shape (legacy ``BlueprintListOut``)."""

    user_id = serializers.IntegerField(read_only=True)
    author_name = serializers.CharField(source="user.username", read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    has_liked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Blueprint
        fields = (
            "id",
            "user_id",
            "author_name",
            "title",
            "description",
            "parsed_data",
            "tags",
            "downloads",
            "likes_count",
            "has_liked",
            "created_at",
        )
        read_only_fields = fields


class BlueprintDetailSerializer(serializers.ModelSerializer):
    """Detail shape (legacy ``BlueprintDetailOut``); adds string + updated_at."""

    user_id = serializers.IntegerField(read_only=True)
    author_name = serializers.CharField(source="user.username", read_only=True)
    likes_count = serializers.IntegerField(read_only=True)
    has_liked = serializers.BooleanField(read_only=True)

    class Meta:
        model = Blueprint
        fields = (
            "id",
            "user_id",
            "author_name",
            "title",
            "description",
            "blueprint_string",
            "parsed_data",
            "tags",
            "downloads",
            "likes_count",
            "has_liked",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class BlueprintCreateSerializer(serializers.Serializer):
    """Create request body (legacy ``BlueprintCreate``)."""

    title = serializers.CharField(min_length=1, max_length=200)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    blueprint_string = serializers.CharField(min_length=1)
    parsed_data = serializers.DictField(required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, allow_null=True
    )


class BlueprintUpdateSerializer(serializers.Serializer):
    """Partial-update request body (legacy ``BlueprintUpdate``)."""

    title = serializers.CharField(min_length=1, max_length=200, required=False)
    description = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    blueprint_string = serializers.CharField(min_length=1, required=False)
    parsed_data = serializers.DictField(required=False, allow_null=True)
    tags = serializers.ListField(
        child=serializers.CharField(allow_blank=True), required=False, allow_null=True
    )


class BlueprintLikeResponseSerializer(serializers.Serializer):
    """Like toggle response (legacy ``BlueprintLikeResponse``)."""

    is_liked = serializers.BooleanField()
    like_count = serializers.IntegerField()


class BlueprintDownloadResponseSerializer(serializers.Serializer):
    """Download increment response (legacy ``BlueprintDownloadResponse``)."""

    downloads = serializers.IntegerField()
