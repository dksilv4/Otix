"""Serializers for dedicated game servers, friend shares, and invite links."""

from rest_framework import serializers

from apps.gameservers.models import DedicatedGameServer, GameServerInvite, GameServerShare
from apps.library.models.user_server_machine import UserServerMachine


class SharedUserSerializer(serializers.Serializer):
    """Minimal friend profile for share records."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    avatar_url = serializers.CharField(read_only=True, allow_null=True)
    display_name = serializers.SerializerMethodField()

    def get_display_name(self, obj) -> str:
        return getattr(obj, "display_name", None) or getattr(obj, "username", "")


class DedicatedGameServerSerializer(serializers.ModelSerializer):
    """Full representation of a dedicated game server."""

    media_item_id = serializers.PrimaryKeyRelatedField(
        source="media_item",
        read_only=True,
    )
    media_item_title = serializers.SerializerMethodField()
    media_item_poster = serializers.SerializerMethodField()
    server_machine_id = serializers.PrimaryKeyRelatedField(
        source="server_machine",
        read_only=True,
    )
    server_machine_name = serializers.CharField(
        source="server_machine.name",
        read_only=True,
        allow_null=True,
        default=None,
    )
    connection_address = serializers.ReadOnlyField()
    is_owner = serializers.SerializerMethodField()
    is_member = serializers.SerializerMethodField()
    user_permission = serializers.SerializerMethodField()
    active_invite_code = serializers.SerializerMethodField()
    owner_username = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = DedicatedGameServer
        fields = [
            "id",
            "name",
            "game_title",
            "media_item_id",
            "media_item_title",
            "media_item_poster",
            "server_machine_id",
            "server_machine_name",
            "server_type",
            "host",
            "port",
            "query_port",
            "password",
            "description",
            "is_public_link",
            "status",
            "current_players",
            "max_players",
            "player_list",
            "current_map",
            "version",
            "ping_ms",
            "last_queried_at",
            "connection_address",
            "owner_username",
            "is_owner",
            "is_member",
            "user_permission",
            "active_invite_code",
            "created_at",
            "updated_at",
        ]

    def get_media_item_title(self, obj: DedicatedGameServer) -> str:
        if obj.media_item:
            return obj.media_item.title
        return obj.game_title

    def get_media_item_poster(self, obj: DedicatedGameServer) -> str | None:
        if obj.media_item:
            resolved = getattr(obj.media_item, "_resolved_poster_url", None)
            if resolved:
                return resolved
            if hasattr(obj.media_item, "assets"):
                asset = obj.media_item.assets.filter(asset_type="poster").first()
                if asset:
                    return asset.url
        return None

    def get_is_owner(self, obj: DedicatedGameServer) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.owner_id == request.user.id

    def get_is_member(self, obj: DedicatedGameServer) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        if obj.owner_id == request.user.id:
            return True
        return obj.shares.filter(user_id=request.user.id).exists()

    def get_user_permission(self, obj: DedicatedGameServer) -> str:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return "viewer"
        if obj.owner_id == request.user.id:
            return "admin"
        share = obj.shares.filter(user_id=request.user.id).first()
        return share.permission if share else "viewer"

    def get_active_invite_code(self, obj: DedicatedGameServer) -> str | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return None
        # Only owner or admins see invite code
        if obj.owner_id == request.user.id or obj.is_public_link:
            invite = obj.invites.filter(is_active=True).first()
            return invite.code if invite else None
        return None


class DedicatedGameServerCreateSerializer(serializers.ModelSerializer):
    """Payload for creating or updating a dedicated game server."""

    name = serializers.CharField(
        required=False,
        allow_blank=True,
        default="",
    )
    media_item_id = serializers.CharField(
        required=False,
        allow_null=True,
    )
    server_machine_id = serializers.PrimaryKeyRelatedField(
        queryset=UserServerMachine.objects.all(),
        source="server_machine",
        required=False,
        allow_null=True,
    )

    class Meta:
        model = DedicatedGameServer
        fields = [
            "name",
            "game_title",
            "media_item_id",
            "server_machine_id",
            "server_type",
            "host",
            "port",
            "query_port",
            "password",
            "description",
            "is_public_link",
        ]

    def validate_media_item_id(self, value: str | None) -> int | None:
        if not value:
            return None
        from apps.media.views.catalog import resolve_media_pk

        pk = resolve_media_pk("game", str(value).strip())
        if pk is not None:
            return pk
        if str(value).isdigit():
            return int(value)
        return None

    def validate_port(self, value: int) -> int:
        if not (1 <= value <= 65535):
            raise serializers.ValidationError("Port must be between 1 and 65535")
        return value

    def validate_query_port(self, value: int | None) -> int | None:
        if value is not None and not (1 <= value <= 65535):
            raise serializers.ValidationError("Query port must be between 1 and 65535")
        return value


class GameServerShareSerializer(serializers.ModelSerializer):
    """Representation of a friend share."""

    user = SharedUserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True)

    class Meta:
        model = GameServerShare
        fields = [
            "id",
            "server_id",
            "user",
            "user_id",
            "permission",
            "created_at",
        ]
        read_only_fields = ["id", "server_id", "created_at"]


class GameServerInviteSerializer(serializers.ModelSerializer):
    """Representation of an invite link for sharing with anyone."""

    is_valid = serializers.ReadOnlyField()

    class Meta:
        model = GameServerInvite
        fields = [
            "id",
            "code",
            "server_id",
            "is_active",
            "expires_at",
            "max_uses",
            "uses",
            "is_valid",
            "created_at",
        ]
        read_only_fields = ["id", "code", "server_id", "uses", "is_valid", "created_at"]
