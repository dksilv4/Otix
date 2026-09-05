"""DRF authentication backends for the real-auth slice.

``JWTAuthentication`` is the primary scheme (Bearer access token). It yields to
DRF's ``TokenAuthentication`` when the header uses another scheme (e.g. legacy
``Token <key>`` clients) so both coexist until the FastAPI cutover.
"""

from __future__ import annotations

from rest_framework import authentication, exceptions

from apps.accounts.models import User
from apps.accounts.services.tokens import TokenError, decode_token


class JWTAuthentication(authentication.BaseAuthentication):
    """Authenticate a user from a 15-minute Bearer access JWT."""

    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            # Different scheme — let a later authenticator (DRF Token) try.
            return None
        token = parts[1]
        try:
            payload = decode_token(token)
        except TokenError as exc:
            raise exceptions.AuthenticationFailed(
                "Invalid or expired access token"
            ) from exc
        if payload.get("type") != "access":
            raise exceptions.AuthenticationFailed("Invalid token type")
        user_id = payload.get("sub")
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist as exc:
            raise exceptions.AuthenticationFailed(
                "Invalid or expired access token"
            ) from exc
        if not user.is_active:
            raise exceptions.AuthenticationFailed("User account is disabled.")
        return (user, token)

    def authenticate_header(self, request) -> str:
        return self.keyword
