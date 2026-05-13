"""Steam enrichment hydration.

Fetches player counts + store data, transforms via pure functions, and
persists everything to Game, MediaAsset, MediaVideo, and ExternalRating.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating, MediaAsset, MediaVideo
from otix.domain.base import gen_otix_id
from otix.domain.company import Company, InvolvedCompany
from otix.domain.media import Game
from otix.lib.slug import slugify
from otix.providers.steam.client import SteamProvider
from otix.providers.steam.transformer import (
    extract_developers,
    extract_metacritic,
    extract_movie_data,
    extract_price,
    extract_publishers,
    extract_recommendations,
    extract_review_data,
    extract_review_summary,
    extract_screenshot_urls,
)


class SteamHydrator:
    def __init__(self, provider: SteamProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate(self, game: Game) -> None:
        """Fetch all Steam data for a game and persist to domain models."""
        app_id = game.steam_app_id
        if not app_id:
            return

        await self._hydrate_player_count(game, app_id)
        await self._hydrate_store_data(game, app_id)

    # ── Player count ───────────────────────────────────────────────

    async def _hydrate_player_count(self, game: Game, app_id: int) -> None:
        try:
            data = await self.provider.get_current_players(app_id)
        except Exception:
            return

        if data is None:
            return

        result = data.get("response", {})
        if result.get("result") != 1:
            return

        count = result.get("player_count")
        if isinstance(count, (int, float)):
            game.current_players = int(count)

    # ── Store data ─────────────────────────────────────────────────

    async def _hydrate_store_data(self, game: Game, app_id: int) -> None:
        try:
            store = await self.provider.get_app_details(app_id)
        except Exception:
            store = None

        try:
            reviews = await self.provider.get_app_reviews(app_id)
        except Exception:
            reviews = None

        if not store and not reviews:
            return

        if store:
            # Update steam_app_id if missing
            if not game.steam_app_id:
                steam_id = store.get("steam_appid")
                if isinstance(steam_id, int):
                    game.steam_app_id = steam_id

            if store.get("is_free") is True:
                game.is_free = True

            await self._hydrate_companies(
                game,
                extract_developers(store),
                extract_publishers(store),
            )
            game.price_json = extract_price(store)
            game.recommendations = extract_recommendations(store)

            # Store-based review summary (may be missing for some apps)
            game.review_summary = extract_review_summary(store)

            await self._upsert_steam_metacritic_rating(game, store)

            await self._hydrate_screenshots(game, store)
            await self._hydrate_movies(game, store)

        # Reviews API — review summary + user score (more reliable than store)
        if reviews:
            review_data = extract_review_data(reviews)
            if review_data:
                summary, score, total = review_data
                if not game.review_summary:
                    game.review_summary = summary
                if score > 0:
                    await self._upsert_steam_user_rating(game, score, total)

    # ── Companies ──────────────────────────────────────────────────

    async def _hydrate_companies(
        self,
        game: Game,
        developers: list[str] | None,
        publishers: list[str] | None,
    ) -> None:
        """Upsert Company rows and create InvolvedCompany links for a game."""
        role_map: dict[str, dict] = {}

        if developers:
            for name in developers:
                s = slugify(name)
                if s not in role_map:
                    role_map[s] = {"name": name, "developer": False, "publisher": False}
                role_map[s]["developer"] = True

        if publishers:
            for name in publishers:
                s = slugify(name)
                if s not in role_map:
                    role_map[s] = {"name": name, "developer": False, "publisher": False}
                role_map[s]["publisher"] = True

        if not role_map:
            return

        existing = await self.session.scalars(
            select(Company).where(Company.slug.in_(list(role_map.keys())))
        )
        by_slug: dict[str, Company] = {c.slug: c for c in existing}

        new_companies = []
        for slug_key, info in role_map.items():
            if slug_key not in by_slug:
                company = Company(id=gen_otix_id(), name=info["name"], slug=slug_key)
                new_companies.append(company)
                by_slug[slug_key] = company

        if new_companies:
            self.session.add_all(new_companies)
            await self.session.flush()

        await self.session.execute(
            delete(InvolvedCompany).where(
                InvolvedCompany.media_item_id == game.media_item_id
            )
        )

        for slug_key, info in role_map.items():
            company = by_slug[slug_key]
            self.session.add(
                InvolvedCompany(
                    media_item_id=game.media_item_id,
                    company_id=company.id,
                    developer=info["developer"],
                    publisher=info["publisher"],
                )
            )

    # ── Ratings ────────────────────────────────────────────────────

    async def _upsert_steam_user_rating(
        self, game: Game, review_score: int, review_count: int
    ) -> None:
        if review_score <= 0:
            return

        existing = await self.session.scalar(
            select(ExternalRating).where(
                ExternalRating.media_item_id == game.media_item_id,
                ExternalRating.provider == "steam_user",
            )
        )
        if existing is not None:
            if existing.score != review_score or existing.vote_count != review_count:
                existing.score = float(review_score)
                existing.vote_count = review_count
        else:
            self.session.add(
                ExternalRating(
                    media_item_id=game.media_item_id,
                    provider="steam_user",
                    score=float(review_score),
                    max_score=100.0,
                    vote_count=review_count,
                )
            )

    async def _upsert_steam_metacritic_rating(self, game: Game, store: dict) -> None:
        mc_data = extract_metacritic(store)
        if mc_data is None:
            return
        mc_score, _ = mc_data

        existing = await self.session.scalar(
            select(ExternalRating).where(
                ExternalRating.media_item_id == game.media_item_id,
                ExternalRating.provider == "steam_metacritic",
            )
        )
        if existing is not None:
            if existing.score != mc_score:
                existing.score = float(mc_score)
        else:
            self.session.add(
                ExternalRating(
                    media_item_id=game.media_item_id,
                    provider="steam_metacritic",
                    score=float(mc_score),
                    max_score=100.0,
                )
            )

    # ── Assets ─────────────────────────────────────────────────────

    async def _hydrate_screenshots(self, game: Game, store: dict) -> None:
        urls = extract_screenshot_urls(store)
        if not urls:
            return

        existing_urls = set(
            await self.session.scalars(
                select(MediaAsset.url).where(
                    MediaAsset.media_item_id == game.media_item_id,
                    MediaAsset.provider == "steam",
                )
            )
        )

        for url in urls:
            if url not in existing_urls:
                self.session.add(
                    MediaAsset(
                        media_item_id=game.media_item_id,
                        asset_type="screenshot",
                        url=url,
                        provider="steam",
                    )
                )
                existing_urls.add(url)

    async def _hydrate_movies(self, game: Game, store: dict) -> None:
        movies = extract_movie_data(store)
        if not movies:
            return

        existing_urls = set(
            await self.session.scalars(
                select(MediaVideo.url).where(
                    MediaVideo.media_item_id == game.media_item_id,
                    MediaVideo.provider == "steam",
                )
            )
        )

        for m in movies:
            url = m["url"]
            if url not in existing_urls:
                self.session.add(
                    MediaVideo(
                        media_item_id=game.media_item_id,
                        video_type="trailer",
                        url=url,
                        provider="steam",
                        provider_id=m["name"],
                    )
                )
                existing_urls.add(url)
