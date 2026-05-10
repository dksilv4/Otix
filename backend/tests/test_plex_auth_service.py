from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services import plex_auth_service


class MockPlexResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def json(self) -> dict:
        return self._data

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class MockPlexClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url: str, **kwargs):
        assert url == "https://plex.tv/api/v2/pins"
        return MockPlexResponse({"id": 1234, "code": "ABCD"})

    async def get(self, url: str, **kwargs):
        if url == "https://plex.tv/api/v2/pins/1234":
            return MockPlexResponse({"authToken": "plex-token"})
        if url == "https://plex.tv/api/v2/user":
            return MockPlexResponse({
                "id": 999,
                "username": "plexuser",
                "email": "plex@example.com",
                "thumb": "https://plex.tv/avatar.png",
            })
        raise AssertionError(f"unexpected URL {url}")


async def test_build_plex_link_url_uses_hosted_auth_link(fakeredis, monkeypatch):
    monkeypatch.setattr(plex_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    monkeypatch.setattr(plex_auth_service.httpx, "AsyncClient", MockPlexClient)
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:5173")

    auth_url, state, pin_id = await plex_auth_service.build_plex_link_url()

    assert auth_url.startswith("https://app.plex.tv/auth#?")
    assert "code=ABCD" in auth_url
    assert "forwardUrl=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fplex%2Fconnect%2Fcallback" in auth_url
    assert pin_id == "1234"
    assert await fakeredis.get(plex_auth_service._state_key(state)) == "1234"


async def test_link_plex_to_user_consumes_state_and_persists_profile(fakeredis, monkeypatch, mock_db_session):
    monkeypatch.setattr(plex_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    monkeypatch.setattr(plex_auth_service.httpx, "AsyncClient", MockPlexClient)
    state = "plex-state"
    await fakeredis.set(plex_auth_service._state_key(state), "1234")
    user = User(email="user@example.com", username="user", hashed_password="hash")
    user.id = "oti_user"
    mock_db_session.scalar.return_value = None

    await plex_auth_service.link_plex_to_user(mock_db_session, user, state)

    assert user.plex_id == "999"
    assert user.plex_username == "plexuser"
    assert user.plex_email == "plex@example.com"
    assert user.plex_thumb == "https://plex.tv/avatar.png"
    assert user.plex_auth_token == "plex-token"
    assert await fakeredis.get(plex_auth_service._state_key(state)) is None
    mock_db_session.flush.assert_awaited_once()
