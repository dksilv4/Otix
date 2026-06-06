# TODO: Review this file
"""OMDb API client.

Auth: API key query parameter (?apikey=...).
Premium key supports higher throughput (configurable via omdb_global_rps_limit).

OMDb returns JSON with a "Response" field ("True"/"False"). On "False",
the "Error" field contains a human-readable message.
"""

from __future__ import annotations

import httpx
from redis.asyncio import Redis

from otix.infrastructure.config import settings
from otix.lib.types import JSONValue
from otix.providers.base import BaseProvider

_shared_client: httpx.AsyncClient | None = None


def get_http_client() -> httpx.AsyncClient:
    global _shared_client
    if _shared_client is None or _shared_client.is_closed:
        _shared_client = httpx.AsyncClient(
            base_url=OMDbProvider.BASE_URL,
            timeout=settings.omdb_request_timeout_seconds,
        )
    return _shared_client


class OMDbProvider(BaseProvider):
    BASE_URL = "https://www.omdbapi.com"

    def __init__(self, redis: Redis, http_client: httpx.AsyncClient | None = None):
        client = http_client or get_http_client()
        super().__init__(
            name="omdb",
            redis=redis,
            http_client=client,
            rate=settings.omdb_global_rps_limit,
            burst=settings.omdb_global_rps_limit,
        )

    async def _get(self, url: str, **kwargs) -> httpx.Response:
        params = dict(kwargs.pop("params", {}))
        params["apikey"] = settings.omdb_api_key
        return await super()._get(url, params=params, **kwargs)

    async def get_by_imdb_id(self, imdb_id: str) -> dict[str, JSONValue]:
        response = await self._get("/", params={"i": imdb_id})
        data = response.json()
        if data.get("Response") == "False":
            raise OMDbError(data.get("Error", "Unknown OMDb error"))
        return data


class OMDbError(Exception):
    pass
