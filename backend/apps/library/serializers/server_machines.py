"""Serializers for UserHome and UserServerMachine."""

from rest_framework import serializers

from apps.library.models import UserHome, UserNode, UserServerMachine


class UserHomeSerializer(serializers.ModelSerializer):
    """User home / homelab location."""

    nodes_count = serializers.SerializerMethodField()
    server_machines_count = serializers.SerializerMethodField()

    class Meta:
        model = UserHome
        fields = [
            "id",
            "name",
            "description",
            "is_default",
            "subnet_cidr",
            "nodes_count",
            "server_machines_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]

    def get_nodes_count(self, obj: UserHome) -> int:
        return obj.nodes.count()

    def get_server_machines_count(self, obj: UserHome) -> int:
        return obj.server_machines.count()


class UserHomeCreateUpdateSerializer(serializers.ModelSerializer):
    """Payload to create or update a UserHome."""

    class Meta:
        model = UserHome
        fields = ["name", "description", "is_default", "subnet_cidr"]


class UserServerMachineSerializer(serializers.ModelSerializer):
    """Homelab server machine."""

    home_id = serializers.IntegerField(source="home.id", read_only=True, allow_null=True)
    home_name = serializers.CharField(source="home.name", read_only=True, allow_null=True)
    hosted_node_id = serializers.IntegerField(
        source="hosted_node.id", read_only=True, allow_null=True
    )
    hosted_node_name = serializers.CharField(
        source="hosted_node.name", read_only=True, allow_null=True
    )
    smb_node_ids = serializers.SerializerMethodField()
    smb_nodes = serializers.SerializerMethodField()

    class Meta:
        model = UserServerMachine
        fields = [
            "id",
            "home_id",
            "home_name",
            "name",
            "os",
            "os_version",
            "host",
            "hosted_node_id",
            "hosted_node_name",
            "smb_enabled",
            "smb_host",
            "smb_port",
            "smb_share_name",
            "smb_username",
            "smb_password",
            "smb_workgroup",
            "smb_mount_path",
            "smb_shares",
            "smb_node_ids",
            "smb_nodes",
            "drives_config",
            "total_storage_bytes",
            "free_storage_bytes",
            "is_online",
            "notes",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "home_id",
            "home_name",
            "hosted_node_id",
            "hosted_node_name",
            "total_storage_bytes",
            "free_storage_bytes",
            "created_at",
            "updated_at",
        ]

    def get_smb_node_ids(self, obj: UserServerMachine) -> list[int]:
        return list(obj.smb_nodes.values_list("id", flat=True))

    def get_smb_nodes(self, obj: UserServerMachine) -> list[dict]:
        return [
            {"id": n.id, "name": n.name, "primary_url": n.primary_url} for n in obj.smb_nodes.all()
        ]


class UserServerMachineCreateUpdateSerializer(serializers.ModelSerializer):
    """Payload to create or update a UserServerMachine."""

    home_id = serializers.IntegerField(required=False, allow_null=True)
    hosted_node_id = serializers.IntegerField(required=False, allow_null=True)
    smb_shares = serializers.ListField(child=serializers.DictField(), required=False, default=list)
    smb_node_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )

    class Meta:
        model = UserServerMachine
        fields = [
            "name",
            "home_id",
            "os",
            "os_version",
            "host",
            "hosted_node_id",
            "smb_enabled",
            "smb_host",
            "smb_port",
            "smb_share_name",
            "smb_username",
            "smb_password",
            "smb_workgroup",
            "smb_mount_path",
            "smb_shares",
            "smb_node_ids",
            "drives_config",
            "is_online",
            "notes",
        ]

    def _get_context_user(self):
        user = self.context.get("user")
        if user and getattr(user, "is_authenticated", False):
            return user
        request = self.context.get("request")
        if request:
            from apps.library.views.nodes import _resolve_user

            return _resolve_user(request)
        return user

    def validate_home_id(self, value):
        if value is None:
            return None
        user = self._get_context_user()
        if user and not UserHome.objects.filter(id=value, user=user).exists():
            raise serializers.ValidationError("Home does not exist or does not belong to you.")
        elif not user and not UserHome.objects.filter(id=value).exists():
            raise serializers.ValidationError("Home does not exist.")
        return value

    def validate_hosted_node_id(self, value):
        if value is None:
            return None
        user = self._get_context_user()
        if user and not UserNode.objects.filter(id=value, user=user).exists():
            raise serializers.ValidationError("Node does not exist or does not belong to you.")
        elif not user and not UserNode.objects.filter(id=value).exists():
            raise serializers.ValidationError("Node does not exist.")
        return value

    def create(self, validated_data):
        home_id = validated_data.pop("home_id", None)
        hosted_node_id = validated_data.pop("hosted_node_id", None)
        smb_node_ids = validated_data.pop("smb_node_ids", [])
        user = self._get_context_user()

        server = UserServerMachine.objects.create(
            user=user,
            home_id=home_id,
            hosted_node_id=hosted_node_id,
            **validated_data,
        )
        if smb_node_ids:
            nodes = (
                UserNode.objects.filter(id__in=smb_node_ids, user=user)
                if user
                else UserNode.objects.none()
            )
            server.smb_nodes.set(nodes)

        server.recalculate_storage()
        server.save(update_fields=["total_storage_bytes", "free_storage_bytes"])
        return server

    def update(self, instance, validated_data):
        home_id = validated_data.pop("home_id", ...)
        hosted_node_id = validated_data.pop("hosted_node_id", ...)
        smb_node_ids = validated_data.pop("smb_node_ids", ...)
        user = self._get_context_user()

        if home_id is not ...:
            instance.home_id = home_id
        if hosted_node_id is not ...:
            instance.hosted_node_id = hosted_node_id

        for attr, value in validated_data.items():
            setattr(instance, attr, value)

        if smb_node_ids is not ...:
            nodes = (
                UserNode.objects.filter(id__in=smb_node_ids, user=user)
                if user
                else UserNode.objects.none()
            )
            instance.smb_nodes.set(nodes)

        instance.recalculate_storage()
        instance.save()
        return instance
