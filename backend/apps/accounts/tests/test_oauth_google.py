"""Endpoint tests for the google + google-drive OAuth link family.

Exercises the /auth/oauth/* surface against the real URLconf with the outbound
Google HTTP leaf (``oauth._request``) mocked to canned token/userinfo responses
— the state store, PKCE building, column writes and error mapping all run for
real. Settings ``GOOGLE_CLIENT_ID/SECRET`` are non-empty so the 503
not-configured guard stays out of the happy path.
"""

from __future__ import annotations

import json
import urllib.parse
from datetime import timedelta
from unittest.mock import patch

from django.test import TestCase, override_settings
from django.utils import timezone
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
        "sub": "111122223333",
        "email": "gosia@example.com",
        "name": "Gosia",
        "picture": "http://example.com/gosia.png",
    }
    body.update(overrides)
    return status, json.dumps(body)


class GoogleLinkFlowTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="gosia", email="gosia@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "gosia", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    def _store_state(self, *, flow: str = "youtube", user_id: int | None = None) -> str:
        state = "s" + "0" * 31  # 32 chars, url-safe
        payload = {"v": "1", "flow": flow, "verifier": "verifier-token"}
        if user_id is not None:
            payload["user_id"] = user_id
        OAuthState.objects.create(key=state, payload=payload)
        return state

    def _mock_google(self, *, token_status: int = 200, profile_status: int = 200):
        def fake_request(url, *, method="GET", form=None, headers=None, timeout=15.0):
            if "userinfo" in url:
                return _profile_reply(status=profile_status)
            return _token_reply(status=token_status)

        return patch.object(oauth_service, "_request", side_effect=fake_request)

    @override_settings(**GOOGLE_SETTINGS)
    def test_initiate_returns_auth_url_and_stores_state(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/google")
        self.assertEqual(response.status_code, 200)
        auth_url = response.data["auth_url"]
        state = response.data["state"]
        self.assertTrue(auth_url.startswith("https://accounts.google.com/o/oauth2/v2/auth?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        self.assertEqual(params["access_type"], "offline")
        self.assertEqual(params["prompt"], "consent")
        self.assertEqual(params["code_challenge_method"], "S256")
        self.assertEqual(params["response_type"], "code")
        self.assertIn("https://www.googleapis.com/auth/youtube", params["scope"])
        self.assertEqual(params["state"], state)
        self.assertIn("code_challenge", params)
        self.assertEqual(params["redirect_uri"], "http://localhost:5173/auth/callback/google")
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "youtube")
        self.assertEqual(row.payload["user_id"], self.user.pk)
        self.assertIn("verifier", row.payload)

    @override_settings(GOOGLE_CLIENT_ID="", GOOGLE_CLIENT_SECRET="")
    def test_initiate_503_when_unconfigured(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/google")
        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.data["detail"], "Google authentication is not configured.")

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_links_google_to_state_owner(self) -> None:
        state = self._store_state(user_id=self.user.pk)
        with self._mock_google():
            response = APIClient().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Google account linked successfully")
        self.user.refresh_from_db()
        self.assertEqual(self.user.google_id, "111122223333")
        self.assertEqual(self.user.google_email, "gosia@example.com")
        self.assertEqual(self.user.google_name, "Gosia")
        self.assertEqual(self.user.google_avatar_url, "http://example.com/gosia.png")
        self.assertEqual(self.user.google_access_token, "google-access-token")
        self.assertEqual(self.user.google_refresh_token, "google-refresh-token")
        self.assertIsNotNone(self.user.google_token_expires_at)
        self.assertFalse(OAuthState.objects.filter(key=state).exists())

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_resolves_authenticated_user_first(self) -> None:
        state = self._store_state()  # no user_id in state
        with self._mock_google():
            response = self._authed().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.google_id, "111122223333")

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/oauth/google/callback",
            {"code": "auth-code", "state": "bogus"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Google linking session expired. Please try again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_already_linked_400_before_exchange(self) -> None:
        self.user.google_id = "already-set"
        self.user.save(update_fields=("google_id",))
        state = self._store_state(user_id=self.user.pk)
        with patch.object(oauth_service, "_request") as mock_request:
            response = APIClient().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Google account already linked")

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_google_id_on_other_account_409(self) -> None:
        other = User.objects.create_user(
            username="other", email="other@example.com", password="Correct-Horse-2"
        )
        other.google_id = "111122223333"
        other.save(update_fields=("google_id",))
        state = self._store_state(user_id=self.user.pk)
        with self._mock_google():
            response = APIClient().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "This Google account is already linked to another Otix account.",
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_token_exchange_non200_400(self) -> None:
        state = self._store_state(user_id=self.user.pk)
        with self._mock_google(token_status=500):
            response = APIClient().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 400)  # non-200 exchange -> 400 string
        self.assertEqual(
            response.data["detail"], "Google authorization failed. Please try linking again."
        )

    @override_settings(**GOOGLE_SETTINGS)
    def test_callback_network_failure_502(self) -> None:
        state = self._store_state(user_id=self.user.pk)

        def raise_network(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise oauth_service.OAuthProviderError("connection refused")

        with patch.object(oauth_service, "_request", side_effect=raise_network):
            response = APIClient().post(
                "/api/v1/auth/oauth/google/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Unable to connect to Google. Please try again.")


class GoogleDriveLinkFlowTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="gosia", email="gosia@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "gosia", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    def _store_state(self) -> str:
        state = "d" + "1" * 31
        OAuthState.objects.create(
            key=state,
            payload={"v": "1", "flow": "drive", "verifier": "verifier", "user_id": self.user.pk},
        )
        return state

    @override_settings(**GOOGLE_SETTINGS)
    def test_drive_initiate_uses_drive_scope(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/google-drive")
        self.assertEqual(response.status_code, 200)
        auth_url = response.data["auth_url"]
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        self.assertIn("https://www.googleapis.com/auth/drive.file", params["scope"])
        self.assertEqual(params["redirect_uri"], "http://localhost:5173/auth/callback/google-drive")
        state = OAuthState.objects.get(key=response.data["state"])
        self.assertEqual(state.payload["flow"], "drive")

    @override_settings(**GOOGLE_SETTINGS)
    def test_drive_callback_writes_drive_columns_no_profile_fetch(self) -> None:
        state = self._store_state()
        with self._mock_google():
            response = APIClient().post(
                "/api/v1/auth/oauth/google-drive/callback",
                {"code": "auth-code", "state": state},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Google Drive linked successfully")
        self.user.refresh_from_db()
        self.assertEqual(self.user.drive_access_token, "google-access-token")
        self.assertEqual(self.user.drive_refresh_token, "google-refresh-token")
        self.assertIsNotNone(self.user.drive_token_expires_at)
        self.assertIsNone(self.user.google_id)  # drive link never touches google cols

    def _mock_google(self):
        def fake_request(url, *, method="GET", form=None, headers=None, timeout=15.0):
            return 200, json.dumps(
                {
                    "access_token": "google-access-token",
                    "refresh_token": "google-refresh-token",
                    "expires_in": 3600,
                }
            )

        return patch.object(oauth_service, "_request", side_effect=fake_request)

    @override_settings(**GOOGLE_SETTINGS)
    def test_drive_disconnect_null_columns(self) -> None:
        self.user.drive_access_token = "at"
        self.user.drive_refresh_token = "rt"
        self.user.save(update_fields=("drive_access_token", "drive_refresh_token"))
        response = self._authed().delete("/api/v1/auth/oauth/google-drive/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Google Drive account unlinked successfully")
        self.user.refresh_from_db()
        self.assertIsNone(self.user.drive_refresh_token)

    @override_settings(**GOOGLE_SETTINGS)
    def test_drive_disconnect_never_linked_400(self) -> None:
        response = self._authed().delete("/api/v1/auth/oauth/google-drive/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "No Google Drive account linked")


class GoogleTokenViewTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="gosia", email="gosia@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "gosia", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(**GOOGLE_SETTINGS)
    def test_token_returned_from_cache_when_fresh(self) -> None:
        self.user.google_refresh_token = "rt"
        self.user.google_access_token = "cached-at"
        self.user.google_token_expires_at = timezone.now() + timedelta(minutes=5)
        self.user.save(
            update_fields=(
                "google_refresh_token",
                "google_access_token",
                "google_token_expires_at",
            )
        )
        with patch.object(oauth_service, "_request") as mock_request:
            response = self._authed().get("/api/v1/auth/oauth/google/token")
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["access_token"], "cached-at")

    @override_settings(**GOOGLE_SETTINGS)
    def test_token_refreshes_when_expired(self) -> None:
        self.user.google_refresh_token = "rt"
        self.user.google_access_token = "stale-at"
        self.user.google_token_expires_at = timezone.now() - timedelta(seconds=10)
        self.user.save(
            update_fields=(
                "google_refresh_token",
                "google_access_token",
                "google_token_expires_at",
            )
        )
        with self._mock_token(_token_reply(access_token="fresh-at")):
            response = self._authed().get("/api/v1/auth/oauth/google/token")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["access_token"], "fresh-at")
        self.user.refresh_from_db()
        self.assertEqual(self.user.google_access_token, "fresh-at")
        self.assertGreater(self.user.google_token_expires_at, timezone.now())

    @override_settings(**GOOGLE_SETTINGS)
    def test_token_revoked_unlinks_and_404s(self) -> None:
        from apps.social.models import Notification

        self.user.google_id = "111122223333"
        self.user.google_refresh_token = "rt"
        self.user.google_token_expires_at = timezone.now() - timedelta(seconds=10)
        self.user.save(
            update_fields=("google_id", "google_refresh_token", "google_token_expires_at")
        )
        with self._mock_token((400, json.dumps({"error": "invalid_grant"}))):
            response = self._authed().get("/api/v1/auth/oauth/google/token")
        self.assertEqual(response.status_code, 404)
        self.assertEqual(
            response.data["detail"], "Google account is not linked or token has expired."
        )
        self.user.refresh_from_db()
        self.assertIsNone(self.user.google_id)
        self.assertIsNone(self.user.google_refresh_token)
        note = Notification.objects.get(user=self.user, type="integration_disconnected")
        self.assertEqual(note.metadata_json["provider"], "google")
        self.assertEqual(note.title, "Google disconnected")

    @override_settings(**GOOGLE_SETTINGS)
    def test_token_404_when_never_linked(self) -> None:
        response = self._authed().get("/api/v1/auth/oauth/google/token")
        self.assertEqual(response.status_code, 404)

    def _mock_token(self, reply):
        def fake_request(url, *, method="GET", form=None, headers=None, timeout=15.0):
            return reply if isinstance(reply, tuple) else (200, json.dumps(reply))

        return patch.object(oauth_service, "_request", side_effect=fake_request)


class GoogleDisconnectTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="gosia", email="gosia@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "gosia", "password": "Correct-Horse-1"},
            format="json",
        )
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {login.data['access_token']}")

    @override_settings(**GOOGLE_SETTINGS)
    def test_disconnect_null_columns(self) -> None:
        self.user.google_id = "111122223333"
        self.user.google_refresh_token = "rt"
        self.user.save(update_fields=("google_id", "google_refresh_token"))
        response = self.client.delete("/api/v1/auth/oauth/google/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Google account unlinked successfully")
        self.user.refresh_from_db()
        self.assertIsNone(self.user.google_id)
        self.assertIsNone(self.user.google_refresh_token)

    @override_settings(**GOOGLE_SETTINGS)
    def test_disconnect_never_linked_400(self) -> None:
        response = self.client.delete("/api/v1/auth/oauth/google/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "No Google account linked")
