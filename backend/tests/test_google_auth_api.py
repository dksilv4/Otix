from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from otix.api.router import api_router
from otix.domain.user import User
from otix.infrastructure.config import settings


def _make_app():
    app = FastAPI()
    app.include_router(api_router)
    return app


@pytest.fixture
def mock_db():
    session = AsyncMock()
    return session


@pytest.fixture
def current_user():
    user = User(email="test@example.com", username="testuser", hashed_password="pwd")
    user.id = "user-123"
    return user


@pytest.fixture
def app(mock_db, current_user):
    app = _make_app()
    from otix.api import deps

    async def override_get_db():
        try:
            yield mock_db
            await mock_db.commit()
        except Exception:
            await mock_db.rollback()
            raise

    app.dependency_overrides[deps.get_db] = override_get_db
    app.dependency_overrides[deps.get_current_user] = lambda: current_user
    app.dependency_overrides[deps.get_optional_user] = lambda: current_user
    yield app
    app.dependency_overrides.clear()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.build_google_link_url")
async def test_google_connect_initiate_success(mock_build_url, app):
    mock_build_url.return_value = ("https://accounts.google.com/oauth", "state-123")

    # Configure mock client settings
    with (
        patch.object(settings, "google_client_id", "some-id"),
        patch.object(settings, "google_client_secret", "some-secret"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/oauth/google")
            assert resp.status_code == 200

            data = resp.json()
            assert data["auth_url"] == "https://accounts.google.com/oauth"
            assert data["state"] == "state-123"
            mock_build_url.assert_called_once()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.build_google_link_url")
async def test_google_connect_initiate_unconfigured(mock_build_url, app):
    with patch.object(settings, "google_client_id", ""), patch.object(settings, "google_client_secret", ""):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post("/auth/oauth/google")
            assert resp.status_code == 503
            assert "Google authentication is not configured" in resp.json()["detail"]
            mock_build_url.assert_not_called()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.disconnect.unlink_google_from_user")
async def test_google_disconnect_success(mock_unlink, mock_db, current_user, app):
    mock_unlink.return_value = None

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request("DELETE", "/auth/oauth/google/disconnect")
        assert resp.status_code == 200
        assert resp.json()["message"] == "Google account unlinked successfully"

        mock_unlink.assert_awaited_once_with(mock_db, current_user)
        mock_db.commit.assert_awaited_once()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.disconnect.unlink_google_from_user")
async def test_google_disconnect_not_linked(mock_unlink, mock_db, current_user, app):
    mock_unlink.side_effect = HTTPException(status_code=400, detail="No Google account linked")

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.request("DELETE", "/auth/oauth/google/disconnect")
        assert resp.status_code == 400
        assert resp.json()["detail"] == "No Google account linked"

        mock_unlink.assert_awaited_once_with(mock_db, current_user)
        mock_db.commit.assert_not_awaited()
        mock_db.rollback.assert_awaited_once()


# ── Callback ─────────────────────────────────────────────────────


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.callback.link_google_to_user")
async def test_google_callback_success(mock_link, mock_db, current_user, app):
    mock_link.return_value = None

    with (
        patch.object(settings, "google_client_id", "some-id"),
        patch.object(settings, "google_client_secret", "some-secret"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/oauth/google/callback",
                json={"code": "auth-code-abc", "state": "state-xyz"},
            )
            assert resp.status_code == 200
            assert resp.json()["message"] == "Google account linked successfully"

            mock_link.assert_awaited_once_with(mock_db, current_user, "auth-code-abc", "state-xyz")
            mock_db.commit.assert_awaited_once()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.callback.link_google_to_user")
async def test_google_callback_unconfigured(mock_link, app):
    with patch.object(settings, "google_client_id", ""), patch.object(settings, "google_client_secret", ""):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/oauth/google/callback",
                json={"code": "auth-code-abc", "state": "state-xyz"},
            )
            assert resp.status_code == 503
            assert "Google authentication is not configured" in resp.json()["detail"]
            mock_link.assert_not_awaited()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.callback.link_google_to_user")
async def test_google_callback_http_exception_passthrough(mock_link, mock_db, current_user, app):
    mock_link.side_effect = HTTPException(status_code=409, detail="Google account already linked to another user")

    with (
        patch.object(settings, "google_client_id", "some-id"),
        patch.object(settings, "google_client_secret", "some-secret"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/oauth/google/callback",
                json={"code": "auth-code-abc", "state": "state-xyz"},
            )
            assert resp.status_code == 409
            assert resp.json()["detail"] == "Google account already linked to another user"

            mock_db.rollback.assert_awaited_once()
            mock_db.commit.assert_not_awaited()


@pytest.mark.anyio
@patch("otix.api.auth.oauth.google.callback.link_google_to_user")
async def test_google_callback_generic_error(mock_link, mock_db, current_user, app):
    mock_link.side_effect = RuntimeError("token exchange failed")

    with (
        patch.object(settings, "google_client_id", "some-id"),
        patch.object(settings, "google_client_secret", "some-secret"),
    ):
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            resp = await client.post(
                "/auth/oauth/google/callback",
                json={"code": "bad-code", "state": "state-xyz"},
            )
            assert resp.status_code == 500
            assert "Failed to link Google account" in resp.json()["detail"]

            mock_db.rollback.assert_awaited_once()
            mock_db.commit.assert_not_awaited()
