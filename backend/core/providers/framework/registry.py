"""Centralized provider registry and capability discovery.

Tracks all registered provider manifests, provides capability-based querying
(e.g., all providers that offer artwork or ratings), and maintains bindings
to concrete client classes.
"""

from __future__ import annotations

from typing import Any

from core.providers.framework.capabilities import ProviderCapability, ProviderManifest


class ProviderRegistry:
    """Registry singleton managing provider manifests and client implementations."""

    def __init__(self) -> None:
        self._manifests: dict[str, ProviderManifest] = {}
        self._clients: dict[str, type] = {}

    def register(
        self,
        manifest: ProviderManifest,
        client_cls: type | None = None,
    ) -> None:
        """Register a provider manifest and optional client class."""
        self._manifests[manifest.id] = manifest
        if client_cls is not None:
            self._clients[manifest.id] = client_cls

    def get(self, provider_id: str) -> ProviderManifest | None:
        """Retrieve a provider manifest by its unique provider ID."""
        if provider_id not in self._manifests:
            autodiscover_providers(force=True)
        return self._manifests.get(provider_id)

    def get_client_class(self, provider_id: str) -> type | None:
        """Retrieve a provider's client class by provider ID."""
        if provider_id not in self._clients:
            autodiscover_providers(force=True)
        return self._clients.get(provider_id)

    def get_by_capability(self, capability: ProviderCapability) -> list[ProviderManifest]:
        """Query all registered manifests that implement the specified capability flag."""
        autodiscover_providers()
        return [
            manifest
            for manifest in self._manifests.values()
            if manifest.has_capability(capability)
        ]

    def all_manifests(self) -> list[ProviderManifest]:
        """Return a list of all registered provider manifests."""
        autodiscover_providers()
        return list(self._manifests.values())

    list_all = all_manifests
    get_client_cls = get_client_class

    def clear(self) -> None:
        """Clear all registered providers (primarily used in unit test teardown)."""
        self._manifests.clear()
        self._clients.clear()


# Global registry singleton
registry = ProviderRegistry()


def register_provider(
    manifest: ProviderManifest,
    client_cls: type | None = None,
) -> Any:
    """Register a provider manifest with the global registry.

    Can be invoked directly:
        register_provider(manifest, TMDBClient)

    Or as a decorator on the client class:
        @register_provider(manifest)
        class TMDBClient(BaseProviderClient):
            ...
    """
    if client_cls is not None:
        registry.register(manifest, client_cls=client_cls)
        return client_cls

    def decorator(cls: type) -> type:
        registry.register(manifest, client_cls=cls)
        return cls

    return decorator

_discovered = False

def autodiscover_providers(force: bool = False) -> None:
    """Import built-in provider packages so their manifests register."""
    global _discovered
    if _discovered and not force:
        return
    import importlib
    all_ok = True
    for name in ("tmdb", "igdb", "steamgrid", "omdb", "fanart"):
        try:
            importlib.import_module(f"core.providers.{name}")
        except Exception:
            all_ok = False
    _discovered = all_ok
