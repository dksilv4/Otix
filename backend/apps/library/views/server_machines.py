"""Views for Home and Server Machine (homelab computer) management."""

import logging

import httpx
from django.http import Http404
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import UserHome, UserNode, UserServerMachine
from apps.library.serializers.server_machines import (
    UserHomeCreateUpdateSerializer,
    UserHomeSerializer,
    UserServerMachineCreateUpdateSerializer,
    UserServerMachineSerializer,
)
from apps.library.views.nodes import _resolve_user

logger = logging.getLogger(__name__)


class UserHomeListCreateView(APIView):
    """List or create homes for the authenticated user."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)
        homes = UserHome.objects.filter(user=user)
        # If user has no homes yet, create a default "Home"
        if not homes.exists():
            default_home = UserHome.objects.create(
                user=user,
                name="Home",
                description="Default home network & homelab environment",
                is_default=True,
            )
            homes = UserHome.objects.filter(id=default_home.id)

        serializer = UserHomeSerializer(homes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = UserHomeCreateUpdateSerializer(data=request.data, context={"request": request, "user": user})
        serializer.is_valid(raise_exception=True)

        is_default = serializer.validated_data.get("is_default", False)
        if is_default:
            UserHome.objects.filter(user=user).update(is_default=False)

        home = serializer.save(user=user)
        return Response(UserHomeSerializer(home).data, status=status.HTTP_201_CREATED)


class UserHomeDetailView(APIView):
    """Retrieve, update, or delete a specific Home."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, user, home_id: int) -> UserHome:
        if not user:
            raise Http404("Home not found")
        home = UserHome.objects.filter(id=home_id, user=user).first()
        if not home:
            raise Http404("Home not found")
        return home

    def get(self, request: Request, home_id: int) -> Response:
        user = _resolve_user(request)
        home = self.get_object(user, home_id)
        return Response(UserHomeSerializer(home).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, home_id: int) -> Response:
        user = _resolve_user(request)
        home = self.get_object(user, home_id)
        serializer = UserHomeCreateUpdateSerializer(
            home, data=request.data, partial=True, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)

        if serializer.validated_data.get("is_default") and user:
            UserHome.objects.filter(user=user).exclude(id=home.id).update(is_default=False)

        updated_home = serializer.save()
        return Response(UserHomeSerializer(updated_home).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, home_id: int) -> Response:
        user = _resolve_user(request)
        home = self.get_object(user, home_id)
        home.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserServerMachineListCreateView(APIView):
    """List or create homelab server machines."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)

        queryset = UserServerMachine.objects.filter(user=user).prefetch_related(
            "smb_nodes"
        ).select_related("home", "hosted_node")

        home_id = request.query_params.get("home_id")
        if home_id:
            try:
                queryset = queryset.filter(home_id=int(home_id))
            except ValueError:
                pass

        serializer = UserServerMachineSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = UserServerMachineCreateUpdateSerializer(
            data=request.data, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)
        server = serializer.save()
        return Response(UserServerMachineSerializer(server).data, status=status.HTTP_201_CREATED)


class UserServerMachineDetailView(APIView):
    """Retrieve, update, or delete a homelab server machine."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, user, server_id: int) -> UserServerMachine:
        if not user:
            raise Http404("Server machine not found")
        qs = UserServerMachine.objects.prefetch_related("smb_nodes").select_related(
            "home", "hosted_node"
        )
        obj = qs.filter(id=server_id, user=user).first()
        if not obj:
            raise Http404("Server machine not found")
        return obj

    def get(self, request: Request, server_id: int) -> Response:
        user = _resolve_user(request)
        server = self.get_object(user, server_id)
        return Response(UserServerMachineSerializer(server).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, server_id: int) -> Response:
        user = _resolve_user(request)
        server = self.get_object(user, server_id)
        serializer = UserServerMachineCreateUpdateSerializer(
            server, data=request.data, partial=True, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)
        updated_server = serializer.save()
        return Response(UserServerMachineSerializer(updated_server).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, server_id: int) -> Response:
        user = _resolve_user(request)
        server = self.get_object(user, server_id)
        server.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserServerMachineDetectDrivesView(APIView):
    """Detect hard drive configuration for a server machine by probing a node daemon."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, server_id: int | None = None) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
        server: UserServerMachine | None = None
        if server_id is not None:
            server = UserServerMachine.objects.filter(id=server_id, user=user).first()
            if not server:
                return Response({"error": "Server machine not found"}, status=status.HTTP_404_NOT_FOUND)

        # Target node: from query param, request body, or server.hosted_node
        node_id = (
            request.data.get("node_id")
            or request.query_params.get("node_id")
            or (server.hosted_node_id if server else None)
        )
        if not node_id:
            return Response(
                {"error": "A node_id or server with a hosted_node is required to probe drives."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            node = UserNode.objects.get(id=node_id, user=user)
        except UserNode.DoesNotExist:
            return Response(
                {"error": "Node not found or does not belong to user."},
                status=status.HTTP_404_NOT_FOUND,
            )

        target_url = node.primary_url.rstrip("/")
        if not target_url:
            return Response(
                {"error": "Node does not have a reachable URL configured."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        headers: dict[str, str] = {}
        if node.auth_token:
            headers["Authorization"] = f"Bearer {node.auth_token}"

        try:
            with httpx.Client(timeout=6.0) as client:
                res = client.get(f"{target_url}/api/v1/hardware", headers=headers)
                if res.status_code != 200:
                    return Response(
                        {"error": f"Node returned status code {res.status_code}"},
                        status=status.HTTP_502_BAD_GATEWAY,
                    )
                hw_data = res.json()
        except Exception as e:
            logger.warning("Failed to probe hardware from node %s: %s", node.id, e)
            return Response(
                {"error": f"Failed to contact node: {str(e)}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        raw_storage = hw_data.get("storage") or []
        detected_drives = []
        for idx, item in enumerate(raw_storage):
            drive_name = item.get("drive") or f"Disk {idx+1}"
            label = item.get("label") or drive_name
            fs = item.get("fileSystem") or item.get("file_system") or ""
            tot = int(item.get("totalBytes") or item.get("total_bytes") or 0)
            free = int(item.get("freeBytes") or item.get("free_bytes") or 0)
            used = int(item.get("usedBytes") or item.get("used_bytes") or max(0, tot - free))

            detected_drives.append(
                {
                    "id": f"drive-{idx+1}",
                    "drive": drive_name,
                    "label": label,
                    "file_system": fs,
                    "total_bytes": tot,
                    "free_bytes": free,
                    "used_bytes": used,
                    "type": "hdd" if tot > 2_000_000_000_000 else "ssd",
                    "mount_point": drive_name,
                }
            )

        # Detect OS if present
        detected_os = hw_data.get("os") or {}
        os_platform = str(detected_os.get("platform") or "").lower()
        os_name = str(detected_os.get("name") or "")

        os_code = "other"
        if "unraid" in os_name.lower():
            os_code = "unraid"
        elif "truenas" in os_name.lower():
            os_code = "truenas"
        elif "ubuntu" in os_name.lower():
            os_code = "ubuntu"
        elif "debian" in os_name.lower():
            os_code = "debian"
        elif "proxmox" in os_name.lower():
            os_code = "proxmox"
        elif "windows" in os_platform or "windows" in os_name.lower():
            os_code = "windows_server" if "server" in os_name.lower() else "other"
        elif "darwin" in os_platform or "mac" in os_name.lower():
            os_code = "macos"
        elif "arch" in os_name.lower():
            os_code = "arch"

        if server:
            server.drives_config = detected_drives
            server.recalculate_storage()
            if os_code != "other" and server.os == "other":
                server.os = os_code
            if os_name and not server.os_version:
                server.os_version = os_name
            server.save()

        return Response(
            {
                "success": True,
                "server": UserServerMachineSerializer(server).data if server else None,
                "detected_drives": detected_drives,
                "detected_os": detected_os,
                "detected_os_code": os_code,
            },
            status=status.HTTP_200_OK,
        )
