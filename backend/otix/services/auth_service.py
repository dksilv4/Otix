from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone

import bcrypt
import structlog
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import AuthActionToken, AuthActionType, RefreshToken, User
from otix.infrastructure.config import settings

logger = structlog.get_logger()


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode(), hashed_password.encode())


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_lifetime_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def create_refresh_token(user_id: str, session_key: str = "") -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    exp = now + timedelta(days=settings.refresh_token_lifetime_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti,
        "session_key": session_key,
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    return token, jti, exp


def create_challenge_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "2fa_challenge",
        "iat": now,
        "exp": now + timedelta(minutes=5),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.jwt_secret_key, algorithms=["HS256"])


def get_refresh_cookie_config() -> dict:
    return {
        "key": settings.auth_refresh_cookie_name,
        "path": settings.auth_refresh_cookie_path,
        "domain": settings.auth_refresh_cookie_domain or None,
        "secure": settings.auth_refresh_cookie_secure,
        "httponly": settings.auth_refresh_cookie_httponly,
        "samesite": settings.auth_refresh_cookie_samesite,
        "max_age": settings.refresh_token_lifetime_days * 86400,
    }


class AuthService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def register(self, email: str, username: str, password: str) -> User:
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

        user.last_login_at = datetime.now(timezone.utc)
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
        try:
            payload = decode_token(refresh_token_str)
        except JWTError:
            return None

        if payload.get("type") != "refresh":
            return None

        user_id = payload.get("sub")
        jti = payload.get("jti")
        if not user_id or not jti:
            return None

        # Verify refresh token exists and isn't revoked.
        rt = await self.session.scalar(
            select(RefreshToken).where(RefreshToken.jti == jti)
        )
        if rt is None or rt.revoked_at is not None:
            # Possible token reuse — revoke all tokens for this user.
            if rt is not None:
                logger.warning("refresh token reuse detected", user_id=user_id)
                await self._revoke_all_user_tokens(user_id)
            return None

        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is None or not user.is_active:
            return None

        # Global logout check.
        if user.global_logout_marker is not None:
            issued_at = datetime.fromtimestamp(payload["iat"], tz=timezone.utc)
            if issued_at < user.global_logout_marker:
                return None

        # Touch the session if session_key is present in the token.
        session_key = payload.get("session_key", "")
        if session_key:
            from otix.services.session_service import SessionService
            await SessionService(self.session).touch_session(session_key)

        if settings.rotate_refresh_tokens:
            # Revoke the current refresh token, issue new pair.
            rt.revoked_at = datetime.now(timezone.utc)
            new_access = create_access_token(user.id)
            new_refresh, new_jti, new_exp = create_refresh_token(user.id, session_key)
            new_rt = RefreshToken(user_id=user.id, jti=new_jti, expires_at=new_exp)
            self.session.add(new_rt)
            await self.session.flush()
            return new_access, new_refresh, user

        # Non-rotating mode — just issue a new access token.
        new_access = create_access_token(user.id)
        return new_access, refresh_token_str, user

    async def logout(self, user_id: str) -> None:
        user = await self.session.scalar(select(User).where(User.id == user_id))
        if user is not None:
            user.global_logout_marker = datetime.now(timezone.utc)
            await self.session.flush()
            logger.info("user logged out", user_id=user_id)

    async def logout_all(self, user_id: str) -> None:
        """Revoke all refresh tokens and set global logout marker."""
        await self._revoke_all_user_tokens(user_id)
        await self.logout(user_id)

    async def _revoke_all_user_tokens(self, user_id: str) -> None:
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
        now = datetime.now(timezone.utc)
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
