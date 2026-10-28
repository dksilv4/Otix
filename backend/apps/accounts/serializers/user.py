"""User serializers.

Golden-reference pattern: read serializers are deliberately field-listed (never
``fields = "__all__"``) so the API surface is explicit and stable, and they are
grouped by audience (identity vs. self) rather than one fat serializer.
"""

from rest_framework import serializers

from apps.accounts.models import User
from apps.accounts.models.user import MAX_AVATAR_URL_LENGTH, MAX_BACKGROUND_URL_LENGTH
from core.image_url import clean_image_url


class UserIdentitySerializer(serializers.ModelSerializer):
    """Minimal public identity — used for registration responses."""

    class Meta:
        model = User
        fields = ("id", "username", "email")
        read_only_fields = fields


class UserSelfSerializer(serializers.ModelSerializer):
    """The current user's own profile — used by ``GET /auth/me``.

    Scalar profile fields only (superset of legacy ``MeResponse``); the
    preference lists/dicts live behind ``GET /auth/me/preferences``.
    ``date_of_birth`` is readable here but deliberately absent from
    ``UserUpdateSerializer`` (legacy never lets PATCH change it).
    ``is_admin`` is derived read-only from the user's staff flag so the web
    client can gate admin UI (avatar-bearing consumers can't send a header).
    """

    is_admin = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "display_name",
            "avatar_url",
            "is_active",
            "is_verified",
            "two_factor_enabled",
            "bio",
            "background_url",
            "date_of_birth",
            "country",
            "is_private",
            "show_adult_content",
            "save_game_sessions",
            "game_sessions_private",
            "section_visibility",
            "is_bot",
            "is_admin",
            "total_xp",
            "onboarding_completed",
            "taste_reset_at",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields

    def get_is_admin(self, obj: User) -> bool:
        return bool(obj.is_staff)

    def to_representation(self, instance: User) -> dict:
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = clean_image_url(data["avatar_url"])
        if data.get("background_url"):
            data["background_url"] = clean_image_url(data["background_url"])
        return data


class UserUpdateSerializer(serializers.ModelSerializer):
    """Partial self-update of the authenticated user (``PATCH /auth/me``).

    Writable set mirrors the legacy ``_UPDATABLE_FIELDS`` allow-list (plus
    greenfield ``display_name``); any other body key is silently ignored by
    DRF because it is not a declared field. Username/email uniqueness is
    enforced with the current instance excluded. Non-editable columns
    (``is_bot``, ``total_xp``, ``date_of_birth``, security flags) are read-only
    on ``UserSelfSerializer``.
    """

    email = serializers.EmailField(required=False, allow_blank=True)
    avatar_url = serializers.CharField(
        max_length=MAX_AVATAR_URL_LENGTH,
        required=False,
        allow_null=True,
        allow_blank=True,
    )
    background_url = serializers.CharField(
        max_length=MAX_BACKGROUND_URL_LENGTH,
        required=False,
        allow_null=True,
        allow_blank=True,
    )

    class Meta:
        model = User
        fields = (
            "username",
            "email",
            "display_name",
            "bio",
            "avatar_url",
            "background_url",
            "country",
            "is_private",
            "show_adult_content",
            "save_game_sessions",
            "game_sessions_private",
            "daily_mood_checkins_enabled",
            "onboarding_completed",
            "integration_visibility",
            "section_visibility",
            "profile_sections",
            "profile_card_sections",
            "hall_of_fame_media_ids",
            "notification_preferences",
            "preferred_media_types",
            "preferred_genres",
            "preferred_languages",
            "discover_emphases",
        )

    def to_representation(self, instance: User) -> dict:
        data = super().to_representation(instance)
        if data.get("avatar_url"):
            data["avatar_url"] = clean_image_url(data["avatar_url"])
        if data.get("background_url"):
            data["background_url"] = clean_image_url(data["background_url"])
        return data

    def validate_avatar_url(self, value: str | None) -> str | None:
        return self._validate_safe_profile_url(value, "avatar_url")

    def validate_section_visibility(self, value: dict | None) -> dict:
        if value is None:
            return {}
        if not isinstance(value, dict):
            raise serializers.ValidationError("section_visibility must be a dictionary.")
        for k, v in value.items():
            if not isinstance(k, str) or v not in ("public", "friends", "private"):
                raise serializers.ValidationError(
                    f"Invalid visibility value for {k}: expected 'public', 'friends', or 'private'."
                )
        return value

    def validate_background_url(self, value: str | None) -> str | None:
        return self._validate_safe_profile_url(value, "background_url")

    def update(self, instance: User, validated_data: dict) -> User:
        if "section_visibility" in validated_data and isinstance(
            validated_data["section_visibility"], dict
        ):
            sec_vis = validated_data["section_visibility"]
            if "game_sessions" in sec_vis:
                instance.game_sessions_private = sec_vis["game_sessions"] != "public"
        return super().update(instance, validated_data)

    def _validate_safe_profile_url(self, value: str | None, field_name: str) -> str | None:
        if not value or not value.strip():
            return None
        val = clean_image_url(value.strip())
        if not val:
            return None
        if val.startswith("/uploads/") or val.startswith("/api/v1/uploads/"):
            return val
        lower = val.lower()
        if (
            lower.startswith("javascript:")
            or lower.startswith("data:")
            or lower.startswith("vbscript:")
            or lower.startswith("file:")
        ):
            raise serializers.ValidationError(f"Disallowed URL scheme in {field_name}.")
        if not (lower.startswith("http://") or lower.startswith("https://")):
            raise serializers.ValidationError(
                f"{field_name} must be an absolute http(s) URL or local /uploads/ path."
            )
        return val


class UserPreferencesSerializer(serializers.ModelSerializer):
    """Read-only preference blob behind ``GET /auth/me/preferences``."""

    class Meta:
        model = User
        fields = (
            "preferred_media_types",
            "preferred_genres",
            "preferred_languages",
            "discover_emphases",
            "daily_mood_checkins_enabled",
            "save_game_sessions",
            "game_sessions_private",
            "hall_of_fame_media_ids",
            "profile_sections",
            "profile_card_sections",
            "integration_visibility",
            "section_visibility",
            "notification_preferences",
        )
        read_only_fields = fields


class RegisterSerializer(serializers.Serializer):
    """Create a new account.

    Hand-rolled (not a ModelSerializer) because creation goes through
    ``User.objects.create_user`` so the password is hashed and default flags
    (is_active/is_staff/is_superuser) are set consistently.
    """

    username = serializers.CharField(max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, min_length=8, trim_whitespace=False)

    def validate_username(self, value: str) -> str:
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError("A user with this username already exists.")
        return value

    def validate_email(self, value: str) -> str:
        if value and User.objects.filter(email=value).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return value

    def create(self, validated_data: dict) -> User:
        return User.objects.create_user(
            username=validated_data["username"],
            email=validated_data.get("email") or None,
            password=validated_data["password"],
        )
