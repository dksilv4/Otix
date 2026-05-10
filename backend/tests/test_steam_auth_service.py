from __future__ import annotations

import urllib.parse
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from otix.infrastructure.config import settings
from otix.services import steam_auth_service


def _parse_auth_url(url: str) -> dict[str, str]:
    parsed = urllib.parse.urlparse(url)
    return dict(urllib.parse.parse_qsl(parsed.query))


def _parse_return_to(auth_url: str) -> dict[str, str]:
    params = _parse_auth_url(auth_url)
    return_to = urllib.parse.urlparse(params["openid.return_to"])
    return dict(urllib.parse.parse_qsl(return_to.query))


class TestSteamAuthUrl:
    async def test_login_url_embeds_state_in_return_to(self, fakeredis, monkeypatch):
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:5173")

        url, state = await steam_auth_service.build_steam_login_url()

        params = _parse_auth_url(url)
        return_to_query = _parse_return_to(url)

        assert params["openid.return_to"].startswith("http://localhost:5173/auth/steam/callback")
        assert return_to_query["state"] == state
        assert await fakeredis.get(steam_auth_service._state_key(state)) == "1"

    async def test_link_url_embeds_state_in_connect_return_to(self, fakeredis, monkeypatch):
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        monkeypatch.setattr(settings, "frontend_base_url", "http://localhost:5173")

        url, state = await steam_auth_service.build_steam_link_url()

        params = _parse_auth_url(url)
        return_to_query = _parse_return_to(url)

        assert params["openid.return_to"].startswith("http://localhost:5173/auth/steam/connect/callback")
        assert return_to_query["state"] == state
        assert await fakeredis.get(steam_auth_service._link_state_key(state)) == "1"


class TestSteamCallbackValidation:
    def test_raw_validation_body_preserves_signed_fields(self):
        raw_query = (
            "state=abc"
            "&openid.ns=http%3A%2F%2Fspecs.openid.net%2Fauth%2F2.0"
            "&openid.mode=id_res"
            "&openid.sig=a%2Bb%2Fc%3D"
        )

        body = steam_auth_service._validation_body({}, raw_query)

        assert "state=abc" not in body
        assert "openid.mode=check_authentication" in body
        assert "openid.sig=a%2Bb%2Fc%3D" in body

    async def test_login_callback_requires_state(self, monkeypatch):
        validate = AsyncMock(return_value="76561198000000000")
        monkeypatch.setattr(steam_auth_service, "_validate_openid_response", validate)

        with pytest.raises(HTTPException) as exc:
            await steam_auth_service.validate_steam_callback({"openid.mode": "id_res"})

        assert exc.value.status_code == 400
        validate.assert_not_awaited()

    async def test_login_callback_rejects_unknown_state(self, fakeredis, monkeypatch):
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        validate = AsyncMock(return_value="76561198000000000")
        monkeypatch.setattr(steam_auth_service, "_validate_openid_response", validate)

        with pytest.raises(HTTPException) as exc:
            await steam_auth_service.validate_steam_callback({"state": "missing", "openid.mode": "id_res"})

        assert exc.value.status_code == 400
        validate.assert_not_awaited()

    async def test_login_callback_consumes_state_once(self, fakeredis, monkeypatch):
        state = "known-state"
        await fakeredis.set(steam_auth_service._state_key(state), "1")
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        validate = AsyncMock(return_value="76561198000000000")
        monkeypatch.setattr(steam_auth_service, "_validate_openid_response", validate)

        steam_id = await steam_auth_service.validate_steam_callback({"state": state, "openid.mode": "id_res"})

        assert steam_id == "76561198000000000"
        assert await fakeredis.get(steam_auth_service._state_key(state)) is None
        validate.assert_awaited_once()

    async def test_link_callback_uses_link_state_namespace(self, fakeredis, monkeypatch):
        state = "link-state"
        await fakeredis.set(steam_auth_service._link_state_key(state), "1")
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        validate = AsyncMock(return_value="76561198000000001")
        monkeypatch.setattr(steam_auth_service, "_validate_openid_response", validate)

        steam_id = await steam_auth_service.validate_steam_link_callback({"state": state, "openid.mode": "id_res"})

        assert steam_id == "76561198000000001"
        assert await fakeredis.get(steam_auth_service._link_state_key(state)) is None
        validate.assert_awaited_once()

    async def test_link_callback_can_read_state_from_raw_query(self, fakeredis, monkeypatch):
        state = "link-state"
        await fakeredis.set(steam_auth_service._link_state_key(state), "1")
        monkeypatch.setattr(steam_auth_service, "get_redis", AsyncMock(return_value=fakeredis))
        validate = AsyncMock(return_value="76561198000000001")
        monkeypatch.setattr(steam_auth_service, "_validate_openid_response", validate)

        steam_id = await steam_auth_service.validate_steam_link_callback(
            {},
            f"state={state}&openid.mode=id_res",
        )

        assert steam_id == "76561198000000001"
        assert await fakeredis.get(steam_auth_service._link_state_key(state)) is None
        validate.assert_awaited_once_with({}, f"state={state}&openid.mode=id_res")
