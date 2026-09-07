"""Endpoint tests for the Plex OAuth link + login families.

Exercises the /auth/oauth/plex + /auth/plex surface against the real URLconf
with the outbound Plex.tv HTTP leaf (``oauth._request``) mocked. The PIN
create/poll and user-profile calls are canned by URL/method; the DB state
store, column writes, user find-or-create and session bootstrap all run for
real.
"""

from __future__ import annotations

import json
import urllib.parse
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.accounts.services import oauth as oauth_service

PLEX_SETTINGS = dict(FRONTEND_BASE_URL="http://localhost:5173")


def _pin_create_reply(status=200, **overrides):
    body = {"id": "pin-123", "code": "ABCD1234", "expiresIn": 900}
    body.update(overrides)
    return status, json.dumps(body)


def _pin_get_reply(status=200, *, approved=True, **overrides):
    body = {"id": "pin-123", "code": "ABCD1234"}
    if approved:
        body["authToken"] = "plex-auth-token"
    body.update(overrides)
    return status, json.dumps(body)


def _profile_reply(status=200, **overrides):
    body = {
        "id": "9001",
        "uuid": "xxxx-9001",
        "username": "plexuser",
        "email": "plex@example.com",
        "thumb": "http://example.com/plex-thumb.png",
        "title": "Plex User",
    }
    body.update(overrides)
    return status, json.dumps(body)


def _store_state(*, key: str, pin_id: str, user_id: int | None = None) -> None:
    payload = {"v": "1", "pin_id": pin_id}
    if user_id is not None:
        payload["user_id"] = user_id
    else:
        payload["flow"] = "login"
    OAuthState.objects.create(key=key, payload=payload)


def _mock_plex(
    *,
    pin_create=200,
    pin_get=200,
    approved=True,
    profile=200,
    profile_body=None,
    raise_on=None,
):
    """Patch ``oauth._request`` to answer the Plex.tv call sequence."""

    def fake_request(url, *, method="GET", form=None, headers=None, timeout=15.0):
        if raise_on is not None and raise_on in url:
            raise oauth_service.OAuthProviderError("connection refused")
        if "/api/v2/pins" in url and method == "POST":
            return _pin_create_reply(status=pin_create)
        if "/api/v2/user" in url:
            if profile_body is not None:
                return profile, json.dumps(profile_body)
            return _profile_reply(status=profile)
        # GET /api/v2/pins/{id}
        if "/api/v2/pins/" in url:
            return _pin_get_reply(status=pin_get, approved=approved)
        raise AssertionError(f"unexpected request url: {url}")

    return patch.object(oauth_service, "_request", side_effect=fake_request)


class PlexLinkInitiateTests(TestCase):
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

    def test_initiate_returns_auth_url_state_and_pin(self) -> None:
        with _mock_plex():
            response = self._authed().post("/api/v1/auth/oauth/plex")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            sorted(response.data.keys()), ["auth_url", "pin_id", "state"]
        )
        self.assertEqual(response.data["pin_id"], "pin-123")
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith("https://app.plex.tv/auth#?"))
        fragment = dict(urllib.parse.parse_qsl(auth_url.split("#?", 1)[1]))
        self.assertEqual(fragment["code"], "ABCD1234")
        self.assertEqual(fragment["clientID"], "otix-web")
        self.assertEqual(fragment["context[device][product]"], "Otix")
        state = response.data["state"]
        forward = dict(urllib.parse.parse_qsl(fragment["forwardUrl"].split("?", 1)[1]))
        self.assertEqual(forward["state"], state)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["pin_id"], "pin-123")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    def test_initiate_400_when_already_linked(self) -> None:
        self.user.plex_id = "9001"
        self.user.save(update_fields=("plex_id",))
        with patch.object(oauth_service, "_request") as mock_request:
            response = self._authed().post("/api/v1/auth/oauth/plex")
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Plex account already linked")

    def test_initiate_pin_create_non200_502(self) -> None:
        with _mock_plex(pin_create=500):
            response = self._authed().post("/api/v1/auth/oauth/plex")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"], "Unable to start Plex linking. Please try again."
        )

    def test_initiate_pin_missing_code_502(self) -> None:
        with _mock_plex(pin_create=200) as patcher:
            patcher.side_effect = lambda *a, **k: _pin_create_reply(
                id="pin-123", code=""
            )
            response = self._authed().post("/api/v1/auth/oauth/plex")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"],
            "Plex returned an invalid linking response. Please try again.",
        )

    def test_initiate_unauthed_401(self) -> None:
        with _mock_plex():
            response = APIClient().post("/api/v1/auth/oauth/plex")
        self.assertEqual(response.status_code, 401)


class PlexLinkCallbackTests(TestCase):
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

    def test_callback_links_plex_to_state_owner(self) -> None:
        _store_state(key="plex-state-a", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex():
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-a", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Plex account linked successfully")
        self.user.refresh_from_db()
        self.assertEqual(self.user.plex_id, "9001")
        self.assertEqual(self.user.plex_username, "plexuser")
        self.assertEqual(self.user.plex_email, "plex@example.com")
        self.assertEqual(self.user.plex_thumb, "http://example.com/plex-thumb.png")
        self.assertEqual(self.user.plex_auth_token, "plex-auth-token")
        self.assertFalse(OAuthState.objects.filter(key="plex-state-a").exists())

    def test_callback_resolves_authenticated_user_first(self) -> None:
        _store_state(key="plex-state-b", pin_id="pin-123")  # no user_id
        with _mock_plex():
            response = self._authed().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-b", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plex_id, "9001")

    def test_callback_unauthed_with_state_owner_links(self) -> None:
        _store_state(key="plex-state-c", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex():
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-c", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.plex_id, "9001")

    def test_callback_unauthed_no_state_user_401(self) -> None:
        _store_state(key="plex-state-d", pin_id="pin-123")  # no user_id
        with _mock_plex():
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-d", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 401)
        self.assertEqual(
            response.data["detail"],
            "Authentication required. Please sign in and try again.",
        )

    def test_callback_bad_state_400(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/oauth/plex/callback",
            {"state": "bogus", "pin_id": "pin-123"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Plex linking session expired. Please try again."
        )

    def test_callback_pin_mismatch_400(self) -> None:
        _store_state(key="plex-state-e", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex():
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-e", "pin_id": "pin-other"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Invalid Plex linking session. Please try again."
        )

    def test_callback_already_linked_400(self) -> None:
        self.user.plex_id = "9009"
        self.user.save(update_fields=("plex_id",))
        _store_state(key="plex-state-f", pin_id="pin-123", user_id=self.user.pk)
        with patch.object(oauth_service, "_request") as mock_request:
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-f", "pin_id": "pin-123"},
                format="json",
            )
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Plex account already linked")

    def test_callback_unapproved_pin_400(self) -> None:
        _store_state(key="plex-state-g", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex(approved=False):
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-g", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Plex has not approved this link yet. Please finish signing in.",
        )

    def test_callback_plex_id_on_other_account_409(self) -> None:
        other = User.objects.create_user(
            username="other", email="other@example.com", password="Correct-Horse-2"
        )
        other.plex_id = "9001"
        other.save(update_fields=("plex_id",))
        _store_state(key="plex-state-h", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex():
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-h", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "This Plex account is already linked to another Otix account.",
        )

    def test_callback_user_info_non200_502(self) -> None:
        _store_state(key="plex-state-i", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex(profile=500):
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-i", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"],
            "Unable to fetch Plex account details. Please try again.",
        )

    def test_callback_network_failure_502(self) -> None:
        _store_state(key="plex-state-j", pin_id="pin-123", user_id=self.user.pk)
        with _mock_plex(raise_on="/api/v2/pins/"):
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-j", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"], "Unable to verify with Plex. Please try again."
        )

    def test_callback_unexpected_error_500(self) -> None:
        _store_state(key="plex-state-k", pin_id="pin-123", user_id=self.user.pk)

        def boom(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise ValueError("boom")

        with patch.object(oauth_service, "_request", side_effect=boom):
            response = APIClient().post(
                "/api/v1/auth/oauth/plex/callback",
                {"state": "plex-state-k", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.data["detail"], "Failed to link Plex account. Please try again."
        )


class PlexDisconnectTests(TestCase):
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

    def test_disconnect_null_columns(self) -> None:
        self.user.plex_id = "9001"
        self.user.plex_username = "plexuser"
        self.user.plex_email = "plex@example.com"
        self.user.plex_thumb = "http://t"
        self.user.plex_auth_token = "at"
        self.user.save()
        response = self._authed().delete("/api/v1/auth/oauth/plex/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.data["message"], "Plex account unlinked successfully"
        )
        self.user.refresh_from_db()
        self.assertIsNone(self.user.plex_id)
        self.assertIsNone(self.user.plex_username)
        self.assertIsNone(self.user.plex_email)
        self.assertIsNone(self.user.plex_thumb)
        self.assertIsNone(self.user.plex_auth_token)

    def test_disconnect_never_linked_400(self) -> None:
        response = self._authed().delete("/api/v1/auth/oauth/plex/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "No Plex account linked")


class PlexLoginTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_login_initiate_returns_url_state_pin(self) -> None:
        with _mock_plex():
            response = self.client.post("/api/v1/auth/plex/initiate")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            sorted(response.data.keys()), ["auth_url", "pin_id", "state"]
        )
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith("https://app.plex.tv/auth#?"))
        state = response.data["state"]
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["pin_id"], "pin-123")
        self.assertEqual(row.payload["flow"], "login")

    def test_login_initiate_pin_create_error_502(self) -> None:
        with _mock_plex(pin_create=500):
            response = self.client.post("/api/v1/auth/plex/initiate")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(
            response.data["detail"], "Unable to start Plex login. Please try again."
        )

    def test_login_initiate_unexpected_error_500(self) -> None:
        def boom(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise ValueError("boom")

        with patch.object(oauth_service, "_request", side_effect=boom):
            response = self.client.post("/api/v1/auth/plex/initiate")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.data["detail"], "Failed to start Plex login. Please try again."
        )

    def test_login_callback_creates_user_and_session(self) -> None:
        _store_state(key="plex-login-a", pin_id="pin-123")
        with _mock_plex(profile_body={"id": "9002", "username": "plexlogin"}):
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-a", "pinId": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["token_type"], "bearer")
        self.assertTrue(response.data["access_token"])
        user = User.objects.get(plex_id="9002")
        self.assertEqual(user.username, "plexlogin")
        self.assertTrue(user.is_verified)
        self.assertEqual(user.plex_auth_token, "plex-auth-token")
        self.assertIn("otix_refresh", response.cookies)
        self.assertFalse(OAuthState.objects.filter(key="plex-login-a").exists())

    def test_login_callback_existing_user_reuses_account(self) -> None:
        user = User.objects.create_user(
            username="plexlogin", email="plex@example.com", password="x"
        )
        user.plex_id = "9002"
        user.save(update_fields=("plex_id",))
        _store_state(key="plex-login-b", pin_id="pin-123")
        with _mock_plex(profile_body={"id": "9002", "username": "plexlogin"}):
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-b", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access_token"])
        self.assertEqual(User.objects.filter(plex_id="9002").count(), 1)

    def test_login_callback_deactivated_account_403(self) -> None:
        user = User.objects.create_user(
            username="plexlogin", email="plex@example.com", password="x"
        )
        user.plex_id = "9002"
        user.is_active = False
        user.save(update_fields=("plex_id", "is_active"))
        _store_state(key="plex-login-c", pin_id="pin-123")
        with _mock_plex(profile_body={"id": "9002", "username": "plexlogin"}):
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-c", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Account is deactivated")

    def test_login_callback_missing_state_400(self) -> None:
        response = self.client.post(
            "/api/v1/auth/plex/callback", {"pin_id": "pin-123"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Missing state parameter.")

    def test_login_callback_bad_state_400(self) -> None:
        with _mock_plex():
            response = self.client.post(
                "/api/v1/auth/plex/callback", {"state": "bogus"}, format="json"
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Plex linking session expired. Please try again."
        )

    def test_login_callback_pin_mismatch_400(self) -> None:
        _store_state(key="plex-login-d", pin_id="pin-123")
        with _mock_plex():
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-d", "pinId": "pin-other"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"], "Invalid Plex linking session. Please try again."
        )

    def test_login_callback_unapproved_400(self) -> None:
        _store_state(key="plex-login-e", pin_id="pin-123")
        with _mock_plex(approved=False):
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-e", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(
            response.data["detail"],
            "Plex has not approved this link yet. Please finish signing in.",
        )

    def test_login_callback_unexpected_error_500(self) -> None:
        _store_state(key="plex-login-f", pin_id="pin-123")

        def boom(url, *, method="GET", form=None, headers=None, timeout=15.0):
            raise ValueError("boom")

        with patch.object(oauth_service, "_request", side_effect=boom):
            response = self.client.post(
                "/api/v1/auth/plex/callback",
                {"state": "plex-login-f", "pin_id": "pin-123"},
                format="json",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(
            response.data["detail"], "Failed to sign in with Plex. Please try again."
        )
