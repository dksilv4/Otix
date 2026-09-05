"""State-layer tests: registry models, service transitions, manage.py commands.

These exercise the API-owned ``Plugin`` rows (operator intent) and never run
plugin code. The pure-Python core (manifest/discovery/registry/dispatch) is
covered by ``tests.py`` alongside filesystem discovery.
"""

from __future__ import annotations

import tempfile
from io import StringIO
from pathlib import Path

from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from plugins.manifest import parse_manifest
from plugins.models import Plugin
from plugins.services import (
    PluginStateError,
    disable_plugin,
    enable_plugin,
    register_plugin,
    scan_root,
    unregister_plugin,
)

VALID = """\
name: echo
version: 1.0.0
description: Returns what you send it.
permissions: [network:external]
config:
  greeting:
    type: string
    default: hi
"""


def manifest(text: str = VALID):
    return parse_manifest(text)


class RegisterServiceTests(TestCase):
    def test_register_creates_seeded_grant_and_state(self) -> None:
        plugin, created = register_plugin(manifest())
        self.assertTrue(created)
        self.assertEqual(plugin.name, "echo")
        self.assertEqual(plugin.version, "1.0.0")
        self.assertFalse(plugin.enabled)
        self.assertFalse(plugin.system)
        self.assertEqual(plugin.permissions_declared, ["network:external"])
        self.assertEqual(plugin.permissions_granted, ["network:external"])
        self.assertEqual(plugin.config, {})
        self.assertEqual(plugin.instances, [])
        self.assertEqual(plugin.missing_grants(), [])
        self.assertEqual(plugin.manifest["name"], "echo")

    def test_reregister_updates_snapshot_keeps_operator_state(self) -> None:
        register_plugin(manifest())
        plugin = Plugin.objects.get(name="echo")
        plugin.enabled = True
        plugin.config["greeting"] = "hola"
        plugin.permissions_granted = ["network:any"]
        plugin.save()

        bumped = manifest(VALID.replace("1.0.0", "1.1.0"))
        again, created = register_plugin(bumped)
        self.assertFalse(created)
        again.refresh_from_db()
        self.assertEqual(again.version, "1.1.0")
        self.assertEqual(again.manifest["version"], "1.1.0")
        self.assertTrue(again.enabled)
        self.assertEqual(again.config, {"greeting": "hola"})
        # Freshly-declared + operator grants both preserved (deduped).
        self.assertEqual(set(again.permissions_granted), {"network:any", "network:external"})

    def test_system_plugin_autoeanbles_and_cannot_be_touched(self) -> None:
        plugin, created = register_plugin(manifest(), system=True)
        self.assertTrue(created)
        self.assertTrue(plugin.enabled)
        self.assertTrue(plugin.system)
        with self.assertRaises(PluginStateError):
            disable_plugin("echo")
        with self.assertRaises(PluginStateError):
            unregister_plugin("echo")

    def test_enable_flips_flag(self) -> None:
        register_plugin(manifest())
        enable_plugin("echo")
        plugin = Plugin.objects.get(name="echo")
        self.assertTrue(plugin.enabled)
        self.assertEqual(plugin.error, "")

    def test_enable_refuses_when_a_declared_grant_was_revoked(self) -> None:
        plugin, _ = register_plugin(manifest())
        plugin.permissions_granted = []
        plugin.save()
        with self.assertRaises(PluginStateError):
            enable_plugin("echo")
        self.assertFalse(Plugin.objects.get(name="echo").enabled)

    def test_unknown_plugin_ops_raise(self) -> None:
        with self.assertRaises(PluginStateError):
            enable_plugin("nope")
        with self.assertRaises(PluginStateError):
            disable_plugin("nope")
        with self.assertRaises(PluginStateError):
            unregister_plugin("nope")

    def test_disable_and_unregister(self) -> None:
        register_plugin(manifest())
        disable_plugin("echo")
        self.assertFalse(Plugin.objects.get(name="echo").enabled)
        unregister_plugin("echo")
        self.assertFalse(Plugin.objects.filter(name="echo").exists())


class ScanServiceTests(TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugins-root-"))

    def _write(self, relative: str, content: str) -> None:
        path = self.root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")

    def _seed_folder(self, name: str, version: str = "1.0.0") -> None:
        self._write(
            f"{name}/manifest.yaml",
            f"name: {name}\nversion: {version}\npermissions: [network:external]\n",
        )
        self._write(f"{name}/__init__.py", "")
        self._write(f"{name}/plugin.py", "from plugins.base import Plugin\n")

    def test_scan_registers_healthy_and_reports_broken(self) -> None:
        self._seed_folder("echo")
        # Broken: manifest name != folder name.
        self._write(
            "typo/manifest.yaml",
            "name: echo2\nversion: 1.0.0\npermissions: [network:external]\n",
        )
        self._write("typo/__init__.py", "")
        self._write("typo/plugin.py", "from plugins.base import Plugin\n")

        report = {item["id"]: item for item in scan_root(self.root)}
        self.assertTrue(report["echo"]["ok"])
        self.assertTrue(report["echo"]["created"])
        self.assertFalse(report["echo"]["enabled"])
        self.assertFalse(report["typo"]["ok"])
        self.assertIn("must match folder name", report["typo"]["error"])
        self.assertTrue(Plugin.objects.filter(name="echo").exists())
        self.assertFalse(Plugin.objects.filter(name="typo").exists())

    def test_scan_twice_is_idempotent_and_preserves_enabled(self) -> None:
        self._seed_folder("echo", "1.0.0")
        scan_root(self.root)
        enable_plugin("echo")
        self._seed_folder("echo", "1.2.0")
        report = scan_root(self.root)
        self.assertTrue(report[0]["ok"])
        self.assertFalse(report[0]["created"])
        plugin = Plugin.objects.get(name="echo")
        self.assertEqual(plugin.version, "1.2.0")
        self.assertTrue(plugin.enabled)


class CommandTests(TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugins-cmd-"))
        (self.root / "echo").mkdir()
        (self.root / "echo" / "manifest.yaml").write_text(
            "name: echo\nversion: 1.0.0\npermissions: [network:external]\n",
            encoding="utf-8",
        )
        (self.root / "echo" / "__init__.py").write_text("", encoding="utf-8")
        (self.root / "echo" / "plugin.py").write_text(
            "from plugins.base import Plugin\n", encoding="utf-8"
        )

    def _call(self, command: str, *args: str) -> str:
        out = StringIO()
        call_command(command, *args, stdout=out)
        return out.getvalue()

    def test_list_reports_none_then_after_scan(self) -> None:
        out = self._call("plugins_list")
        self.assertIn("No plugins registered", out)

    def test_scan_enable_disable_uninstall_lifecycle(self) -> None:
        self._call("plugins_scan", "--root", str(self.root))
        plugin = Plugin.objects.get(name="echo")
        self.assertFalse(plugin.enabled)

        out = self._call("plugins_enable", "echo")
        self.assertIn("Enabled echo", out)
        self.assertTrue(Plugin.objects.get(name="echo").enabled)

        self._call("plugins_disable", "echo")
        self.assertFalse(Plugin.objects.get(name="echo").enabled)

        self._call("plugins_uninstall", "echo")
        self.assertFalse(Plugin.objects.filter(name="echo").exists())

        out = self._call("plugins_list")
        self.assertIn("No plugins registered", out)

    def test_enable_unknown_plugin_errors(self) -> None:
        with self.assertRaises(CommandError):
            call_command("plugins_enable", "nope")
