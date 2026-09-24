"""Framework-service tests: grant enforcement on http + per-plugin storage.

Unit level covers service gating (allowed vs PluginPermissionDenied) and the
store persistence shape; integration level loads real plugins in the host and
calls data methods that read config and use the services, so the inject +
refresh path is proven end to end in-process.
"""

from __future__ import annotations

import json
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from django.test import TestCase

from plugin_framework.base import PluginError
from plugin_framework.framework import (
    HttpService,
    PluginPermissionDenied,
    StoreService,
)
from plugin_framework.host import PluginHost
from plugin_framework.manifest import parse_manifest
from plugin_framework.models import Plugin
from plugin_framework.services import enable_plugin, register_plugin, scan_root

STORE_MANIFEST = (
    "name: sample\n"
    "version: 1.0.0\n"
    "permissions: [network:external, storage:local]\n"
    "config:\n"
    "  greeting:\n"
    "    type: string\n"
    "    default: hi\n"
)

SAMPLE_FILES = {
    "manifest.yaml": STORE_MANIFEST,
    "__init__.py": "",
    "plugin.py": (
        "from plugin_framework.base import Plugin\n"
        "class Sample(Plugin):\n"
        "    def echo_config(self, payload):\n"
        "        return self.services.config\n"
        "    def store_put(self, payload):\n"
        "        self.services.store.set('k', payload)\n"
        "        return self.services.store.get('k')\n"
        "    def store_keys(self, payload):\n"
        "        return self.services.store.keys()\n"
        "    def fetch(self, payload):\n"
        "        return self.services.http.get_json(payload['url'])\n"
    ),
}


class _JsonServer(ThreadingHTTPServer):
    daemon_threads = True


class _JsonHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *args) -> None:
        pass

    def do_GET(self) -> None:
        body = json.dumps({"echo": self.path}).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class StoreServiceTests(TestCase):
    def setUp(self) -> None:
        self.plugin, _ = register_plugin(parse_manifest(STORE_MANIFEST))

    def test_set_get_delete_and_keys(self) -> None:
        store = StoreService(self.plugin.name, {"storage:local"})
        store.set("k", {"nested": [1, 2]})
        self.assertEqual(store.get("k"), {"nested": [1, 2]})
        self.assertEqual(store.keys(), ["k"])
        store.delete("k")
        self.assertIsNone(store.get("k"))
        self.assertEqual(store.keys(), [])

    def test_missing_grant_denied(self) -> None:
        store = StoreService(self.plugin.name, set())
        with self.assertRaises(PluginPermissionDenied):
            store.set("k", 1)

    def test_non_json_safe_value_rejected(self) -> None:
        store = StoreService(self.plugin.name, {"storage:local"})
        with self.assertRaises(PluginError):
            store.set("bad", object())


class HttpServiceTests(TestCase):
    def setUp(self) -> None:
        self.server = _JsonServer(("127.0.0.1", 0), _JsonHandler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.url = f"http://127.0.0.1:{self.server.server_address[1]}/ping"

    def tearDown(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)

    def test_allowed_get_json(self) -> None:
        http = HttpService({"network:external"})
        data = http.get_json(self.url)
        self.assertEqual(data["echo"], "/ping")

    def test_missing_grant_denied_before_network(self) -> None:
        http = HttpService(set())
        with self.assertRaises(PluginPermissionDenied):
            http.get_json(self.url)

    def test_wildcard_network_any_covers_external(self) -> None:
        http = HttpService({"network:any"})
        self.assertEqual(http.get_json(self.url)["echo"], "/ping")

    def test_non_http_scheme_rejected(self) -> None:
        http = HttpService({"network:external"})
        with self.assertRaises(PluginError):
            http.request("file:///etc/passwd")


class HostServicesTests(TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugin-framework-root-"))
        folder = self.root / "sample"
        folder.mkdir()
        for relative, content in SAMPLE_FILES.items():
            path = folder / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        self._settings_root = self.settings(PLUGINS_ROOT=str(self.root))
        self._settings_root.enable()
        self.addCleanup(self._settings_root.disable)
        scan_root(self.root)
        enable_plugin("sample")
        self.host = PluginHost()
        self.host.sync()

    def _call(self, method: str, payload=None) -> dict:
        return self.host.call("sample", method, payload)

    def test_config_refreshed_into_services(self) -> None:
        self._call("echo.config")  # services bound even with no prior dispatch
        result = self._call("echo.config")
        self.assertTrue(result["ok"])
        self.assertEqual(result["result"], {})

    def test_store_persists_across_dispatches(self) -> None:
        first = self._call("store.put", {"token": "abc"})
        self.assertTrue(first["ok"])
        self.assertEqual(first["result"], {"token": "abc"})
        second = self._call("store.put", {"token": "def"})
        self.assertEqual(second["result"], {"token": "def"})
        # still persisted in the DB under the plugin's store
        plugin = Plugin.objects.get(name="sample")
        self.assertEqual(plugin.store.get(key="k").value, {"token": "def"})

    def test_http_service_gated_inside_plugin(self) -> None:
        server = _JsonServer(("127.0.0.1", 0), _JsonHandler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        # addCleanup runs LIFO, so register in reverse: join first, so
        # shutdown/close execute before the join unblocks.
        self.addCleanup(thread.join, 5)
        self.addCleanup(server.server_close)
        self.addCleanup(server.shutdown)
        url = f"http://127.0.0.1:{server.server_address[1]}/inside"
        result = self._call("fetch", {"url": url})
        self.assertTrue(result["ok"])
        self.assertEqual(result["result"]["echo"], "/inside")

    def test_plugin_not_granted_storage_is_denied_inside_method(self) -> None:
        # "sneaky" only declares network:external yet tries store.set — the host
        # dispatches fine (declared ⊆ granted) and the service refuses.
        folder = self.root / "sneaky"
        folder.mkdir()
        files = dict(SAMPLE_FILES)
        files["manifest.yaml"] = "name: sneaky\nversion: 1.0.0\npermissions: [network:external]\n"
        for relative, content in files.items():
            path = folder / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        scan_root(self.root)
        enable_plugin("sneaky")
        self.host.reload("sneaky")
        result = self.host.call("sneaky", "store.put", {"x": 1})
        self.assertFalse(result["ok"])
        self.assertIn("not granted 'storage:local'", result["error"])
