"""Rate limiting dependency for auth endpoints.

Wraps the Redis-backed token-bucket RateLimiter with bucket keys and
thresholds tuned for authentication flows.
"""

from __future__ import annotations

import hashlib

from fastapi import Depends, HTTPException, Request, status

import redis.asyncio as aioredis

from otix.infrastructure.redis import get_redis
from otix.lib.rate_limiter import RateLimiter


def client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    if request.client:
        return request.client.host
    return "unknown"


class AuthRateLimiter:
    def __init__(self, redis: aioredis.Redis):
        self._limiter = RateLimiter(redis, key_prefix="auth_ratelimit")

    async def _check(self, bucket: str, rate: float, burst: int) -> None:
        allowed, wait = await self._limiter.acquire(bucket, rate=rate, burst=burst)
        if not allowed:
            retry_after = max(1, int(wait))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

    async def check_login_by_ip(self, ip: str) -> None:
        # 20 attempts per 5 minutes
        await self._check(f"login:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_login_by_identity(self, identity: str) -> None:
        # 10 attempts per 5 minutes per identity
        h = hashlib.sha256(identity.lower().encode()).hexdigest()
        await self._check(f"login:id:{h}", rate=10.0 / 300, burst=10)

    async def check_refresh(self, ip: str) -> None:
        # 30 attempts per 5 minutes
        await self._check(f"refresh:ip:{ip}", rate=30.0 / 300, burst=30)

    async def check_forgot_password(self, email: str) -> None:
        # 5 attempts per 15 minutes per email
        h = hashlib.sha256(email.lower().encode()).hexdigest()
        await self._check(f"email:{h}", rate=5.0 / 900, burst=5)

    async def check_send_verification(self, user_id: str) -> None:
        # 5 attempts per 15 minutes per user
        await self._check(f"email:user:{user_id}", rate=5.0 / 900, burst=5)


async def get_auth_rate_limiter(
    redis: aioredis.Redis = Depends(get_redis),
) -> AuthRateLimiter:
    return AuthRateLimiter(redis)
