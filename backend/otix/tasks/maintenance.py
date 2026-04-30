"""Maintenance and scheduled tasks.

These run on the 'control' queue via Celery beat.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timedelta, timezone

import structlog
from sqlalchemy import delete

from otix.domain.user import RefreshToken
from otix.infrastructure.celery import app
from otix.infrastructure.database import async_session_factory
from otix.infrastructure.redis import get_redis
from otix.lib.metrics import SYNC_JOBS_ACTIVE, get_registry

logger = structlog.get_logger()


def run_async(coro):
    loop = asyncio.new_event_loop()
    try:
        return loop.run_until_complete(coro)
    finally:
        loop.close()


@app.task(name="maintenance.refresh_discover_feed", queue="control")
def refresh_discover_feed() -> dict:
    """Rebuild discovery feed for active users."""
    # Stub — will call discovery service once implemented.
    logger.info("discover feed refresh triggered")
    return {"status": "ok", "message": "discover feed refresh not yet implemented"}


@app.task(name="maintenance.provider_health_check", queue="control")
def provider_health_check() -> dict:
    """Check provider circuit breaker states and log warnings."""
    return run_async(_provider_health_check())


@app.task(name="maintenance.cleanup_expired_tokens", queue="control")
def cleanup_expired_tokens() -> dict:
    """Remove expired refresh tokens from the database."""
    return run_async(_cleanup_expired_tokens())


async def _provider_health_check() -> dict:
    registry = get_registry()
    snapshot = registry.snapshot()
    circuit_breakers = snapshot.get("gauges", {}).get("otix_circuit_breaker_state", {}).get("values", {})

    open_breakers = [k for k, v in circuit_breakers.items() if v >= 1.0]
    if open_breakers:
        logger.warning("circuit breakers open", providers=open_breakers)

    return {"circuit_breakers": circuit_breakers, "open": open_breakers}


async def _cleanup_expired_tokens() -> dict:
    async with async_session_factory() as session:
        now = datetime.now(timezone.utc)
        result = await session.execute(
            delete(RefreshToken).where(RefreshToken.expires_at < now)
        )
        await session.commit()
        count = result.rowcount
        if count:
            logger.info("expired refresh tokens cleaned up", count=count)
        return {"deleted": count}
