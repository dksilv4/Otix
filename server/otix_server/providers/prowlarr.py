"""Prowlarr Search and Indexer Provider.

Concrete implementation of BaseSearchProvider using Prowlarr REST API.
"""

from typing import Any, Dict, List, Optional
from otix_server.providers.base import BaseSearchProvider
from otix_server.usenet_types import ProwlarrConfig, ProwlarrRelease
from otix_server.usenet_utils import (
    test_prowlarr_connection,
    search_prowlarr,
    fetch_prowlarr_indexers,
    sync_prowlarr_indexers,
)


class ProwlarrSearchProvider(BaseSearchProvider):
    """Prowlarr indexer aggregator provider."""

    name = "Prowlarr"
    protocol = "multi"  # Supports both Usenet & Torrents

    def __init__(self, config: ProwlarrConfig) -> None:
        self.config = config

    def is_configured(self) -> bool:
        return bool(self.config.api_key and self.config.api_key.strip())

    def test_connection(self) -> Dict[str, Any]:
        return test_prowlarr_connection(self.config)

    def search(
        self, query: str, categories: Optional[List[int]] = None
    ) -> List[ProwlarrRelease]:
        return search_prowlarr(self.config, query, categories=categories)

    def get_indexers(self, protocol: Optional[str] = None) -> List[dict]:
        return fetch_prowlarr_indexers(self.config, protocol=protocol)

    def sync_indexers(self, protocol: Optional[str] = None) -> dict:
        return sync_prowlarr_indexers(self.config, protocol=protocol)

