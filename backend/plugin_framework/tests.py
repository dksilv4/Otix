"""Tests for the plugin framework foundation.

Uses real temporary plugin folders for the discovery/registry story so it also
documents the drop-in layout. No DB/models are involved yet — the framework
core is pure Python.
"""

from __future__ import annotations

import tempfile
from pathlib import Path

from django.test import SimpleTestCase

from plugin_framework.base import Plugin, PluginError, to_json_safe
from plugin_framework.discovery import scan
from plugin_framework.manifest import ManifestError, parse_manifest
from plugin_framework.permissions import codename_for, missing_grants, unsupported_grants
from plugin_framework.registry import PluginRegistry, load_plugin

VALID_YAML = """
name: echo
version: 1.2.0
description: Returns what you send it.
author: otix
repository: https://example.com/echo
min_app_version: 1.0.0
stage: stable
permissions:
  - network:external
  - storage:local
entry:
  main: plugin.py
services:
  - type: search-provider
    methods: [echo.ping]
config:
  greeting:
    type: string
    label: Greeting
    default: hi
unknown_future_key: ignored
"""


class ManifestTests(SimpleTestCase):
    def test_parse_round_trips_to_js_shape(self) -> None:
        manifest = parse_manifest(VALID_YAML)
        self.assertEqual(manifest.name, "echo")
        self.assertEqual(manifest.version, "1.2.0")
        self.assertEqual(manifest.entry_main, "plugin.py")
        self.assertEqual(manifest.permissions, ("network:external", "storage:local"))
        self.assertEqual(manifest.services[0].type, "search-provider")
        self.assertEqual(manifest.services[0].methods, ("echo.ping",))
        self.assertEqual(manifest.config["greeting"]["default"], "hi")

        dumped = manifest.to_dict()
        self.assertEqual(dumped["name"], "echo")
        self.assertEqual(dumped["entry"], {"main": "plugin.py"})
        self.assertEqual(dumped["services"][0]["type"], "search-provider")
        self.assertNotIn("unknown_future_key", dumped)

    def test_minimal_manifest_defaults(self) -> None:
        manifest = parse_manifest("name: tiny\nversion: 0.0.1\n")
        self.assertEqual(manifest.entry_main, "plugin.py")
        self.assertEqual(manifest.permissions, ())
        self.assertEqual(manifest.services, ())
        self.assertEqual(manifest.stage, "stable")
        self.assertFalse(manifest.system)

    def test_bad_name_is_rejected(self) -> None:
        with self.assertRaises(ManifestError):
            parse_manifest("name: 'Not A Slug'\nversion: 1.0.0\n")

    def test_missing_version_is_rejected(self) -> None:
        with self.assertRaises(ManifestError):
            parse_manifest("name: echo\n")

    def test_unknown_permission_is_rejected(self) -> None:
        with self.assertRaises(ManifestError):
            parse_manifest("name: echo\nversion: 1.0.0\npermissions: [sudo]\n")

    def test_server_grant_permissions_accepted(self) -> None:
        manifest = parse_manifest(
            "name: echo\nversion: 1.0.0\npermissions: [table:media_ratings, network:any]\n"
        )
        self.assertEqual(manifest.permissions, ("table:media_ratings", "network:any"))

    def test_bad_config_field_type_is_rejected(self) -> None:
        with self.assertRaises(ManifestError):
            parse_manifest("name: echo\nversion: 1.0.0\nconfig:\n  x:\n    type: wat\n")

    def test_entry_must_be_bare_filename(self) -> None:
        with self.assertRaises(ManifestError):
            parse_manifest("name: echo\nversion: 1.0.0\nentry:\n  main: ../evil.py\n")

    def test_missing_entry_file_rejected_with_root(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ManifestError):
                parse_manifest(
                    "name: echo\nversion: 1.0.0\nentry:\n  main: nope.py\n",
                    root=Path(tmp),
                )


class PermissionTests(SimpleTestCase):
    def test_codename_is_stable_and_django_safe(self) -> None:
        self.assertEqual(codename_for("network:external"), "can_network_external")
        self.assertEqual(codename_for("ui:media.actions"), "can_ui_media_actions")
        self.assertEqual(codename_for("table:media_ratings"), "can_table_media_ratings")
        self.assertEqual(codename_for("notifications"), "can_notifications")

    def test_missing_grants_exact_and_wildcard(self) -> None:
        declared = ["network:external", "storage:local", "table:media_ratings"]
        self.assertEqual(
            missing_grants(declared, {"storage:local"}),
            {"network:external", "table:media_ratings"},
        )
        # table:any covers the table grant but not the network one.
        self.assertEqual(
            missing_grants(declared, {"storage:local", "table:any"}),
            {"network:external"},
        )
        self.assertEqual(missing_grants(declared, set(declared)), set())

    def test_unsupported_grants_flag_unknown_power(self) -> None:
        self.assertEqual(unsupported_grants({"network:external"}), set())
        self.assertEqual(unsupported_grants({"table:any"}), set())
        self.assertIn("sudo", unsupported_grants({"sudo"}))


class EchoPlugin(Plugin):
    """Sample plugin exercising dispatch/json-safety (not under a scan root)."""

    def __init__(self, manifest) -> None:
        super().__init__(manifest)

    def ping(self, payload) -> dict:
        return {"pong": payload}

    def movies_list(self, payload) -> list[dict]:
        return [{"title": "Arrival"}, {"title": "Dune"}]

    def noisy(self, payload) -> bytes:
        return b"raw-bytes"


class PluginDispatchTests(SimpleTestCase):
    def setUp(self) -> None:
        self.plugin = EchoPlugin(parse_manifest(VALID_YAML))

    def test_dispatch_uses_dot_namespaces(self) -> None:
        self.assertEqual(self.plugin.call("ping", {"x": 1}), {"pong": {"x": 1}})
        self.assertEqual(len(self.plugin.call("movies.list", None)), 2)

    def test_unknown_method_raises(self) -> None:
        with self.assertRaises(PluginError):
            self.plugin.call("does.not_exist", None)

    def test_reserved_names_are_not_data_methods(self) -> None:
        handlers = self.plugin.handlers()
        self.assertNotIn("call", handlers)
        self.assertNotIn("enable", handlers)
        self.assertIn("ping", handlers)
        self.assertIn("movies.list", handlers)

    def test_json_safe_coercion(self) -> None:
        from datetime import date

        payload = self.plugin.call("noisy", None)
        self.assertEqual(payload, "raw-bytes")
        self.assertEqual(to_json_safe({date(2026, 1, 2): {1, 2}}), {"2026-01-02": [1, 2]})
        with self.assertRaises(PluginError):
            to_json_safe(object())

    def test_describe_advertises_manifest_and_methods(self) -> None:
        described = self.plugin.describe()
        self.assertEqual(described["id"], "echo")
        self.assertEqual(described["manifest"]["name"], "echo")
        self.assertIn("movies.list", described["methods"])


class DiscoveryRegistryTests(SimpleTestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugins-test-"))

    def _write(self, relative: str, content: str) -> Path:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def _seed_plugin_folder(self) -> None:
        self._write(
            "echo/manifest.yaml",
            "name: echo\nversion: 1.0.0\npermissions: [network:external]\n",
        )
        self._write("echo/__init__.py", "")
        self._write(
            "echo/plugin.py",
            "from plugin_framework.base import Plugin\n"
            "class Echo(Plugin):\n"
            "    def ping(self, payload):\n"
            "        return {'pong': payload or {}}\n",
        )

    def test_scan_finds_healthy_and_reports_broken(self) -> None:
        self._seed_plugin_folder()
        # Broken: unknown permission → manifest validation error, not a crash.
        self._write(
            "borked/manifest.yaml",
            "name: borked\nversion: 1.0.0\npermissions: [sudo]\n",
        )
        self._write("borked/__init__.py", "")
        self._write("borked/plugin.py", "from plugin_framework.base import Plugin\n")
        # Not a plugin dir (no manifest) → ignored entirely.
        self._write("notes/scratch.txt", "not a plugin")

        found = {record.id: record for record in scan(self.root)}
        self.assertTrue(found["echo"].ok)
        self.assertEqual(found["echo"].manifest.name, "echo")
        self.assertFalse(found["borked"].ok)
        self.assertIn("not a known capability", found["borked"].error)
        self.assertNotIn("notes", found)

    def test_manifest_name_must_equal_folder_name(self) -> None:
        # Folder "renamed" declares name "other" → broken, reported, not loaded.
        self._write(
            "renamed/manifest.yaml",
            "name: other\nversion: 1.0.0\npermissions: [network:external]\n",
        )
        self._write("renamed/__init__.py", "")
        self._write("renamed/plugin.py", "from plugin_framework.base import Plugin\n")
        found = {record.id: record for record in scan(self.root)}
        self.assertFalse(found["renamed"].ok)
        self.assertIn("must match folder name", found["renamed"].error)
        self.assertNotIn("other", found)

    def test_registry_scan_and_load_runs_plugin(self) -> None:
        self._seed_plugin_folder()
        registry = PluginRegistry()
        registry.scan_and_load(self.root)
        plugin = registry.get("echo")
        self.assertIsNotNone(plugin)
        self.assertEqual(plugin.call("ping", {"hello": 1}), {"pong": {"hello": 1}})
        self.assertEqual(registry.errors, {})

    def test_registry_isolates_failing_entry(self) -> None:
        self._seed_plugin_folder()
        self._write(
            "dead/manifest.yaml",
            "name: dead\nversion: 1.0.0\nentry:\n  main: missing.py\n",
        )
        self._write("dead/__init__.py", "")
        registry = PluginRegistry()
        registry.scan_and_load(self.root)
        # echo loads; dead records an error and is absent.
        self.assertIsNotNone(registry.get("echo"))
        self.assertIsNone(registry.get("dead"))
        self.assertIn("dead", registry.errors)

    def test_reload_replaces_without_collision(self) -> None:
        self._seed_plugin_folder()
        registry = PluginRegistry()
        registry.scan_and_load(self.root)
        first = registry.get("echo")
        # Mutate the entry then rescan: same module name, fresh code.
        self._write(
            "echo/plugin.py",
            "from plugin_framework.base import Plugin\n"
            "class Echo(Plugin):\n"
            "    def ping(self, payload):\n"
            "        return {'v2': True}\n",
        )
        registry.scan_and_load(self.root)
        second = registry.get("echo")
        self.assertIsNotNone(first)
        self.assertIsNotNone(second)
        self.assertIsNot(first, second)
        self.assertEqual(second.call("ping", None), {"v2": True})


class LoadPluginTests(SimpleTestCase):
    def test_entry_without_plugin_subclass_raises(self) -> None:
        from plugin_framework.manifest import PluginManifest

        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "manifest.yaml").write_text("name: x\nversion: 1.0.0\n", encoding="utf-8")
            (root / "plugin.py").write_text("VALUE = 1\n", encoding="utf-8")
            manifest = PluginManifest(name="x", version="1.0.0")
            with self.assertRaises(PluginError):
                load_plugin(manifest, root)
