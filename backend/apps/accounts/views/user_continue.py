"""Continue-watching endpoint owned by ``accounts`` (identity/hub).

The view is thin; the interaction/media queries live in the social services
layer (``apps.social.services.get_continue_watching``) because the source rows
are social tables. Mirrors ``old-backend/otix/api/user/continue_watching/router.py``.
"""

from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.serializers.user_profile import ContinueItemSerializer
from apps.social import services


class ContinueWatchingView(APIView):
    """``GET /users/me/continue`` — media the current user may continue."""

    def get(self, request: Request) -> Response:
        try:
            limit = int(request.query_params.get("limit", 10))
        except (TypeError, ValueError):
            limit = 10
        limit = max(1, min(limit, 50))
        items = services.get_continue_watching(request.user.id, limit=limit)
        return Response(ContinueItemSerializer(items, many=True).data)
