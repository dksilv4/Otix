# TODO: Review this file
"""IP-to-country resolution with Redis caching.

Precedence:
1. Cloudflare ``CF-IPCountry`` header (free, always accurate).
2. ipapi.co lookup (free tier, 1k req/day — cached aggressively).
3. ``"us"`` fallback on any failure.
"""

from __future__ import annotations

import logging

import httpx

from otix.infrastructure.redis import get_redis

logger = logging.getLogger(__name__)

_GEOIP_CACHE_TTL = 60 * 60 * 24  # 24 hours — IP→country is stable


async def resolve_country_from_request(
    x_forwarded_for: str | None = None,
    cf_ipcountry: str | None = None,
    client_host: str | None = None,
) -> str:
    """Return an ISO 3166-1 alpha-2 country code (lowercase) for the request.

    Returns ``"us"`` when nothing can be determined.
    """
    if cf_ipcountry:
        return cf_ipcountry.lower()

    ip = _extract_ip(x_forwarded_for, client_host)
    if not ip or _is_private_ip(ip):
        return "us"

    return await _geoip_lookup(ip)


async def _geoip_lookup(ip: str) -> str:
    """Resolve *ip* to a country code, caching results in Redis."""
    cache_key = f"geoip:{ip}"

    try:
        redis = await get_redis()
        cached = await redis.get(cache_key)
        if cached:
            return cached.decode("utf-8") if isinstance(cached, bytes) else cached

        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"https://ipapi.co/{ip}/json/")
            if resp.status_code == 200:
                data = resp.json()
                country = (data.get("country_code") or "us").lower()
                await redis.set(cache_key, country, ex=_GEOIP_CACHE_TTL)
                return country

    except Exception:
        logger.warning("GeoIP lookup failed for %s, falling back to us", ip, exc_info=True)

    return "us"


def _extract_ip(x_forwarded_for: str | None, client_host: str | None) -> str | None:
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return client_host


def _is_private_ip(ip: str) -> bool:
    """Return True for private / loopback / link-local addresses."""
    if ip in ("127.0.0.1", "::1", "localhost", "unknown"):
        return True
    if ip.startswith(("10.", "172.16.", "192.168.", "fc", "fd", "fe80")):
        return True
    return False
