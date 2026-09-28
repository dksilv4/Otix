"""Endpoint tests for the real-auth slice (JWT + refresh cookie + 2FA + recovery).

Uses ``APIClient`` against the real URLconf (not DRF Token auth). Covers the
login/refresh-rotation/logout/session, TOTP and password-recovery surfaces at
the status-code/response-key fidelity the frozen FastAPI contract specifies.
"""

import re
from datetime import timedelta
from unittest.mock import patch

import pyotp
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from apps.accounts.models import RefreshToken, UserSession
from apps.accounts.services.sessions import session_key_from_cookie

User = get_user_model()

TOKEN_RE = re.compile(rb"token=([A-Za-z0-9_\-]+)")


class RealAuthFlowTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(
            username="alice", email="alice@example.com", password="Correct-Horse-1"
        )
        self.client = APIClient()

    def _login(self, client: APIClient | None = None, identity: str = "alice") -> dict:
        """POST /auth/login, return parsed body + the refresh cookie value."""
        c = client or self.client
        response = c.post(
            "/api/v1/auth/login",
            {"identity": identity, "password": "Correct-Horse-1"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        cookie = response.cookies.get(settings.REFRESH_COOKIE_NAME)
        return {
            "response": response,
            "body": response.data,
            "refresh": cookie.value if cookie else None,
            "access": response.data["access_token"],
        }

    def _bearer(self, access: str) -> APIClient:
        c = APIClient()
        c.credentials(HTTP_AUTHORIZATION=f"Bearer {access}")
        return c

    # ── Login ────────────────────────────────────────────────────────────
    def test_login_success_returns_access_and_sets_http_only_cookie(self) -> None:
        result = self._login()
        self.assertEqual(result["body"]["token_type"], "bearer")
        self.assertFalse(result["body"]["two_factor_required"])
        self.assertIsNone(result["body"]["challenge_token"])
        self.assertTrue(result["body"]["access_token"])
        self.assertIsNotNone(result["refresh"])
        cookie = result["response"].cookies[settings.REFRESH_COOKIE_NAME]
        self.assertTrue(cookie["httponly"])
        self.assertEqual(cookie["path"], "/api/v1/auth/")
        self.assertEqual(cookie["samesite"], "lax")
        self.assertEqual(RefreshToken.objects.filter(user=self.user).count(), 1)
        self.assertEqual(UserSession.objects.filter(user=self.user).count(), 1)

    def test_login_rejects_bad_password_and_unknown_user(self) -> None:
        bad = self.client.post(
            "/api/v1/auth/login",
            {"identity": "alice", "password": "wrong-password"},
            format="json",
        )
        self.assertEqual(bad.status_code, 401)
        self.assertEqual(bad.data["detail"], "Invalid email or password")
        unknown = self.client.post(
            "/api/v1/auth/login",
            {"identity": "nobody", "password": "whatever-1"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 401)

    def test_login_accepts_email_identity_case_insensitively(self) -> None:
        result = self._login(identity="ALICE@example.com")
        self.assertIn("access_token", result["body"])

    def test_login_accepts_username_identity_case_insensitively_and_trimmed(self) -> None:
        result = self._login(identity="  Alice  ")
        self.assertIn("access_token", result["body"])
        result_upper = self._login(identity="ALICE")
        self.assertIn("access_token", result_upper["body"])

    # ── Refresh rotation ─────────────────────────────────────────────────
    def test_refresh_rotates_and_old_cookie_reuse_revokes_all(self) -> None:
        login_client = APIClient()
        result = self._login(login_client)
        old_refresh = result["refresh"]

        rotated = login_client.post("/api/v1/auth/refresh")
        self.assertEqual(rotated.status_code, 200)
        self.assertIn("access_token", rotated.data)
        self.assertEqual(RefreshToken.objects.filter(user=self.user).count(), 2)

        # Replay the old cookie after the concurrent-refresh grace window.
        thief = APIClient()
        thief.cookies[settings.REFRESH_COOKIE_NAME] = old_refresh
        later = timezone.now() + timedelta(seconds=30)
        with patch("apps.accounts.services.sessions.timezone.now", return_value=later):
            replay = thief.post("/api/v1/auth/refresh")
        self.assertEqual(replay.status_code, 401)
        live = RefreshToken.objects.filter(user=self.user, revoked_at__isnull=True).count()
        self.assertEqual(live, 0)

    def test_refresh_recent_reuse_does_not_revoke_family(self) -> None:
        login_client = APIClient()
        result = self._login(login_client)
        old_refresh = result["refresh"]

        rotated = login_client.post("/api/v1/auth/refresh")
        self.assertEqual(rotated.status_code, 200)

        # Immediate replay looks like overlapping in-flight refreshes, not theft.
        thief = APIClient()
        thief.cookies[settings.REFRESH_COOKIE_NAME] = old_refresh
        replay = thief.post("/api/v1/auth/refresh")
        self.assertEqual(replay.status_code, 401)
        live = RefreshToken.objects.filter(user=self.user, revoked_at__isnull=True).count()
        self.assertEqual(live, 1)

    def test_refresh_without_cookie_is_401(self) -> None:
        response = self.client.post("/api/v1/auth/refresh")
        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.data["detail"], "No refresh token provided")

    # ── Logout / sessions ────────────────────────────────────────────────
    def test_logout_kills_every_refresh_token(self) -> None:
        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        logged_out = bearer.post("/api/v1/auth/logout")
        self.assertEqual(logged_out.status_code, 204)

        # The pre-logout cookie must now fail on refresh.
        stale = APIClient()
        stale.cookies[settings.REFRESH_COOKIE_NAME] = result["refresh"]
        replay = stale.post("/api/v1/auth/refresh")
        self.assertEqual(replay.status_code, 401)

    def test_logout_requires_auth(self) -> None:
        response = self.client.post("/api/v1/auth/logout")
        self.assertEqual(response.status_code, 401)

    def test_sessions_list_and_delete_all_except_current(self) -> None:
        first = self._login(self.client)
        second_client = APIClient()
        self._login(second_client)
        first_cookie = first["response"].cookies[settings.REFRESH_COOKIE_NAME].value
        first_session_key = session_key_from_cookie(first_cookie)

        # The bearer client also carries the *current* refresh cookie.
        bearer = self._bearer(first["access"])
        bearer.cookies[settings.REFRESH_COOKIE_NAME] = first_cookie
        listed = bearer.get("/api/v1/auth/sessions")
        self.assertEqual(listed.status_code, 200)
        self.assertEqual(set(listed.data), {"sessions", "current_session_key"})
        self.assertEqual(len(listed.data["sessions"]), 2)
        self.assertEqual(listed.data["current_session_key"], first_session_key)

        revoked = bearer.delete("/api/v1/auth/sessions")
        self.assertEqual(revoked.status_code, 200)
        self.assertEqual(revoked.data["revoked_count"], 1)
        remaining = UserSession.objects.filter(user=self.user, revoked_at__isnull=True)
        self.assertEqual(remaining.count(), 1)
        self.assertEqual(remaining.first().session_key, first_session_key)

    def test_delete_single_session(self) -> None:
        result = self._login(self.client)
        session_key = UserSession.objects.get(user=self.user).session_key
        bearer = self._bearer(result["access"])
        gone = bearer.delete(f"/api/v1/auth/sessions/{session_key}")
        self.assertEqual(gone.status_code, 204)
        live = UserSession.objects.filter(user=self.user, revoked_at__isnull=True).count()
        self.assertEqual(live, 0)

        missing = bearer.delete("/api/v1/auth/sessions/does-not-exist")
        self.assertEqual(missing.status_code, 404)
        self.assertEqual(missing.data["detail"], "Session not found")

    # ── 2FA / TOTP ───────────────────────────────────────────────────────
    def _setup_2fa(self) -> str:
        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        setup = bearer.post("/api/v1/auth/2fa/setup")
        self.assertEqual(setup.status_code, 200)
        self.assertEqual(set(setup.data), {"secret", "provisioning_uri", "qr_code_svg"})
        secret = setup.data["secret"]
        self.user.refresh_from_db()
        self.assertEqual(self.user.two_factor_secret, secret)
        return secret

    def test_2fa_full_flow(self) -> None:
        secret = self._setup_2fa()

        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        enabled = bearer.post(
            "/api/v1/auth/2fa/enable",
            {"code": pyotp.TOTP(secret).now()},
            format="json",
        )
        self.assertEqual(enabled.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.two_factor_enabled)

        # Next password login demands the challenge; no cookie is set yet.
        challenged = self.client.post(
            "/api/v1/auth/login",
            {"identity": "alice", "password": "Correct-Horse-1"},
            format="json",
        )
        self.assertEqual(challenged.status_code, 200)
        self.assertTrue(challenged.data["two_factor_required"])
        self.assertIsNone(challenged.data["access_token"])
        self.assertIn("challenge_token", challenged.data)
        self.assertNotIn(settings.REFRESH_COOKIE_NAME, challenged.cookies)

        # Verify with a valid TOTP code → real tokens.
        verified = self.client.post(
            "/api/v1/auth/2fa/login/verify",
            {
                "challenge_token": challenged.data["challenge_token"],
                "code": pyotp.TOTP(secret).now(),
            },
            format="json",
        )
        self.assertEqual(verified.status_code, 200)
        self.assertIn("access_token", verified.data)

        # A wrong code is rejected.
        again = self.client.post(
            "/api/v1/auth/login",
            {"identity": "alice", "password": "Correct-Horse-1"},
            format="json",
        )
        bad = self.client.post(
            "/api/v1/auth/2fa/login/verify",
            {
                "challenge_token": again.data["challenge_token"],
                "code": "000000",
            },
            format="json",
        )
        self.assertEqual(bad.status_code, 400)

    def test_2fa_enable_rejects_bad_code(self) -> None:
        self._setup_2fa()
        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        bad = bearer.post("/api/v1/auth/2fa/enable", {"code": "000000"}, format="json")
        self.assertEqual(bad.status_code, 400)

    def test_2fa_disable_requires_password(self) -> None:
        secret = self._setup_2fa()
        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        bearer.post("/api/v1/auth/2fa/enable", {"code": pyotp.TOTP(secret).now()}, format="json")
        wrong = bearer.post("/api/v1/auth/2fa/disable", {"password": "nope"}, format="json")
        self.assertEqual(wrong.status_code, 400)
        good = bearer.post(
            "/api/v1/auth/2fa/disable", {"password": "Correct-Horse-1"}, format="json"
        )
        self.assertEqual(good.status_code, 200)
        self.user.refresh_from_db()
        self.assertFalse(self.user.two_factor_enabled)
        self.assertIsNone(self.user.two_factor_secret)

    # ── Password reset + email verify ────────────────────────────────────
    def test_forgot_and_reset_password(self) -> None:
        response = self.client.post(
            "/api/v1/auth/forgot-password",
            {"email": "alice@example.com"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        raw = TOKEN_RE.search(mail.outbox[0].message().as_bytes()).group(1).decode()

        reset = self.client.post(
            "/api/v1/auth/reset-password",
            {"token": raw, "password": "Brand-New-Pass-9"},
            format="json",
        )
        self.assertEqual(reset.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password("Brand-New-Pass-9"))

        # Old token is single-use.
        again = self.client.post(
            "/api/v1/auth/reset-password",
            {"token": raw, "password": "Another-Pass-9"},
            format="json",
        )
        self.assertEqual(again.status_code, 400)
        self.assertEqual(again.data["detail"], "Invalid or expired reset token")

    def test_forgot_password_never_enumirates(self) -> None:
        gone = self.client.post(
            "/api/v1/auth/forgot-password",
            {"email": "ghost@example.com"},
            format="json",
        )
        self.assertEqual(gone.status_code, 200)
        self.assertEqual(len(mail.outbox), 0)

    def test_verify_email_send_and_verify(self) -> None:
        result = self._login(self.client)
        bearer = self._bearer(result["access"])
        sent = bearer.post("/api/v1/auth/verify-email/send")
        self.assertEqual(sent.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        raw = TOKEN_RE.search(mail.outbox[0].message().as_bytes()).group(1).decode()

        verified = self.client.post("/api/v1/auth/verify-email", {"token": raw}, format="json")
        self.assertEqual(verified.status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_verified)

        second = bearer.post("/api/v1/auth/verify-email/send")
        self.assertEqual(second.status_code, 400)
        self.assertEqual(second.data["detail"], "Email already verified")
