# TODO: Review this file
"""OMDb rating hydration.

After TMDB sync lands core media data and IMDb IDs, this hydrator adds
ratings from OMDb as ExternalRating rows. Provider + media_item_id
uniqueness prevents duplicates on re-sync.
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating
from otix.domain.media import ExternalID, MediaItem
from otix.providers.omdb.client import OMDbProvider
from otix.providers.omdb.transformer import omdb_to_ratings


class OMDbHydrator:
    def __init__(self, provider: OMDbProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate_ratings(self, media_item: MediaItem) -> bool:
        """Fetch OMDb ratings and store as ExternalRating rows.

        Uses IMDb ID from ExternalID to query OMDb. Returns True if any new
        ratings were added or updated.
        """
        imdb_id = await self._resolve_imdb_id(media_item.id)
        if imdb_id is None:
            return False

        try:
            raw = await self.provider.get_by_imdb_id(imdb_id)
        except Exception:
            return False

        ratings = omdb_to_ratings(raw, media_item.id)
        if not ratings:
            return False

        return await self._upsert_ratings(ratings)

    async def _resolve_imdb_id(self, media_item_id: str) -> str | None:
        ext_id = await self.session.scalar(
            select(ExternalID).where(
                ExternalID.media_item_id == media_item_id,
                ExternalID.provider == "imdb",
            )
        )
        if ext_id is None:
            return None
        return ext_id.external_id

    async def _upsert_ratings(self, ratings: list[ExternalRating]) -> bool:
        """Insert or update ratings — one per provider per media_item."""
        if not ratings:
            return False

        media_item_id = ratings[0].media_item_id
        provider_keys = {r.provider for r in ratings}

        existing_ratings = await self.session.scalars(
            select(ExternalRating).where(
                ExternalRating.media_item_id == media_item_id,
                ExternalRating.provider.in_(provider_keys),
            )
        )
        by_provider = {r.provider: r for r in existing_ratings}

        changed = False
        for rating in ratings:
            existing = by_provider.get(rating.provider)
            if existing is not None:
                if existing.score != rating.score or existing.vote_count != rating.vote_count:
                    existing.score = rating.score
                    existing.max_score = rating.max_score
                    existing.vote_count = rating.vote_count
                    changed = True
            else:
                self.session.add(rating)
                changed = True

        if changed:
            await self.session.flush()
            return True

        return False
