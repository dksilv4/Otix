"""Endpoint tests for the Steam OAuth link + login families.

Covers POST /auth/oauth/steam (initiate + callback + disconnect) and the
unauthed POST /auth/steam/initiate + /auth/steam/callback login family,
against the real URLconf. The outbound leaf (``oauth._request``) is mocked:
the Steam OpenID check_authentication replay answers ``is_valid:true`` and
GetPlayerSummaries returns a canned player when a key is configured. The DB
state store, find-or-create, column writes and session bootstrap run for real.
"""

from __future__ import annotations

import json
import urllib.parse
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.accounts.services import oauth as oauth_service

STEAM_SETTINGS = dict(
    FRONTEND_BASE_URL="http://localhost:5173",
    STEAM_API_KEY="test-steam-key",
)

STEAM_ID = "76561197960435530"
STEAM_ID2 = "76561197960265728"


def _player_summary(*, personaname: str, avatarfull: str = "http://example.com/avatar.png") -> dict:
    return {
        "steamid": STEAM_ID,
        "personaname": personaname,
        "profileurl": f"https://steamcommunity.com/id/{personaname}/",
        "avatarfull": avatarfull,
    }


def _store_state(*, key: str, link: bool, user_id: int | None = None) -> None:
    payload = {"v": "1", "flow": "link" if link else "login"}
    if link and user_id is not None:
        payload["user_id"] = user_id
    OAuthState.objects.create(key=key, payload=payload)


def _openid_callback(
    *,
    steam_id: str = STEAM_ID,
    state: str = "steam-state",
    callback: str = "/auth/callback/steam",
) -> dict:
    """Build the body a frontend forwards after Steam redirects back."""
    claimed = f"https://steamcommunity.com/openid/id/{steam_id}"
    params = {
        "openid.ns": "http://specs.openid.net/auth/2.0",
        "openid.mode": "id_res",
        "openid.op_endpoint": "https://steamcommunity.com/openid/login",
        "openid.claimed_id": claimed,
        "openid.identity": claimed,
        "openid.return_to": f"http://localhost:5173{callback}",
        "openid.response_nonce": "2026-01-01T00:00:00Zabcdef",
        "openid.assoc_handle": "1234567890",
        "openid.signed": "op_endpoint,claimed_id,identity,return_to,response_nonce,assoc_handle",
        "openid.sig": "c2ln",
    }
    raw_query = urllib.parse.urlencode({**params, "state": state})
    return {"params": params, "raw_query": raw_query}


def _mock_steam(*, validated: bool = True, summary: dict | None = None):
    """Patch ``oauth._request`` for the OpenID replay + GetPlayerSummaries."""

    def fake_request(url, *, method="GET", form=None, data=None, headers=None, timeout=15.0):
        if url.startswith(oauth_service.STEAM_OPENID_URL):
            return 200, "is_valid:true" if validated else "is_valid:false"
        if oauth_service.STEAM_API_BASE in url:
            body = {"response": {"players": [summary] if summary is not None else []}}
            return 200, json.dumps(body)
        raise AssertionError(f"unexpected request url: {url}")

    return patch.object(oauth_service, "_request", side_effect=fake_request)


class SteamLinkInitiateTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="steamlover", email="steamlover@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "steamlover", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(**STEAM_SETTINGS)
    def test_initiate_returns_auth_url_and_state(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/steam")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith(oauth_service.STEAM_OPENID_URL + "?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        self.assertEqual(params["openid.mode"], "checkid_setup")
        self.assertEqual(params["openid.realm"], "http://localhost:5173")
        self.assertIn("/auth/callback/steam-connect", params["openid.return_to"])
        return_to_params = dict(urllib.parse.parse_qsl(params["openid.return_to"].split("?", 1)[1]))
        self.assertEqual(return_to_params["state"], state)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "link")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    @override_settings(**STEAM_SETTINGS)
    def test_initiate_carries_source_into_return_to(self) -> None:
        response = self._authed().post(
            "/api/v1/auth/oauth/steam", {"source": "settings"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        params = dict(urllib.parse.parse_qsl(response.data["auth_url"].split("?", 1)[1]))
        self.assertIn("source=settings", params["openid.return_to"])

    def test_initiate_400_when_already_linked(self) -> None:
        self.user.steam_id = STEAM_ID
        self.user.save(update_fields=("steam_id",))
        response = self._authed().post("/api/v1/auth/oauth/steam")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Steam account already linked")

    def test_initiate_unauthed_401(self) -> None:
        response = APIClient().post("/api/v1/auth/oauth/steam")
        self.assertEqual(response.status_code, 401)


class SteamLinkCallbackTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="steamlover", email="steamlover@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "steamlover", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(**STEAM_SETTINGS)
    def test_callback_links_steam_to_state_owner(self) -> None:
        _store_state(key="steam-link-a", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-a", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Steam account linked successfully")
        self.user.refresh_from_db()
        self.assertEqual(self.user.steam_id, STEAM_ID)
        self.assertFalse(OAuthState.objects.filter(key="steam-link-a").exists())

    @override_settings(**STEAM_SETTINGS)
    def test_callback_resolves_authenticated_user_first(self) -> None:
        _store_state(key="steam-link-b", link=True)  # no user_id
        body = _openid_callback(state="steam-link-b", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = self._authed().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.steam_id, STEAM_ID)

    @override_settings(**STEAM_SETTINGS)
    def test_callback_unauthed_no_state_user_401(self) -> None:
        _store_state(key="steam-link-c", link=True)  # no user_id
        body = _openid_callback(state="steam-link-c", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.data["detail"],
            "Authentication required. Please sign in and try again.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_already_linked_different_409(self) -> None:
        self.user.steam_id = STEAM_ID2
        self.user.save(update_fields=("steam_id",))
        _store_state(key="steam-link-d", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-d", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "Your account is already linked to a different Steam account. Unlink it first.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_steam_claimed_by_another_account_409(self) -> None:
        other = User.objects.create_user(
            username="othersteam", email="other@example.com", password="Correct-Horse-1"
        )
        other.steam_id = STEAM_ID
        other.save(update_fields=("steam_id",))
        _store_state(key="steam-link-e", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-e", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "This Steam account is already linked to another Otix account.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        body = _openid_callback(state="bogus", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Steam authentication session expired. Please try signing in again.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_wrong_mode_400(self) -> None:
        _store_state(key="steam-link-f", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-f", callback="/auth/callback/steam-connect")
        body["params"]["openid.mode"] = "checkid_setup"
        body["params"]["state"] = "steam-link-f"
        body["raw_query"] = urllib.parse.urlencode(body["params"])
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Invalid Steam response: missing or incorrect openid.mode",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_invalid_claimed_id_400(self) -> None:
        _store_state(key="steam-link-g", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-g", callback="/auth/callback/steam-connect")
        body["params"]["openid.claimed_id"] = "https://steamcommunity.com/openid/id/abc"
        body["params"]["openid.identity"] = "https://steamcommunity.com/openid/id/abc"
        body["params"]["state"] = "steam-link-g"
        body["raw_query"] = urllib.parse.urlencode(body["params"])
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Invalid Steam identity in callback. Please try again."
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_steam_rejects_authentication_400(self) -> None:
        _store_state(key="steam-link-h", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-h", callback="/auth/callback/steam-connect")
        with _mock_steam(validated=False):
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Steam rejected the authentication. Please try signing in again.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_validation_network_failure_502(self) -> None:
        _store_state(key="steam-link-i", link=True, user_id=self.user.pk)
        body = _openid_callback(state="steam-link-i", callback="/auth/callback/steam-connect")
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.side_effect = oauth_service.OAuthProviderError("connection refused")
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Unable to verify with Steam. Please try again.")


class SteamDisconnectTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="steamlover", email="steamlover@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "steamlover", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    def test_disconnect_unlinks(self) -> None:
        self.user.steam_id = STEAM_ID
        self.user.save(update_fields=("steam_id",))
        response = self._authed().delete("/api/v1/auth/oauth/steam/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Steam account unlinked successfully")
        self.user.refresh_from_db()
        self.assertIsNone(self.user.steam_id)

    def test_disconnect_never_linked_400(self) -> None:
        response = self._authed().delete("/api/v1/auth/oauth/steam/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "No Steam account linked")

    def test_disconnect_unauthed_401(self) -> None:
        response = APIClient().delete("/api/v1/auth/oauth/steam/disconnect")
        self.assertEqual(response.status_code, 401)


class SteamLoginInitiateTests(TestCase):
    @override_settings(**STEAM_SETTINGS)
    def test_initiate_returns_auth_url_and_state(self) -> None:
        response = APIClient().post("/api/v1/auth/steam/initiate")
        self.assertEqual(response.status_code, 200)
        state = response.data["state"]
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith(oauth_service.STEAM_OPENID_URL + "?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        self.assertEqual(params["openid.realm"], "http://localhost:5173")
        self.assertIn("/auth/callback/steam", params["openid.return_to"])
        return_to_params = dict(urllib.parse.parse_qsl(params["openid.return_to"].split("?", 1)[1]))
        self.assertEqual(return_to_params["state"], state)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "login")
        self.assertNotIn("user_id", row.payload)


class SteamLoginCallbackTests(TestCase):
    @override_settings(**STEAM_SETTINGS)
    def test_callback_creates_user_and_session(self) -> None:
        _store_state(key="steam-login-a", link=False)
        body = _openid_callback(state="steam-login-a", callback="/auth/callback/steam")
        with _mock_steam(summary=_player_summary(personaname="CoolGuy")):
            response = APIClient().post("/api/v1/auth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["token_type"], "bearer")
        self.assertTrue(response.data["access_token"])
        self.assertIn("otix_refresh", response.cookies)
        user = User.objects.get(steam_id=STEAM_ID)
        self.assertEqual(user.username, "CoolGuy")
        self.assertEqual(user.email, f"steam_{STEAM_ID}@user.otix")
        self.assertEqual(user.avatar_url, "http://example.com/avatar.png")
        self.assertTrue(user.is_verified)
        self.assertFalse(OAuthState.objects.filter(key="steam-login-a").exists())

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")  # no steam key
    def test_callback_no_api_key_uses_fallback_username(self) -> None:
        _store_state(key="steam-login-b", link=False)
        body = _openid_callback(state="steam-login-b", callback="/auth/callback/steam")
        with patch.object(oauth_service, "_request") as mock_request:

            def only_openid_replay(
                url, *, method="GET", form=None, data=None, headers=None, timeout=15.0
            ):
                if url.startswith(oauth_service.STEAM_OPENID_URL):
                    return 200, "is_valid:true"
                raise AssertionError(f"GetPlayerSummaries must not run without an API key: {url}")

            mock_request.side_effect = only_openid_replay
            response = APIClient().post("/api/v1/auth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 200)
        user = User.objects.get(steam_id=STEAM_ID)
        self.assertEqual(user.username, f"steam_user_{STEAM_ID}")
        self.assertIsNone(user.avatar_url)

    @override_settings(**STEAM_SETTINGS)
    def test_callback_reuses_existing_user(self) -> None:
        user = User.objects.create_user(
            username="veteran", email="veteran@example.com", password="Correct-Horse-1"
        )
        user.steam_id = STEAM_ID
        user.save(update_fields=("steam_id",))
        _store_state(key="steam-login-c", link=False)
        body = _openid_callback(state="steam-login-c", callback="/auth/callback/steam")
        with _mock_steam(summary=_player_summary(personaname="Veteran")):
            response = APIClient().post("/api/v1/auth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access_token"])
        self.assertEqual(User.objects.filter(steam_id=STEAM_ID).count(), 1)
        user.refresh_from_db()
        self.assertEqual(user.username, "veteran")  # untouched

    @override_settings(**STEAM_SETTINGS)
    def test_callback_deactivated_account_403(self) -> None:
        user = User.objects.create_user(
            username="retired", email="retired@example.com", password="Correct-Horse-1"
        )
        user.steam_id = STEAM_ID
        user.is_active = False
        user.save(update_fields=("steam_id", "is_active"))
        _store_state(key="steam-login-d", link=False)
        body = _openid_callback(state="steam-login-d", callback="/auth/callback/steam")
        with _mock_steam(summary=_player_summary(personaname="Retired")):
            response = APIClient().post("/api/v1/auth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Account is deactivated")

    @override_settings(**STEAM_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        body = _openid_callback(state="bogus", callback="/auth/callback/steam")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Steam authentication session expired. Please try signing in again.",
        )

    @override_settings(**STEAM_SETTINGS)
    def test_callback_login_state_rejected_by_link_flow_400(self) -> None:
        _store_state(key="steam-login-e", link=False)  # login flow state
        body = _openid_callback(state="steam-login-e", callback="/auth/callback/steam-connect")
        with _mock_steam():
            response = APIClient().post("/api/v1/auth/oauth/steam/callback", body, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Steam authentication session expired. Please try signing in again.",
        )
