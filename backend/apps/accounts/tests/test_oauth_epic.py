"""Endpoint tests for the Epic OAuth link family.

Covers POST /auth/oauth/epic (initiate + callback + disconnect) against the
user account model and optional node synchronization.
"""

from __future__ import annotations

import urllib.parse
from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.integrations.models import UserEpicGame
from apps.integrations.services import epic_client
from apps.library.models import UserGameServer


def _node(user: User, *, is_online: bool = True, is_active: bool = True) -> UserGameServer:
    return UserGameServer.objects.create(
        user=user,
        name="Homelab",
        local_url="http://192.168.1.50:8000",
        is_online=is_online,
        is_active=is_active,
    )


def _expected_auth_url() -> str:
    redirect_target = (
        "https://www.epicgames.com/id/api/redirect"
        f"?clientId={epic_client.EPIC_CLIENT_ID}&responseType=code"
    )
    return "https://www.epicgames.com/id/login?redirectUrl=" + urllib.parse.quote(
        redirect_target, safe=""
    )


class _EpicAuthedCase(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="epiclover",
            email="epic@example.com",
            password="Correct-Horse-1",
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "epiclover", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client


class EpicInitiateTests(_EpicAuthedCase):
    def test_200_without_node_stores_state(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        self.assertEqual(response.data["auth_url"], _expected_auth_url())
        self.assertIn("epicgames.com/id/login", response.data["auth_url"])
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "epic-link")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    def test_200_with_online_node_stores_state(self) -> None:
        _node(self.user)
        response = self._authed().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        self.assertEqual(response.data["auth_url"], _expected_auth_url())
        self.assertIn("epicgames.com/id/login", response.data["auth_url"])
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "epic-link")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    def test_200_with_explicit_node_id(self) -> None:
        node = _node(self.user)
        response = self._authed().post(
            "/api/v1/auth/oauth/epic", {"node_id": node.id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("auth_url", response.data)

    def test_initiate_unauthed_401(self) -> None:
        response = APIClient().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 401)


class EpicCallbackTests(_EpicAuthedCase):
    def _store_state(self, *, key: str = "epic-state", user_id: int | None = None) -> str:
        payload = {"v": "1", "flow": "epic-link", "user_id": user_id or self.user.pk}
        OAuthState.objects.create(key=key, payload=payload)
        return key

    @patch("apps.integrations.services.epic_client.exchange_authorization_code")
    def test_exchanges_code_and_stores_on_user(self, mock_exchange) -> None:
        from datetime import timedelta

        from django.utils import timezone

        mock_exchange.return_value = {
            "account_id": "epic-acc-123",
            "display_name": "EpicGamer",
            "access_token": "mock-access-token",
            "refresh_token": "mock-refresh-token",
            "expires_at": timezone.now() + timedelta(hours=8),
        }
        state = self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": state},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["connected"], True)
        self.assertEqual(response.data["account_id"], "epic-acc-123")
        self.assertEqual(response.data["display_name"], "EpicGamer")

        self.user.refresh_from_db()
        self.assertEqual(self.user.epic_account_id, "epic-acc-123")
        self.assertEqual(self.user.epic_display_name, "EpicGamer")
        self.assertEqual(self.user.epic_refresh_token, "mock-refresh-token")
        self.assertFalse(OAuthState.objects.filter(key=state).exists())

    def test_callback_bad_state_400(self) -> None:
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "bogus"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_callback_wrong_user_state_400(self) -> None:
        other = User.objects.create_user(
            username="other", email="other@example.com", password="Correct-Horse-1"
        )
        self._store_state(user_id=other.pk)
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch(
        "apps.integrations.services.epic_client.exchange_authorization_code",
        side_effect=epic_client.EpicAuthError(
            "Authorization code is invalid or expired. Please sign in again."
        ),
    )
    def test_callback_maps_auth_error(self, _exchange) -> None:
        self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or expired", response.data["detail"])

    def test_callback_unauthed_401(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)


class EpicDisconnectTests(_EpicAuthedCase):
    def test_disconnect_unlinks_user_and_preserves_games(self) -> None:
        self.user.epic_account_id = "epic-acc-123"
        self.user.epic_display_name = "EpicGamer"
        self.user.epic_refresh_token = "mock-token"
        self.user.save()

        UserEpicGame.objects.create(user=self.user, app_name="Jaguar", title="Rocket League")
        response = self._authed().delete("/api/v1/auth/oauth/epic/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Epic account unlinked successfully")
        self.assertEqual(UserEpicGame.objects.filter(user=self.user).count(), 1)

        self.user.refresh_from_db()
        self.assertIsNone(self.user.epic_account_id)
        self.assertIsNone(self.user.epic_display_name)
        self.assertIsNone(self.user.epic_refresh_token)

    def test_disconnect_unauthed_401(self) -> None:
        response = APIClient().delete("/api/v1/auth/oauth/epic/disconnect")
        self.assertEqual(response.status_code, 401)


class EpicOauthListTests(_EpicAuthedCase):
    def test_auth_oauth_includes_epic(self) -> None:
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 200)
        provider_names = [p["name"] for p in response.data["providers"]]
        self.assertIn("epic", provider_names)
        epic_data = next(p for p in response.data["providers"] if p["name"] == "epic")
        self.assertFalse(epic_data["connected"])

        self.user.epic_refresh_token = "mock-ref"
        self.user.epic_account_id = "acc-99"
        self.user.save()

        response2 = self._authed().get("/api/v1/auth/oauth")
        epic_data2 = next(p for p in response2.data["providers"] if p["name"] == "epic")
        self.assertTrue(epic_data2["connected"])
        self.assertEqual(epic_data2["epic_account_id"], "acc-99")
