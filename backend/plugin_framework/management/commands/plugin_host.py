"""Run the plugin host service (separate process from the API).

Loads the DB's enabled plugins into an in-process registry and serves the
internal control API (127.0.0.1, ``PLUGIN_HOST_SECRET``) the Django API uses to
dispatch plugin calls — the API never imports plugin code. The host re-reads the
DB every ``--sync-interval`` seconds, so enable/disable converge even without an
explicit reload; ``POST /plugins/reload-all`` forces it immediately.

Run under its own supervisor/container, e.g.:
    uv run manage.py plugin_host --port 8347
"""

from __future__ import annotations

import signal
import threading
import time

from django.conf import settings
from django.core.management.base import BaseCommand

from plugin_framework.host import PluginHost
from plugin_framework.hostserver import HostControlServer


class Command(BaseCommand):
    help = "Run the plugin host: load enabled plugins and serve the control API."

    def add_arguments(self, parser) -> None:
        parser.add_argument("--bind", default=settings.PLUGIN_HOST_BIND)
        parser.add_argument("--port", type=int, default=settings.PLUGIN_HOST_PORT)
        parser.add_argument(
            "--sync-interval",
            type=float,
            default=5.0,
            help="Seconds between DB re-syncs (host picks up enable/disable).",
        )

    def handle(self, *args, **options) -> None:
        host = PluginHost()
        host.sync()

        def _resync_loop() -> None:
            while True:
                time.sleep(options["sync_interval"])
                try:
                    host.sync()
                except Exception:  # noqa: BLE001 - keep the loop alive on DB blips
                    self.stderr.write("host re-sync failed (will retry)")

        threading.Thread(target=_resync_loop, daemon=True, name="host-resync").start()

        server = HostControlServer(
            host, secret=settings.PLUGIN_HOST_SECRET, bind=options["bind"], port=options["port"]
        )

        # A supervisor (systemd/supervisord) stops the host with SIGTERM; route it
        # through the existing KeyboardInterrupt path so serve_forever exits and
        # the control server closes cleanly instead of the process being killed.
        def _on_sigterm(_signum, _frame) -> None:
            raise KeyboardInterrupt

        signal.signal(signal.SIGTERM, _on_sigterm)
        self.stdout.write(f"plugin host control API listening at {server.address}")
        self.stdout.write(
            f"plugins root: {settings.PLUGINS_ROOT} (loaded {len(host.registry.ids())})"
        )
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            server.server_close()
