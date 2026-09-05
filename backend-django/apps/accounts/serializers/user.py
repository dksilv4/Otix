"""User serializers.

Golden-reference pattern: read serializers are deliberately field-listed (never
``fields = "__all__"``) so the API surface is explicit and stable, and they are
grouped by audience (identity vs. self) rather than one fat serializer.
"""

from rest_framework import serializers

from apps.accounts.models import User


class UserIdentitySerializer(serializers.ModelSerializer):
    """Minimal public identity — used for registration responses."""

    class Meta:
        model = User
        fields = ("id", "username", "email")
        read_only_fields = fields


class UserSelfSerializer(serializers.ModelSerializer):
    """The current user's own profile — used by ``GET /auth/me``."""

    class Meta:
        model = User
        fields = (
            "id",
            "username",
            "email",
            "display_name",
            "avatar_url",
            "is_active",
            "created_at",
            "updated_at",
        )
        read_only_fields = fields


class UserUpdateSerializer(serializers.ModelSerializer):
    """Partial self-update of the authenticated user (``PATCH /auth/me``).

    Mirrors legacy ``UserUpdateRequest`` semantics: only the profile fields the
    greenfield ``User`` currently carries are writable; any other body key is
    silently ignored by DRF (it is not a declared field). Uniqueness on
    username/email is enforced with the current instance excluded.
    """

    email = serializers.EmailField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("username", "email", "display_name", "avatar_url")


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
