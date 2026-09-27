"""Endpoint tests for the Epic OAuth link family.

Covers POST /auth/oauth/epic (initiate + callback + disconnect) against the
real URLconf. The node leaf (``server_proxy_request``) is mocked; Django must
never store Epic tokens or User.epic_* columns. GET /auth/oauth stays five
providers.
"""

from __future__ import annotations

import urllib.parse
from unittest.mock import patch

from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import OAuthState, User
from apps.integrations.models import UserEpicGame
from apps.library.models import UserGameServer

NO_EPIC_NODE = "Connect an Otix Server to link Epic."
EPIC_CLIENT_ID = "34a02cf8f4414e29b15921876da36f9a"


def _node(user, **kwargs):
    defaults = dict(
        name="nas",
        local_url="http://127.0.0.1:8090",
        is_online=True,
        is_active=True,
        last_seen_at=timezone.now(),
    )
    defaults.update(kwargs)
    return UserGameServer.objects.create(user=user, **defaults)


def _expected_auth_url() -> str:
    redirect = (
        f"https://www.epicgames.com/id/api/redirect?clientId={EPIC_CLIENT_ID}&responseType=code"
    )
    return "https://www.epicgames.com/id/login?redirectUrl=" + urllib.parse.quote(redirect, safe="")


class _EpicAuthedCase(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="epiclover", email="epiclover@example.com", password="Correct-Horse-1"
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
    def test_400_without_node(self) -> None:
        response = self._authed().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], NO_EPIC_NODE)
        self.assertFalse(OAuthState.objects.exists())

    def test_400_when_node_offline(self) -> None:
        _node(self.user, is_online=False)
        response = self._authed().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], NO_EPIC_NODE)

    def test_400_when_node_inactive(self) -> None:
        _node(self.user, is_active=False)
        response = self._authed().post("/api/v1/auth/oauth/epic")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], NO_EPIC_NODE)

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
        response = self._authed().post("/api/v1/auth/oauth/epic", {"node_id": node.id}, format="json")
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

    @patch(
        "apps.library.services.game_server.server_proxy_request",
        return_value=(
            200,
            {
                "connected": True,
                "account_id": "acc",
                "display_name": "D",
                "refresh_token": "leak",
            },
        ),
    )
    def test_strips_token_and_does_not_write_user(self, _proxy) -> None:
        _node(self.user)
        state = self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": state},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("refresh_token", response.data)
        self.assertEqual(response.data["connected"], True)
        self.assertEqual(response.data["account_id"], "acc")
        self.assertEqual(response.data["display_name"], "D")
        self.user.refresh_from_db()
        self.assertFalse(
            hasattr(self.user, "epic_refresh_token")
            and getattr(self.user, "epic_refresh_token", None)
        )
        credential_fields = [
            field.name for field in self.user._meta.fields if field.name.startswith("epic_")
        ]
        self.assertEqual(credential_fields, [])
        self.assertFalse(OAuthState.objects.filter(key=state).exists())
        _proxy.assert_called_once()
        args, kwargs = _proxy.call_args
        self.assertEqual(args[1], "POST")
        self.assertEqual(args[2], "/api/v1/epic/auth")
        self.assertEqual(kwargs["json"], {"code": "auth-code"})
        self.assertEqual(kwargs["timeout"], 20.0)

    def test_callback_bad_state_400(self) -> None:
        _node(self.user)
        with patch("apps.library.services.game_server.server_proxy_request") as proxy:
            response = self._authed().post(
                "/api/v1/auth/oauth/epic/callback",
                {"code": "auth-code", "state": "bogus"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        proxy.assert_not_called()

    def test_callback_wrong_user_state_400(self) -> None:
        _node(self.user)
        other = User.objects.create_user(
            username="other", email="other@example.com", password="Correct-Horse-1"
        )
        self._store_state(user_id=other.pk)
        with patch("apps.library.services.game_server.server_proxy_request") as proxy:
            response = self._authed().post(
                "/api/v1/auth/oauth/epic/callback",
                {"code": "auth-code", "state": "epic-state"},
                format="json",
            )
        self.assertEqual(response.status_code, 400)
        proxy.assert_not_called()

    def test_callback_400_without_node(self) -> None:
        self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], NO_EPIC_NODE)

    def test_callback_unauthed_401(self) -> None:
        response = APIClient().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    @patch(
        "apps.library.services.game_server.server_proxy_request",
        return_value=(400, {"detail": "Code expired or invalid. Sign in again."}),
    )
    def test_callback_maps_node_status(self, _proxy) -> None:
        _node(self.user)
        self._store_state()
        response = self._authed().post(
            "/api/v1/auth/oauth/epic/callback",
            {"code": "auth-code", "state": "epic-state"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], "Code expired or invalid. Sign in again.")


class EpicDisconnectTests(_EpicAuthedCase):
    @patch(
        "apps.library.services.game_server.server_proxy_request",
        return_value=(200, {"connected": False}),
    )
    def test_disconnect_unlinks_without_deleting_rows(self, _proxy) -> None:
        _node(self.user)
        UserEpicGame.objects.create(user=self.user, app_name="Jaguar", title="Rocket League")
        response = self._authed().delete("/api/v1/auth/oauth/epic/disconnect")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["message"], "Epic account unlinked successfully")
        self.assertEqual(UserEpicGame.objects.filter(user=self.user).count(), 1)
        _proxy.assert_called_once()
        args, kwargs = _proxy.call_args
        self.assertEqual(args[1], "DELETE")
        self.assertEqual(args[2], "/api/v1/epic/auth")

    def test_disconnect_400_without_node(self) -> None:
        response = self._authed().delete("/api/v1/auth/oauth/epic/disconnect")
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data["detail"], NO_EPIC_NODE)

    def test_disconnect_unauthed_401(self) -> None:
        response = APIClient().delete("/api/v1/auth/oauth/epic/disconnect")
        self.assertEqual(response.status_code, 401)


class EpicOauthListTests(_EpicAuthedCase):
    def test_auth_oauth_still_five_providers(self) -> None:
        response = self._authed().get("/api/v1/auth/oauth")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            [p["name"] for p in response.data["providers"]],
            ["steam", "plex", "tmdb", "google", "google_drive"],
        )
        self.assertNotIn("epic", [p["name"] for p in response.data["providers"]])
