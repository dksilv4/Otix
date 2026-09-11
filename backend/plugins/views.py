"""DRF surface for the plugin framework (registry + PluginAPI proxy).

These are additive routes (the legacy FastAPI had no server-side plugin API) that
mirror the frontend ``PluginAPI`` contract: list / discover / enable / disable /
reload / uninstall, config read-write, data-method dispatch, plus a
Nextcloud-style capability announcement. Plugin *code* runs only in the host
process; these views read/write the registry rows (``plugins.services``) and
proxy dispatch to the host over HTTP (``plugins.hostclient``). Auth is the DRF
default (JWT/Token, IsAuthenticated).
"""

from __future__ import annotations

from django.http import Http404
from rest_framework.authentication import TokenAuthentication
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.accounts.authentication import JWTAuthentication
from plugins import hostclient
from plugins.gateway import PluginGatewayPermission, PluginTokenAuthentication
from plugins.hostclient import HostUnreachableError
from plugins.manifest import (
    CONFIG_FIELD_TYPES,
    KNOWN_PERMISSIONS,
    SERVER_GRANT_SCOPES,
    STAGES,
)
from plugins.models import Plugin
from plugins.permissions import MAX_GRANTABLE
from plugins.serializers import CallSerializer
from plugins.services import (
    PluginStateError,
    disable_plugin,
    enable_plugin,
    scan_root,
    unregister_plugin,
)


def _summary(row: Plugin) -> dict:
    return {
        "id": row.name,
        "version": row.version,
        "description": row.description,
        "author": row.author,
        "repository": row.repository,
        "icon": row.icon,
        "stage": row.stage,
        "system": row.system,
        "enabled": row.enabled,
        "error": row.error,
        "permissions_declared": row.permissions_declared or [],
        "permissions_granted": row.permissions_granted or [],
        "config": row.config or {},
        "instances": row.instances or [],
        "manifest": row.manifest or {},
        "updated_at": row.updated_at.isoformat(),
    }


def _get_row_or_404(plugin_id: str) -> Plugin:
    row = Plugin.objects.filter(name=plugin_id).first()
    if row is None:
        raise Http404(f"plugin '{plugin_id}' is not registered")
    return row


def _host_status() -> list[dict] | None:
    try:
        payload = hostclient.status()
    except HostUnreachableError:
        return None
    return payload.get("plugins")


def _host_reload(plugin_id: str) -> dict:
    try:
        return hostclient.reload(plugin_id)
    except HostUnreachableError as exc:
        return {"ok": False, "error": str(exc)}


class PluginListView(APIView):
    """GET the registry (+ host status); POST to scan/discover a plugins root."""

    def get(self, request) -> Response:
        rows = Plugin.objects.all()
        return Response(
            {"plugins": [_summary(row) for row in rows], "host": _host_status()}
        )

    def post(self, request) -> Response:
        report = scan_root()
        host: dict | None
        try:
            host = hostclient.reload_all()
        except HostUnreachableError as exc:
            host = {"ok": False, "error": str(exc)}
        return Response({"scanned": report, "host": host}, status=201)


class PluginCapabilitiesView(APIView):
    """Nextcloud-style announcement of what the framework understands."""

    def get(self, request) -> Response:
        return Response(
            {
                "permissions": sorted(KNOWN_PERMISSIONS),
                "grantable": sorted(MAX_GRANTABLE),
                "server_grants": list(SERVER_GRANT_SCOPES),
                "config_field_types": sorted(CONFIG_FIELD_TYPES),
                "stages": sorted(STAGES),
                "host": _host_status(),
            }
        )


class PluginDetailView(APIView):
    """GET one plugin's full shape (incl. config schema + host describe)."""

    # A scoped gateway token may describe a plugin but never uninstall it (the
    # permission blocks non-GET/ token requests); user sessions keep full access.
    # PluginTokenAuthentication must run before JWT: JWT rejects any Bearer that
    # isn't a valid JWT, which would swallow otxp_ gateway tokens.
    authentication_classes = (PluginTokenAuthentication, JWTAuthentication, TokenAuthentication)
    permission_classes = (PluginGatewayPermission,)

    def get(self, request, plugin_id: str) -> Response:
        row = _get_row_or_404(plugin_id)
        describe = None
        if row.enabled:
            try:
                describe = hostclient.describe(plugin_id)
            except HostUnreachableError:
                describe = None
        payload = _summary(row)
        payload["config_schema"] = (row.manifest or {}).get("config", {})
        payload["describe"] = describe
        return Response(payload)

    def delete(self, request, plugin_id: str) -> Response:
        _get_row_or_404(plugin_id)
        try:
            unregister_plugin(plugin_id)
        except PluginStateError as exc:
            return Response({"error": str(exc)}, status=409)
        return Response(_host_reload(plugin_id), status=200)


class PluginStateView(APIView):
    """POST enable|disable|reload — flip the registry flag then sync the host."""

    _ACTIONS = ("enable", "disable", "reload")

    def post(self, request, plugin_id: str, action: str) -> Response:
        if action not in self._ACTIONS:
            return Response({"error": f"unknown action '{action}'"}, status=400)
        try:
            if action == "enable":
                enable_plugin(plugin_id)
            elif action == "disable":
                disable_plugin(plugin_id)
        except PluginStateError as exc:
            return Response({"error": str(exc)}, status=409)
        row = _get_row_or_404(plugin_id)
        return Response({"plugin": _summary(row), "host": _host_reload(plugin_id)})


class PluginConfigView(APIView):
    """GET config/instances (+schema); PUT replaces config and/or instances."""

    def get(self, request, plugin_id: str) -> Response:
        row = _get_row_or_404(plugin_id)
        return Response(
            {
                "config": row.config or {},
                "instances": row.instances or [],
                "config_schema": (row.manifest or {}).get("config", {}),
            }
        )

    def put(self, request, plugin_id: str) -> Response:
        row = _get_row_or_404(plugin_id)
        if "config" in request.data:
            config = request.data["config"]
            if not isinstance(config, dict):
                return Response({"error": "'config' must be an object"}, status=400)
            row.config = config
        if "instances" in request.data:
            instances = request.data["instances"]
            if not isinstance(instances, list):
                return Response({"error": "'instances' must be a list"}, status=400)
            row.instances = instances
        row.save()
        return Response({"config": row.config, "instances": row.instances})


class PluginCallView(APIView):
    """POST {method, payload} — dispatch a data method on the running plugin."""

    authentication_classes = (PluginTokenAuthentication, JWTAuthentication, TokenAuthentication)
    permission_classes = (PluginGatewayPermission,)

    def post(self, request, plugin_id: str) -> Response:
        _get_row_or_404(plugin_id)
        serializer = CallSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=400)
        try:
            result = hostclient.call(
                plugin_id,
                serializer.validated_data["method"],
                serializer.validated_data.get("payload"),
            )
        except HostUnreachableError as exc:
            return Response({"error": str(exc)}, status=503)
        return Response(result)
