"""Reference Plex plugin end-to-end: seed → enable → host → data methods.

Loads the real bundled plugin (the shipped ``bundled_plugins/plex/`` folder),
registers it as a system row via ``scan_bundled``, starts the host in-process
and round-trips data methods that call a fake Plex HTTP server through the
grant-gated ``HttpService``. Also proves grant enforcement: revoking a declared
grant takes the system plugin down.
"""

from __future__ import annotations

import json
import shutil
import tempfile
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from django.test import TestCase

from plugin_framework.host import PluginHost
from plugin_framework.models import Plugin
from plugin_framework.services import scan_bundled, scan_root

PLEX_FOLDER = Path(__file__).resolve().parent.parent / "bundled_plugins" / "plex"


class _PlexServer(ThreadingHTTPServer):
    daemon_threads = True
    requests = 0
    seen_token: str | None = None


class _PlexHandler(BaseHTTPRequestHandler):
    def log_message(self, _format: str, *args) -> None:
        pass

    def do_GET(self) -> None:
        server = self.server
        server.requests += 1
        server.seen_token = self.headers.get("X-Plex-Token")
        path = urlsplit(self.path).path
        body, status = self._route(path)
        raw = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    @staticmethod
    def _route(path: str) -> tuple[dict, int]:
        if path == "/identity":
            return (
                {
                    "MediaContainer": {
                        "size": 1,
                        "claimed": True,
                        "machineIdentifier": "mock-plex-id",
                        "version": "1.32.6",
                        "platform": "Linux",
                    }
                },
                200,
            )
        if path == "/library/sections":
            return (
                {
                    "MediaContainer": {
                        "size": 2,
                        "Directory": [
                            {"key": "1", "type": "movie", "title": "Movies", "size": 1},
                            {"key": "2", "type": "show", "title": "Shows", "size": 0},
                        ],
                    }
                },
                200,
            )
        if path.startswith("/library/sections/") and path.endswith("/all"):
            return (
                {
                    "MediaContainer": {
                        "size": 1,
                        "Metadata": [{"ratingKey": "1", "type": "movie", "title": "Blade Runner"}],
                    }
                },
                200,
            )
        return ({"errors": [{"code": 1, "message": "not found"}]}, 404)


class PlexPluginEndToEnd(TestCase):
    def setUp(self) -> None:
        self.server = _PlexServer(("127.0.0.1", 0), _PlexHandler)
        self.server.requests = 0
        self.server.seen_token = None
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        # addCleanup runs LIFO — join last, so shutdown/close happen first.
        self.addCleanup(self.thread.join, 5)
        self.addCleanup(self.server.server_close)
        self.addCleanup(self.server.shutdown)

        self.operator = Path(tempfile.mkdtemp(prefix="plex-operator-root-"))
        self.bundled = Path(tempfile.mkdtemp(prefix="plex-bundled-root-"))
        shutil.copytree(PLEX_FOLDER, self.bundled / "plex")
        self._settings = self.settings(
            PLUGINS_ROOT=str(self.operator), BUNDLED_PLUGINS_ROOT=str(self.bundled)
        )
        self._settings.enable()
        self.addCleanup(self._settings.disable)

        scan_bundled()
        row = Plugin.objects.get(name="plex")
        row.config = {"serverUrl": f"http://127.0.0.1:{self.server.server_address[1]}"}
        row.save(update_fields=("config", "updated_at"))
        self.host = PluginHost()
        self.host.sync()

    def _call(self, method: str, payload=None) -> dict:
        return self.host.call("plex", method, payload)

    def _set_config(self, **values) -> None:
        row = Plugin.objects.get(name="plex")
        config = dict(row.config)
        config.update({k: v for k, v in values.items() if v is not None})
        for key in values:
            if values[key] is None:
                config.pop(key, None)
        row.config = config
        row.save(update_fields=("config", "updated_at"))

    # ── Seed + lifecycle ────────────────────────────────────────────────
    def test_scan_bundled_seeds_system_enabled_and_granted(self) -> None:
        row = Plugin.objects.get(name="plex")
        self.assertTrue(row.system)
        self.assertTrue(row.enabled)
        self.assertEqual(row.permissions_declared, ["network:external"])
        self.assertEqual(row.permissions_granted, ["network:external"])
        self.assertEqual(row.missing_grants(), [])

    def test_status_loads_plex(self) -> None:
        by_id = {entry["id"]: entry for entry in self.host.status()}
        self.assertTrue(by_id["plex"]["loaded"])
        self.assertEqual(by_id["plex"]["version"], "1.0.0")

    # ── Data-method round trips through the host ────────────────────────
    def test_identity_round_trips_pluginapi_envelope(self) -> None:
        result = self._call("plex.identity")
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["result"]["machineIdentifier"], "mock-plex-id")

    def test_libraries_list_uses_config_token_header(self) -> None:
        self._set_config(token="tok-abc")
        result = self._call("plex.libraries")
        self.assertTrue(result["ok"], result)
        self.assertEqual(self.server.seen_token, "tok-abc")
        titles = [d["title"] for d in result["result"]["Directory"]]
        self.assertEqual(titles, ["Movies", "Shows"])

    def test_library_items_takes_section_payload(self) -> None:
        self._set_config(token="tok-abc")
        result = self._call("plex.library_items", {"section": "1"})
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["result"]["Metadata"][0]["title"], "Blade Runner")

    def test_library_items_requires_section(self) -> None:
        result = self._call("plex.library_items")
        self.assertFalse(result["ok"])
        self.assertIn("section", result["error"])

    def test_missing_server_url_returns_clear_error(self) -> None:
        self._set_config(serverUrl=None)
        result = self._call("plex.identity")
        self.assertFalse(result["ok"])
        self.assertIn("serverUrl", result["error"])

    def test_unreachable_server_returns_error_envelope(self) -> None:
        self._set_config(serverUrl="http://127.0.0.1:1")
        result = self._call("plex.identity")
        self.assertFalse(result["ok"])
        self.assertNotIn("Traceback", result["error"])

    # ── Grant enforcement on a system plugin ────────────────────────────
    def test_revoking_declared_grant_takes_system_plugin_down(self) -> None:
        row = Plugin.objects.get(name="plex")
        row.permissions_granted = []
        row.save(update_fields=("permissions_granted", "updated_at"))
        result = self._call("plex.identity")
        self.assertFalse(result["ok"])
        self.assertIn("missing grants", result["error"])
        # host.reload records the failure on the row and unloads the plugin.
        self.host.reload("plex")
        row.refresh_from_db()
        self.assertIn("missing grants", row.error)
        self.assertNotIn("plex", self.host.registry.ids())

    # ── Operator shadowing of a bundled name ────────────────────────────
    def test_operator_plex_folder_shadows_bundled_copy(self) -> None:
        # An operator installs their own "plex" under PLUGINS_ROOT (no bundled
        # row yet): the bundled reseed must not hijack the operator-owned row.
        Plugin.objects.filter(name="plex").delete()
        folder = self.operator / "plex"
        folder.mkdir()
        (folder / "__init__.py").write_text("", encoding="utf-8")
        (folder / "plugin.py").write_text(
            "from plugin_framework.base import Plugin\n"
            "class Plex(Plugin):\n"
            "    def ping(self, payload):\n"
            "        return {'source': 'operator'}\n",
            encoding="utf-8",
        )
        (folder / "manifest.yaml").write_text("name: plex\nversion: 9.9.9\n", encoding="utf-8")
        scan_root(self.operator)
        row = Plugin.objects.get(name="plex")
        self.assertFalse(row.system)
        self.assertNotEqual(row.version, "1.0.0")
        report = {item["id"]: item for item in scan_bundled()}
        self.assertEqual(report["plex"]["skipped"], "operator copy wins")
        row.refresh_from_db()
        self.assertFalse(row.system)
        self.assertEqual(row.version, "9.9.9")
