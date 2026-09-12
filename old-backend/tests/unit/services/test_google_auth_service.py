from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from otix.domain.user import User
from otix.infrastructure.config import settings
from otix.services import google_auth_service


class MockResponse:
    def __init__(self, data: dict, status_code: int = 200):
        self._data = data
        self.status_code = status_code

    def json(self) -> dict:
        return self._data

    def raise_for_status(self) -> None:
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


class MockGoogleClient:
    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return None

    async def post(self, url: str, data: dict, **kwargs):
        assert url == google_auth_service.GOOGLE_TOKEN_URL
        if data.get("grant_type") == "authorization_code":
            return MockResponse({
                "access_token": "google-access-token",
                "refresh_token": "google-refresh-token",
                "expires_in": 3600,
            })
        elif data.get("grant_type") == "refresh_token":
            return MockResponse({
                "access_token": "new-access-token",
                "expires_in": 1800,
            })
        raise AssertionError("unexpected post")

    async def get(self, url: str, headers: dict, **kwargs):
        assert url == google_auth_service.GOOGLE_USERINFO_URL
        assert headers.get("Authorization") == "Bearer google-access-token"
        return MockResponse({
            "sub": "google-id-123",
            "email": "google@example.com",
            "name": "Google User",
            "picture": "https://google.com/avatar.png",
        })


async def test_build_google_link_url(fakeredis, monkeypatch):
    monkeypatch.setattr(google_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    monkeypatch.setattr(settings, "google_client_id", "client-id")
    monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:5173")

    url, state = await google_auth_service.build_google_link_url()

    assert "client_id=client-id" in url
    assert "response_type=code" in url
    assert "redirect_uri=http%3A%2F%2Flocalhost%3A5173%2Fauth%2Fcallback%2Fgoogle" in url
    assert "access_type=offline" in url
    assert "code_challenge_method=S256" in url
    assert "code_challenge=" in url
    assert state is not None

    stored = await fakeredis.get(google_auth_service._state_key(state))
    payload = json.loads(stored)
    assert payload["v"] == "1"
    assert "verifier" in payload


async def test_consume_state_success(fakeredis, monkeypatch):
    monkeypatch.setattr(google_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    state = "some-state"
    await fakeredis.set(google_auth_service._state_key(state), json.dumps({"v": "1", "verifier": "verifier-123"}))

    payload = await google_auth_service.consume_state(state)

    assert payload["v"] == "1"
    assert payload["verifier"] == "verifier-123"
    assert await fakeredis.get(google_auth_service._state_key(state)) is None


async def test_consume_state_missing(fakeredis, monkeypatch):
    monkeypatch.setattr(google_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    with pytest.raises(HTTPException) as exc:
        await google_auth_service.consume_state("invalid-state")
    assert exc.value.status_code == 400


async def test_link_google_to_user_success(fakeredis, monkeypatch, mock_db_session):
    monkeypatch.setattr(google_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    monkeypatch.setattr(google_auth_service.httpx, "AsyncClient", MockGoogleClient)

    state = "some-state"
    await fakeredis.set(google_auth_service._state_key(state), json.dumps({"v": "1", "user_id": "user-id-abc", "verifier": "verifier-123"}))

    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.id = "user-id-abc"
    mock_db_session.scalar.return_value = None

    await google_auth_service.link_google_to_user(mock_db_session, user, "auth-code", state)

    assert user.google_id == "google-id-123"
    assert user.google_email == "google@example.com"
    assert user.google_name == "Google User"
    assert user.google_avatar_url == "https://google.com/avatar.png"
    assert user.google_access_token == "google-access-token"
    assert user.google_refresh_token == "google-refresh-token"
    assert user.google_token_expires_at is not None
    assert await fakeredis.get(google_auth_service._state_key(state)) is None


async def test_link_google_already_linked(mock_db_session):
    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.google_id = "already-linked"

    with pytest.raises(HTTPException) as exc:
        await google_auth_service.link_google_to_user(mock_db_session, user, "code", "state")
    assert exc.value.status_code == 400


async def test_link_google_duplicate_links(fakeredis, monkeypatch, mock_db_session):
    monkeypatch.setattr(google_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
    monkeypatch.setattr(google_auth_service.httpx, "AsyncClient", MockGoogleClient)

    state = "some-state"
    await fakeredis.set(google_auth_service._state_key(state), json.dumps({"v": "1", "user_id": "user-id-abc"}))

    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.id = "user-id-abc"

    existing_linked_user = User(email="other@example.com", username="other", hashed_password="pwd")
    existing_linked_user.id = "other-user-id"
    mock_db_session.scalar.return_value = existing_linked_user

    with pytest.raises(HTTPException) as exc:
        await google_auth_service.link_google_to_user(mock_db_session, user, "code", state)
    assert exc.value.status_code == 409


async def test_unlink_google_success(mock_db_session):
    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.google_id = "google-id-123"
    user.google_email = "google@example.com"
    user.google_access_token = "token"

    await google_auth_service.unlink_google_from_user(mock_db_session, user)

    assert user.google_id is None
    assert user.google_email is None
    assert user.google_access_token is None


async def test_unlink_google_not_linked(mock_db_session):
    user = User(email="user@example.com", username="user", hashed_password="pwd")

    with pytest.raises(HTTPException) as exc:
        await google_auth_service.unlink_google_from_user(mock_db_session, user)
    assert exc.value.status_code == 400


async def test_get_user_google_access_token_valid(monkeypatch):
    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.google_access_token = "current-valid-token"
    user.google_refresh_token = "refresh"
    user.google_token_expires_at = datetime.now(UTC) + timedelta(minutes=10)

    token = await google_auth_service.get_user_google_access_token(user)

    assert token == "current-valid-token"


async def test_get_user_google_access_token_refresh(monkeypatch):
    monkeypatch.setattr(google_auth_service.httpx, "AsyncClient", MockGoogleClient)
    user = User(email="user@example.com", username="user", hashed_password="pwd")
    user.google_access_token = "old-expired-token"
    user.google_refresh_token = "refresh"
    user.google_token_expires_at = datetime.now(UTC) - timedelta(minutes=1)

    token = await google_auth_service.get_user_google_access_token(user)

    assert token == "new-access-token"
    assert user.google_access_token == "new-access-token"
    assert user.google_token_expires_at > datetime.now(UTC)
