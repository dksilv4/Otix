"""Endpoint tests for the TMDb connect/login families + the oauth aggregates.

Covers POST /auth/oauth/tmdb (initiate/callback/disconnect), the server 303 hop
GET /auth/oauth/tmdb/redirect, POST /auth/tmdb/initiate + /auth/tmdb/callback,
and the authed aggregates GET /auth/oauth + GET /auth/me/integrations — all
against the real URLconf. The outbound leaf (``oauth._request``) is mocked for
the request_token/session/account TMDb dance; the DB state store, column
writes, find-or-create and session bootstrap run for real.
"""

from __future__ import annotations

import json
import urllib.parse
from unittest.mock import patch

from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.accounts.services import oauth as oauth_service

TMDB_SETTINGS = dict(
    FRONTEND_BASE_URL="http://localhost:5173",
    TMDB_API_KEY="test-tmdb-key",
)

REQUEST_TOKEN = "rt-123"
SESSION_ID = "sess-abc"
ACCOUNT_ID = 12345


def _profile_reply(*, account_id: int = ACCOUNT_ID, **overrides) -> dict:
    body = {
        "id": account_id,
        "username": "tmdbuser",
        "name": "Tmdb User",
        "avatar": {"gravatar": {"hash": "hash123"}},
    }
    body.update(overrides)
    return body


def _store_state(
    *,
    key: str = "tmdb-state",
    request_token: str = REQUEST_TOKEN,
    link: bool,
    user_id: int | None = None,
) -> None:
    payload = {"v": "1", "request_token": request_token}
    payload["flow"] = "link" if link else "login"
    if link and user_id is not None:
        payload["user_id"] = user_id
    OAuthState.objects.create(key=key, payload=payload)


def _mock_tmdb(
    *,
    profile: dict | None = None,
    request_token: str = REQUEST_TOKEN,
    session_id: str = SESSION_ID,
    token_success: bool = True,
    session_success: bool = True,
):
    """Patch ``oauth._request`` for the token/session/account TMDb calls."""
    profile = profile if profile is not None else _profile_reply()

    def fake_request(url, *, method="GET", form=None, data=None, headers=None, timeout=15.0):
        if "authentication/token/new" in url:
            return 200, json.dumps({"success": token_success, "request_token": request_token})
        if "authentication/session/new" in url:
            body = {"success": session_success}
            if session_success:
                body["session_id"] = session_id
            return 200, json.dumps(body)
        if "/rated/" in url or "/watchlist/" in url:
            return 200, json.dumps({"total_results": 17})
        if "/account" in url:
            return 200, json.dumps(profile)
        raise AssertionError(f"unexpected request url: {url}")

    return patch.object(oauth_service, "_request", side_effect=fake_request)


class TMDbLinkInitiateTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "tmdbuser", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_returns_auth_url_and_state(self) -> None:
        with _mock_tmdb():
            response = self._authed().post("/api/v1/auth/oauth/tmdb")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith(oauth_service.TMDB_AUTH_BASE + "/rt-123?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        redirect_to = urllib.parse.unquote(params["redirect_to"])
        self.assertIn("/api/v1/auth/oauth/tmdb/redirect", redirect_to)
        self.assertIn(f"state={state}", redirect_to)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "link")
        self.assertEqual(row.payload["user_id"], self.user.pk)
        self.assertEqual(row.payload["request_token"], REQUEST_TOKEN)
        self.assertTrue(OAuthState.objects.filter(key=f"tmdb_rt:{REQUEST_TOKEN}").exists())

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_400_when_already_linked(self) -> None:
        self.user.tmdb_session_id = SESSION_ID
        self.user.save(update_fields=("tmdb_session_id",))
        with patch.object(oauth_service, "_request") as mock_request:
            response = self._authed().post("/api/v1/auth/oauth/tmdb")
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "TMDb account already linked")

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_provider_failure_502(self) -> None:
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.side_effect = oauth_service.OAuthProviderError("refused")
            response = self._authed().post("/api/v1/auth/oauth/tmdb")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Unable to start TMDb linking. Please try again.")

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_token_rejected_502(self) -> None:
        with _mock_tmdb(token_success=False):
            response = self._authed().post("/api/v1/auth/oauth/tmdb")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "TMDb returned an error. Please try again.")

    def test_initiate_unauthed_401(self) -> None:
        response = APIClient().post("/api/v1/auth/oauth/tmdb")
        self.assertEqual(response.status_code, 401)


class TMDbLinkRedirectTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )

    @override_settings(**TMDB_SETTINGS)
    def test_redirect_links_and_303s_success(self) -> None:
        _store_state(key="tmdb-redir-a", link=True, user_id=self.user.pk)
        with _mock_tmdb():
            response = self.client.get(
                "/api/v1/auth/oauth/tmdb/redirect",
                {"state": "tmdb-redir-a", "request_token": REQUEST_TOKEN, "approved": "true"},
            )
        self.assertEqual(response.status_code, 303)
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(response.url).query))
        self.assertEqual(query, {"tmdb_link": "success"})
        self.assertTrue(response.url.startswith("http://localhost:5173/?"))
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_session_id, SESSION_ID)
        self.assertEqual(self.user.tmdb_account_id, ACCOUNT_ID)
        self.assertEqual(self.user.tmdb_username, "tmdbuser")
        self.assertEqual(self.user.tmdb_avatar_hash, "hash123")

    @override_settings(**TMDB_SETTINGS)
    def test_redirect_cancelled(self) -> None:
        response = self.client.get("/api/v1/auth/oauth/tmdb/redirect", {"approved": "false"})
        self.assertEqual(response.status_code, 303)
        self.assertIn("tmdb_link=error", response.url)
        self.assertIn("message=", response.url)

    @override_settings(**TMDB_SETTINGS)
    def test_redirect_missing_params(self) -> None:
        response = self.client.get("/api/v1/auth/oauth/tmdb/redirect")
        self.assertEqual(response.status_code, 303)
        self.assertIn("tmdb_link=error", response.url)
        self.assertIn("message=", response.url)

    @override_settings(**TMDB_SETTINGS)
    def test_redirect_bad_state_303_error(self) -> None:
        with _mock_tmdb():
            response = self.client.get(
                "/api/v1/auth/oauth/tmdb/redirect",
                {"state": "bogus", "request_token": REQUEST_TOKEN},
            )
        self.assertEqual(response.status_code, 303)
        query = dict(urllib.parse.parse_qsl(urllib.parse.urlsplit(response.url).query))
        self.assertEqual(query["tmdb_link"], "error")
        self.assertIn("Failed to link TMDb account", query["message"])


class TMDbLinkCallbackTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "tmdbuser", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(**TMDB_SETTINGS)
    def test_callback_links_state_owner(self) -> None:
        _store_state(key="tmdb-cb-a", link=True, user_id=self.user.pk)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-a", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "TMDb account linked successfully")
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_session_id, SESSION_ID)
        self.assertEqual(self.user.tmdb_account_id, ACCOUNT_ID)
        self.assertEqual(self.user.tmdb_username, "tmdbuser")
        self.assertEqual(self.user.tmdb_avatar_hash, "hash123")
        self.assertFalse(OAuthState.objects.filter(key="tmdb-cb-a").exists())

    @override_settings(**TMDB_SETTINGS)
    def test_callback_authenticated_resolves_request_user(self) -> None:
        _store_state(key="tmdb-cb-b", link=True)  # no user_id -> authed user wins
        with _mock_tmdb():
            response = self._authed().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-b", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_session_id, SESSION_ID)

    @override_settings(**TMDB_SETTINGS)
    def test_callback_recovers_by_request_token_when_state_mangled(self) -> None:
        # TMDb mangles state; the row keyed by request token still resolves.
        OAuthState.objects.create(
            key=f"tmdb_rt:{REQUEST_TOKEN}",
            payload={
                "v": "1",
                "request_token": REQUEST_TOKEN,
                "flow": "link",
                "user_id": self.user.pk,
            },
        )
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "mangled-state", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.tmdb_session_id, SESSION_ID)

    @override_settings(**TMDB_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "bogus", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "TMDb linking session expired. Please try again.")

    @override_settings(**TMDB_SETTINGS)
    def test_callback_request_token_mismatch_400(self) -> None:
        _store_state(key="tmdb-cb-c", link=True, user_id=self.user.pk)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-c", "request_token": "other-token"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Invalid TMDb linking session. Please try again.")

    @override_settings(**TMDB_SETTINGS)
    def test_callback_already_linked_400(self) -> None:
        self.user.tmdb_session_id = SESSION_ID
        self.user.save(update_fields=("tmdb_session_id",))
        _store_state(key="tmdb-cb-d", link=True, user_id=self.user.pk)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-d", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "TMDb account already linked")

    @override_settings(**TMDB_SETTINGS)
    def test_callback_session_claimed_by_another_409(self) -> None:
        other = User.objects.create_user(
            username="othertmdb", email="other@example.com", password="Correct-Horse-1"
        )
        other.tmdb_session_id = SESSION_ID
        other.save(update_fields=("tmdb_session_id",))
        _store_state(key="tmdb-cb-e", link=True, user_id=self.user.pk)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-e", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "This TMDb account is already linked to another Otix account.",
        )

    @override_settings(**TMDB_SETTINGS)
    def test_callback_account_claimed_by_another_409(self) -> None:
        other = User.objects.create_user(
            username="othertmdb", email="other@example.com", password="Correct-Horse-1"
        )
        other.tmdb_session_id = "sess-other"
        other.tmdb_account_id = ACCOUNT_ID
        other.save(update_fields=("tmdb_session_id", "tmdb_account_id"))
        _store_state(key="tmdb-cb-f", link=True, user_id=self.user.pk)
        with _mock_tmdb(session_id="sess-new"):
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-f", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 409)
        self.assertEqual(
            response.data["detail"],
            "This TMDb account is already linked to another Otix account.",
        )

    @override_settings(**TMDB_SETTINGS)
    def test_callback_unexpected_error_500(self) -> None:
        _store_state(key="tmdb-cb-g", link=True, user_id=self.user.pk)
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.side_effect = ValueError("boom")
            response = APIClient().post(
                "/api/v1/auth/oauth/tmdb/callback",
                {"state": "tmdb-cb-g", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to link TMDb account. Please try again.")


class TMDbDisconnectTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "tmdbuser", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    def test_disconnect_unlinks(self) -> None:
        self.user.tmdb_session_id = SESSION_ID
        self.user.tmdb_account_id = ACCOUNT_ID
        self.user.tmdb_username = "tmdbuser"
        self.user.tmdb_avatar_hash = "hash123"
        self.user.save(
            update_fields=(
                "tmdb_session_id",
                "tmdb_account_id",
                "tmdb_username",
                "tmdb_avatar_hash",
            )
        )
        response = self._authed().delete("/api/v1/auth/oauth/tmdb/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "TMDb account unlinked successfully")
        self.user.refresh_from_db()
        self.assertIsNone(self.user.tmdb_session_id)
        self.assertIsNone(self.user.tmdb_account_id)
        self.assertIsNone(self.user.tmdb_username)
        self.assertIsNone(self.user.tmdb_avatar_hash)

    def test_disconnect_never_linked_400(self) -> None:
        response = self._authed().delete("/api/v1/auth/oauth/tmdb/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "No TMDb account linked")

    def test_disconnect_unauthed_401(self) -> None:
        response = APIClient().delete("/api/v1/auth/oauth/tmdb/disconnect")
        self.assertEqual(response.status_code, 401)


class TMDbLoginInitiateTests(TestCase):
    @override_settings(**TMDB_SETTINGS)
    def test_initiate_returns_auth_url_and_state(self) -> None:
        with _mock_tmdb():
            response = APIClient().post("/api/v1/auth/tmdb/initiate")
        self.assertEqual(response.status_code, 200)
        state = response.data["state"]
        auth_url = response.data["auth_url"]
        self.assertTrue(auth_url.startswith(oauth_service.TMDB_AUTH_BASE + "/rt-123?"))
        params = dict(urllib.parse.parse_qsl(auth_url.split("?", 1)[1]))
        redirect_to = urllib.parse.unquote(params["redirect_to"])
        self.assertIn("http://localhost:5173/auth/callback/tmdb-login", redirect_to)
        self.assertIn(f"state={state}", redirect_to)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "login")
        self.assertNotIn("user_id", row.payload)

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_provider_failure_502(self) -> None:
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.side_effect = oauth_service.OAuthProviderError("refused")
            response = APIClient().post("/api/v1/auth/tmdb/initiate")
        self.assertEqual(response.status_code, 502)
        self.assertEqual(response.data["detail"], "Unable to start TMDb login. Please try again.")

    @override_settings(**TMDB_SETTINGS)
    def test_initiate_unexpected_error_500(self) -> None:
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.side_effect = ValueError("boom")
            response = APIClient().post("/api/v1/auth/tmdb/initiate")
        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.data["detail"], "Failed to start TMDb login. Please try again.")


class TMDbLoginCallbackTests(TestCase):
    @override_settings(**TMDB_SETTINGS)
    def test_callback_creates_user_and_session(self) -> None:
        _store_state(key="tmdb-login-a", link=False)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/tmdb/callback",
                {"state": "tmdb-login-a", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["token_type"], "bearer")
        self.assertTrue(response.data["access_token"])
        self.assertIn("otix_refresh", response.cookies)
        user = User.objects.get(tmdb_account_id=ACCOUNT_ID)
        self.assertEqual(user.username, "tmdbuser")
        self.assertEqual(user.email, f"tmdb_{ACCOUNT_ID}@user.otix")
        self.assertEqual(user.tmdb_session_id, SESSION_ID)
        self.assertTrue(user.is_verified)
        self.assertFalse(OAuthState.objects.filter(key="tmdb-login-a").exists())

    @override_settings(**TMDB_SETTINGS)
    def test_callback_reuses_existing_user(self) -> None:
        user = User.objects.create_user(
            username="veteran", email="veteran@example.com", password="Correct-Horse-1"
        )
        user.tmdb_account_id = ACCOUNT_ID
        user.save(update_fields=("tmdb_account_id",))
        _store_state(key="tmdb-login-b", link=False)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/tmdb/callback",
                {"state": "tmdb-login-b", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["access_token"])
        self.assertEqual(User.objects.filter(tmdb_account_id=ACCOUNT_ID).count(), 1)
        user.refresh_from_db()
        self.assertEqual(user.username, "veteran")  # untouched
        self.assertIsNone(user.tmdb_session_id)  # fresh session not persisted

    @override_settings(**TMDB_SETTINGS)
    def test_callback_deactivated_account_403(self) -> None:
        user = User.objects.create_user(
            username="retired", email="retired@example.com", password="Correct-Horse-1"
        )
        user.tmdb_account_id = ACCOUNT_ID
        user.is_active = False
        user.save(update_fields=("tmdb_account_id", "is_active"))
        _store_state(key="tmdb-login-c", link=False)
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/tmdb/callback",
                {"state": "tmdb-login-c", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 403)
        self.assertEqual(response.data["detail"], "Account is deactivated")

    @override_settings(**TMDB_SETTINGS)
    def test_callback_missing_params_400(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/tmdb/callback", {"state": "", "request_token": ""}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Missing state or request_token parameter.")

    @override_settings(**TMDB_SETTINGS)
    def test_callback_bad_state_400(self) -> None:
        with _mock_tmdb():
            response = APIClient().post(
                "/api/v1/auth/tmdb/callback",
                {"state": "bogus", "request_token": REQUEST_TOKEN},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "TMDb linking session expired. Please try again.")


class MeIntegrationsViewTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "tmdbuser", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_returns_all_identity_keys(self) -> None:
        self.user.steam_id = "76561197960435530"
        self.user.plex_id = "plex-1"
        self.user.google_id = "g-1"
        self.user.drive_refresh_token = "drv-rt"
        self.user.save(update_fields=("steam_id", "plex_id", "google_id", "drive_refresh_token"))
        response = self._authed().get("/api/v1/auth/me/integrations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            sorted(response.data.keys()),
            sorted(
                [
                    "steam_id",
                    "plex_id",
                    "tmdb_account_id",
                    "tmdb_username",
                    "tmdb_avatar_url",
                    "tmdb_rating_sync_direction",
                    "google_id",
                    "google_email",
                    "google_name",
                    "google_avatar_url",
                    "drive_connected",
                    "plex_watch_history_enabled",
                ]
            ),
        )
        self.assertEqual(response.data["steam_id"], "76561197960435530")
        self.assertTrue(response.data["drive_connected"])
        self.assertEqual(response.data["tmdb_rating_sync_direction"], "disabled")

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_tmdb_and_gravatar_fields(self) -> None:
        self.user.tmdb_account_id = ACCOUNT_ID
        self.user.tmdb_username = "tmdbuser"
        self.user.tmdb_avatar_hash = "hash123"
        self.user.save(update_fields=("tmdb_account_id", "tmdb_username", "tmdb_avatar_hash"))
        response = self._authed().get("/api/v1/auth/me/integrations")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["tmdb_account_id"], ACCOUNT_ID)
        self.assertEqual(
            response.data["tmdb_avatar_url"],
            "https://www.gravatar.com/avatar/hash123?s=200",
        )
        self.assertFalse(response.data["drive_connected"])

    def test_unauthed_401(self) -> None:
        response = APIClient().get("/api/v1/auth/me/integrations")
        self.assertEqual(response.status_code, 401)


class OAuthProvidersViewTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="tmdbuser", email="tmdb@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "tmdbuser", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_returns_five_providers_with_full_field_set(self) -> None:
        self.user.steam_id = "76561197960435530"
        self.user.plex_id = "plex-1"
        self.user.plex_username = "plexuser"
        self.user.google_id = "g-1"
        self.user.google_email = "g@example.com"
        self.user.google_name = "G"
        self.user.drive_refresh_token = "drv-rt"
        self.user.save(
            update_fields=(
                "steam_id",
                "plex_id",
                "plex_username",
                "google_id",
                "google_email",
                "google_name",
                "drive_refresh_token",
            )
        )
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 200)
        providers = response.data["providers"]
        self.assertEqual(
            [p["name"] for p in providers],
            ["steam", "plex", "tmdb", "google", "google_drive", "epic", "gog"],
        )
        all_keys = {
            "name",
            "connected",
            "steam_id",
            "steam_profile",
            "plex_id",
            "plex_username",
            "plex_email",
            "plex_thumb",
            "tmdb_username",
            "tmdb_avatar_url",
            "tmdb_stats",
            "tmdb_rating_sync_direction",
            "google_email",
            "google_name",
            "google_avatar_url",
            "epic_account_id",
            "epic_display_name",
            "gog_account_id",
            "gog_display_name",
        }
        for provider in providers:
            self.assertEqual(set(provider.keys()), all_keys)
        by_name = {p["name"]: p for p in providers}
        self.assertTrue(by_name["steam"]["connected"])
        self.assertEqual(by_name["steam"]["steam_id"], "76561197960435530")
        self.assertIsNone(by_name["steam"]["steam_profile"])  # no STEAM_API_KEY
        self.assertTrue(by_name["plex"]["connected"])
        self.assertEqual(by_name["plex"]["plex_username"], "plexuser")
        self.assertFalse(by_name["tmdb"]["connected"])
        self.assertTrue(by_name["google"]["connected"])
        self.assertTrue(by_name["google_drive"]["connected"])
        self.assertFalse(by_name["epic"]["connected"])
        self.assertFalse(by_name["gog"]["connected"])

    @override_settings(FRONTEND_BASE_URL="http://localhost:5173")
    def test_unlinked_returns_all_disconnected(self) -> None:
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 200)
        for provider in response.data["providers"]:
            self.assertFalse(provider["connected"])

    @override_settings(
        FRONTEND_BASE_URL="http://localhost:5173",
        STEAM_API_KEY="test-steam-key",
        TMDB_API_KEY="test-tmdb-key",
        TMDB_RAT="test-tmdb-rat",
    )
    def test_providers_payload_does_not_call_live_provider_http(self) -> None:
        self.user.steam_id = "76561197960435530"
        self.user.tmdb_session_id = SESSION_ID
        self.user.tmdb_account_id = ACCOUNT_ID
        self.user.tmdb_username = "tmdbuser"
        self.user.save(
            update_fields=("steam_id", "tmdb_session_id", "tmdb_account_id", "tmdb_username")
        )
        with patch.object(oauth_service, "_request") as mock_request:
            mock_request.return_value = (200, "{}")
            response = self._authed().get("/api/v1/auth/oauth")
        mock_request.assert_not_called()
        self.assertEqual(response.status_code, 200)
        by_name = {p["name"]: p for p in response.data["providers"]}
        self.assertTrue(by_name["steam"]["connected"])
        self.assertTrue(by_name["tmdb"]["connected"])

    def test_unauthed_401(self) -> None:
        response = APIClient().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 401)
