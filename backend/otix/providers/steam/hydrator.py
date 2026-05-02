"""Steam enrichment hydration.

After core game data is saved, fetch Steam player counts and store data.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating
from otix.domain.media import Game
from otix.providers.steam.client import SteamProvider


class SteamHydrator:
    def __init__(self, provider: SteamProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate(self, game: Game) -> None:
        """Fetch Steam player count and store data for a game."""
        app_id = game.steam_app_id
        if not app_id:
            return

        await self.hydrate_player_count(game, app_id)
        await self.hydrate_reviews(game, app_id)

    async def hydrate_player_count(self, game: Game, app_id: int) -> None:
        try:
            data = await self.provider.get_current_players(app_id)
        except Exception:
            return

        result = data.get("response", {})
        if result.get("result") != 1:
            return

        count = result.get("player_count")
        if isinstance(count, (int, float)):
            game.current_players = int(count)

    async def hydrate_reviews(self, game: Game, app_id: int) -> None:
        try:
            store = await self.provider.get_app_details(app_id)
        except Exception:
            return

        if not store:
            return

        # Update steam_app_id on the Game if it was missing
        if not game.steam_app_id:
            steam_id = store.get("steam_appid")
            if isinstance(steam_id, int):
                game.steam_app_id = steam_id

        # is_free flag
        if store.get("is_free") is True:
            game.is_free = True

        # Review summary
        score = store.get("metacritic", {}).get("score") if isinstance(store.get("metacritic"), dict) else None
        review_desc = store.get("review_summary", "")
        review_score = store.get("review_score") or 0
        review_count = store.get("total_reviews") or 0

        if isinstance(review_score, (int, float)) and int(review_score) > 0:
            from sqlalchemy import select

            existing = await self.session.scalar(
                select(ExternalRating).where(
                    ExternalRating.media_item_id == game.media_item_id,
                    ExternalRating.provider == "steam",
                )
            )
            if existing is not None:
                if existing.score != review_score or existing.vote_count != review_count:
                    existing.score = float(review_score)
                    existing.vote_count = int(review_count)
            else:
                self.session.add(
                    ExternalRating(
                        media_item_id=game.media_item_id,
                        provider="steam",
                        score=float(review_score),
                        max_score=100.0,
                        vote_count=int(review_count),
                    )
                )
