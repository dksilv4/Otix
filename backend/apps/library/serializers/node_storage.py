"""Serializers for Storage Shares, Node Library Paths, and Game Matches."""

from rest_framework import serializers

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare
from apps.media.serializers.catalog import MediaItemSummarySerializer


class StorageShareSerializer(serializers.ModelSerializer):
    node_count = serializers.SerializerMethodField()

    def get_node_count(self, obj: StorageShare) -> int:
        return obj.node_paths.values("node_id").distinct().count()

    class Meta:
        model = StorageShare
        fields = [
            "id",
            "name",
            "protocol",
            "host",
            "export_path",
            "notes",
            "is_active",
            "server_machine_id",
            "node_count",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class NodeLibraryPathSerializer(serializers.ModelSerializer):
    storage_share_id = serializers.PrimaryKeyRelatedField(
        queryset=StorageShare.objects.all(),
        source="storage_share",
        required=False,
        allow_null=True,
    )
    storage_share_name = serializers.CharField(source="storage_share.name", read_only=True, allow_null=True)

    class Meta:
        model = NodeLibraryPath
        fields = [
            "id",
            "node_id",
            "storage_share_id",
            "storage_share_name",
            "name",
            "path",
            "kind",
            "roles",
            "allowed_extensions",
            "is_download_target",
            "is_active",
            "total_files",
            "last_scanned_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "created_at", "updated_at"]


class GameMatchRecordSerializer(serializers.ModelSerializer):
    media = MediaItemSummarySerializer(source="media_item", read_only=True, allow_null=True)
    storage_share_name = serializers.CharField(source="storage_share.name", read_only=True, allow_null=True)
    node_name = serializers.CharField(source="node.name", read_only=True, allow_null=True)

    class Meta:
        model = GameMatchRecord
        fields = [
            "id",
            "canonical_key",
            "raw_title",
            "cleaned_title",
            "relative_path",
            "format_category",
            "filesize",
            "sha256_head",
            "match_status",
            "confidence",
            "candidates",
            "user_override",
            "media_item_id",
            "media",
            "storage_share_id",
            "storage_share_name",
            "node_id",
            "node_name",
            "last_seen_at",
            "created_at",
            "updated_at",
        ]
        read_only_fields = ["id", "canonical_key", "last_seen_at", "created_at", "updated_at"]


class ConfirmMatchPayloadSerializer(serializers.Serializer):
    media_item_id = serializers.CharField(required=True)
