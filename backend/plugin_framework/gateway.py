"""Public plugin gateway — scoped API tokens for calling plugin methods.

External tools authenticate with ``Authorization: Bearer <token>`` and may only
invoke the (plugin, method-prefix) scope the operator granted. Issued tokens
carry a recognizable ``otxp_`` prefix so this auth class yields to the normal
user auth (JWT / DRF Token) for every other credential and only claims bearer
tokens it owns. Only the SHA-256 hash is stored server-side; the plaintext is
shown once at creation.
"""

from __future__ import annotations

import hashlib
import secrets

from django.utils import timezone
from rest_framework import authentication, exceptions
from rest_framework.permissions import BasePermission

from plugin_framework.models import PluginAccessToken, PluginAccessTokenGrant

TOKEN_PREFIX = "otxp_"
_HASH_ALGORITHM = "sha256"


def hash_token(plaintext: str) -> str:
    return hashlib.sha256(plaintext.encode("utf-8")).hexdigest()


def generate_token() -> tuple[str, str]:
    """Return ``(plaintext, prefix)`` — plaintext shown once, prefix for admin."""
    plaintext = TOKEN_PREFIX + secrets.token_urlsafe(32)
    return plaintext, plaintext[:12]


def create_token(
    *,
    name: str,
    grants: list[dict],
    created_by=None,
    expires_at=None,
) -> tuple[PluginAccessToken, str]:
    """Persist a token + its scope rows; returns ``(token, plaintext)``."""
    plaintext, prefix = generate_token()
    token = PluginAccessToken.objects.create(
        name=name,
        prefix=prefix,
        token_hash=hash_token(plaintext),
        created_by=created_by,
        expires_at=expires_at,
    )
    for grant in grants:
        PluginAccessTokenGrant.objects.create(
            token=token,
            plugin=grant["plugin"],
            method_prefix=grant.get("methods", ""),
        )
    return token, plaintext


def deactivate_plugin_tokens(plugin: str) -> None:
    """Deactivate every active token that carries a grant for ``plugin``.

    The token lifecycle follows the plugin's enabled state: disabling a plugin
    must cut off third-party callers that hold a previously-shared secret.
    """
    ids = PluginAccessTokenGrant.objects.filter(plugin=plugin, token__is_active=True).values_list(
        "token_id", flat=True
    )
    unique = set(ids)
    if unique:
        PluginAccessToken.objects.filter(id__in=unique, is_active=True).update(
            is_active=False, updated_at=timezone.now()
        )


def ensure_plugin_token(
    *, plugin: str, created_by=None
) -> tuple[PluginAccessToken | None, str | None]:
    """Mint a whole-plugin token only when none is active (enabled-state parity).

    Returns ``(None, None)`` when an active token already scopes the plugin, so
    re-enabling keeps the same credential for previously-shared secrets rather
    than rotating every toggle. The plaintext is discarded by callers that just
    want the row to exist; the one-time reveal is the mint/rotate action.
    """
    ids = PluginAccessTokenGrant.objects.filter(plugin=plugin, token__is_active=True).values_list(
        "token_id", flat=True
    )
    active = (
        PluginAccessToken.objects.filter(id__in=set(ids), is_active=True).order_by("-id").first()
    )
    if active is not None:
        return None, None
    return create_plugin_token(plugin=plugin, created_by=created_by)


def create_plugin_token(
    *,
    plugin: str,
    methods: list[str] | None = None,
    name: str | None = None,
    created_by=None,
) -> tuple[PluginAccessToken, str]:
    """Mint a token scoped to one plugin, retiring any prior active one.

    ``methods`` is a list of dotted method prefixes; missing/empty grants every
    method the plugin exposes. Returns ``(token, plaintext)``.
    """
    deactivate_plugin_tokens(plugin)
    prefixes = methods or [""]
    grants = [{"plugin": plugin, "methods": prefix} for prefix in prefixes]
    display = plugin.replace("_", " ").replace("-", " ").strip().title() or plugin
    return create_token(
        name=name or f"{display} API access",
        grants=grants,
        created_by=created_by,
    )


def resolve_token(plaintext: str) -> PluginAccessToken | None:
    """Look up an active, unexpired token by its plaintext (None when absent)."""
    if not plaintext or not plaintext.startswith(TOKEN_PREFIX):
        return None
    token = PluginAccessToken.objects.filter(token_hash=hash_token(plaintext)).first()
    if token is None or not token.is_active:
        return None
    if token.expires_at and token.expires_at < timezone.now():
        return None
    return token


def token_allows(token: PluginAccessToken, plugin: str, method: str | None) -> bool:
    """Whether ``token`` may call ``plugin.method`` (None = describe whole plugin).

    A grant's ``method_prefix`` matches as a dotted prefix; an empty prefix
    covers every method the plugin exposes.
    """
    if not plugin:
        return False
    grants = PluginAccessTokenGrant.objects.filter(token=token, plugin=plugin)
    if not grants.exists():
        return False
    if method is None:
        return True
    return any(
        not grant.method_prefix or method.startswith(grant.method_prefix) for grant in grants
    )


class PluginTokenAuthentication(authentication.BaseAuthentication):
    """DRF auth: claim bearer tokens with the ``otxp_`` prefix.

    Returns ``(AnonymousUser(), token)`` so permission checks can tell a
    gateway call (``request.auth`` is the token) from a user-session call.
    """

    keyword = "Bearer"

    def authenticate(self, request):
        header = request.headers.get("Authorization")
        if not header:
            return None
        parts = header.split()
        if len(parts) != 2 or parts[0] != self.keyword:
            return None
        credential = parts[1]
        if not credential.startswith(TOKEN_PREFIX):
            return None  # someone else's scheme (JWT / DRF Token) owns this
        token = resolve_token(credential)
        if token is None:
            raise exceptions.AuthenticationFailed("Invalid plugin access token")
        token.last_used_at = timezone.now()
        token.save(update_fields=("last_used_at",))
        from django.contrib.auth.models import AnonymousUser

        return (AnonymousUser(), token)

    def authenticate_header(self, request) -> str:
        return self.keyword


class PluginGatewayPermission(BasePermission):
    """Gate for call/describe routes: a user session OR a scoped gateway token.

    A token request (``request.auth`` is the token) must carry a grant covering
    the target plugin and — for calls — the method. Describe (no method in the
    body) is allowed when the token scopes the plugin at all.
    """

    message = "This plugin access token is not scoped to this plugin/method."

    def has_permission(self, request, view):
        auth = getattr(request, "auth", None)
        if not isinstance(auth, PluginAccessToken):
            return bool(request.user and request.user.is_authenticated)
        plugin_id = view.kwargs.get("plugin_id")
        # Describe (GET detail) is allowed for any scoped plugin; tokens may only
        # POST the call route, never delete/uninstall or flip plugin state.
        if request.method == "GET":
            return token_allows(auth, plugin_id, None)
        url_name = request.resolver_match.url_name if request.resolver_match else None
        if request.method == "POST" and url_name == "plugin-call":
            method = None
            try:
                body = request.data
                if isinstance(body, dict):
                    method = body.get("method")
            except (ValueError, TypeError):
                method = None
            return token_allows(auth, plugin_id, method)
        return False
