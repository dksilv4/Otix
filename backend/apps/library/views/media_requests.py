"""API endpoints for managing and retrieving persisted media requests."""

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.models import UserNode
from apps.library.services.media_requests import (
    delete_media_request,
    list_media_requests,
    record_media_request,
    serialize_media_request,
)


class UserMediaRequestsView(APIView):
    """``GET /api/v1/library/requests`` — list user's media requests.
    ``POST /api/v1/library/requests`` — store or refresh a media request.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        server_id_raw = request.query_params.get("server_id")
        server_id = None
        if server_id_raw:
            try:
                server_id = int(server_id_raw)
            except (TypeError, ValueError):
                pass

        media_type = request.query_params.get("media_type")
        status_filter = request.query_params.get("status")
        try:
            limit = int(request.query_params.get("limit") or 100)
        except (TypeError, ValueError):
            limit = 100

        items = list_media_requests(
            user=request.user,
            server_id=server_id,
            media_type=media_type,
            status=status_filter,
            limit=limit,
        )
        return Response({"items": items})

    def post(self, request: Request) -> Response:
        payload = request.data if isinstance(request.data, dict) else {}
        server_id = payload.get("server_id") or payload.get("serverId")
        server = None
        if server_id:
            server = UserNode.objects.filter(id=server_id, user=request.user).first()

        service = str(payload.get("service") or "radarr").strip().lower()
        media_type = (
            str(payload.get("media_type") or payload.get("mediaType") or "movie").strip().lower()
        )

        request_row = record_media_request(
            user=request.user,
            server=server,
            service=service,
            media_type=media_type,
            payload=payload,
            result=payload,
        )
        if not request_row:
            return Response(
                {"error": "Title is required to record a media request"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(serialize_media_request(request_row), status=status.HTTP_201_CREATED)


class UserMediaRequestDetailView(APIView):
    """``DELETE /api/v1/library/requests/{request_id}`` — delete or cancel a request."""

    permission_classes = (permissions.IsAuthenticated,)

    def delete(self, request: Request, request_id: int) -> Response:
        deleted = delete_media_request(request.user, request_id)
        if not deleted:
            return Response(
                {"error": "Request not found or not owned by user"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response({"ok": True}, status=status.HTTP_200_OK)
