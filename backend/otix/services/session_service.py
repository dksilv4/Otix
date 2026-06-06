# TODO: Review this file
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.user import RefreshToken, User, UserSession

from otix.domain.user import RefreshToken, User, UserSession


class SessionService:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create_session(self, user: User, ip_address: str | None, user_agent: str | None) -> str:
        session_key = str(uuid.uuid4())

        user_session = UserSession(
            user_id=user.id,
            session_key=session_key,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        self.session.add(user_session)
        await self.session.flush()
        return session_key

    async def touch_session(self, session_key: str) -> None:
        session_record = await self.session.scalar(
            select(UserSession).where(
                UserSession.session_key == session_key,
                UserSession.revoked_at.is_(None),
            )
        )
        if session_record is not None:
            session_record.last_seen_at = datetime.now(timezone.utc)
            await self.session.flush()

    async def list_user_sessions(self, user_id: str) -> list[dict]:
        result = await self.session.execute(
            select(UserSession)
            .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None))
            .order_by(UserSession.last_seen_at.desc())
        )
        sessions = result.scalars().all()
        return [
            {
                "session_key": s.session_key,
                "ip_address": s.ip_address,
                "user_agent": s.user_agent,
                "last_seen_at": s.last_seen_at,
                "created_at": s.created_at,
            }
            for s in sessions
        ]

    async def revoke_session(self, session_key: str, user_id: str | None = None, reason: str = "user_revoked") -> bool:
        clauses = [
            UserSession.session_key == session_key,
            UserSession.revoked_at.is_(None),
        ]
        if user_id is not None:
            clauses.append(UserSession.user_id == user_id)
        session_record = await self.session.scalar(
            select(UserSession).where(*clauses)
        )
        if session_record is None:
            return False
        session_record.revoked_at = datetime.now(timezone.utc)
        session_record.revoked_reason = reason
        await self.session.flush()
        return True

    async def revoke_other_sessions(self, user_id: str, current_session_key: str, reason: str = "user_revoked") -> int:
        now = datetime.now(timezone.utc)
        result = await self.session.execute(
            select(UserSession).where(
                UserSession.user_id == user_id,
                UserSession.session_key != current_session_key,
                UserSession.revoked_at.is_(None),
            )
        )
        count = 0
        for s in result.scalars():
            s.revoked_at = now
            s.revoked_reason = reason
            count += 1
        await self.session.flush()
        return count

    async def store_refresh_token(self, user_id: str, jti: str, expires_at: datetime) -> None:
        """Persist a refresh token record."""
        rt = RefreshToken(user_id=user_id, jti=jti, expires_at=expires_at)
        self.session.add(rt)
        await self.session.flush()
