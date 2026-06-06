from __future__ import annotations

import json
import urllib.parse
from unittest.mock import AsyncMock

import httpx

from otix.infrastructure.config import settings
from otix.services import tmdb_auth_service


class TokenTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"success": True, "request_token": "tmdb-request-token"},
            request=request,
        )


class TestTmdbAuthUrl:
    async def test_link_url_uses_backend_redirect_and_stores_user_state(self, fakeredis, monkeypatch):
        async_client = httpx.AsyncClient
        monkeypatch.setattr(tmdb_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        monkeypatch.setattr(settings, "tmdb_api_key", "test-key")
        monkeypatch.setattr(
            tmdb_auth_service.httpx,
            "AsyncClient",
            lambda *args, **kwargs: async_client(
                transport=TokenTransport(),
                base_url=tmdb_auth_service.TMDB_API_BASE,
                timeout=kwargs.get("timeout"),
            ),
        )

        url, state = await tmdb_auth_service.build_tmdb_link_url_for_user(
            "user-1",
            "https://api.example.com/auth/oauth/tmdb/redirect",
        )

        parsed = urllib.parse.urlparse(url)
        auth_query = dict(urllib.parse.parse_qsl(parsed.query))
        redirect = urllib.parse.urlparse(auth_query["redirect_to"])
        redirect_query = dict(urllib.parse.parse_qsl(redirect.query))

        assert parsed.scheme == "https"
        assert parsed.netloc == "www.themoviedb.org"
        assert parsed.path == "/authenticate/tmdb-request-token"
        assert redirect.scheme == "https"
        assert redirect.netloc == "api.example.com"
        assert redirect.path == "/auth/oauth/tmdb/redirect"
        assert redirect_query == {"state": state}

        stored = await fakeredis.get(tmdb_auth_service._state_key(state))
        assert json.loads(stored) == {"request_token": "tmdb-request-token", "user_id": "user-1"}
