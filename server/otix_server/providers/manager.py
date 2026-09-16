"""Provider Manager for Otix Server.

Coordinates modular downloaders (SABnzbd, etc.) and search providers (Prowlarr, etc.).
"""

from typing import Any, Dict, List, Optional
from otix_server.providers.base import (
    BaseDownloader,
    BaseSearchProvider,
    ProviderInfo,
)


def infer_download_protocol(download_url: str) -> str:
    """Guess usenet vs torrent from the grab URL when the indexer hint is missing."""
    url = (download_url or "").strip().lower()
    if url.startswith("magnet:") or url.endswith(".torrent") or ".torrent?" in url:
        return "torrent"
    return "usenet"
from otix_server.usenet_types import (
    ProwlarrRelease,
    ServerDownloadHistory,
    ServerDownloadQueue,
)


class ProviderManager:
    """Unified manager and registry for download and search providers."""

    def __init__(self) -> None:
        self._downloaders: Dict[str, BaseDownloader] = {}
        self._search_providers: Dict[str, BaseSearchProvider] = {}
        self.active_downloader_name: str = "sabnzbd"
        self.active_search_provider_name: str = "prowlarr"

    def register_downloader(self, downloader: BaseDownloader) -> None:
        self._downloaders[downloader.name.lower()] = downloader

    def register_search_provider(self, provider: BaseSearchProvider) -> None:
        self._search_providers[provider.name.lower()] = provider

    def get_downloader(self, name: Optional[str] = None) -> BaseDownloader:
        target = (name or self.active_downloader_name).lower()
        if target not in self._downloaders:
            available = list(self._downloaders.keys())
            raise ValueError(
                f"Downloader '{target}' not found. Registered downloaders: {available}"
            )
        return self._downloaders[target]

    def get_search_provider(self, name: Optional[str] = None) -> BaseSearchProvider:
        target = (name or self.active_search_provider_name).lower()
        if target not in self._search_providers:
            available = list(self._search_providers.keys())
            raise ValueError(
                f"Search provider '{target}' not found. Registered providers: {available}"
            )
        return self._search_providers[target]

    def list_providers(self) -> Dict[str, List[Dict[str, Any]]]:
        """Return all registered providers and their current status."""
        return {
            "downloaders": [d.to_info().model_dump() for d in self._downloaders.values()],
            "search_providers": [s.to_info().model_dump() for s in self._search_providers.values()],
            "active_downloader": self.active_downloader_name,
            "active_search_provider": self.active_search_provider_name,
        }

    def test_provider(self, provider_type: str, name: str) -> Dict[str, Any]:
        """Test connectivity for a named provider."""
        ptype = provider_type.lower()
        if ptype in ("downloader", "downloaders"):
            return self.get_downloader(name).test_connection()
        elif ptype in ("search_provider", "search", "indexer", "indexers"):
            return self.get_search_provider(name).test_connection()
        raise ValueError(f"Unknown provider type '{provider_type}'")

    def search(
        self,
        query: str,
        categories: Optional[List[int]] = None,
        provider_name: Optional[str] = None,
    ) -> List[ProwlarrRelease]:
        """Search indexers via active or specified search provider."""
        provider = self.get_search_provider(provider_name)
        if not provider.is_configured():
            raise ValueError(f"Provider '{provider.name}' is not configured or missing API key")
        return provider.search(query, categories)

    def download(
        self,
        download_url: str,
        title: str,
        category: str = "games",
        downloader_name: Optional[str] = None,
        protocol: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Send a download task to a client that supports this release protocol."""
        inferred = (protocol or infer_download_protocol(download_url)).lower()
        if downloader_name:
            downloader = self.get_downloader(downloader_name)
            if not downloader.is_configured():
                raise ValueError(f"Downloader '{downloader.name}' is not configured or missing API key")
            downloader_protocol = (downloader.protocol or "").lower()
            if downloader_protocol not in (inferred, "multi"):
                raise ValueError(f"{downloader.name} cannot download {inferred} releases")
            return downloader.add_download(download_url, title, category)

        matches = self._configured_downloaders_for(inferred)
        if not matches:
            if inferred == "torrent":
                raise ValueError(
                    "No torrent download client is configured. Add qBittorrent, Transmission, or another torrent client."
                )
            raise ValueError("No Usenet download client is configured.")
        return matches[0].add_download(download_url, title, category)

    def _configured_downloaders_for(self, protocol: str) -> List[BaseDownloader]:
        wanted = (protocol or "").lower()
        matches: List[BaseDownloader] = []
        for downloader in self._downloaders.values():
            if not downloader.is_configured():
                continue
            proto = (downloader.protocol or "").lower()
            if proto == wanted or proto == "multi":
                matches.append(downloader)
        return matches

    def get_queue(self, downloader_name: Optional[str] = None) -> ServerDownloadQueue:
        """Fetch live download queue from the active or specified downloader."""
        downloader = self.get_downloader(downloader_name)
        return downloader.get_queue()

    def get_history(
        self, downloader_name: Optional[str] = None, limit: int = 50
    ) -> ServerDownloadHistory:
        """Fetch completed and failed downloads from the active or specified downloader."""
        downloader = self.get_downloader(downloader_name)
        return downloader.get_history(limit=limit)

    def delete_download(
        self, download_id: str, downloader_name: Optional[str] = None
    ) -> bool:
        """Delete or cancel an active download slot."""
        downloader = self.get_downloader(downloader_name)
        return downloader.delete_download(download_id)
