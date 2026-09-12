"""API tests for the plugin framework routes under /api/v1/plugins/.

DB-backed state transitions + config are exercised directly; the proxy path
(call/describe/host status) runs against a ``HostControlServer`` in a thread
backed by a fake host so no plugin code or cross-thread DB is involved. Real
host↔plugin behaviour is covered in ``tests_host.py`` and the live smoke.
"""

from __future__ import annotations

import tempfile
import threading
from pathlib import Path

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from plugins.hostserver import HostControlServer
from plugins.manifest import parse_manifest
from plugins.models import Plugin
from plugins.services import register_plugin

User = get_user_model()

MANIFEST = "name: echo\nversion: 1.0.0\npermissions: [network:external]\n"


def register_echo(name: str = "echo") -> Plugin:
    return register_plugin(parse_manifest(MANIFEST.replace("name: echo", f"name: {name}")))[0]


class PluginApiStateTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    def test_requires_auth(self) -> None:
        anon = APIClient()
        response = anon.get("/api/v1/plugins/")
        self.assertIn(response.status_code, (401, 403))

    def test_list_requires_no_host(self) -> None:
        register_echo()
        response = self.client.get("/api/v1/plugins/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["plugins"][0]["id"], "echo")
        self.assertIsNone(response.data["host"])  # host down → degrades gracefully

    def test_capabilities_announcement(self) -> None:
        response = self.client.get("/api/v1/plugins/capabilities")
        self.assertEqual(response.status_code, 200)
        self.assertIn("network:external", response.data["permissions"])
        self.assertIn("network:any", response.data["grantable"])
        self.assertIn("string", response.data["config_field_types"])
        self.assertIn("stable", response.data["stages"])

    def test_enable_disable_and_reload_actions(self) -> None:
        register_echo()
        response = self.client.post("/api/v1/plugins/echo/enable")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["plugin"]["enabled"])
        self.assertFalse(response.data["host"]["ok"])  # unreachable host surfaced
        response = self.client.post("/api/v1/plugins/echo/disable")
        self.assertFalse(response.data["plugin"]["enabled"])
        response = self.client.post("/api/v1/plugins/echo/unknown-action")
        self.assertEqual(response.status_code, 400)

    def test_system_plugin_cannot_disable_or_uninstall(self) -> None:
        register_plugin(parse_manifest(MANIFEST), system=True)
        self.assertEqual(self.client.post("/api/v1/plugins/echo/disable").status_code, 409)
        self.assertEqual(self.client.delete("/api/v1/plugins/echo").status_code, 409)
        self.assertTrue(Plugin.objects.filter(name="echo").exists())

    def test_uninstall_deletes_row(self) -> None:
        register_echo()
        response = self.client.delete("/api/v1/plugins/echo")
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Plugin.objects.filter(name="echo").exists())

    def test_detail_includes_config_schema(self) -> None:
        register_echo()
        response = self.client.get("/api/v1/plugins/echo")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["config_schema"], {})
        self.assertEqual(response.data["describe"], None)  # host down

    def test_config_get_put(self) -> None:
        register_echo()
        response = self.client.get("/api/v1/plugins/echo/config")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["config"], {})

        response = self.client.put(
            "/api/v1/plugins/echo/config",
            {"config": {"greeting": "hola"}, "instances": [{"instance_id": "a"}]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["config"], {"greeting": "hola"})

        response = self.client.put(
            "/api/v1/plugins/echo/config", {"instances": "nope"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_call_404_when_host_down_503(self) -> None:
        register_echo()
        response = self.client.post(
            "/api/v1/plugins/ghost/call", {"method": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 404)
        response = self.client.post(
            "/api/v1/plugins/echo/call", {"method": "x"}, format="json"
        )
        self.assertEqual(response.status_code, 503)

    def test_discover_scans_a_root(self) -> None:
        root = Path(tempfile.mkdtemp(prefix="plugins-api-root-"))
        folder = root / "echo"
        folder.mkdir()
        (folder / "manifest.yaml").write_text(MANIFEST, encoding="utf-8")
        (folder / "__init__.py").write_text("", encoding="utf-8")
        (folder / "plugin.py").write_text("from plugins.base import Plugin\n", encoding="utf-8")
        with override_settings(PLUGINS_ROOT=str(root)):
            response = self.client.post("/api/v1/plugins/")
        self.assertEqual(response.status_code, 201)
        self.assertTrue(response.data["scanned"][0]["created"])
        self.assertTrue(Plugin.objects.filter(name="echo").exists())


class FakeHost:
    """Stand-in PluginHost behind a real HostControlServer for the proxy tests."""

    def status(self) -> list[dict]:
        return [{"id": "echo", "version": "1.0.0", "enabled": True, "loaded": True}]

    def describe(self, name: str) -> dict:
        return {"ok": True, "result": {"id": name, "manifest": {"name": name}}}

    def call(self, name: str, method: str, payload: object = None) -> dict:
        return {"ok": True, "result": {"echo": method, "payload": payload}}

    def reload(self, name: str) -> dict:
        return {"id": name, "ok": True, "loaded": True}

    def reload_all(self) -> dict:
        return {"reconciled": [{"id": "echo", "ok": True, "action": "enabled"}]}


class PluginApiProxyTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="bob", password="pw")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")
        register_echo()
        self.server = HostControlServer(FakeHost(), secret="sekret", bind="127.0.0.1", port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def _settings(self):
        return override_settings(
            PLUGIN_HOST_BIND="127.0.0.1",
            PLUGIN_HOST_PORT=self.port,
            PLUGIN_HOST_SECRET="sekret",
        )

    def test_list_and_capabilities_include_host_status(self) -> None:
        with self._settings():
            response = self.client.get("/api/v1/plugins/")
            self.assertEqual(response.data["host"][0]["loaded"], True)
            response = self.client.get("/api/v1/plugins/capabilities")
            self.assertEqual(response.data["host"][0]["id"], "echo")

    def test_detail_describe_from_host(self) -> None:
        with self._settings():
            self.client.post("/api/v1/plugins/echo/enable")
            response = self.client.get("/api/v1/plugins/echo")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["describe"]["ok"])

    def test_call_proxies_to_host(self) -> None:
        with self._settings():
            response = self.client.post(
                "/api/v1/plugins/echo/call",
                {"method": "sample.ping", "payload": {"x": 1}},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["result"]["echo"], "sample.ping")

    def test_call_requires_method(self) -> None:
        with self._settings():
            response = self.client.post("/api/v1/plugins/echo/call", {}, format="json")
        self.assertEqual(response.status_code, 400)
