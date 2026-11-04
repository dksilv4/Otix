"""API endpoints for managing Storage Shares, Node Library Paths, and Match Center."""

from __future__ import annotations

import uuid
from typing import Any

from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, ValidationError
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
from apps.media.models import MediaItem
from apps.media.services.catalog import attach_media_urls


class StorageSharesView(APIView):
    """List and create logical Storage Shares (SMB, NFS, Local Pools)."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        if not getattr(request.user, "is_authenticated", False):
            return Response([])
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
        try:
            return StorageShare.objects.get(id=pk, user=request.user)
        except (StorageShare.DoesNotExist, ValueError) as err:
            raise NotFound("Storage share not found") from err

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


def _resolve_user_node(
    user,
    node_id: Any,
    token: str | None = None,
    raise_exception: bool = True,
) -> UserNode | None:
    """Resolve UserNode by integer ID, string UUID machine_id, or local desktop alias (0, -1)."""
    try:
        str_id = str(node_id).strip()
        if str_id in ("-1", "0"):
            if user and getattr(user, "is_authenticated", False):
                node = (
                    UserNode.objects.filter(user=user, is_local_desktop=True).first()
                    or UserNode.objects.filter(user=user, local_url="otix://desktop").first()
                    or UserNode.objects.filter(user=user, local_url__startswith="otix://desktop/").first()
                )
                if not node:
                    node, _ = UserNode.objects.get_or_create(
                        user=user,
                        is_local_desktop=True,
                        defaults={
                            "name": "This PC",
                            "local_url": "otix://desktop",
                            "is_online": True,
                            "is_active": True,
                            "is_local": True,
                        },
                    )
                return node
            if raise_exception:
                raise NotFound("Desktop node requires authenticated user")
            return None

        query = Q()
        if str_id.isdigit() or (str_id.startswith("-") and str_id[1:].isdigit()):
            query |= Q(id=int(str_id))
        try:
            val = uuid.UUID(str_id)
            query |= Q(machine_id=val)
        except (ValueError, TypeError):
            pass

        if not query:
            if raise_exception:
                raise NotFound(f"Node {node_id} not found")
            return None

        node = UserNode.objects.filter(query).first()
        if not node:
            if raise_exception:
                raise NotFound(f"Node {node_id} not found")
            return None

        # Validate authorization: session/user auth or token auth (api_key or auth_token)
        if user and getattr(user, "is_authenticated", False) and node.user_id == user.id:
            return node
        if token and ((node.api_key and token == node.api_key) or (getattr(node, "auth_token", None) and token == node.auth_token)):
            return node

        if raise_exception:
            raise NotFound(f"Node {node_id} not found")
        return None
    except Exception as err:
        if raise_exception:
            if isinstance(err, NotFound):
                raise
            raise NotFound(f"Node {node_id} not found") from err
        return None


class NodeLibraryPathsView(APIView):
    """List, create, or batch-update library paths configured on a specific Node."""

    permission_classes = (permissions.AllowAny,)

    def get_node(self, request: Request, node_id: int) -> UserNode:
        return _resolve_user_node(request.user, node_id)

    def get(self, request: Request, node_id: int) -> Response:
        if not getattr(request.user, "is_authenticated", False):
            return Response([])
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
        try:
            lp = NodeLibraryPath.objects.get(id=path_id, node__id=node_id, node__user=request.user)
        except (NodeLibraryPath.DoesNotExist, ValueError) as err:
            raise NotFound("Node library path not found") from err
        lp.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class NodeManifestIngestView(APIView):
    """Receive indexed files from an Otix node scan and perform pure database matching."""

    authentication_classes = ()
    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request, node_id: Any) -> Response:
        user = getattr(request, "user", None)
        token = request.data.get("auth_token") or request.data.get("api_key")
        if not token:
            auth_header = request.headers.get("Authorization") or ""
            if auth_header.startswith("Bearer "):
                token = auth_header[7:].strip()

        node = _resolve_user_node(user, node_id, token=token, raise_exception=False)
        if not node:
            return Response(
                {"error": "Node not found or unauthorized"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        files = request.data.get("files") or []
        if not isinstance(files, list):
            return Response({"error": "Expected 'files' array"}, status=status.HTTP_400_BAD_REQUEST)

        append = bool(request.data.get("append") or request.data.get("is_chunk"))
        prune = not append and bool(request.data.get("prune", True))
        stats = sync_node_manifest(node, files, prune=prune)
        return Response({"status": "ok", "stats": stats})


class GameMatchCenterView(APIView):
    """List match records with filtering by status and query search."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        if not getattr(request.user, "is_authenticated", False):
            return Response([])

        qs = GameMatchRecord.objects.filter(user=request.user).select_related(
            "media_item", "storage_share", "node"
        ).prefetch_related("media_item__assets")

        node_id = request.query_params.get("node_id") or request.query_params.get("nodeId")
        if node_id is not None:
            try:
                n_id = int(node_id)
                if n_id in (0, -1):
                    local_node = (
                        UserNode.objects.filter(user=request.user, is_local_desktop=True).first()
                        or UserNode.objects.filter(user=request.user, local_url="otix://desktop").first()
                    )
                    if local_node:
                        qs = qs.filter(node=local_node)
                    else:
                        qs = qs.none()
                else:
                    qs = qs.filter(node_id=n_id)
            except (ValueError, TypeError):
                pass

        match_status = request.query_params.get("status")
        if match_status:
            qs = qs.filter(match_status=match_status)

        query = request.query_params.get("q")
        if query:
            qs = qs.filter(cleaned_title__icontains=query)

        records = list(qs[:200])
        media_items = [r.media_item for r in records if r.media_item]
        if media_items:
            attach_media_urls(media_items)
        return Response(GameMatchRecordSerializer(records, many=True).data)

    def delete(self, request: Request) -> Response:
        """Clear match records, optionally filtered by node_id."""
        if not getattr(request.user, "is_authenticated", False):
            return Response({"status": "ok", "deleted": 0})

        qs = GameMatchRecord.objects.filter(user=request.user)
        node_id = request.query_params.get("node_id") or request.query_params.get("nodeId")
        if node_id is not None:
            try:
                n_id = int(node_id)
                if n_id in (0, -1):
                    local_node = (
                        UserNode.objects.filter(user=request.user, is_local_desktop=True).first()
                        or UserNode.objects.filter(user=request.user, local_url="otix://desktop").first()
                    )
                    if local_node:
                        qs = qs.filter(node=local_node)
                else:
                    qs = qs.filter(node_id=n_id)
            except (ValueError, TypeError):
                pass
        deleted_count, _ = qs.delete()
        return Response({"status": "ok", "deleted": deleted_count})


class GameMatchConfirmView(APIView):
    """Confirm or override a game's catalog match."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request, record_id: int) -> Response:
        serializer = ConfirmMatchPayloadSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        if not getattr(request.user, "is_authenticated", False):
            return Response({"status": "ok", "record_id": record_id})
        try:
            record = confirm_match(request.user, record_id, serializer.validated_data["media_item_id"])
        except GameMatchRecord.DoesNotExist as err:
            raise NotFound("Game match record not found") from err
        except (MediaItem.DoesNotExist, ValueError) as err:
            raise ValidationError("Target media item not found or invalid") from err
        if record.media_item:
            attach_media_urls([record.media_item])
        return Response(GameMatchRecordSerializer(record).data)


class GameMatchUnmatchView(APIView):
    """Remove a game's catalog match."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request: Request, record_id: int) -> Response:
        if not getattr(request.user, "is_authenticated", False):
            return Response({"status": "ok", "record_id": record_id})
        try:
            record = unmatch_record(request.user, record_id)
        except GameMatchRecord.DoesNotExist as err:
            raise NotFound("Game match record not found") from err
        if record.media_item:
            attach_media_urls([record.media_item])
        return Response(GameMatchRecordSerializer(record).data)
