# TODO: Review this file
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, date, datetime, timedelta

import bcrypt
import structlog
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import AuthActionToken, AuthActionType, RefreshToken, User
from otix.lib.tokens import (
    create_access_token,
    create_challenge_token,
    create_refresh_token,
    decode_token,
)

logger = structlog.get_logger()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    @staticmethod
    async def get_user_by_id(session: AsyncSession, user_id: str) -> User | None:
        """Return a user by ID, or None if not found."""
        return await session.get(User, user_id)

    async def register(self, email: str, username: str, password: str, date_of_birth: date) -> User:
        existing = await self.session.scalar(
            select(User).where((User.email == email) | (User.username == username))
        )
        if existing is not None:
            if existing.email == email:
                raise ValueError("Email already registered")
            raise ValueError("Username already taken")

        user = User(
            email=email,
            username=username,
            hashed_password=hash_password(password),
            is_admin=False,
            date_of_birth=date_of_birth,
        )
        self.session.add(user)
        await self.session.flush()
        logger.info("user registered", user_id=user.id)
        return user

    async def login(
        self,
        identity: str,
        password: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str | None, str, User] | None:
        """Authenticate a user by identity + password.

        Returns:
            (access_token, refresh_token, user) — normal login
            (None, challenge_token, user) — 2FA required (access_token is None, refresh_token position holds challenge)
            None — invalid credentials
        """
        user = await self.session.scalar(select(User).where(User.email == identity))
        if user is None:
            user = await self.session.scalar(select(User).where(User.username == identity))
        if user is None or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None

        user.last_login_at = datetime.now(UTC)
        await self.session.flush()

        # If 2FA is enabled, return a challenge token instead of real tokens.
        if user.two_factor_enabled:
            challenge = create_challenge_token(user.id)
            logger.info("2fa challenge issued", user_id=user.id)
            return None, challenge, user

        from otix.services.session_service import SessionService

        session_key = await SessionService(self.session).create_session(user, ip_address, user_agent)

        access_token = create_access_token(user.id)
        refresh_token, jti, exp = create_refresh_token(user.id, session_key)

        rt = RefreshToken(user_id=user.id, jti=jti, expires_at=exp)
        self.session.add(rt)

        await self.session.flush()
        logger.info("user logged in", user_id=user.id)
        return access_token, refresh_token, user

    async def verify_2fa_login(
        self,
        challenge_token: str,
        totp_code: str,
        ip_address: str | None = None,
        user_agent: str | None = None,
    ) -> tuple[str, str, User] | None:
        """Verify a 2FA challenge token + TOTP code and issue real tokens."""
        try:
            payload = decode_token(challenge_token)
        except JWTError:
            return None

        if payload.get("type") != "2fa_challenge":
            return None

        user_id = payload.get("sub")
        if not user_id:
            return None

        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is None or not user.is_active or not user.two_factor_enabled or not user.two_factor_secret:
            return None

        from otix.lib.totp import verify_totp

        if not verify_totp(user.two_factor_secret, totp_code):
            return None

        from otix.services.session_service import SessionService

        session_key = await SessionService(self.session).create_session(user, ip_address, user_agent)

        access_token = create_access_token(user.id)
        refresh_token, jti, exp = create_refresh_token(user.id, session_key)

        rt = RefreshToken(user_id=user.id, jti=jti, expires_at=exp)
        self.session.add(rt)

        await self.session.flush()
        logger.info("2fa login verified", user_id=user.id)
        return access_token, refresh_token, user

    async def refresh(self, refresh_token_str: str) -> tuple[str, str, User] | None:
        from otix.services.auth.refresh_service import RefreshError, RefreshService

        try:
            return await RefreshService(self.session).refresh(refresh_token_str)
        except RefreshError:
            return None

    async def logout(self, user_id: str) -> None:
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is not None:
            user.global_logout_marker = datetime.now(UTC)
            await self.session.flush()
            logger.info("user logged out", user_id=user_id)

    async def logout_all(self, user_id: str) -> None:
        """Revoke all refresh tokens and set global logout marker."""
        await self._revoke_all_user_tokens(user_id)
        await self.logout(user_id)

    async def _revoke_all_user_tokens(self, user_id: str) -> None:
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

    # ── Email verification ──────────────────────────────────────────

    async def create_email_verification(self, user: User) -> str:
        token = secrets.token_urlsafe(48)
        token_hash_val = hash_token(token)
        await self._invalidate_existing_tokens(user.id, AuthActionType.VERIFY_EMAIL.value)
        now = datetime.now(UTC)
        action_token = AuthActionToken(
            user_id=user.id,
            purpose=AuthActionType.VERIFY_EMAIL.value,
            token_hash=token_hash_val,
            expires_at=now + timedelta(hours=24),
        )
        self.session.add(action_token)
        await self.session.flush()
        return token

    async def verify_email(self, token: str) -> bool:
        token_hash_val = hash_token(token)
        now = datetime.now(UTC)
        action_token = await self.session.scalar(
            select(AuthActionToken).where(
                AuthActionToken.token_hash == token_hash_val,
                AuthActionToken.purpose == AuthActionType.VERIFY_EMAIL.value,
                AuthActionToken.used_at.is_(None),
                AuthActionToken.expires_at > now,
            )
        )
        if action_token is None:
            return False
        action_token.used_at = now
        user = await self.session.scalar(select(User).where(User.id == action_token.user_id))
        if user is None:
            return False
        user.is_verified = True
        await self.session.flush()
        return True

    # ── Password reset ──────────────────────────────────────────────

    async def create_password_reset_token(self, email: str) -> str | None:
        user = await self.session.scalar(select(User).where(User.email == email))
        if user is None:
            return None
        token = secrets.token_urlsafe(48)
        token_hash_val = hash_token(token)
        await self._invalidate_existing_tokens(user.id, AuthActionType.PASSWORD_RESET.value)
        now = datetime.now(UTC)
        action_token = AuthActionToken(
            user_id=user.id,
            purpose=AuthActionType.PASSWORD_RESET.value,
            token_hash=token_hash_val,
            expires_at=now + timedelta(hours=2),
        )
        self.session.add(action_token)
        await self.session.flush()
        return token

    async def reset_password(self, token: str, new_password: str) -> bool:
        token_hash_val = hash_token(token)
        now = datetime.now(UTC)
        action_token = await self.session.scalar(
            select(AuthActionToken).where(
                AuthActionToken.token_hash == token_hash_val,
                AuthActionToken.purpose == AuthActionType.PASSWORD_RESET.value,
                AuthActionToken.used_at.is_(None),
                AuthActionToken.expires_at > now,
            )
        )
        if action_token is None:
            return False
        action_token.used_at = now
        user = await self.session.scalar(select(User).where(User.id == action_token.user_id))
        if user is None:
            return False
        user.hashed_password = hash_password(new_password)
        await self._revoke_all_user_tokens(user.id)
        user.global_logout_marker = now
        await self.session.flush()
        return True

    async def _invalidate_existing_tokens(self, user_id: str, purpose: str) -> None:
        now = datetime.now(UTC)
        result = await self.session.execute(
            select(AuthActionToken).where(
                AuthActionToken.user_id == user_id,
                AuthActionToken.purpose == purpose,
                AuthActionToken.used_at.is_(None),
            )
        )
        for t in result.scalars():
            t.used_at = now
        await self.session.flush()
