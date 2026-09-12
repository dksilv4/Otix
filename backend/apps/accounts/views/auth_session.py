"""Session lifecycle endpoints: login, refresh, logout, sessions list/revoke.

Status/shape parity with the frozen FastAPI contract:

- ``POST /login`` 200 (two_required access_token null) or 401 uniform error;
- ``POST /refresh`` rotates the refresh cookie; reuse revokes all tokens;
- ``POST /logout`` 204, global marker + cookie clear;
- ``GET /sessions`` list; ``DELETE /sessions`` 200 revoke-others;
  ``DELETE /sessions/{key}`` 204 or 404.
"""

from django.conf import settings
from rest_framework import permissions, status
from rest_framework.generics import GenericAPIView
from rest_framework.response import Response

from apps.accounts.models import UserSession
from apps.accounts.serializers.auth import LoginSerializer, SessionSerializer
from apps.accounts.services import sessions as session_service
from apps.accounts.services.cookies import clear_refresh_cookie, set_refresh_cookie
from apps.accounts.services.login import authenticate_identity
from apps.accounts.services.sessions import AuthServiceError
from apps.accounts.services.tokens import TokenError, create_challenge_token


class LoginView(GenericAPIView):
    """Password login. Returns tokens, or a 2FA challenge for TOTP users."""

    permission_classes = (permissions.AllowAny,)
    serializer_class = LoginSerializer

    def post(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        user = authenticate_identity(data["identity"], data["password"])
        if user is None:
            return Response(
                {"detail": "Invalid email or password"},
                status=status.HTTP_401_UNAUTHORIZED,
            )

        if user.two_factor_enabled:
            return Response(
                {
                    "access_token": None,
                    "token_type": "bearer",
                    "two_factor_required": True,
                    "challenge_token": create_challenge_token(user.pk),
                },
                status=status.HTTP_200_OK,
            )

        access, refresh = session_service.begin_session(user, request)
        response = Response(
            {
                "access_token": access,
                "token_type": "bearer",
                "two_factor_required": False,
                "challenge_token": None,
            },
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, refresh)
        return response


class RefreshView(GenericAPIView):
    """Rotate the refresh cookie into a fresh pair."""

    permission_classes = (permissions.AllowAny,)

    def post(self, request, *args, **kwargs):
        cookie = request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        if not cookie:
            return Response(
                {"detail": "No refresh token provided"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        try:
            access, refresh = session_service.refresh_session(cookie, request)
        except (AuthServiceError, TokenError):
            response = Response(
                {"detail": "Invalid or expired refresh token"},
                status=status.HTTP_401_UNAUTHORIZED,
            )
            clear_refresh_cookie(response)
            return response
        response = Response(
            {"access_token": access, "token_type": "bearer"},
            status=status.HTTP_200_OK,
        )
        set_refresh_cookie(response, refresh)
        return response


class LogoutView(GenericAPIView):
    """Global logout: marks every existing refresh token dead + clears cookie."""

    def post(self, request, *args, **kwargs):
        session_service.logout(request.user)
        response = Response(status=status.HTTP_204_NO_CONTENT)
        clear_refresh_cookie(response)
        return response


class SessionsView(GenericAPIView):
    """List (GET) or revoke-others (DELETE) the user's sessions."""

    def get(self, request, *args, **kwargs):
        rows = UserSession.objects.filter(
            user=request.user, revoked_at__isnull=True
        ).order_by("-last_seen_at", "-created_at")
        serializer = SessionSerializer(rows, many=True)
        current = session_service.session_key_from_cookie(
            request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        )
        return Response(
            {"sessions": serializer.data, "current_session_key": current},
            status=status.HTTP_200_OK,
        )

    def delete(self, request, *args, **kwargs):
        current = session_service.session_key_from_cookie(
            request.COOKIES.get(settings.REFRESH_COOKIE_NAME)
        )
        count = session_service.revoke_other_sessions(request.user, current)
        return Response(
            {
                "message": f"Revoked {count} other session(s)",
                "revoked_count": count,
            },
            status=status.HTTP_200_OK,
        )


class SessionDetailView(GenericAPIView):
    """Revoke a single session (DELETE). 404 if not owned / already revoked."""

    def delete(self, request, *args, **kwargs):
        try:
            session_service.revoke_session(request.user, kwargs["session_key"])
        except AuthServiceError:
            return Response(
                {"detail": "Session not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        return Response(status=status.HTTP_204_NO_CONTENT)
