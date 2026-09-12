"""Plugin lifecycle events: payload shape, fail-open behaviour, host wiring.

Unit level covers the emitter itself with an injected fake Redis client (no live
Redis needed); the host wiring tests stub ``plugins.host.publish_lifecycle`` and
assert the host emits loaded/unloaded/error at the right transitions.
"""

from __future__ import annotations

import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.test import SimpleTestCase, TestCase

from plugins.events import publish_lifecycle
from plugins.services import enable_plugin, scan_root

MANIFEST = "name: sample\nversion: 1.0.0\npermissions: [network:external]\n"
PLUGIN = (
    "from plugins.base import Plugin\n"
    "class Sample(Plugin):\n"
    "    def ping(self, payload):\n"
    "        return {'ok': True}\n"
)


class _FakeClient:
    def __init__(self, *, fail: bool = False) -> None:
        self.fail = fail
        self.published: list[tuple[str, str]] = []

    def publish(self, channel: str, message: str) -> int:
        if self.fail:
            raise ConnectionError("redis down")
        self.published.append((channel, message))
        return 1


class LifecycleEmitterTests(SimpleTestCase):
    def setUp(self) -> None:
        self.client = _FakeClient()
        self._settings = self.settings(
            PLUGIN_EVENTS_URL="redis://127.0.0.1:6379/0",
            PLUGIN_EVENTS_CHANNEL="otix.plugins.lifecycle",
        )
        self._settings.enable()
        self.addCleanup(self._settings.disable)

    def test_publishes_json_payload_to_channel(self) -> None:
        publish_lifecycle("loaded", "plex", version="1.0.0", client=self.client)
        self.assertEqual(len(self.client.published), 1)
        channel, message = self.client.published[0]
        self.assertEqual(channel, "otix.plugins.lifecycle")
        payload = json.loads(message)
        self.assertEqual(payload["type"], "plugin.loaded")
        self.assertEqual(payload["id"], "plex")
        self.assertEqual(payload["version"], "1.0.0")
        self.assertIsNone(payload["error"])
        self.assertIn("at", payload)

    def test_error_event_carries_message(self) -> None:
        publish_lifecycle("error", "plex", error="missing grants: network:external",
                          client=self.client)
        payload = json.loads(self.client.published[0][1])
        self.assertEqual(payload["type"], "plugin.error")
        self.assertEqual(payload["error"], "missing grants: network:external")

    def test_redis_failure_is_swallowed(self) -> None:
        publish_lifecycle("loaded", "plex", client=_FakeClient(fail=True))
        self.assertTrue(True)  # reached: a down Redis must not raise


class LifecycleDisabledTests(SimpleTestCase):
    def test_empty_url_is_noop_and_touches_no_client(self) -> None:
        client = _FakeClient()
        with self.settings(PLUGIN_EVENTS_URL=""):
            publish_lifecycle("loaded", "plex", client=client)
        self.assertEqual(client.published, [])


class HostLifecycleTests(TestCase):
    def setUp(self) -> None:
        self.root = Path(tempfile.mkdtemp(prefix="plugin-events-root-"))
        folder = self.root / "sample"
        folder.mkdir()
        (folder / "__init__.py").write_text("", encoding="utf-8")
        (folder / "plugin.py").write_text(PLUGIN, encoding="utf-8")
        (folder / "manifest.yaml").write_text(MANIFEST, encoding="utf-8")
        self._settings = self.settings(PLUGINS_ROOT=str(self.root))
        self._settings.enable()
        self.addCleanup(self._settings.disable)
        scan_root(self.root)

    def _record(self):
        calls: list[tuple] = []

        def record(action, plugin_id, *, version=None, error=None) -> None:
            calls.append((action, plugin_id, version, error))

        return calls, record

    def test_load_then_disable_emit_loaded_then_unloaded(self) -> None:
        enable_plugin("sample")
        calls, record = self._record()
        with patch("plugins.host.publish_lifecycle", side_effect=record):
            from plugins.host import PluginHost

            host = PluginHost()
            host.sync()  # first reconcile loads "sample"
            from plugins.services import disable_plugin

            disable_plugin("sample")
            host.reload("sample")  # disabled row -> unloaded
        self.assertEqual(
            calls,
            [
                ("loaded", "sample", "1.0.0", None),
                ("unloaded", "sample", "1.0.0", None),
            ],
        )

    def test_missing_grant_emits_error(self) -> None:
        enable_plugin("sample")
        calls, record = self._record()
        with patch("plugins.host.publish_lifecycle", side_effect=record):
            from plugins.host import PluginHost
            from plugins.models import Plugin

            host = PluginHost()
            host.sync()
            row = Plugin.objects.get(name="sample")
            row.permissions_granted = []
            row.save(update_fields=("permissions_granted", "updated_at"))
            host.reload("sample")  # declared ⊆ granted no longer holds
        actions = [call[0] for call in calls]
        self.assertEqual(actions, ["loaded", "unloaded", "error"])
        error_call = next(call for call in calls if call[0] == "error")
        self.assertEqual(error_call[1], "sample")
        self.assertIn("missing grants", error_call[3])
