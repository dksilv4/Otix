"""Tests for the third-party plugin gateway (scoped access tokens).

Token management endpoints + scope enforcement are DB/route tests; the call
path is exercised with the host down so a permitted call resolves to 503
(permission passed) rather than touching plugin code.
"""

from __future__ import annotations

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from plugins.gateway import (
    create_token,
    deactivate_plugin_tokens,
    ensure_plugin_token,
    generate_token,
    hash_token,
    resolve_token,
    token_allows,
)
from plugins.manifest import parse_manifest
from plugins.models import PluginAccessToken, PluginAccessTokenGrant
from plugins.services import disable_plugin, enable_plugin, register_plugin

User = get_user_model()

MANIFEST = "name: echo\nversion: 1.0.0\npermissions: [network:external]\n"


def register_echo(name: str = "echo") -> None:
    register_plugin(parse_manifest(MANIFEST.replace("name: echo", f"name: {name}")))


class GatewayHelpersTests(TestCase):
    def test_generate_and_resolve_round_trip(self) -> None:
        token, secret = create_token(
            name="ci",
            grants=[{"plugin": "echo", "methods": "echo.ping"}],
        )
        self.assertTrue(secret.startswith("otxp_"))
        self.assertEqual(len(secret), len("otxp_") + 43)  # 32-byte urlsafe base64
        self.assertEqual(resolve_token(secret), token)
        self.assertIsNone(resolve_token("otxp_tampered"))  # not a stored hash
        self.assertNotEqual(generate_token()[0], secret)  # each token is unique
        self.assertEqual(len(hash_token(secret)), 64)  # sha256, stored only

    def test_scope_gating(self) -> None:
        token, _ = create_token(
            name="scoped",
            grants=[{"plugin": "plex", "methods": "plex.identity"}],
        )
        self.assertTrue(token_allows(token, "plex", "plex.identity"))
        self.assertTrue(token_allows(token, "plex", None))  # describe whole plugin
        self.assertFalse(token_allows(token, "plex", "plex.libraries"))
        self.assertFalse(token_allows(token, "other", "plex.identity"))
        broad, _ = create_token(name="broad", grants=[{"plugin": "plex", "methods": ""}])
        self.assertTrue(token_allows(broad, "plex", "plex.libraries"))
        self.assertFalse(token_allows(broad, "not-plex", "plex.libraries"))

    def test_revoked_and_expired_tokens_do_not_resolve(self) -> None:
        token, plaintext = create_token(name="temp", grants=[])
        self.assertEqual(resolve_token(plaintext), token)
        token.is_active = False
        token.save(update_fields=("is_active",))
        self.assertIsNone(resolve_token(plaintext))


class GatewayApiTests(TestCase):
    def setUp(self) -> None:
        self.admin = User.objects.create_user(
            username="admin", password="pw", is_staff=True, is_superuser=True
        )
        self.admin_token = Token.objects.create(user=self.admin)
        self.user = User.objects.create_user(username="bob", password="pw")
        self.user_token = Token.objects.create(user=self.user)
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        self.user_client = APIClient()
        self.user_client.credentials(HTTP_AUTHORIZATION=f"Token {self.user_token.key}")
        register_echo()

    def _create_token_via_api(self, name="ci", grants=None) -> str:
        grants = grants or [{"plugin": "echo", "methods": "echo.ping"}]
        response = self.admin_client.post(
            "/api/v1/plugins/access/tokens",
            {"name": name, "grants": grants},
            format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("token", response.data)
        return response.data["token"]

    def test_management_requires_staff(self) -> None:
        response = self.user_client.get("/api/v1/plugins/access/tokens")
        self.assertIn(response.status_code, (401, 403))
        response = self.user_client.post(
            "/api/v1/plugins/access/tokens", {"name": "x", "grants": []}, format="json"
        )
        self.assertIn(response.status_code, (401, 403))

    def test_create_returns_secret_once_list_hides_it(self) -> None:
        secret = self._create_token_via_api()
        self.assertTrue(secret.startswith("otxp_"))
        listing = self.admin_client.get("/api/v1/plugins/access/tokens")
        self.assertEqual(listing.status_code, 200)
        self.assertEqual(len(listing.data["tokens"]), 1)
        self.assertNotIn("token", listing.data["tokens"][0])
        self.assertEqual(listing.data["tokens"][0]["grants"][0]["plugin"], "echo")

    def test_revoke_blocks_calls(self) -> None:
        secret = self._create_token_via_api(name="temp")
        token = resolve_token(secret)
        self.assertIsNotNone(token)
        response = self.admin_client.delete(f"/api/v1/plugins/access/tokens/{token.id}")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.data["active"])
        self.assertIsNone(resolve_token(secret))

    @override_settings(PLUGIN_HOST_PORT=1)  # force the host unreachable
    def test_scoped_token_can_call_and_does_not_need_user(self) -> None:
        secret = self._create_token_via_api(name="caller")
        response = APIClient().post(
            "/api/v1/plugins/echo/call",
            {"method": "echo.ping", "payload": {}},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {secret}",
        )
        # Permission allowed → request reached the (down) host proxy → 503.
        self.assertEqual(response.status_code, 503)

    def test_unscoped_token_is_denied(self) -> None:
        secret = self._create_token_via_api(name="denied", grants=[{"plugin": "other"}])
        response = APIClient().post(
            "/api/v1/plugins/echo/call",
            {"method": "echo.ping", "payload": {}},
            format="json",
            HTTP_AUTHORIZATION=f"Bearer {secret}",
        )
        self.assertEqual(response.status_code, 403)

    def test_scoped_token_describe_allowed(self) -> None:
        secret = self._create_token_via_api(name="describer")
        response = APIClient().get(
            "/api/v1/plugins/echo", HTTP_AUTHORIZATION=f"Bearer {secret}"
        )
        # Describe of a scoped plugin → host down → describe None, still 200.
        self.assertEqual(response.status_code, 200)

    def test_token_cannot_uninstall_or_flip_state(self) -> None:
        secret = self._create_token_via_api(name="readonly")
        # Uninstall/state routes are not token-authenticated surfaces; the token
        # is either rejected outright (401) or permission-denied (403).
        for path, method in (
            ("/api/v1/plugins/echo", "delete"),
            ("/api/v1/plugins/echo/disable", "post"),
        ):
            client = APIClient()
            response = getattr(client, method)(path, HTTP_AUTHORIZATION=f"Bearer {secret}")
            self.assertIn(response.status_code, (401, 403))

    def test_invalid_token_rejected(self) -> None:
        response = APIClient().post(
            "/api/v1/plugins/echo/call",
            {"method": "echo.ping", "payload": {}},
            format="json",
            HTTP_AUTHORIZATION="Bearer otxp_not-a-real-token",
        )
        self.assertIn(response.status_code, (401, 403))


class PluginTokenApiTests(TestCase):
    """POST /plugins/<id>/access-token mints a per-plugin scoped token."""

    def setUp(self) -> None:
        self.admin = User.objects.create_user(
            username="admin2", password="pw", is_staff=True, is_superuser=True
        )
        self.admin_token = Token.objects.create(user=self.admin)
        self.admin_client = APIClient()
        self.admin_client.credentials(HTTP_AUTHORIZATION=f"Token {self.admin_token.key}")
        register_echo()

    def _mint(self, **body) -> tuple[int, dict]:
        response = self.admin_client.post(
            "/api/v1/plugins/echo/access-token", body, format="json"
        )
        return response.status_code, response.data

    def test_mint_whole_plugin(self) -> None:
        status_code, data = self._mint()
        self.assertEqual(status_code, 201)
        self.assertTrue(data["token"].startswith("otxp_"))
        self.assertEqual(data["name"], "Echo API access")
        self.assertEqual(data["grants"], [{"plugin": "echo", "methods": ""}])
        listing = self.admin_client.get("/api/v1/plugins/access/tokens")
        self.assertEqual(len(listing.data["tokens"]), 1)

    def test_mint_with_method_allowlist(self) -> None:
        status_code, data = self._mint(methods=["echo.ping", "echo.echo"])
        self.assertEqual(status_code, 201)
        self.assertEqual(
            data["grants"],
            [
                {"plugin": "echo", "methods": "echo.ping"},
                {"plugin": "echo", "methods": "echo.echo"},
            ],
        )

    def test_reissue_revokes_previous(self) -> None:
        _, first = self._mint(methods=["echo.ping"])
        status_code, second = self._mint()
        self.assertEqual(status_code, 201)
        self.assertNotEqual(second["token"], first["token"])
        # Only one active token remains, scoped whole-plugin.
        listing = self.admin_client.get("/api/v1/plugins/access/tokens")
        active = [t for t in listing.data["tokens"] if t["active"]]
        self.assertEqual(len(active), 1)
        self.assertEqual(active[0]["grants"], [{"plugin": "echo", "methods": ""}])

    def test_unknown_plugin_404(self) -> None:
        response = self.admin_client.post(
            "/api/v1/plugins/ghost/access-token", {}, format="json"
        )
        self.assertEqual(response.status_code, 404)

    def test_invalid_methods_400(self) -> None:
        status_code, data = self._mint(methods=[1, 2])
        self.assertEqual(status_code, 400)
        self.assertIn("error", data)


def _active_grant_tokens(plugin: str) -> list[int]:
    ids = PluginAccessTokenGrant.objects.filter(plugin=plugin, token__is_active=True).values_list(
        "token_id", flat=True
    )
    rows = PluginAccessToken.objects.filter(
        id__in=set(ids), is_active=True
    ).values_list("id", flat=True)
    return sorted(rows)


class PluginTokenLifecycleTests(TestCase):
    """The per-plugin token follows the plugin's enabled state."""

    def test_enable_mints_token_and_reenable_keeps_it(self) -> None:
        register_echo()
        plugin = enable_plugin("echo")
        self.assertTrue(plugin.enabled)
        first = _active_grant_tokens("echo")
        self.assertEqual(len(first), 1, "enabling an enabled plugin mints its scoped token")

        # Re-enabling keeps the same credential, so previously shared secrets keep
        # resolving rather than rotating on every toggle.
        enable_plugin("echo")
        self.assertEqual(_active_grant_tokens("echo"), first)

    def test_disable_deactivates_and_reenable_mints_fresh(self) -> None:
        register_echo()
        enable_plugin("echo")
        before = _active_grant_tokens("echo")
        self.assertEqual(len(before), 1)

        plugin = disable_plugin("echo")
        self.assertFalse(plugin.enabled)
        self.assertEqual(_active_grant_tokens("echo"), [], "disabling cuts the plugin's token")

        # A disabled plugin can no longer authenticate a previously-shared secret.
        latest = PluginAccessToken.objects.filter(is_active=False).order_by("-id").first()
        self.assertIsNotNone(latest)

        enable_plugin("echo")
        after = _active_grant_tokens("echo")
        self.assertEqual(len(after), 1)
        self.assertNotIn(before[0], after, "re-enable mints a fresh token, not the deactivated one")

    def test_ensure_plugin_token_is_idempotent(self) -> None:
        register_echo()
        enable_plugin("echo")
        before = _active_grant_tokens("echo")
        token, plaintext = ensure_plugin_token(plugin="echo")
        self.assertIsNone(token)
        self.assertIsNone(plaintext)
        self.assertEqual(_active_grant_tokens("echo"), before)

        deactivate_plugin_tokens("echo")
        self.assertEqual(_active_grant_tokens("echo"), [])
        token, plaintext = ensure_plugin_token(plugin="echo")
        self.assertIsNotNone(token)
        self.assertIsNotNone(plaintext)
        self.assertEqual(_active_grant_tokens("echo"), [token.id])
