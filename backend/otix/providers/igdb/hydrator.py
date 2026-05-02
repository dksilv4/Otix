"""IGDB relation hydration.

After core game data is saved, hydrate covers, screenshots, artworks, videos,
genres, and ratings from the IGDB API response.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating, MediaAsset, MediaVideo
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import ExternalID, MediaItem
from otix.lib.types import JSONValue
from otix.providers.igdb.client import IGDBProvider
from otix.providers.igdb.transformer import _cover_url, _slugify


class IGDBHydrator:
    def __init__(self, provider: IGDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate_all(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Run all hydration steps for a game."""
        await self.hydrate_external_id(media_item, raw)
        await self.hydrate_genres(media_item, raw)
        await self.hydrate_images(media_item, raw)
        await self.hydrate_videos(media_item, raw)
        await self.hydrate_ratings(media_item, raw)

    # ── External ID ─────────────────────────────────────────────────

    async def hydrate_external_id(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        igdb_id = raw.get("id")
        if not igdb_id:
            return

        exists = await self.session.scalar(
            select(ExternalID).where(
                ExternalID.provider == "igdb",
                ExternalID.external_id == str(igdb_id),
            )
        )
        if not exists:
            self.session.add(
                ExternalID(
                    provider="igdb",
                    external_id=str(igdb_id),
                    media_item_id=media_item.id,
                )
            )

    # ── Genres ──────────────────────────────────────────────────────

    async def hydrate_genres(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Extract genres and themes from IGDB response, upsert Genre + MediaGenre."""
        genre_list = (raw.get("genres") or []) + (raw.get("themes") or [])
        if not isinstance(genre_list, list) or not genre_list:
            return

        await self.session.execute(
            delete(MediaGenre).where(MediaGenre.media_item_id == media_item.id)
        )

        names: set[str] = set()
        for g in genre_list:
            if isinstance(g, dict) and g.get("name"):
                names.add(str(g["name"]))

        if not names:
            return

        slugs = {name: _slugify(name) for name in names}
        existing = await self.session.scalars(
            select(Genre).where(Genre.slug.in_(list(slugs.values())))
        )
        by_slug: dict[str, Genre] = {g.slug: g for g in existing}

        new_genres: list[Genre] = []
        for name in names:
            slug = slugs[name]
            if slug not in by_slug:
                genre = Genre(name=name, slug=slug)
                new_genres.append(genre)
                by_slug[slug] = genre

        if new_genres:
            self.session.add_all(new_genres)
            await self.session.flush()

        for name in names:
            slug = slugs[name]
            genre = by_slug.get(slug)
            if genre is not None:
                self.session.add(
                    MediaGenre(media_item_id=media_item.id, genre_id=genre.id)
                )

    # ── Images ──────────────────────────────────────────────────────

    async def hydrate_images(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Store cover, screenshots, and artworks as MediaAsset rows."""
        candidates: list[tuple[str, str]] = []

        # Cover (asset_type="cover")
        cover = raw.get("cover")
        if isinstance(cover, dict):
            image_id = cover.get("image_id")
            if isinstance(image_id, str) and image_id:
                url = _cover_url(image_id)
                if url:
                    candidates.append(("cover", url))

        # Screenshots
        screenshots = raw.get("screenshots", [])
        if isinstance(screenshots, list):
            for s in screenshots[:10]:
                if not isinstance(s, dict):
                    continue
                image_id = s.get("image_id")
                if isinstance(image_id, str) and image_id:
                    url = _cover_url(image_id, "t_screenshot_big")
                    if url:
                        candidates.append(("screenshot", url))

        # Artworks
        artworks = raw.get("artworks", [])
        if isinstance(artworks, list):
            for a in artworks[:10]:
                if not isinstance(a, dict):
                    continue
                image_id = a.get("image_id")
                if isinstance(image_id, str) and image_id:
                    url = _cover_url(image_id, "t_1080p")
                    if url:
                        candidates.append(("artwork", url))

        if not candidates:
            return

        urls = {url for _, url in candidates}
        existing = await self.session.scalars(
            select(MediaAsset.url).where(MediaAsset.url.in_(urls))
        )
        existing_urls = set(existing)

        for asset_type, url in candidates:
            if url not in existing_urls:
                self.session.add(
                    MediaAsset(
                        media_item_id=media_item.id,
                        asset_type=asset_type,
                        url=url,
                        provider="igdb",
                    )
                )
                existing_urls.add(url)

    # ── Videos ──────────────────────────────────────────────────────

    async def hydrate_videos(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        videos = raw.get("videos", [])
        if not isinstance(videos, list) or not videos:
            return

        for video in videos[:10]:
            if not isinstance(video, dict):
                continue
            video_id = video.get("video_id")
            if not isinstance(video_id, str) or not video_id:
                continue
            self.session.add(
                MediaVideo(
                    media_item_id=media_item.id,
                    video_type="game_video",
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    provider="igdb",
                    provider_id=video_id,
                )
            )

    # ── Ratings ─────────────────────────────────────────────────────

    async def hydrate_ratings(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Store IGDB rating and aggregated_rating as ExternalRating rows.

        Uses aggregated_rating (critic) and rating (user) as separate providers
        since IGDB stores them as distinct scores.
        """
        rating_entries: list[tuple[str, str, float, int | None, float]] = []

        agg_rating = raw.get("aggregated_rating")
        agg_count = raw.get("aggregated_rating_count")
        if isinstance(agg_rating, (int, float)) and float(agg_rating) > 0:
            rating_entries.append(
                ("igdb_critic", "IGDB Critic", float(agg_rating), int(agg_count) if agg_count else None, 100.0)
            )

        user_rating = raw.get("rating")
        user_count = raw.get("rating_count")
        if isinstance(user_rating, (int, float)) and float(user_rating) > 0:
            rating_entries.append(
                ("igdb_user", "IGDB User", float(user_rating), int(user_count) if user_count else None, 100.0)
            )

        if not rating_entries:
            return

        provider_keys = {entry[0] for entry in rating_entries}
        existing = await self.session.scalars(
            select(ExternalRating).where(
                ExternalRating.media_item_id == media_item.id,
                ExternalRating.provider.in_(provider_keys),
            )
        )
        by_provider = {r.provider: r for r in existing}

        for provider_key, _, score, vote_count, max_score in rating_entries:
            existing_rating = by_provider.get(provider_key)
            if existing_rating is not None:
                if existing_rating.score != score or existing_rating.vote_count != vote_count:
                    existing_rating.score = score
                    existing_rating.vote_count = vote_count
                    existing_rating.max_score = max_score
            else:
                self.session.add(
                    ExternalRating(
                        media_item_id=media_item.id,
                        provider=provider_key,
                        score=score,
                        max_score=max_score,
                        vote_count=vote_count,
                    )
                )
