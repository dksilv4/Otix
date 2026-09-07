"""Reference Plex plugin — a real data source that uses the grant-gated surface.

It is the smallest end-to-end example of what a server plugin is for: read the
operator's config (``serverUrl``/``token``) from ``self.services.config`` and
call the Plex HTTP API through ``self.services.http`` — the allowlisted,
grant-checked client. No raw sockets, no DB handles, no urllib of its own: a
missing ``network:external`` grant raises before any bytes leave the host.

Endpoints mirror the Plex HTTP API. JSON is requested via ``Accept:
application/json``; the token rides the standard ``X-Plex-Token`` header.
"""

from __future__ import annotations

from plugins.base import Plugin, PluginError


def _headers(token: str | None) -> dict:
    headers = {"Accept": "application/json"}
    if token:
        headers["X-Plex-Token"] = token
    return headers


class Plex(Plugin):
    """Talk to one Plex Media Server configured under the plugin's settings."""

    def _server_url(self) -> str:
        url = (self.services.config or {}).get("serverUrl")
        if not url:
            raise PluginError("set a 'serverUrl' in the plugin config first")
        return str(url).rstrip("/")

    def _token(self) -> str | None:
        return (self.services.config or {}).get("token") or None

    def _get(self, path: str) -> dict:
        # self.services.http is grant-gated: ungranted => PluginPermissionDenied.
        return self.services.http.get_json(
            self._server_url() + path, headers=_headers(self._token())
        )

    # ── Data methods ────────────────────────────────────────────────────
    def plex_identity(self, payload) -> dict:
        """Advertise the server (GET /identity — reachable without a token)."""
        return self._get("/identity").get("MediaContainer", {})

    def plex_libraries(self, payload) -> dict:
        """List top-level libraries (GET /library/sections)."""
        return self._get("/library/sections").get("MediaContainer", {})

    def plex_library_items(self, payload) -> dict:
        """List a library's items: pass ``{"section": <library key>}``."""
        key = (payload or {}).get("section")
        if key is None:
            raise PluginError("pass {'section': <library key>} to list its items")
        return self._get(f"/library/sections/{key}/all").get("MediaContainer", {})
