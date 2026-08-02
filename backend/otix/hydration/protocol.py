"""Protocol/interface for provider-agnostic full hydration."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class RelatedCandidate:
    """A related media item discovered while processing another item.

    ``external_id`` is the ID as the provider knows it (int for TMDB/IGDB,
    str MBID for MusicBrainz).
    """

    media_type: str
    external_id: int | str
    priority: float = 0.0


class FullHydration:
    """Interface implemented per data-source provider.

    Implementations wrap the provider's primary sync and every enrichment step
    (art, ratings, embedding, side data) so ``hydrate_complete`` returns only
    once the item is fully processed and ``completeness_score`` is persisted.
    """

    #: Provider label for metrics/analytics, e.g. "tmdb".
    provider_name: str = ""

    async def hydrate_complete(
        self, media_type: str, external_id: int | str, *, force: bool = False
    ) -> dict | None:
        """Fully process one item and persist its completeness score."""
        raise NotImplementedError

    async def discover_seed(self, media_type: str, limit: int) -> list[int]:
        """Top-N candidate external IDs to seed from this provider."""
        raise NotImplementedError

    async def related_candidates(self, media_item_id: str) -> list[RelatedCandidate]:
        """Related items to prioritize (recommendations/similar/collection)."""
        raise NotImplementedError

    async def hydrate_side_data(self, media_type: str) -> dict:
        """Hydrate side data (genres/companies/etc.) independent of items."""
        return {"updated": 0, "skipped": False}
