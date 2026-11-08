"""Serializers for Storage Shares, Node Library Paths, and Game Matches."""

from django.contrib.contenttypes.models import ContentType
from rest_framework import serializers

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare, UserMachine
from apps.media.models import ExternalID, MediaItem
from apps.media.serializers.catalog import MediaItemSummarySerializer


class StorageShareSerializer(serializers.ModelSerializer):
    node_count = serializers.SerializerMethodField()
    server_machine_id = serializers.PrimaryKeyRelatedField(
        source="machine",
        queryset=UserMachine.objects.all(),
        required=False,
        allow_null=True,
    )

    def get_node_count(self, obj: StorageShare) -> int:
        if hasattr(obj, "node_count") and obj.node_count is not None:
            return obj.node_count
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
    storage_share_name = serializers.CharField(
        source="storage_share.name", read_only=True, allow_null=True
    )

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
    storage_share_name = serializers.CharField(
        source="storage_share.name", read_only=True, allow_null=True
    )
    node_name = serializers.CharField(source="node.name", read_only=True, allow_null=True)
    external_ids = serializers.SerializerMethodField()

    def get_external_ids(self, obj: GameMatchRecord) -> dict[str, str]:
        if not obj.media_item_id:
            return {}
        if hasattr(obj, "_cached_external_ids"):
            return obj._cached_external_ids
        context_cache = self.context.get("external_ids_by_media_id")
        if context_cache is not None and obj.media_item_id in context_cache:
            return context_cache[obj.media_item_id]
        if hasattr(obj, "media_item") and obj.media_item:
            prefetched = getattr(obj.media_item, "_prefetched_objects_cache", {}).get("external_ids")
            if prefetched is not None:
                return {e.provider: e.external_id for e in prefetched}
        ct = ContentType.objects.get_for_model(MediaItem)
        return dict(
            ExternalID.objects.filter(content_type=ct, object_id=obj.media_item_id).values_list(
                "provider", "external_id"
            )
        )

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
            "external_ids",
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
    title_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
    ps_id = serializers.CharField(required=False, allow_blank=True, allow_null=True)
