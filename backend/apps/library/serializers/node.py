"""Serializers for UserNode (Otix companion daemons)."""

from rest_framework import serializers

from apps.library.models import UserHome, UserNode


class UserNodeSerializer(serializers.ModelSerializer):
    """Connected self-hosted Otix node with pure snake_case serialization."""

    primary_url = serializers.CharField(read_only=True)
    auth_token = serializers.CharField(source="api_key", read_only=True)
    last_seen_at = serializers.DateTimeField(source="last_heartbeat", read_only=True)
    is_shared = serializers.SerializerMethodField()
    shared_by = serializers.SerializerMethodField()
    home_id = serializers.SerializerMethodField()
    home_name = serializers.SerializerMethodField()
    pending_updates = serializers.SerializerMethodField()

    def _get_parent_machine(self, obj: UserNode):
        prefetched = getattr(obj, "_prefetched_objects_cache", {}).get("hosted_machines")
        if prefetched is not None:
            for m in prefetched:
                if getattr(m, "home_id", None):
                    return m
            return None
        return (
            getattr(obj, "hosted_machines", obj.hosted_server_machines)
            .filter(home__isnull=False)
            .select_related("home")
            .first()
        )

    def get_home_id(self, obj: UserNode) -> int | None:
        if obj.home_id:
            return obj.home_id
        parent = self._get_parent_machine(obj)
        return parent.home_id if parent else None

    def get_home_name(self, obj: UserNode) -> str | None:
        if obj.home_id and obj.home:
            return obj.home.name
        parent = self._get_parent_machine(obj)
        return parent.home.name if parent and parent.home else None

    class Meta:
        model = UserNode
        fields = [
            "id",
            "name",
            "machine_id",
            "home_id",
            "home_name",
            "primary_url",
            "local_url",
            "remote_url",
            "local_ip",
            "port",
            "api_key",
            "auth_token",
            "is_online",
            "is_local",
            "is_local_desktop",
            "last_heartbeat",
            "last_seen_at",
            "network_interfaces",
            "system_stats",
            "version",
            "total_files",
            "storage_free_bytes",
            "storage_total_bytes",
            "is_active",
            "is_shared",
            "shared_by",
            "pending_updates",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "machine_id",
            "home_id",
            "home_name",
            "is_online",
            "is_local_desktop",
            "last_heartbeat",
            "last_seen_at",
            "total_files",
            "storage_free_bytes",
            "storage_total_bytes",
            "created_at",
            "updated_at",
        ]

    def get_is_shared(self, obj: UserNode) -> bool:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated:
            return False
        return obj.user_id != request.user.id

    def get_shared_by(self, obj: UserNode) -> dict | None:
        request = self.context.get("request")
        if not request or not request.user.is_authenticated or obj.user_id == request.user.id:
            return None
        owner = getattr(obj, "user", None)
        if not owner:
            return None
        return {
            "id": owner.id,
            "username": owner.username,
            "display_name": getattr(owner, "display_name", None) or owner.username,
        }

    def get_pending_updates(self, obj: UserNode) -> list[dict]:
        from apps.library.services.node import get_node_pending_updates

        return get_node_pending_updates(obj.id)


class UserNodeCreateSerializer(serializers.ModelSerializer):
    """Payload to register or update an Otix node."""

    name = serializers.CharField(required=False, allow_blank=True, default="")
    home_id = serializers.IntegerField(required=False, allow_null=True)
    machine_id = serializers.UUIDField(required=False, allow_null=True)
    local_ip = serializers.CharField(required=False, allow_blank=True, default="")
    port = serializers.IntegerField(required=False, default=7777)
    api_key = serializers.CharField(required=False, allow_blank=True, default="")
    auth_token = serializers.CharField(required=False, allow_blank=True, default="", write_only=True)
    network_interfaces = serializers.JSONField(required=False, default=list)
    system_stats = serializers.JSONField(required=False, default=dict)
    version = serializers.CharField(required=False, allow_blank=True, default="")

    def validate_home_id(self, value):
        if value is None:
            return None
        user = self.context.get("user")
        if not user and "request" in self.context:
            user = getattr(self.context["request"], "user", None)

        if not UserHome.objects.filter(id=value).exists():
            if user and getattr(user, "is_authenticated", False):
                user_home = UserHome.objects.filter(user=user).first()
                if not user_home:
                    user_home = UserHome.objects.create(
                        user=user,
                        name="Home",
                        description="Default home network & homelab environment",
                        is_default=True,
                    )
                return user_home.id
            raise serializers.ValidationError("Specified home does not exist.")
        return value

    def validate(self, attrs):
        # Support either api_key or legacy auth_token in payload
        auth_token = attrs.pop("auth_token", None)
        if auth_token and not attrs.get("api_key"):
            attrs["api_key"] = auth_token
        return attrs

    class Meta:
        model = UserNode
        fields = [
            "name",
            "home_id",
            "machine_id",
            "primary_url",
            "local_url",
            "remote_url",
            "local_ip",
            "port",
            "api_key",
            "auth_token",
            "network_interfaces",
            "system_stats",
            "version",
            "is_local",
            "is_local_desktop",
            "is_active",
        ]
