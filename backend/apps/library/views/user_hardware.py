"""User hardware & rig specifications endpoint."""

from django.contrib.auth import get_user_model
from rest_framework import permissions
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import UserGameSession, UserNode, UserServerMachine

User = get_user_model()


class UserHardwareView(APIView):
    """``GET /api/v1/library/users/{username}/hardware`` — public rig specs with privacy gating."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, username: str) -> Response:
        target_user = User.objects.filter(username=username).first()
        if not target_user:
            raise NotFound("User not found")

        is_owner = request.user.is_authenticated and request.user.id == target_user.id
        sec_vis = getattr(target_user, "section_visibility", {}) or {}
        vis = sec_vis.get("hardware_rig", "public")

        is_friend = False
        if not is_owner and vis == "friends" and request.user.is_authenticated:
            from apps.social.services import get_friendship_status

            status = get_friendship_status(request.user.id, target_user.id)
            is_friend = status.get("status") == "friends"

        # If private (or friends-only for non-friends) and not owner, return empty privacy notice
        if not is_owner and (vis == "private" or (vis == "friends" and not is_friend)):
            return Response(
                {
                    "is_private": True,
                    "has_hardware": False,
                    "cpu": None,
                    "gpu": None,
                    "ram": None,
                    "os": None,
                    "display": None,
                    "node_count": 0,
                    "total_storage_bytes": 0,
                    "server_count": 0,
                    "recent_game": None,
                    "avg_fps": None,
                }
            )

        # Get latest hardware telemetry from gameplay sessions
        latest_session = (
            UserGameSession.objects.filter(user=target_user)
            .exclude(hardware={})
            .order_by("-start_time")
            .first()
        )
        if not latest_session:
            latest_session = (
                UserGameSession.objects.filter(user=target_user).order_by("-start_time").first()
            )

        hardware = (latest_session.hardware if latest_session else {}) or {}

        cpu = hardware.get("cpu") or hardware.get("cpu_name") or hardware.get("processor")
        gpu = hardware.get("gpu") or hardware.get("gpu_name") or hardware.get("graphics")
        ram = hardware.get("ram") or hardware.get("total_ram") or hardware.get("memory")
        os_name = hardware.get("os") or hardware.get("os_name") or hardware.get("platform")
        display = hardware.get("display") or hardware.get("resolution")

        # Homelab nodes & servers
        nodes = UserNode.objects.filter(user=target_user, is_active=True)
        node_count = nodes.count()
        total_storage_bytes = sum(nodes.values_list("storage_total_bytes", flat=True))

        servers = UserServerMachine.objects.filter(user=target_user)
        server_count = servers.count()
        server_storage = sum(servers.values_list("total_storage_bytes", flat=True))
        if server_storage > total_storage_bytes:
            total_storage_bytes = server_storage

        # If OS not in telemetry, check if any server machine provides OS
        if not os_name and servers.exists():
            first_srv = servers.first()
            if first_srv and first_srv.os != "other":
                os_name = first_srv.get_os_display()

        has_hardware = bool(cpu or gpu or ram or node_count > 0 or server_count > 0)

        return Response(
            {
                "is_private": False,
                "has_hardware": has_hardware,
                "cpu": cpu,
                "gpu": gpu,
                "ram": ram,
                "os": os_name,
                "display": display,
                "node_count": node_count,
                "server_count": server_count,
                "total_storage_bytes": total_storage_bytes,
                "recent_game": latest_session.game_title if latest_session else None,
                "avg_fps": latest_session.avg_fps if latest_session else None,
            }
        )
