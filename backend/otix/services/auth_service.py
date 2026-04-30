from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

import structlog
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import RefreshToken, User
from otix.infrastructure.config import settings

logger = structlog.get_logger()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "type": "access",
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_lifetime_minutes),
    }
    return jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")


def create_refresh_token(user_id: str) -> tuple[str, str, datetime]:
    now = datetime.now(timezone.utc)
    jti = str(uuid.uuid4())
    exp = now + timedelta(days=settings.refresh_token_lifetime_days)
    payload = {
        "sub": user_id,
        "type": "refresh",
        "jti": jti,
        "iat": now,
        "exp": exp,
    }
    token = jwt.encode(payload, settings.jwt_secret_key, algorithm="HS256")
    return token, jti, exp


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

    async def login(self, email: str, password: str) -> tuple[str, str, User] | None:
        user = await self.session.scalar(select(User).where(User.email == email))
        if user is None or not user.is_active:
            return None
        if not verify_password(password, user.hashed_password):
            return None

        # Check global logout — reject tokens issued before the logout marker.
        access_token = create_access_token(user.id)
        refresh_token, jti, exp = create_refresh_token(user.id)

        # Persist refresh token for rotation + blacklisting.
        rt = RefreshToken(user_id=user.id, jti=jti, expires_at=exp)
        self.session.add(rt)

        user.last_login_at = datetime.now(timezone.utc)
        await self.session.flush()
        logger.info("user logged in", user_id=user.id)
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

        if settings.rotate_refresh_tokens:
            # Revoke the current refresh token, issue new pair.
            rt.revoked_at = datetime.now(timezone.utc)
            new_access = create_access_token(user.id)
            new_refresh, new_jti, new_exp = create_refresh_token(user.id)
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
