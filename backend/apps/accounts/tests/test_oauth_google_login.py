"""Endpoint tests for the Google login family (find-or-create + session).

Covers ``POST /auth/google/initiate`` and ``POST /auth/google/callback`` —
unauthed, mirroring the plex login flow. The outbound Google leaf
(``oauth._request``) is mocked to canned token/userinfo responses; the PKCE
state store, user find-or-create, column writes and session bootstrap all run
for real.
"""

from __future__ import annotations

import json
import urllib.parse
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.accounts.services import oauth as oauth_service

GOOGLE_SETTINGS = dict(
    GOOGLE_CLIENT_ID="test-client-id",
    GOOGLE_CLIENT_SECRET="test-client-secret",
    FRONTEND_BASE_URL="http://localhost:5173",
)


def _token_reply(status=200, **overrides):
    body = {
        "access_token": "google-access-token",
        "refresh_token": "google-refresh-token",
        "expires_in": 3600,
        "token_type": "Bearer",
    }
    body.update(overrides)
    return status, json.dumps(body)


def _profile_reply(status=200, **overrides):
    body = {
        "sub": "999988887777",
        "email": "newbie@example.com",
        "name": "Newbie Name",
        "picture": "http://example.com/newbie.png",
    }
    body.update(overrides)
    return status, json.dumps(body)


def _store_state(*, key: str = "glogin-state") -> str:
    OAuthState.objects.create(
        key=key, payload={"v": "1", "flow": "login", "verifier": "verifier-token"}
    )
    return key


class GoogleLoginInitiateTests(TestCase):
    @override_settings(**GOOGLE_SETTINGS)
    def test_initiate_returns_auth_url_and_login_state(self) -> None:
        response = APIClient().post("/api/v1/auth/google/initiate")
        self.assertEqual(response.status_code, 200)
        auth_url = response.data["auth_url"]
        state = response.data["state"]
        self.assertTrue(auth_url.startswith("https://accounts.google.com/o/oauth2/v2/auth?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        self.assertEqual(params["redirect_uri"], "http://localhost:5173/auth/callback/google-login")
        self.assertIn("openid", params["scope"])
        self.assertIn("email", params["scope"])
        self.assertIn("profile", params["scope"])
        self.assertNotIn("https://www.googleapis.com/auth/youtube", params["scope"])
        self.assertNotIn("https://www.googleapis.com/auth/drive.file", params["scope"])
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "login")
        self.assertNotIn("user_id", row.payload)

    @override_settings(GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET="")
    def test_initiate_503_when_unconfigured(self) -> None:
        response = APIClient().post("/api/v1/auth/google/initiate")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Google authentication is not configured.")


class GoogleLoginCallbackTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def _mock_google(self, *, token_status=200, profile_status=200):
        def fake_request(url, *, method="GET", form=None, headers=None, timeout=15.0):
            if "userinfo" in url:
                return _profile_reply(status=profile_status)
            return _token_reply(status=token_status)

        return patch.object(oauth_service, "_request", side_effect=fake_request)

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_creates_user_and_session(self) -> None:
        state = _store_state()
        with self._mock_google():
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["token_type"], "bearer")
        self.assertTrue(response.data["access_token"])
        user = User.objects.get(google_id="999988887777")
        self.assertEqual(user.username, "NewbieName")  # [^A-Za-z0-9_-] stripped
        self.assertEqual(user.google_email, "newbie@example.com")
        self.assertEqual(user.google_name, "Newbie Name")
        self.assertTrue(user.is_verified)
        self.assertEqual(user.avatar_url, "http://example.com/newbie.png")
        self.assertEqual(user.google_access_token, "google-access-token")
        self.assertEqual(user.google_refresh_token, "google-refresh-token")
        self.assertIsNotNone(user.google_token_expires_at)
        self.assertIn("otix_refresh", response.cookies)
        self.assertFalse(OAuthState.objects.filter(key=state).exists())

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_reuses_existing_user(self) -> None:
        user = User.objects.create_user(
            username="newbiename", email="existing@example.com", password="x"
        )
        user.google_id = "999988887777"
        user.google_name = "Old Name"
        user.save(update_fields=("google_id", "google_name"))
        state = _store_state(key="glogin-b")
        with self._mock_google():
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access_token"])
        self.assertEqual(User.objects.filter(google_id="999988887777").count(), 1)
        user.refresh_from_db()
        self.assertEqual(user.username, "newbiename")  # untouched

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_deactivated_account_403(self) -> None:
        user = User.objects.create_user(
            username="newbiename", email="existing@example.com", password="x"
        )
        user.google_id = "999988887777"
        user.is_active = False
        user.save(update_fields=("google_id", "is_active"))
        state = _store_state(key="glogin-c")
        with self._mock_google():
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Account is deactivated")

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        response = self.client.post(
            "/api/v1/auth/google/callback",
            {"code": "auth-code", "state": "bogus"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Google linking session expired. Please try again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_token_exchange_non200_400(self) -> None:
        state = _store_state(key="glogin-d")
        with self._mock_google(token_status=500):
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Google authorization failed. Please try linking again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_missing_access_token_502(self) -> None:
        state = _store_state(key="glogin-e")
        with self._mock_google() as patcher:
            patcher.side_effect = lambda *a, **k: _token_reply(access_token="")
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"], "Google returned an invalid response. Please try again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_profile_non200_502(self) -> None:
        state = _store_state(key="glogin-f")
        with self._mock_google(profile_status=500):
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"], "Unable to fetch Google profile. Please try again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_network_failure_502(self) -> None:
        state = _store_state(key="glogin-g")

        def raise_network(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise oauth_service.OAuthProviderError("connection refused")

        with patch.object(oauth_service, "_request", side_effect=raise_network):
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Unable to connect to Google. Please try again.")

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_unexpected_error_500(self) -> None:
        state = _store_state(key="glogin-h")

        def boom(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise ValueError("boom")

        with patch.object(oauth_service, "_request", side_effect=boom):
            response = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.data["detail"], "Failed to sign in with Google. Please try again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_login_flow_with_desktop_source(self) -> None:
        init_resp = self.client.post(
            "/api/v1/auth/google/initiate",
            {"source": "desktop"},
            format="json",
        )
        self.assertEqual(init_resp.status_code, 200)
        state = init_resp.data["state"]
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["source"], "desktop")

        with self._mock_google():
            cb_resp = self.client.post(
                "/api/v1/auth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(cb_resp.status_code, 200)
        self.assertEqual(cb_resp.data["source"], "desktop")
        self.assertTrue(cb_resp.data["access_token"])

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_via_link_endpoint_completes_login(self) -> None:
        init_resp = self.client.post("/api/v1/auth/google/initiate", format="json")
        self.assertEqual(init_resp.status_code, 200)
        state = init_resp.data["state"]

        with self._mock_google():
            cb_resp = self.client.post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(cb_resp.status_code, 200)
        self.assertIn("access_token", cb_resp.data)
        self.assertEqual(cb_resp.data["token_type"], "bearer")
        self.assertFalse(OAuthState.objects.filter(key=state).exists())
