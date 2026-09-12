"""HttpOnly refresh-cookie helpers shared by the auth views.

The cookie is path-scoped to ``/api/v1/auth/`` so the browser only sends it on
token-endpoint requests (a legacy contract the frontend depends on). Settings
mirror the frozen FastAPI behaviour: httpOnly, samesite=lax, 7-day max_age.
"""

from __future__ import annotations

from django.conf import settings


def set_refresh_cookie(response, refresh_jwt: str) -> None:
    """Attach the new refresh JWT as the httpOnly cookie."""
    response.set_cookie(
        settings.REFRESH_COOKIE_NAME,
        refresh_jwt,
        path=settings.REFRESH_COOKIE_PATH,
        httponly=True,
        secure=settings.REFRESH_COOKIE_SECURE,
        samesite=settings.REFRESH_COOKIE_SAMESITE,
        max_age=settings.REFRESH_TOKEN_LIFETIME_DAYS * 86400,
    )


def clear_refresh_cookie(response) -> None:
    """Delete the refresh cookie. ``delete_cookie`` only accepts key/path/domain."""
    response.delete_cookie(
        settings.REFRESH_COOKIE_NAME,
        path=settings.REFRESH_COOKIE_PATH,
    )
