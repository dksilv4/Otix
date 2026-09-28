"""API views for dedicated game server management, live querying, and sharing."""

from django.contrib.auth import get_user_model
from django.db.models import Q
from rest_framework import permissions, status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.gameservers.models import DedicatedGameServer, GameServerInvite, GameServerShare
from apps.gameservers.serializers import (
    DedicatedGameServerCreateSerializer,
    DedicatedGameServerSerializer,
    GameServerInviteSerializer,
    GameServerShareSerializer,
)
from apps.gameservers.services.query import probe_server_connection, query_game_server
from apps.social.models import FriendRequest

User = get_user_model()


def _is_friend(user_a_id: int, user_b_id: int) -> bool:
    """Check if two users are accepted Otix friends."""
    return FriendRequest.objects.filter(
        (
            Q(sender_id=user_a_id, receiver_id=user_b_id)
            | Q(sender_id=user_b_id, receiver_id=user_a_id)
        ),
        status="accepted",
    ).exists()


def _get_accessible_server(server_id: int, user) -> DedicatedGameServer:
    """Retrieve server if owned by, shared with, or public-linked to user."""
    server = (
        DedicatedGameServer.objects.select_related("owner", "media_item")
        .prefetch_related("shares", "invites")
        .filter(pk=server_id)
        .first()
    )
    if not server:
        raise NotFound("Game server not found")

    if not user.is_authenticated:
        if server.is_public_link:
            return server
        raise PermissionDenied("Authentication required to access this server")

    if server.owner_id == user.id:
        return server

    has_share = server.shares.filter(user_id=user.id).exists()
    if has_share or server.is_public_link:
        return server

    raise PermissionDenied("You do not have access to this game server")


class GameServerListCreateView(APIView):
    """``GET /api/v1/game-servers/`` - list accessible servers.

    ``POST /api/v1/game-servers/`` - register a new dedicated server.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        user = request.user
        media_id = request.query_params.get("media_id")
        server_type = request.query_params.get("server_type")

        # Owned or directly shared with this user
        qs = DedicatedGameServer.objects.filter(Q(owner=user) | Q(shares__user=user)).distinct()

        if media_id:
            qs = qs.filter(media_item_id=media_id)
        if server_type:
            qs = qs.filter(server_type=server_type)

        qs = qs.select_related("owner", "media_item").prefetch_related("shares", "invites")
        serializer = DedicatedGameServerSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)

    def post(self, request: Request) -> Response:
        serializer = DedicatedGameServerCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        data = dict(serializer.validated_data)
        server_name = data.get("name")
        if not server_name or not server_name.strip():
            game_title = data.get("game_title")
            if not game_title and data.get("media_item_id"):
                from apps.media.models import MediaItem

                media = MediaItem.objects.filter(pk=data["media_item_id"]).first()
                if media:
                    game_title = media.title
            data["name"] = f"{game_title or 'Dedicated'} Server"

        server = DedicatedGameServer.objects.create(
            owner=request.user,
            **data,
        )
        # Create an initial invite code if public link is enabled
        if server.is_public_link:
            GameServerInvite.objects.create(
                server=server,
                created_by=request.user,
            )

        # Trigger initial query immediately in-band
        try:
            query_game_server(server)
        except Exception:
            pass

        out = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(out.data, status=status.HTTP_201_CREATED)


class GameServerDetailView(APIView):
    """``GET / PATCH / DELETE /api/v1/game-servers/<id>``."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        serializer = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(serializer.data)

    def patch(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        # Only owner or moderator/admin can edit
        is_owner = server.owner_id == request.user.id
        share = server.shares.filter(user_id=request.user.id).first()
        is_admin_or_mod = share and share.permission in ("admin", "moderator")

        if not (is_owner or is_admin_or_mod):
            raise PermissionDenied("You do not have permission to edit this server")

        serializer = DedicatedGameServerCreateSerializer(
            server,
            data=request.data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()

        # If is_public_link was toggled on and no invite exists, create one
        if server.is_public_link and not server.invites.filter(is_active=True).exists():
            GameServerInvite.objects.create(server=server, created_by=request.user)

        out = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(out.data)

    def delete(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        if server.owner_id != request.user.id:
            raise PermissionDenied("Only the owner can delete this server")

        server.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerQueryView(APIView):
    """``POST /api/v1/game-servers/<id>/query`` - live query status & players."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        result = query_game_server(server)
        out = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(
            {
                "query_result": result,
                "server": out.data,
            }
        )


class GameServerVerifyView(APIView):
    """``POST /api/v1/game-servers/verify`` - transiently test connection before saving."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request) -> Response:
        host = request.data.get("host", "").strip()
        port = request.data.get("port")
        query_port = request.data.get("query_port")
        server_type = request.data.get("server_type", "generic")

        if not host or not port:
            raise ValidationError("Host and port are required for verification")

        try:
            port = int(port)
        except (ValueError, TypeError):
            raise ValidationError("Port must be an integer") from None

        if query_port:
            try:
                query_port = int(query_port)
            except (ValueError, TypeError):
                query_port = None

        result = probe_server_connection(
            host=host,
            port=port,
            query_port=query_port,
            server_type=server_type,
        )
        return Response(result)


class GameServerShareListCreateView(APIView):
    """``GET / POST /api/v1/game-servers/<id>/shares`` - manage Otix friend shares."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        shares = server.shares.select_related("user")
        serializer = GameServerShareSerializer(shares, many=True)
        return Response(serializer.data)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        if server.owner_id != request.user.id:
            raise PermissionDenied("Only the server owner can share this server")

        serializer = GameServerShareSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        target_user_id = serializer.validated_data["user_id"]

        if target_user_id == request.user.id:
            raise ValidationError("You cannot share a server with yourself")

        # REQUIREMENT: Share only with Otix friends!
        if not _is_friend(request.user.id, target_user_id):
            raise ValidationError("You can only share game servers with Otix friends")

        target_user = User.objects.filter(pk=target_user_id).first()
        if not target_user:
            raise NotFound("Friend user not found")

        permission = serializer.validated_data.get("permission", "viewer")
        share, _ = GameServerShare.objects.update_or_create(
            server=server,
            user=target_user,
            defaults={"permission": permission},
        )
        return Response(GameServerShareSerializer(share).data, status=status.HTTP_201_CREATED)


class GameServerShareDeleteView(APIView):
    """``DELETE /api/v1/game-servers/<id>/shares/<user_id>`` - revoke a friend share."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request: Request, server_id: int, user_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        if server.owner_id != request.user.id and request.user.id != user_id:
            raise PermissionDenied("You do not have permission to remove this share")

        deleted, _ = server.shares.filter(user_id=user_id).delete()
        if not deleted:
            raise NotFound("Share not found")
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerInviteView(APIView):
    """``POST /api/v1/game-servers/<id>/invites`` - create or regenerate public link token."""

    permission_classes = (permissions.IsAuthenticated,)

    def post(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        if server.owner_id != request.user.id:
            raise PermissionDenied("Only the owner can manage invite links")

        # Deactivate old invites
        server.invites.filter(is_active=True).update(is_active=False)

        server.is_public_link = True
        server.save(update_fields=["is_public_link", "updated_at"])

        invite = GameServerInvite.objects.create(
            server=server,
            created_by=request.user,
        )
        return Response(GameServerInviteSerializer(invite).data, status=status.HTTP_201_CREATED)

    def delete(self, request: Request, server_id: int) -> Response:
        server = _get_accessible_server(server_id, request.user)
        if server.owner_id != request.user.id:
            raise PermissionDenied("Only the owner can disable invite links")

        server.is_public_link = False
        server.save(update_fields=["is_public_link", "updated_at"])
        server.invites.filter(is_active=True).update(is_active=False)
        return Response(status=status.HTTP_204_NO_CONTENT)


class GameServerInviteResolveView(APIView):
    """``GET / POST /api/v1/game-servers/invites/<code>`` - public invite link handling."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request, code: str) -> Response:
        invite = (
            GameServerInvite.objects.select_related("server", "server__owner", "server__media_item")
            .filter(code=code)
            .first()
        )
        if not invite or not invite.is_valid:
            raise NotFound("Invalid or expired invite link")

        server = invite.server
        serializer = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(
            {
                "invite": GameServerInviteSerializer(invite).data,
                "server": serializer.data,
            }
        )

    def post(self, request: Request, code: str) -> Response:
        if not request.user.is_authenticated:
            raise PermissionDenied("You must be logged in to join via invite")

        invite = GameServerInvite.objects.select_related("server").filter(code=code).first()
        if not invite or not invite.is_valid:
            raise NotFound("Invalid or expired invite link")

        server = invite.server
        if server.owner_id != request.user.id:
            GameServerShare.objects.get_or_create(
                server=server,
                user=request.user,
                defaults={"permission": "viewer"},
            )
            invite.uses += 1
            invite.save(update_fields=["uses", "updated_at"])

        serializer = DedicatedGameServerSerializer(server, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)


class GameServersByGameView(APIView):
    """``GET /api/v1/game-servers/by-game/<media_id>`` - servers for a catalog game."""

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request, media_id: str) -> Response:
        user = request.user
        from apps.media.views.catalog import resolve_media_pk

        media_pk = resolve_media_pk("game", media_id)
        if not media_pk and media_id.isdigit():
            media_pk = int(media_id)

        if media_pk:
            qs = (
                DedicatedGameServer.objects.filter(
                    Q(owner=user) | Q(shares__user=user),
                    media_item_id=media_pk,
                )
                .distinct()
                .select_related("owner", "media_item")
            )
        else:
            qs = (
                DedicatedGameServer.objects.filter(
                    Q(owner=user) | Q(shares__user=user),
                    game_title__iexact=media_id,
                )
                .distinct()
                .select_related("owner", "media_item")
            )

        serializer = DedicatedGameServerSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data)
