"""Smoke test for the golden accounts slice: register -> token -> me.

Every domain app must ship at least one test like this proving its public
endpoints resolve against a real (test) database.
"""

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

User = get_user_model()


class AuthFlowTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_register_creates_user_with_hashed_password(self) -> None:
        response = self.client.post(
            "/api/v1/auth/register",
            {"username": "alice", "email": "alice@example.com", "password": "a-strong-pass-123"},
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.data["username"], "alice")
        self.assertEqual(response.data["email"], "alice@example.com")
        self.assertIn("id", response.data)

        user = User.objects.get(username="alice")
        self.assertTrue(user.check_password("a-strong-pass-123"))
        self.assertTrue(user.is_active)
        self.assertFalse(user.is_staff)
        self.assertFalse(user.two_factor_enabled)

    def test_register_duplicate_username_rejected(self) -> None:
        User.objects.create_user(username="bob", password="a-strong-pass-123")
        response = self.client.post(
            "/api/v1/auth/register",
            {"username": "bob", "password": "a-strong-pass-123"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_me_requires_authentication(self) -> None:
        response = self.client.get("/api/v1/auth/me")
        self.assertEqual(response.status_code, 401)

    def test_full_register_authenticate_me_flow(self) -> None:
        # register
        self.client.post(
            "/api/v1/auth/register",
            {"username": "carol", "email": "carol@example.com", "password": "a-strong-pass-123"},
            format="json",
        )
        user = User.objects.get(username="carol")

        # The login/auth flow (future task) issues a token; provision one here
        # to exercise the authenticated endpoint end-to-end.
        token = Token.objects.create(user=user)

        # authenticate + hit the authenticated endpoint
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        response = self.client.get("/api/v1/auth/me")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["username"], "carol")
        self.assertEqual(response.data["email"], "carol@example.com")
        self.assertIn("created_at", response.data)

    # ── PATCH /auth/me (self-update) ───────────────────────────────
    def _authed_client(self) -> tuple[APIClient, User]:
        user = User.objects.create_user(
            username="dave", email="dave@example.com", password="a-strong-pass-123"
        )
        token = Token.objects.create(user=user)
        client = APIClient()
        client.credentials(HTTP_AUTHORIZATION=f"Token {token.key}")
        return client, user

    def test_me_patch_updates_profile_fields(self) -> None:
        client, _ = self._authed_client()
        response = client.patch(
            "/api/v1/auth/me",
            {"display_name": "Davey", "avatar_url": "https://cdn.example.com/x.png"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_name"], "Davey")
        self.assertEqual(response.data["avatar_url"], "https://cdn.example.com/x.png")
        user = User.objects.get(username="dave")
        self.assertEqual(user.display_name, "Davey")

    def test_me_patch_ignores_unknown_keys(self) -> None:
        client, user = self._authed_client()
        response = client.patch(
            "/api/v1/auth/me",
            {"is_admin": True, "display_name": "Updated"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["display_name"], "Updated")
        self.assertNotIn("is_admin", response.data)
        user.refresh_from_db()
        self.assertEqual(user.display_name, "Updated")

    def test_me_patch_duplicate_username_rejected(self) -> None:
        User.objects.create_user(username="taken", password="a-strong-pass-123")
        client, _ = self._authed_client()
        response = client.patch(
            "/api/v1/auth/me",
            {"username": "taken"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_me_patch_requires_auth(self) -> None:
        response = APIClient().patch(
            "/api/v1/auth/me",
            {"display_name": "anon"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)
