"""Plugin capability/permission helpers.

The manifest declares what a plugin may do (``network:external``,
``table:media_ratings``, ...). Before a plugin is enabled or dispatched the
host must confirm every declared permission was explicitly granted by the
operator — mirroring the JS ``PermissionGrant`` model. No enforcement lives
here yet (the host API + grant store arrive with the app-install increment);
this module owns the stable vocabulary, token grammar and grant math.
"""

from __future__ import annotations

from plugins.manifest import KNOWN_PERMISSIONS, SERVER_GRANT_SCOPES

# Permissions a self-host operator may grant even though no built-in plugin
# declares them; a plugin asking for power outside this set should raise.
MAX_GRANTABLE = frozenset(KNOWN_PERMISSIONS) | {"table:any", "network:any"}


def codename_for(token: str) -> str:
    """Stable Django-permission-style codename for a capability token.

    ``network:external`` -> ``can_network_external``; ``ui:media.actions`` ->
    ``can_ui_media_actions``. Kept under Django's 100-char codename limit and
    lossless for the known vocabulary (colon/asterisk/dot are the only
    characters that need escaping).
    """
    safe = token.replace(":", "_").replace(".", "_").replace("*", "any")
    return f"can_{safe}"


def missing_grants(declared: list[str], granted: set[str]) -> set[str]:
    """Permissions a plugin declares that the operator has not granted.

    ``declared`` comes from the manifest; ``granted`` is the current grant set
    for that plugin. ``table:any`` / ``network:any`` are wildcard grants that
    satisfy any ``table:*`` / ``network:*`` sub-token; every other token must be
    granted exactly.
    """
    missing: set[str] = set()
    for token in declared:
        if token in granted:
            continue
        scope, _, resource = token.partition(":")
        if resource != "any" and f"{scope}:any" in granted:
            continue  # covered by a wildcard grant for the same scope
        missing.add(token)
    return missing


def unsupported_grants(granted: set[str]) -> set[str]:
    """Granted tokens that fall outside every built-in capability + wildcard."""
    supported = frozenset(MAX_GRANTABLE) | {
        f"{scope}any" for scope in SERVER_GRANT_SCOPES
    }
    return {g for g in granted if g not in supported}
