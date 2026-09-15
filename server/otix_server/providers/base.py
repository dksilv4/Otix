"""Abstract Base Provider Interfaces for Otix Server.

All downloaders (SABnzbd, qBittorrent, etc.) and search/indexer providers
(Prowlarr, NZBPlanet, etc.) implement these modular interfaces.
"""

from abc import ABC, abstractmethod
from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from otix_server.usenet_types import (
    ProwlarrRelease,
    ServerDownloadQueue,
)


class ProviderInfo(BaseModel):
    """Metadata describing a registered provider."""
    id: str
    name: str
    type: str  # 'downloader' | 'search_provider'
    protocol: str  # 'usenet' | 'torrent' | 'multi'
    is_configured: bool = False
    description: str = ""


class BaseDownloader(ABC):
    """Abstract interface for all download client providers."""

    name: str
    protocol: str  # 'usenet' | 'torrent'

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if required connection credentials are set."""
        pass

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Test reachability and authentication to the download client."""
        pass

    @abstractmethod
    def add_download(
        self, download_url: str, title: str, category: str = "games"
    ) -> Dict[str, Any]:
        """Dispatch a download task to the download client."""
        pass

    @abstractmethod
    def get_queue(self) -> ServerDownloadQueue:
        """Fetch the current download queue, speed, and active slots."""
        pass

    @abstractmethod
    def delete_download(self, download_id: str) -> bool:
        """Delete or cancel a download task by ID."""
        pass

    def to_info(self) -> ProviderInfo:
        return ProviderInfo(
            id=self.name.lower(),
            name=self.name,
            type="downloader",
            protocol=self.protocol,
            is_configured=self.is_configured(),
            description=f"{self.name} {self.protocol.title()} download client provider",
        )


class BaseSearchProvider(ABC):
    """Abstract interface for all search / indexer providers."""

    name: str
    protocol: str  # 'usenet' | 'torrent' | 'multi'

    @abstractmethod
    def is_configured(self) -> bool:
        """Return True if required API credentials are set."""
        pass

    @abstractmethod
    def test_connection(self) -> Dict[str, Any]:
        """Test reachability and authentication to the search provider."""
        pass

    @abstractmethod
    def search(
        self, query: str, categories: Optional[List[int]] = None
    ) -> List[ProwlarrRelease]:
        """Search indexers for game releases matching query."""
        pass

    def to_info(self) -> ProviderInfo:
        return ProviderInfo(
            id=self.name.lower(),
            name=self.name,
            type="search_provider",
            protocol=self.protocol,
            is_configured=self.is_configured(),
            description=f"{self.name} {self.protocol.title()} search and indexer provider",
        )
