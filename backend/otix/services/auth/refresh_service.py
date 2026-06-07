from __future__ import annotations

from datetime import UTC, datetime

import structlog
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import RefreshToken, User
from otix.infrastructure.config import settings
from otix.lib.tokens import create_access_token, create_refresh_token, decode_token

logger = structlog.get_logger()


class RefreshError(Exception):
    """Base exception for refresh token failures."""

    def __init__(self, message: str, user_id: str | None = None) -> None:
        self.message = message
        self.user_id = user_id
        super().__init__(message)


class TokenReuseError(RefreshError):
    """Raised when a revoked refresh token is reused — invalidates all tokens for the user."""


class UserInactiveError(RefreshError):
    """Raised when the user account is no longer active."""


class RefreshService:
    """Validates refresh tokens and issues new token pairs.

    Handles token rotation, reuse detection, global logout checks,
    and session-touching.
    """

    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def refresh(self, refresh_token_str: str) -> tuple[str, str, User]:
        """Validate a refresh token and issue a new token pair.

        Returns:
            (access_token, refresh_token, user)

        Raises:
            TokenReuseError:   Token was already revoked — all user tokens invalidated.
            UserInactiveError: User account is inactive or deleted.
            RefreshError:      JWT is invalid, expired, or malformed.
        """
        try:
            payload = decode_token(refresh_token_str)
        except JWTError:
            raise RefreshError("Invalid or expired refresh token")

        if payload.get("type") != "refresh":
            raise RefreshError("Invalid token type")

        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            raise RefreshError("Invalid token payload")

        # ── Token reuse detection ────────────────────────────────────────
        rt = await self.session.scalar(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        if rt is None or rt.revoked_at is not None:
            if rt is not None:
                logger.warning(
                    "refresh token reuse detected",
                    user_id=user_id,
                    jti=jti,
                )
                await self._revoke_all_user_tokens(user_id)
                raise TokenReuseError("Refresh token has been revoked", user_id=user_id)
            raise RefreshError("Refresh token not found")

        # ── User check ────────────────────────────────────────────────────
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is None or not user.is_active:
            raise UserInactiveError("User not found or inactive", user_id=user_id)

        # ── Global logout check ───────────────────────────────────────────
        if user.global_logout_marker is not None:
            issued_at = datetime.fromtimestamp(payload["iat"], tz=UTC)
            if issued_at < user.global_logout_marker:
                raise RefreshError("Token issued before global logout", user_id=user_id)

        # ── Touch session ─────────────────────────────────────────────────
        session_key: str = payload.get("session_key", "")
        if session_key:
            from otix.services.session_service import SessionService

            await SessionService(self.session).touch_session(session_key)

        # ── Issue new token pair ──────────────────────────────────────────
        if settings.rotate_refresh_tokens:
            rt.revoked_at = datetime.now(UTC)
            new_access = create_access_token(user.id)
            new_refresh, new_jti, new_exp = create_refresh_token(user.id, session_key)
            new_rt = RefreshToken(user_id=user.id, jti=new_jti, expires_at=new_exp)
            self.session.add(new_rt)
            await self.session.flush()
            return new_access, new_refresh, user

        # Non-rotating mode — just issue a new access token.
        new_access = create_access_token(user.id)
        return new_access, refresh_token_str, user

    async def _revoke_all_user_tokens(self, user_id: str) -> None:
        """Revoke every active refresh token for the given user."""
        now = datetime.now(UTC)
        result = await self.session.execute(
            select(RefreshToken).where(
                RefreshToken.user_id == user_id,
                RefreshToken.revoked_at.is_(None),
            )
        )
        for rt in result.scalars():
            rt.revoked_at = now
        await self.session.flush()
