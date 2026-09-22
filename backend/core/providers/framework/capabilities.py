"""Provider capabilities flag enum and manifest declaration.

Providers declare their static metadata, supported media types, and operational
capabilities (e.g. metadata fetching, artwork discovery, ratings, download/indexer)
via ``ProviderManifest``.
"""

from __future__ import annotations

import enum
from collections.abc import Iterable
from dataclasses import dataclass


class ProviderCapability(enum.Flag):
    """Bitmask flags representing discrete operational capabilities of a provider."""

    METADATA = enum.auto()
    ARTWORK = enum.auto()
    RATINGS = enum.auto()
    WATCH_PROVIDERS = enum.auto()
    LIBRARY_SYNC = enum.auto()
    SEARCH = enum.auto()
    DOWNLOAD = enum.auto()
    INDEXER = enum.auto()


@dataclass(frozen=True, slots=True)
class ProviderManifest:
    """Static metadata and capability declaration for an Otix provider integration.

    Attributes:
        id: Unique canonical provider slug (e.g., 'tmdb', 'igdb', 'steamgrid').
        name: Human-readable display name (e.g., 'The Movie Database').
        capabilities: Bitmask combination of ProviderCapability flags.
        supported_media_types: Media types supported by this provider
            (e.g., ('movie', 'show'), ('game',)).
        description: Brief explanation of the provider and its role in Otix.
    """

    id: str
    name: str
    capabilities: ProviderCapability
    supported_media_types: tuple[str, ...] = ()
    description: str = ""

    def __init__(
        self,
        id: str,
        name: str,
        capabilities: ProviderCapability,
        supported_media_types: Iterable[str] = (),
        description: str = "",
    ) -> None:
        object.__setattr__(self, "id", id)
        object.__setattr__(self, "name", name)
        object.__setattr__(self, "capabilities", capabilities)
        object.__setattr__(self, "supported_media_types", tuple(supported_media_types))
        object.__setattr__(self, "description", description)

    def has_capability(self, capability: ProviderCapability) -> bool:
        """Return True if this provider implements the given capability."""
        return bool(self.capabilities & capability)

    def supports_media_type(self, media_type: str) -> bool:
        """Return True if this provider supports ingesting the given media type."""
        return media_type in self.supported_media_types
