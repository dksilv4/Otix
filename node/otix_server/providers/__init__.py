"""Otix Server Provider Architecture.

Exposes modular downloader and search provider implementations.
"""

from otix_server.providers.base import (
    BaseDownloader,
    BaseSearchProvider,
    ProviderInfo,
)
from otix_server.providers.sabnzbd import SabnzbdDownloader
from otix_server.providers.prowlarr import ProwlarrSearchProvider
from otix_server.providers.manager import ProviderManager

__all__ = [
    "BaseDownloader",
    "BaseSearchProvider",
    "ProviderInfo",
    "SabnzbdDownloader",
    "ProwlarrSearchProvider",
    "ProviderManager",
]
