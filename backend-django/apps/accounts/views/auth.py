"""Auth endpoints: register and current-user.

Golden-reference pattern: thin views delegating to serializers; any
business/domain logic that grows beyond a line or two moves to
``apps/accounts/services/``.
"""

from rest_framework import generics, permissions, status
from rest_framework.response import Response

from apps.accounts.serializers import (
    RegisterSerializer,
    UserIdentitySerializer,
    UserSelfSerializer,
    UserUpdateSerializer,
)


class RegisterView(generics.GenericAPIView):
    """Create an account. Public (no auth).

    Returns ``201`` with the minimal public identity. Token issuance is the
    job of the (future) login/auth flow — DRF 3.18 no longer auto-creates
    tokens on user signup.
    """

    serializer_class = RegisterSerializer
    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserIdentitySerializer(user).data,
            status=status.HTTP_201_CREATED,
        )


class MeView(generics.GenericAPIView):
    """The authenticated user's own profile (GET) and partial update (PATCH).

    ``PATCH /auth/me`` mirrors legacy ``UserUpdateRequest``: only the fields on
    ``UserUpdateSerializer`` are writable and unrecognised keys are ignored.
    """

    serializer_class = UserSelfSerializer
    update_serializer_class = UserUpdateSerializer

    def get_object(self):
        return self.request.user

    def get(self, request, *args, **kwargs):
        return Response(UserSelfSerializer(self.get_object()).data)

    def patch(self, request, *args, **kwargs):
        user = self.get_object()
        serializer = UserUpdateSerializer(user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(UserSelfSerializer(user).data)
