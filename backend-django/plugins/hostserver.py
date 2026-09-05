"""Internal control API for the plugin host.

The host runs plugin code; the Django API (a different process) must never load
it, so it reaches the host over HTTP on 127.0.0.1 authenticated by a shared
secret (``PLUGIN_HOST_SECRET``). Routes are deliberately tiny:

- ``GET  /health``                     liveness + loaded count
- ``GET  /plugins``                    status of every DB + registry plugin
- ``POST /plugins/reload-all``         reconcile registry with the DB
- ``POST /plugins/<id>/reload``        re-read one plugin's DB row
- ``POST /plugins/<id>/call``          body ``{"method","payload"}`` → dispatch
                                       a data method on the running plugin

Every request must carry ``Authorization: Bearer <secret>``.
"""

from __future__ import annotations

import hmac
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from plugins.host import PluginHost

_CONTENT_LENGTH_LIMIT = 1_000_000  # call payloads are small dicts


class HostControlServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, host: PluginHost, secret: str, bind: str, port: int) -> None:
        super().__init__((bind, port), _ControlHandler)
        self.host = host
        self.secret = secret
        self.address = f"http://{bind}:{self.server_address[1]}"


class _ControlHandler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server: HostControlServer

    # ── plumbing ──────────────────────────────────────────────────────
    def log_message(self, _format: str, *args) -> None:
        pass  # control channel chatter stays out of the logs

    def _authorized(self) -> bool:
        header = self.headers.get("Authorization", "")
        if not header.startswith("Bearer "):
            return False
        token = header.removeprefix("Bearer ").strip()
        return hmac.compare_digest(token, self.server.secret or "")

    def _json(self, code: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self) -> dict:
        try:
            length = int(self.headers.get("Content-Length", 0))
        except ValueError:
            return {}
        if length <= 0 or length > _CONTENT_LENGTH_LIMIT:
            return {}
        raw = self.rfile.read(length)
        try:
            data = json.loads(raw.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}
        return data if isinstance(data, dict) else {}

    def _deny(self) -> None:
        self._json(401, {"error": "unauthorized"})

    # ── verbs ─────────────────────────────────────────────────────────
    def do_GET(self) -> None:
        if not self._authorized():
            return self._deny()
        path = self.path.rstrip("/") or "/"
        if path == "/health":
            return self._json(200, {"status": "ok", "plugins": len(self.server.host.status())})
        if path == "/plugins":
            return self._json(200, {"plugins": self.server.host.status()})
        self._json(404, {"error": "not found"})

    def do_POST(self) -> None:
        if not self._authorized():
            return self._deny()
        path = self.path.rstrip("/")
        if path == "/plugins/reload-all":
            return self._json(200, self.server.host.reload_all())
        if path.endswith("/reload"):
            name = path[len("/plugins/") : -len("/reload")]
            if name:
                return self._json(200, self.server.host.reload(name))
        if path.endswith("/call"):
            name = path[len("/plugins/") : -len("/call")]
            if name:
                body = self._body()
                return self._json(
                    200,
                    self.server.host.call(name, body.get("method"), body.get("payload")),
                )
        self._json(404, {"error": "not found"})
