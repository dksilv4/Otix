"""API endpoints for managing Storage Shares, Node Library Paths, and Match Center."""

from __future__ import annotations

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import GameMatchRecord, NodeLibraryPath, StorageShare, UserNode
from apps.library.serializers.node_storage import (
    ConfirmMatchPayloadSerializer,
    GameMatchRecordSerializer,
    NodeLibraryPathSerializer,
    StorageShareSerializer,
)
from apps.library.services.game_matching import (
    confirm_match,
    sync_node_manifest,
    unmatch_record,
)


class StorageSharesView(APIView):
    """List and create logical Storage Shares (SMB, NFS, Local Pools)."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        shares = StorageShare.objects.filter(user=request.user)
        return Response(StorageShareSerializer(shares, many=True).data)

    def post(self, request: Request) -> Response:
        serializer = StorageShareSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        share = serializer.save(user=request.user)
        return Response(StorageShareSerializer(share).data, status=status.HTTP_201_CREATED)


class StorageShareDetailView(APIView):
    """Retrieve, update, or delete a specific Storage Share."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, request: Request, pk: int) -> StorageShare:
        return StorageShare.objects.get(id=pk, user=request.user)

    def get(self, request: Request, pk: int) -> Response:
        share = self.get_object(request, pk)
        return Response(StorageShareSerializer(share).data)

    def put(self, request: Request, pk: int) -> Response:
        share = self.get_object(request, pk)
        serializer = StorageShareSerializer(share, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)

    def delete(self, request: Request, pk: int) -> Response:
        share = self.get_object(request, pk)
        share.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NodeLibraryPathsView(APIView):
    """List, create, or batch-update library paths configured on a specific Node."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_node(self, request: Request, node_id: int) -> UserNode:
        return UserNode.objects.get(id=node_id, user=request.user)

    def get(self, request: Request, node_id: int) -> Response:
        node = self.get_node(request, node_id)
        paths = NodeLibraryPath.objects.filter(node=node)
        return Response(NodeLibraryPathSerializer(paths, many=True).data)

    def post(self, request: Request, node_id: int) -> Response:
        node = self.get_node(request, node_id)
        serializer = NodeLibraryPathSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        lp = serializer.save(node=node)
        lp.refresh_from_db()
        return Response(NodeLibraryPathSerializer(lp).data, status=status.HTTP_201_CREATED)

    def put(self, request: Request, node_id: int) -> Response:
        node = self.get_node(request, node_id)
        items = request.data.get("paths", request.data)
        if not isinstance(items, list):
            return Response({"error": "Expected list of paths"}, status=status.HTTP_400_BAD_REQUEST)

        # Batch upsert paths
        created = []
        for item in items:
            path_str = item.get("path")
            if not path_str:
                continue
            lp, _ = NodeLibraryPath.objects.update_or_create(
                node=node,
                path=path_str,
                defaults={
                    "name": item.get("name") or path_str.split("/")[-1] or "Games",
                    "kind": item.get("kind") or "game",
                    "roles": item.get("roles") or [],
                    "allowed_extensions": item.get("allowed_extensions") or [],
                    "storage_share_id": item.get("storage_share_id"),
                    "is_download_target": bool(item.get("is_download_target", False)),
                    "is_active": bool(item.get("is_active", True)),
                },
            )
            created.append(lp)

        return Response(NodeLibraryPathSerializer(created, many=True).data)


class NodeLibraryPathDetailView(APIView):
    """Delete a library path from a node."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request: Request, node_id: int, path_id: int) -> Response:
        lp = NodeLibraryPath.objects.get(id=path_id, node__id=node_id, node__user=request.user)
        lp.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NodeManifestIngestView(APIView):
    """Receive indexed files from an Otix node scan and perform pure database matching."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, node_id: int) -> Response:
        node = UserNode.objects.get(id=node_id, user=request.user)
        files = request.data.get("files") or []
        if not isinstance(files, list):
            return Response({"error": "Expected 'files' array"}, status=status.HTTP_400_BAD_REQUEST)

        stats = sync_node_manifest(node, files)
        return Response({"status": "ok", "stats": stats})


class GameMatchCenterView(APIView):
    """List match records with filtering by status and query search."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        qs = GameMatchRecord.objects.filter(user=request.user).select_related(
            "media_item", "storage_share", "node"
        )

        match_status = request.query_params.get("status")
        if match_status:
            qs = qs.filter(match_status=match_status)

        query = request.query_params.get("q")
        if query:
            qs = qs.filter(cleaned_title__icontains=query)

        return Response(GameMatchRecordSerializer(qs[:200], many=True).data)


class GameMatchConfirmView(APIView):
    """Confirm or override a game's catalog match."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, record_id: int) -> Response:
        serializer = ConfirmMatchPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        record = confirm_match(request.user, record_id, serializer.validated_data["media_item_id"])
        return Response(GameMatchRecordSerializer(record).data)


class GameMatchUnmatchView(APIView):
    """Remove a game's catalog match."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, record_id: int) -> Response:
        record = unmatch_record(request.user, record_id)
        return Response(GameMatchRecordSerializer(record).data)
