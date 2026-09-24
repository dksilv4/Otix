"""Admin-only management of plugin gateway tokens (CLI mirror under
``management/commands/plugins_token_*``). Tokens are scoped per-plugin with an
optional dotted method prefix; the plaintext secret is returned only from the
create response.
"""

from __future__ import annotations

from django.utils.dateparse import parse_datetime
from rest_framework import status
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from plugin_framework.gateway import create_plugin_token, create_token
from plugin_framework.models import Plugin, PluginAccessToken, PluginAccessTokenGrant


class IsStaffOperator(BasePermission):
    """Token management is operator-only (staff/superuser), never a gateway token."""

    def has_permission(self, request, view) -> bool:
        user = request.user
        return bool(user and user.is_authenticated and user.is_staff)


def _grant_payload(grant: PluginAccessTokenGrant) -> dict:
    return {"plugin": grant.plugin, "methods": grant.method_prefix}


def _token_payload(token: PluginAccessToken, plaintext: str | None = None) -> dict:
    payload: dict = {
        "id": token.id,
        "name": token.name,
        "prefix": token.prefix,
        "active": token.is_active,
        "expires_at": token.expires_at.isoformat() if token.expires_at else None,
        "last_used_at": token.last_used_at.isoformat() if token.last_used_at else None,
        "grants": [_grant_payload(g) for g in token.grants.all()],
    }
    if plaintext:
        payload["token"] = plaintext
    return payload


def _parse_grants(raw) -> tuple[list[dict] | None, str | None]:
    """Normalize ``[{plugin, methods?}]`` into per-prefix grant dicts.

    ``methods`` may be a single prefix string or a list of prefix strings;
    omitted/empty means every method of the plugin.
    """
    if not isinstance(raw, list) or not raw:
        return None, "'grants' must be a non-empty list of {plugin, methods?}"
    grants: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            return None, "each grant must be an object"
        plugin = item.get("plugin")
        if not isinstance(plugin, str) or not plugin.strip():
            return None, "each grant needs a 'plugin' name"
        methods = item.get("methods", "")
        prefixes: list[str]
        if methods == "" or methods is None:
            prefixes = [""]
        elif isinstance(methods, str):
            prefixes = [methods]
        elif isinstance(methods, list) and all(isinstance(m, str) for m in methods):
            prefixes = list(methods)
        else:
            return None, "'methods' must be a string or a list of strings"
        for prefix in prefixes:
            grants.append({"plugin": plugin.strip(), "methods": prefix})
    return grants, None


class TokenListCreateView(APIView):
    """GET list gateway tokens; POST create one (plaintext returned once)."""

    permission_classes = (IsAuthenticated, IsStaffOperator)

    def get(self, request) -> Response:
        tokens = PluginAccessToken.objects.prefetch_related("grants")
        return Response({"tokens": [_token_payload(t) for t in tokens]})

    def post(self, request) -> Response:
        name = request.data.get("name")
        if not isinstance(name, str) or not name.strip():
            return Response({"error": "'name' is required"}, status=status.HTTP_400_BAD_REQUEST)
        grants, error = _parse_grants(request.data.get("grants"))
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        expires_at = None
        if request.data.get("expires_at"):
            expires_at = parse_datetime(request.data["expires_at"])
            if expires_at is None:
                return Response(
                    {"error": "'expires_at' must be an ISO datetime"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
        token, plaintext = create_token(
            name=name.strip(),
            grants=grants,
            created_by=request.user if request.user.is_authenticated else None,
            expires_at=expires_at,
        )
        return Response(_token_payload(token, plaintext), status=status.HTTP_201_CREATED)


class TokenDetailView(APIView):
    """DELETE (revoke) a gateway token — soft-delete so audit rows survive."""

    permission_classes = (IsAuthenticated, IsStaffOperator)

    def delete(self, request, token_id: int) -> Response:
        token = PluginAccessToken.objects.filter(id=token_id).first()
        if token is None:
            return Response({"error": "token not found"}, status=status.HTTP_404_NOT_FOUND)
        token.is_active = False
        token.save(update_fields=("is_active", "updated_at"))
        return Response(_token_payload(token))


def _parse_prefixes(raw) -> tuple[list[str] | None, str | None]:
    """Normalize a ``methods`` allowlist into dotted method prefixes.

    Missing / empty means every method the plugin exposes (whole-plugin scope).
    """
    if raw in (None, "", []):
        return None, None
    if isinstance(raw, str):
        raw = [raw]
    if not isinstance(raw, list) or not all(isinstance(x, str) for x in raw):
        return None, "'methods' must be a string or a list of strings"
    prefixes = [prefix.strip() for prefix in raw if prefix.strip()]
    return (prefixes or None), None


class PluginAccessTokenView(APIView):
    """POST mint/replace a single-plugin access token (staff only).

    Scoped to ``plugin_id`` with an optional dotted-method allowlist; issuing a
    new token revokes any previously active token for the same plugin so each
    plugin carries at most one active API token. The plaintext secret is
    returned only from this create response.
    """

    permission_classes = (IsAuthenticated, IsStaffOperator)

    def post(self, request, plugin_id: str) -> Response:
        if Plugin.objects.filter(name=plugin_id).first() is None:
            return Response(
                {"error": f"plugin '{plugin_id}' is not registered"},
                status=status.HTTP_404_NOT_FOUND,
            )
        prefixes, error = _parse_prefixes(request.data.get("methods"))
        if error:
            return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)
        token, plaintext = create_plugin_token(
            plugin=plugin_id,
            methods=prefixes,
            created_by=request.user if request.user.is_authenticated else None,
        )
        return Response(_token_payload(token, plaintext), status=status.HTTP_201_CREATED)
