"""Push API views: VAPID public key, subscribe, unsubscribe.

The vapid-key route is public (legacy declares no auth dependency on it).
Subscribe and unsubscribe are authenticated and rely on the project-wide
``IsAuthenticated`` default (no explicit permission_classes). Thin views: the
serializers parse request bodies and ``apps.push.services`` does the work.
"""

from rest_framework import permissions, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.push import services
from apps.push.serializers import SubscribeSerializer, UnsubscribeSerializer


class VapidPublicKeyView(APIView):
    """``GET /api/v1/push/vapid-public-key`` -- public VAPID public key."""

    permission_classes = (permissions.AllowAny,)

    def get(self, request: Request) -> Response:
        return Response({"public_key": services.get_vapid_public_key()})


class SubscribeView(APIView):
    """Register or remove the current user's device (authenticated).

    Mirrors the legacy router: ``POST`` returns 201 ``{"message": "Subscribed"}``
    and ``DELETE`` returns 200 ``{"message": "Unsubscribed"}`` (not 204).
    """

    def post(self, request: Request) -> Response:
        body = SubscribeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.subscribe(
            request.user.id,
            body.validated_data["endpoint"],
            body.validated_data["p256dh"],
            body.validated_data["auth"],
        )
        return Response({"message": "Subscribed"}, status=status.HTTP_201_CREATED)

    def delete(self, request: Request) -> Response:
        body = UnsubscribeSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        services.unsubscribe(request.user.id, body.validated_data["endpoint"])
        return Response({"message": "Unsubscribed"})
