"""Media activity aggregation view.

Provides a unified status map across user-owned and friend-shared nodes for
real-time media card badges and heros.
"""

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.library.services.media_activity import get_user_media_activity


class MediaActivityView(APIView):
    """``GET /api/v1/library/nodes/media-activity``

    Returns active downloads, requested items, and available media across
    owned and friend-shared nodes using Owned-First Priority.
    """

    permission_classes = (permissions.IsAuthenticated,)

    def get(self, request: Request) -> Response:
        include_friends = request.query_params.get("include_friends", "true").lower() != "false"
        queue_only = request.query_params.get("queue_only", "false").lower() == "true"

        data = get_user_media_activity(
            request.user, include_friends=include_friends, queue_only=queue_only
        )
        return Response(data, status=status.HTTP_200_OK)
