# TODO: Review this file
from __future__ import annotations

from fastapi import Depends, HTTPException, Request, status
from jose import JWTError
from sqlalchemy.ext.asyncio import AsyncSession

from otix.infrastructure.config import settings
from otix.infrastructure.database import get_session
from otix.lib.geoip import lang_from_country, resolve_country_from_request
from otix.lib.tokens import decode_token
from otix.services.auth.auth_service import AuthService


async def get_db() -> AsyncSession:
    async for session in get_session():
        yield session


async def get_current_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User:
    token = _extract_token_from_request(request)
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing authorization header")
    return await _resolve_user_from_token(token, db)


def _extract_token_from_request(request: Request) -> str | None:
    """Extract Bearer token from the Authorization header."""
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.removeprefix("Bearer ")
    return None


async def _resolve_user_from_token(token: str, db: AsyncSession) -> User:
    try:
        payload = decode_token(token)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")

    if payload.get("type") != "access":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token type")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token payload")

    user = await AuthService.get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found or inactive")

    return user


async def get_current_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


async def get_trusted_or_admin_user(
    current_user: User = Depends(get_current_user),
) -> User:
    """Allow admins or users with sufficient XP to perform proposal actions."""
    if current_user.is_admin:
        return current_user
    if current_user.total_xp >= settings.proposal_min_xp:
        return current_user
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail=f"Minimum {settings.proposal_min_xp} XP required for this action",
    )


async def get_optional_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> User | None:
    try:
        return await get_current_user(request, db)
    except HTTPException:
        return None


async def resolve_country_code(
    request: Request,
    current_user: User | None = None,
) -> str:
    """Resolve the country code for the current request.

    Precedence:
    1. Authenticated user with a saved country preference.
    2. IP geolocation (Cloudflare header first, then ipapi.co).
    3. ``"us"`` fallback.
    """
    if current_user and current_user.country:
        return current_user.country.lower()

    forwarded = request.headers.get("X-Forwarded-For")
    cf_country = request.headers.get("CF-IPCountry")
    client_host = request.client.host if request.client else None
    return await resolve_country_from_request(
        x_forwarded_for=forwarded,
        cf_ipcountry=cf_country,
        client_host=client_host,
    )


async def resolve_preferred_lang(
    request: Request,
    current_user: User | None = None,
) -> str:
    """Resolve the preferred language (ISO 639-1) for logo selection.

    Precedence:
    1. Authenticated user's explicit ``preferred_languages``.
    2. Country derived from the request (user country, Cloudflare header, IP geo).
    3. ``"en"`` fallback.
    """
    if current_user and current_user.preferred_languages:
        first = current_user.preferred_languages[0]
        if isinstance(first, str) and len(first) >= 2 and first[:2].isalpha():
            return first[:2].lower()

    country = await resolve_country_code(request, current_user)
    return lang_from_country(country)
