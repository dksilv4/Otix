"""Endpoint tests for the GOG OAuth link family.

Covers POST /auth/oauth/gog (initiate + callback + disconnect) against the
user account model and optional node synchronization.
"""

from __future__ import annotations

from unittest.mock import patch

from django.test import TestCase
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.integrations.models import UserGOGGame
from apps.integrations.services import gog_client
from apps.library.models import UserGameServer


def _node(user: User, *, is_online: bool = True, is_active: bool = True) -> UserGameServer:
    return UserGameServer.objects.create(
        user=user,
        name="Homelab",
        local_url="http://192.168.1.50:8000",
        is_online=is_online,
        is_active=is_active,
    )


class _GOGAuthedCase(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="goglover",
            email="gog@example.com",
            password="Correct-Horse-1",
        )
        self.client = APIClient()
        login = self.client.post(
            "/api/v1/auth/login",
            {"identity": "goglover", "password": "Correct-Horse-1"},
            format="json",
        )
        self.bearer = login.data["access_token"]

    def _authed(self) -> APIClient:
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Bearer {self.bearer}")
        return client


class GOGInitiateTests(_GOGAuthedCase):
    def test_200_without_node_stores_state(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/gog")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        self.assertEqual(response.data["auth_url"], gog_client.GOG_AUTH_URL)
        self.assertIn("auth.gog.com/auth", response.data["auth_url"])
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "gog-link")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    def test_200_with_online_node_stores_state(self) -> None:
        _node(self.user)
        response = self._authed().post("/api/v1/auth/oauth/gog")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(sorted(response.data.keys()), ["auth_url", "state"])
        state = response.data["state"]
        self.assertEqual(response.data["auth_url"], gog_client.GOG_AUTH_URL)
        row = OAuthState.objects.get(key=state)
        self.assertEqual(row.payload["flow"], "gog-link")
        self.assertEqual(row.payload["user_id"], self.user.pk)

    def test_200_with_explicit_node_id(self) -> None:
        node = _node(self.user)
        response = self._authed().post(
            "/api/v1/auth/oauth/gog", {"node_id": node.id}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("auth_url", response.data)

    def test_initiate_unauthed_401(self) -> None:
        response = APIClient().post("/api/v1/auth/oauth/gog")
        self.assertEqual(response.status_code, 401)


class GOGCallbackTests(_GOGAuthedCase):
    def _store_state(self, *, key: str = "gog-state", user_id: int | None = None) -> str:
        payload = {"v": "1", "flow": "gog-link", "user_id": user_id or self.user.pk}
        OAuthState.objects.create(key=key, payload=payload)
        return key

    @patch("apps.integrations.services.gog_client.exchange_authorization_code")
    def test_exchanges_code_and_stores_on_user(self, mock_exchange) -> None:
        from datetime import timedelta

        from django.utils import timezone

        mock_exchange.return_value = {
            "account_id": "gog-acc-123",
            "display_name": "GOGGamer",
            "access_token": "mock-access-token",
            "refresh_token": "mock-refresh-token",
            "expires_at": timezone.now() + timedelta(hours=1),
        }
        state = self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/gog/callback",
            {"code": "auth-code", "state": state},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["connected"], True)
        self.assertEqual(response.data["account_id"], "gog-acc-123")
        self.assertEqual(response.data["display_name"], "GOGGamer")

        self.user.refresh_from_db()
        self.assertEqual(self.user.gog_account_id, "gog-acc-123")
        self.assertEqual(self.user.gog_display_name, "GOGGamer")
        self.assertEqual(self.user.gog_refresh_token, "mock-refresh-token")
        self.assertFalse(OAuthState.objects.filter(key=state).exists())

    def test_callback_bad_state_400(self) -> None:
        response = self._authed().post(
            "/api/v1/auth/oauth/gog/callback",
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
            "/api/v1/auth/oauth/gog/callback",
            {"code": "auth-code", "state": "gog-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    @patch(
        "apps.integrations.services.gog_client.exchange_authorization_code",
        side_effect=gog_client.GOGAuthError(
            "Authorization code is invalid or expired. Please sign in again."
        ),
    )
    def test_callback_maps_auth_error(self, _exchange) -> None:
        self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/gog/callback",
            {"code": "auth-code", "state": "gog-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("invalid or expired", response.data["detail"])

    def test_callback_unauthed_401(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/oauth/gog/callback",
            {"code": "auth-code", "state": "gog-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)


class GOGDisconnectTests(_GOGAuthedCase):
    def test_disconnect_unlinks_user_and_preserves_games(self) -> None:
        self.user.gog_account_id = "gog-acc-123"
        self.user.gog_display_name = "GOGGamer"
        self.user.gog_refresh_token = "mock-token"
        self.user.save()

        UserGOGGame.objects.create(user=self.user, game_id="1207658924", title="The Witcher 3")
        response = self._authed().delete("/api/v1/auth/oauth/gog/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "GOG account unlinked successfully")
        self.assertEqual(UserGOGGame.objects.filter(user=self.user).count(), 1)

        self.user.refresh_from_db()
        self.assertIsNone(self.user.gog_account_id)
        self.assertIsNone(self.user.gog_display_name)
        self.assertIsNone(self.user.gog_refresh_token)

    def test_disconnect_unauthed_401(self) -> None:
        response = APIClient().delete("/api/v1/auth/oauth/gog/disconnect")
        self.assertEqual(response.status_code, 401)


class GOGOauthListTests(_GOGAuthedCase):
    def test_auth_oauth_includes_gog(self) -> None:
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 200)
        provider_names = [p["name"] for p in response.data["providers"]]
        self.assertIn("gog", provider_names)
        gog_data = next(p for p in response.data["providers"] if p["name"] == "gog")
        self.assertFalse(gog_data["connected"])

        self.user.gog_refresh_token = "mock-ref"
        self.user.gog_account_id = "acc-99"
        self.user.save()

        response2 = self._authed().get("/api/v1/auth/oauth")
        gog_data2 = next(p for p in response2.data["providers"] if p["name"] == "gog")
        self.assertTrue(gog_data2["connected"])
        self.assertEqual(gog_data2["gog_account_id"], "acc-99")
