"""Views for Home and Machine (homelab computer) management."""

import logging

import httpx
from django.db.models import Count
from django.http import Http404
from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import UserHome, UserMachine, UserNode
from apps.library.serializers.machines import (
    UserHomeCreateUpdateSerializer,
    UserHomeSerializer,
    UserMachineCreateUpdateSerializer,
    UserMachineSerializer,
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
        homes = UserHome.objects.filter(user=user).annotate(
            nodes_count=Count("nodes", distinct=True),
            machines_count=Count("machines", distinct=True),
        )
        # If user has no homes yet, create a default "Home"
        if not homes.exists():
            default_home = UserHome.objects.create(
                user=user,
                name="Home",
                description="Default home network & homelab environment",
                is_default=True,
            )
            homes = UserHome.objects.filter(id=default_home.id).annotate(
                nodes_count=Count("nodes", distinct=True),
                machines_count=Count("machines", distinct=True),
            )

        serializer = UserHomeSerializer(homes, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = UserHomeCreateUpdateSerializer(
            data=request.data, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)

        is_default = serializer.validated_data.get("is_default", False)
        if is_default:
            UserHome.objects.filter(user=user).update(is_default=False)

        home = serializer.save(user=user)
        return Response(UserHomeSerializer(home).data, status=status.HTTP_201_CREATED)


class UserHomeDetailView(APIView):
    """Retrieve, update, or delete a home."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, user, home_id: int) -> UserHome:
        if not user:
            raise Http404("Home not found")
        obj = UserHome.objects.filter(id=home_id, user=user).first()
        if not obj:
            raise Http404("Home not found")
        return obj

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

        is_default = serializer.validated_data.get("is_default")
        if is_default:
            UserHome.objects.filter(user=user).exclude(id=home.id).update(is_default=False)

        updated_home = serializer.save()
        return Response(UserHomeSerializer(updated_home).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, home_id: int) -> Response:
        user = _resolve_user(request)
        home = self.get_object(user, home_id)
        home.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserMachineListCreateView(APIView):
    """List or create homelab host machines."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response([], status=status.HTTP_401_UNAUTHORIZED)

        queryset = (
            UserMachine.objects.filter(user=user)
            .prefetch_related("smb_nodes")
            .select_related("home", "hosted_node")
        )

        home_id = request.query_params.get("home_id")
        if home_id:
            try:
                queryset = queryset.filter(home_id=int(home_id))
            except ValueError:
                pass

        serializer = UserMachineSerializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def post(self, request: Request) -> Response:
        user = _resolve_user(request)
        if not user:
            return Response({"error": "User not found"}, status=status.HTTP_401_UNAUTHORIZED)
        serializer = UserMachineCreateUpdateSerializer(
            data=request.data, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)
        machine = serializer.save()
        return Response(UserMachineSerializer(machine).data, status=status.HTTP_201_CREATED)


class UserMachineDetailView(APIView):
    """Retrieve, update, or delete a homelab host machine."""

    permission_classes = (permissions.IsAuthenticated,)

    def get_object(self, user, machine_id: int) -> UserMachine:
        if not user:
            raise Http404("Machine not found")
        qs = UserMachine.objects.prefetch_related("smb_nodes").select_related(
            "home", "hosted_node"
        )
        obj = qs.filter(id=machine_id, user=user).first()
        if not obj:
            raise Http404("Machine not found")
        return obj

    def get(self, request: Request, machine_id: int | None = None, server_id: int | None = None) -> Response:
        mid = machine_id if machine_id is not None else server_id
        user = _resolve_user(request)
        machine = self.get_object(user, mid)
        return Response(UserMachineSerializer(machine).data, status=status.HTTP_200_OK)

    def patch(self, request: Request, machine_id: int | None = None, server_id: int | None = None) -> Response:
        mid = machine_id if machine_id is not None else server_id
        user = _resolve_user(request)
        machine = self.get_object(user, mid)
        serializer = UserMachineCreateUpdateSerializer(
            machine, data=request.data, partial=True, context={"request": request, "user": user}
        )
        serializer.is_valid(raise_exception=True)
        updated_machine = serializer.save()
        return Response(UserMachineSerializer(updated_machine).data, status=status.HTTP_200_OK)

    def delete(self, request: Request, machine_id: int | None = None, server_id: int | None = None) -> Response:
        mid = machine_id if machine_id is not None else server_id
        user = _resolve_user(request)
        machine = self.get_object(user, mid)
        machine.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class UserMachineDetectDrivesView(APIView):
    """Detect hard drive configuration for a machine by probing a node daemon."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, machine_id: int | None = None, server_id: int | None = None) -> Response:
        mid = machine_id if machine_id is not None else server_id
        user = _resolve_user(request)
        if not user:
            return Response(
                {"error": "User authentication required"}, status=status.HTTP_401_UNAUTHORIZED
            )
        machine: UserMachine | None = None
        if mid is not None:
            machine = UserMachine.objects.filter(id=mid, user=user).first()
            if not machine:
                return Response(
                    {"error": "Machine not found"}, status=status.HTTP_404_NOT_FOUND
                )

        # Target node: from query param, request body, or machine.hosted_node
        node_id = (
            request.data.get("node_id")
            or request.query_params.get("node_id")
            or (machine.hosted_node_id if machine else None)
        )
        target_node: UserNode | None = None
        if node_id:
            try:
                target_node = (
                    UserNode.objects.filter(id=int(node_id), user=user).first()
                    if user
                    else UserNode.objects.filter(id=int(node_id)).first()
                )
            except ValueError:
                pass

        if not target_node and user:
            # Fall back to user's first online node
            target_node = UserNode.objects.filter(user=user, is_online=True).first()

        if not target_node:
            return Response(
                {"error": "No reachable node found to probe hardware drives."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        endpoint = target_node.primary_url or target_node.local_url or ""
        if not endpoint:
            return Response(
                {"error": f"Node {target_node.name} has no reachable endpoint."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        probe_url = f"{endpoint.rstrip('/')}/api/hardware/drives"
        target_token = target_node.auth_token or target_node.api_key
        headers = {}
        if target_token:
            headers["Authorization"] = f"Bearer {target_token}"
            headers["X-Otix-Node-Key"] = target_token

        try:
            with httpx.Client(timeout=8.0) as client:
                resp = client.get(probe_url, headers=headers)
                if resp.status_code != 200:
                    return Response(
                        {
                            "error": f"Node returned HTTP {resp.status_code}: {resp.text[:200]}",
                            "status_code": resp.status_code,
                        },
                        status=status.HTTP_502_BAD_GATEWAY,
                    )
                payload = resp.json()
        except Exception as exc:
            logger.warning("Hardware probe failed to %s: %s", probe_url, exc)
            return Response(
                {"error": f"Failed to connect to node at {endpoint}: {exc}"},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        # Normalize disks into drives_config format
        raw_disks = (
            payload.get("storage")
            or payload.get("disks")
            or payload.get("drives")
            or []
        )
        drives_config = []
        for idx, d in enumerate(raw_disks):
            drive_letter = d.get("drive") or d.get("device") or d.get("mount_point") or f"Disk {idx+1}"
            label = d.get("label") or d.get("volume_name") or drive_letter
            fs = d.get("fileSystem") or d.get("file_system") or d.get("fs_type") or "NTFS"
            total = int(d.get("totalBytes") or d.get("total_bytes") or d.get("total") or 0)
            free = int(d.get("freeBytes") or d.get("free_bytes") or d.get("free") or 0)
            used = int(d.get("usedBytes") or d.get("used_bytes") or max(0, total - free))
            mount = d.get("mount_point") or drive_letter
            drive_type = d.get("type") or ("hdd" if total > 2_000_000_000_000 else "ssd")

            drives_config.append(
                {
                    "id": f"drive-{idx+1}",
                    "drive": drive_letter,
                    "label": label,
                    "file_system": fs,
                    "total_bytes": total,
                    "free_bytes": free,
                    "used_bytes": used,
                    "mount_point": mount,
                    "type": drive_type,
                }
            )

        # Detect OS if present
        detected_os = payload.get("os") or {}
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

        # Update machine drives_config if machine exists
        if machine:
            machine.drives_config = drives_config
            machine.recalculate_storage()
            update_fields = ["drives_config", "total_storage_bytes", "free_storage_bytes"]
            if os_code != "other" and machine.os == "other":
                machine.os = os_code
                update_fields.append("os")
            if os_name and not machine.os_version:
                machine.os_version = os_name
                update_fields.append("os_version")
            machine.save(update_fields=update_fields)

        return Response(
            {
                "success": True,
                "node_id": target_node.id,
                "node_name": target_node.name,
                "drives_config": drives_config,
                "machine": UserMachineSerializer(machine).data if machine else None,
            },
            status=status.HTTP_200_OK,
        )


UserServerMachineListCreateView = UserMachineListCreateView
UserServerMachineDetailView = UserMachineDetailView
UserServerMachineDetectDrivesView = UserMachineDetectDrivesView
