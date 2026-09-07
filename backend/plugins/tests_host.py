"""Host tests: reconcile registry↔DB (sync/load/enable hooks) + control HTTP.

The DB-backed tests run the host in-process against a real temp plugins root and
the same-DB connection; the HTTP control API is exercised against a fake host so
routing/auth are tested without cross-thread DB visibility issues. A true
cross-process smoke test ships with the Plex reference plugin (increment 5).
"""

from __future__ import annotations

import json
import tempfile
import threading
from http.client import HTTPConnection
from pathlib import Path

from django.test import SimpleTestCase, TestCase

from plugins.host import PluginHost
from plugins.hostserver import HostControlServer
from plugins.manifest import parse_manifest
from plugins.models import Plugin
from plugins.services import disable_plugin, enable_plugin, register_plugin, scan_root

SAMPLE_PLUGIN = {
    "manifest.yaml": (
        "name: sample\n"
        "version: 1.0.0\n"
        "permissions: [network:external]\n"
        "services:\n"
        "  - type: search-provider\n"
        "    methods: [sample.ping]\n"
    ),
    "__init__.py": "",
    "plugin.py": (
        "from plugins.base import Plugin\n"
        "class Sample(Plugin):\n"
        "    def ping(self, payload):\n"
        "        return {'pong': payload or {}}\n"
    ),
}


class HostSyncTests(TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugin-host-root-"))

    def _write_folder(self, name: str, files: dict[str, str]) -> None:
        folder = self.root / name
        folder.mkdir()
        for relative, content in files.items():
            path = folder / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")

    def _seed_sample(self) -> None:
        self._write_folder("sample", SAMPLE_PLUGIN)

    def test_sync_loads_enabled_and_dispatches(self) -> None:
        self._seed_sample()
        with self.settings(PLUGINS_ROOT=str(self.root)):
            scan_root(self.root)
            enable_plugin("sample")
            host = PluginHost()
            result = host.sync()
            self.assertIn("sample", host.registry.ids())
            plugin = host.registry.get("sample")
            self.assertEqual(plugin.call("ping", {"x": 1}), {"pong": {"x": 1}})
            self.assertTrue(all(item["ok"] for item in result["reconciled"]))
            self.assertEqual(Plugin.objects.get(name="sample").error, "")

    def test_sync_unloads_disabled(self) -> None:
        self._seed_sample()
        with self.settings(PLUGINS_ROOT=str(self.root)):
            scan_root(self.root)
            enable_plugin("sample")
            host = PluginHost()
            host.sync()
            self.assertIn("sample", host.registry.ids())
            disable_plugin("sample")
            host.sync()
            self.assertNotIn("sample", host.registry.ids())

    def test_missing_folder_records_error_and_skips(self) -> None:
        manifest = parse_manifest("name: ghost\nversion: 1.0.0\npermissions: []\n")
        with self.settings(PLUGINS_ROOT=str(self.root)):
            register_plugin(manifest)
            enable_plugin("ghost")
            host = PluginHost()
            host.sync()
            self.assertNotIn("ghost", host.registry.ids())
            self.assertIn("not found", Plugin.objects.get(name="ghost").error)

    def test_missing_grants_blocks_load(self) -> None:
        manifest = parse_manifest(
            "name: greedy\nversion: 1.0.0\npermissions: [network:external]\n"
        )
        with self.settings(PLUGINS_ROOT=str(self.root)):
            register_plugin(manifest)
            row = Plugin.objects.get(name="greedy")
            row.permissions_granted = []
            row.enabled = True
            row.save()
            host = PluginHost()
            host.sync()
            self.assertNotIn("greedy", host.registry.ids())
            self.assertIn("missing grants", Plugin.objects.get(name="greedy").error)

    def test_enable_hook_bug_recorded_not_fatal(self) -> None:
        files = {
            "manifest.yaml": "name: boom\nversion: 1.0.0\npermissions: []\n",
            "__init__.py": "",
            "plugin.py": (
                "from plugins.base import Plugin\n"
                "class Boom(Plugin):\n"
                "    def enable(self):\n"
                "        raise RuntimeError('broken boot')\n"
            ),
        }
        self._write_folder("boom", files)
        with self.settings(PLUGINS_ROOT=str(self.root)):
            scan_root(self.root)
            enable_plugin("boom")
            host = PluginHost()
            host.sync()
            self.assertNotIn("boom", host.registry.ids())
            self.assertIn("RuntimeError: broken boot", Plugin.objects.get(name="boom").error)

    def test_call_reflects_enabled_and_plugin_errors(self) -> None:
        self._seed_sample()
        with self.settings(PLUGINS_ROOT=str(self.root)):
            scan_root(self.root)
            enable_plugin("sample")
            host = PluginHost()
            host.sync()
            self.assertTrue(host.call("sample", "ping", {"z": 2})["ok"])
            self.assertEqual(
                host.call("sample", "ping", {"z": 2})["result"], {"pong": {"z": 2}}
            )
            bad = host.call("sample", "nope.nope", None)
            self.assertFalse(bad["ok"])
            self.assertIn("no method", bad["error"])
            disabled = host.call("ghost", "ping", None)
            self.assertFalse(disabled["ok"])
            self.assertIn("not registered", disabled["error"])


class FakeHost:
    """Stand-in PluginHost for control-HTTP routing/auth tests (no DB/thread)."""

    def status(self) -> list[dict]:
        return [{"id": "sample", "version": "1.0.0", "loaded": True, "enabled": True}]

    def reload_all(self) -> dict:
        return {"reconciled": [{"id": "sample", "ok": True, "action": "enabled"}]}

    def reload(self, name: str) -> dict:
        return {"id": name, "ok": True, "loaded": True}

    def call(self, name: str, method: str, payload: object = None) -> dict:
        return {"ok": True, "result": {"echo": method, "payload": payload}}


class HostControlHttpTests(SimpleTestCase):
    def setUp(self) -> None:
        self.server = HostControlServer(FakeHost(), secret="sekret", bind="127.0.0.1", port=0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_address[1]

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def _request(
        self, method: str, path: str, body: dict | None = None, token: str = "sekret"
    ):
        conn = HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Authorization": f"Bearer {token}"}
        raw = json.dumps(body).encode() if body is not None else None
        conn.request(method, path, body=raw, headers=headers)
        response = conn.getresponse()
        payload = json.loads(response.read().decode() or "{}")
        conn.close()
        return response.status, payload

    def test_requires_bearer_secret(self) -> None:
        status, _ = self._request("GET", "/health", token="wrong")
        self.assertEqual(status, 401)

    def test_health_and_plugins(self) -> None:
        status, payload = self._request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["plugins"], 1)
        status, payload = self._request("GET", "/plugins")
        self.assertEqual(status, 200)
        self.assertEqual(payload["plugins"][0]["id"], "sample")

    def test_reload_and_reload_all(self) -> None:
        status, payload = self._request("POST", "/plugins/sample/reload")
        self.assertEqual(status, 200)
        self.assertTrue(payload["ok"])
        status, payload = self._request("POST", "/plugins/reload-all")
        self.assertEqual(status, 200)
        self.assertTrue(payload["reconciled"][0]["ok"])

    def test_call_route_dispatches_method(self) -> None:
        status, payload = self._request(
            "POST", "/plugins/sample/call", {"method": "movies.list", "payload": {}}
        )
        self.assertEqual(status, 200)
        self.assertEqual(payload["result"]["echo"], "movies.list")

    def test_unknown_route_404(self) -> None:
        status, _ = self._request("GET", "/nope")
        self.assertEqual(status, 404)
