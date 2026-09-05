"""Notification endpoints.

Mirror the legacy ``backend/otix/api/user/notification/router.py``: list uses a
cursor envelope ``{items, has_more, next_cursor}`` (not DRF page pagination),
unread-count returns ``{count}``, and the read mutations return the legacy
message bodies. ``GET /notifications/stream`` is a Redis-backed SSE stream in
legacy and is deliberately deferred -- realtime/SSE is future work per
ARCHITECTURE §7, so no polling stand-in is registered.
"""

from datetime import datetime

from rest_framework import status
from rest_framework.exceptions import NotFound
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.social import services
from apps.social.serializers import NotificationOutSerializer


class NotificationListView(APIView):
    """``GET /api/v1/notifications/`` -- cursor-paginated notification feed."""

    def get(self, request: Request) -> Response:
        limit = self._parse_limit(request.query_params.get("limit", "20"))
        cursor = self._parse_cursor(request.query_params.get("cursor"))
        items, has_more, next_cursor = services.list_notifications(
            request.user.id, limit=limit, cursor=cursor
        )
        return Response(
            {
                "items": NotificationOutSerializer(items, many=True).data,
                "has_more": has_more,
                "next_cursor": next_cursor,
            }
        )

    @staticmethod
    def _parse_limit(raw: str) -> int:
        try:
            limit = int(raw)
        except (TypeError, ValueError):
            limit = 20
        return min(max(limit, 1), 50)

    @staticmethod
    def _parse_cursor(raw: str | None):
        if not raw:
            return None
        try:
            return datetime.fromisoformat(raw)
        except ValueError:
            return None


class NotificationUnreadCountView(APIView):
    """``GET /api/v1/notifications/unread-count`` -- number of unread rows."""

    def get(self, request: Request) -> Response:
        count = services.get_unread_count(request.user.id)
        return Response({"count": count})


class NotificationReadAllView(APIView):
    """``POST /api/v1/notifications/read-all`` -- mark every notification read."""

    def post(self, request: Request) -> Response:
        services.mark_all_read(request.user.id)
        return Response(
            {"message": "All notifications marked as read"}, status=status.HTTP_200_OK
        )


class NotificationReadView(APIView):
    """``POST /api/v1/notifications/{notification_id}/read`` -- mark one read."""

    def post(self, request: Request, notification_id: int) -> Response:
        notification = services.mark_notification_read(notification_id, request.user.id)
        if notification is None:
            raise NotFound("Notification not found")
        return Response(
            {"message": "Notification marked as read"}, status=status.HTTP_200_OK
        )
