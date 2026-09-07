# TODO: Review this file
"""Rate limiting dependency for auth endpoints.

Wraps the Redis-backed token-bucket RateLimiter with bucket keys and
thresholds tuned for authentication flows.
"""

from __future__ import annotations

import hashlib

import redis.asyncio as aioredis
from fastapi import Depends, HTTPException, Request, status

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

    async def check_verify_email(self, ip: str) -> None:
        # 10 attempts per 5 minutes per IP — token verification
        await self._check(f"verify:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_forgot_password(self, email: str) -> None:
        # 5 attempts per 15 minutes per email
        h = hashlib.sha256(email.lower().encode()).hexdigest()
        await self._check(f"email:{h}", rate=5.0 / 900, burst=5)

    async def check_2fa_verify(self, ip: str) -> None:
        # 5 attempts per minute per IP — TOTP codes are single-use + challenge expires in 5 min
        await self._check(f"2fa:ip:{ip}", rate=5.0 / 60, burst=5)

    async def check_send_verification(self, user_id: str) -> None:
        # 5 attempts per 15 minutes per user
        await self._check(f"email:user:{user_id}", rate=5.0 / 900, burst=5)

    async def check_register(self, ip: str) -> None:
        # 5 registration attempts per hour per IP
        await self._check(f"register:ip:{ip}", rate=5.0 / 3600, burst=5)

    async def check_list_sessions(self, ip: str) -> None:
        # 30 list requests per 5 minutes per IP
        await self._check(f"sessions:list:ip:{ip}", rate=30.0 / 300, burst=30)

    async def check_revoke_session(self, ip: str) -> None:
        # 20 revoke requests per 5 minutes per IP
        await self._check(f"sessions:revoke:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_tmdb_initiate(self, ip: str) -> None:
        # 10 initiate requests per 5 minutes per IP
        await self._check(f"tmdb:initiate:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_tmdb_callback(self, ip: str) -> None:
        # 10 callback requests per 5 minutes per IP
        await self._check(f"tmdb:callback:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_tmdb_disconnect(self, ip: str) -> None:
        # 5 disconnect requests per 5 minutes per IP
        await self._check(f"tmdb:disconnect:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_steam_initiate(self, ip: str) -> None:
        # 10 initiate requests per minute per IP — covers both login and link
        await self._check(f"steam:initiate:ip:{ip}", rate=10.0 / 60, burst=10)

    async def check_steam_callback(self, ip: str) -> None:
        # 10 callback requests per minute per IP — covers both login and link
        await self._check(f"steam:callback:ip:{ip}", rate=10.0 / 60, burst=10)

    async def check_steam_disconnect(self, ip: str) -> None:
        # 5 disconnect requests per 5 minutes per IP
        await self._check(f"steam:disconnect:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_google_initiate(self, ip: str) -> None:
        # 10 initiate requests per 5 minutes per IP
        await self._check(f"google:initiate:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_google_callback(self, ip: str) -> None:
        # 10 callback requests per 5 minutes per IP
        await self._check(f"google:callback:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_google_disconnect(self, ip: str) -> None:
        # 5 disconnect requests per 5 minutes per IP
        await self._check(f"google:disconnect:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_plex_initiate(self, ip: str) -> None:
        # 10 initiate requests per 5 minutes per IP
        await self._check(f"plex:initiate:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_plex_callback(self, ip: str) -> None:
        # 10 callback requests per 5 minutes per IP
        await self._check(f"plex:callback:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_plex_disconnect(self, ip: str) -> None:
        # 5 disconnect requests per 5 minutes per IP
        await self._check(f"plex:disconnect:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_logout(self, ip: str) -> None:
        # 20 logout requests per 5 minutes per IP
        await self._check(f"logout:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_reset_password(self, ip: str) -> None:
        # 5 reset attempts per 15 minutes per IP
        await self._check(f"reset:ip:{ip}", rate=5.0 / 900, burst=5)

    async def check_update_me(self, ip: str) -> None:
        # 30 profile updates per 5 minutes per IP
        await self._check(f"update_me:ip:{ip}", rate=30.0 / 300, burst=30)

    async def check_two_factor_setup(self, ip: str) -> None:
        # 5 setup attempts per 5 minutes per IP
        await self._check(f"2fa:setup:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_two_factor_enable(self, ip: str) -> None:
        # 10 enable attempts per 5 minutes per IP
        await self._check(f"2fa:enable:ip:{ip}", rate=10.0 / 300, burst=10)

    async def check_two_factor_disable(self, ip: str) -> None:
        # 5 disable attempts per 5 minutes per IP
        await self._check(f"2fa:disable:ip:{ip}", rate=5.0 / 300, burst=5)

    async def check_company_rating(self, ip: str) -> None:
        # 20 rating/unrating actions per 5 minutes per IP
        await self._check(f"company:rating:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_company_follow(self, ip: str) -> None:
        # 20 follow/unfollow actions per 5 minutes per IP
        await self._check(f"company:follow:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_list_write(self, ip: str) -> None:
        # 20 mutating list operations per 5 minutes per IP
        await self._check(f"list:write:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_list_like(self, ip: str) -> None:
        # 30 like/unlike actions per 5 minutes per IP
        await self._check(f"list:like:ip:{ip}", rate=30.0 / 300, burst=30)

    async def check_person_follow(self, ip: str) -> None:
        # 20 follow/unfollow actions per 5 minutes per IP
        await self._check(f"person:follow:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_person_rating(self, ip: str) -> None:
        # 20 rating/unrating actions per 5 minutes per IP
        await self._check(f"person:rating:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_workout_write(self, ip: str) -> None:
        # 20 mutating workout operations per 5 minutes per IP
        await self._check(f"workout:write:ip:{ip}", rate=20.0 / 300, burst=20)

    async def check_workout_checkin(self, ip: str) -> None:
        # 10 check-in / undo actions per 5 minutes per IP
        await self._check(f"workout:checkin:ip:{ip}", rate=10.0 / 300, burst=10)


async def get_auth_rate_limiter(
    redis: aioredis.Redis = Depends(get_redis),
) -> AuthRateLimiter:
    return AuthRateLimiter(redis)
