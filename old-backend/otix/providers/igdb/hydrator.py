# TODO: Review this file
"""IGDB relation hydration.

After core game data is saved, hydrate covers, screenshots, artworks, videos,
genres, and ratings from the IGDB API response.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating, MediaRelease, MediaVideo
from otix.domain.base import gen_otix_id
from otix.domain.company import Company, InvolvedCompany
from otix.domain.franchise import Franchise, FranchiseItem
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import (
    ExternalID,
    GameMode,
    MediaGameMode,
    MediaItem,
    MediaPlatform,
    Platform,
)
from otix.lib.collection_matcher import normalize_franchise_name
from otix.lib.genres import normalize_genre_names
from otix.lib.slug import slugify as _slugify
from otix.lib.types import JSONValue
from otix.providers.asset_mapper import map_asset_type
from otix.providers.asset_pipeline import AssetPipeline, RawAsset
from otix.providers.igdb.client import IGDBProvider
from otix.providers.igdb.transformer import (
    _cover_url,
    extract_franchise,
    extract_involved_companies,
    extract_modes,
    extract_platforms,
)
from otix.services.external_id_service import ExternalIDService
from otix.services.rating_algorithm_service import compute_and_store_overall_rating


class IGDBHydrator:
    def __init__(self, provider: IGDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    async def hydrate_all(self, game, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Run all hydration steps for a game."""
        await self.hydrate_external_id(media_item, raw)
        await self.hydrate_genres(media_item, raw)
        await self.hydrate_images(media_item, raw)
        await self.hydrate_videos(media_item, raw)
        await self.hydrate_ratings(media_item, raw)
        await self.hydrate_companies(media_item, raw)
        await self.hydrate_platforms(media_item, raw)
        await self.hydrate_modes(media_item, raw)
        await self.hydrate_age_ratings(media_item, raw)
        await self.hydrate_franchise(game, raw)

    # ── External ID ─────────────────────────────────────────────────

    async def hydrate_external_id(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        igdb_id = raw.get("id")
        if not igdb_id:
            return

        eid_svc = ExternalIDService(self.session)
        await eid_svc.upsert("igdb", str(igdb_id), "media_item", media_item.id)

    # ── Genres ──────────────────────────────────────────────────────

    async def hydrate_genres(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Extract genres and themes from IGDB response, upsert Genre + MediaGenre."""
        genre_list = (raw.get("genres") or []) + (raw.get("themes") or [])
        if not isinstance(genre_list, list) or not genre_list:
            return

        await self.session.execute(
            delete(MediaGenre).where(MediaGenre.media_item_id == media_item.id)
        )

        raw_names: list[str] = []
        for g in genre_list:
            if isinstance(g, dict) and g.get("name"):
                raw_names.append(str(g["name"]))

        names_by_slug = normalize_genre_names(raw_names)
        if not names_by_slug:
            return

        existing = await self.session.scalars(
            select(Genre).where(Genre.slug.in_(list(names_by_slug)))
        )
        by_slug: dict[str, Genre] = {g.slug: g for g in existing}

        new_genres: list[Genre] = []
        for slug, name in names_by_slug.items():
            if slug not in by_slug:
                genre = Genre(name=name, slug=slug)
                new_genres.append(genre)
                by_slug[slug] = genre

        if new_genres:
            self.session.add_all(new_genres)
            await self.session.flush()

        for slug in names_by_slug:
            genre = by_slug.get(slug)
            if genre is not None:
                self.session.add(
                    MediaGenre(media_item_id=media_item.id, genre_id=genre.id)
                )

    # ── Images ──────────────────────────────────────────────────────

    async def hydrate_images(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Store cover, screenshots, and artworks as MediaAsset rows."""
        candidates: list[RawAsset] = []

        # Cover → poster
        cover = raw.get("cover")
        if isinstance(cover, dict):
            image_id = cover.get("image_id")
            if isinstance(image_id, str) and image_id:
                url = _cover_url(image_id)
                if url:
                    candidates.append(
                        RawAsset(
                            asset_type=map_asset_type("igdb", "cover"),
                            url=url,
                            provider="igdb",
                            label="official",
                        )
                    )

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
                        candidates.append(
                            RawAsset(
                                asset_type=map_asset_type("igdb", "screenshot"),
                                url=url,
                                provider="igdb",
                                label="screenshot",
                            )
                        )

        # Artworks → backdrop
        artworks = raw.get("artworks", [])
        if isinstance(artworks, list):
            for a in artworks[:10]:
                if not isinstance(a, dict):
                    continue
                image_id = a.get("image_id")
                if isinstance(image_id, str) and image_id:
                    url = _cover_url(image_id, "t_1080p")
                    if url:
                        candidates.append(
                            RawAsset(
                                asset_type=map_asset_type("igdb", "artwork"),
                                url=url,
                                provider="igdb",
                                label="clean",
                            )
                        )

        if candidates:
            await AssetPipeline(self.session).store(media_item.id, candidates)

    # ── Videos ──────────────────────────────────────────────────────

    async def hydrate_videos(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        videos = raw.get("videos", [])
        if not isinstance(videos, list) or not videos:
            return

        # Delete-first so re-syncs don't stack duplicate rows (matches the
        # pattern used by genres/platforms/modes/releases hydration).
        await self.session.execute(
            delete(MediaVideo).where(
                MediaVideo.media_item_id == media_item.id,
                MediaVideo.provider == "igdb",
            )
        )

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

        # Keep the media-level overall rating in sync
        await compute_and_store_overall_rating(self.session, media_item.id)

    # ── Companies ──────────────────────────────────────────────────

    async def hydrate_companies(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        entries = extract_involved_companies(raw)
        if not entries:
            return

        slugs = [e["company_slug"] for e in entries]
        existing = await self.session.scalars(
            select(Company).where(Company.slug.in_(slugs))
        )
        by_slug: dict[str, Company] = {c.slug: c for c in existing}

        new_companies = []
        for e in entries:
            slug = e["company_slug"]
            logo_image_id = e.get("logo_image_id")
            if slug not in by_slug:
                company = Company(id=gen_otix_id(), name=e["company_name"], slug=slug)
                igdb_id = e.get("igdb_id")
                if isinstance(igdb_id, int):
                    company.igdb_id = igdb_id
                if logo_image_id:
                    company.logo_url = _cover_url(logo_image_id, "t_logo_med")
                new_companies.append(company)
                by_slug[slug] = company
            else:
                existing_company = by_slug[slug]
                igdb_id = e.get("igdb_id")
                if isinstance(igdb_id, int):
                    existing_igdb = await self.session.scalar(
                        select(ExternalID.external_id).where(
                            ExternalID.provider == "igdb",
                            ExternalID.entity_id == existing_company.id,
                            ExternalID.entity_type == "company",
                        )
                    )
                    if not existing_igdb:
                        existing_company.igdb_id = igdb_id
                if logo_image_id and not existing_company.logo_url:
                    existing_company.logo_url = _cover_url(logo_image_id, "t_logo_med")

        if new_companies:
            self.session.add_all(new_companies)
            await self.session.flush()

        await self.session.execute(
            delete(InvolvedCompany).where(
                InvolvedCompany.media_item_id == media_item.id
            )
        )

        for e in entries:
            company = by_slug[e["company_slug"]]
            self.session.add(
                InvolvedCompany(
                    media_item_id=media_item.id,
                    company_id=company.id,
                    developer=e["developer"],
                    publisher=e["publisher"],
                    porting=e["porting"],
                    supporting=e["supporting"],
                )
            )

    # ── Platforms ──────────────────────────────────────────────────

    async def hydrate_platforms(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        entries = extract_platforms(raw.get("platforms", []))
        if not entries:
            return

        slugs = [e["slug"] for e in entries]
        existing = await self.session.scalars(
            select(Platform).where(Platform.slug.in_(slugs))
        )
        by_slug: dict[str, Platform] = {p.slug: p for p in existing}

        new_platforms = []
        for e in entries:
            slug = e["slug"]
            if slug not in by_slug:
                platform = Platform(name=e["name"], slug=slug)
                logo_id = e.get("logo_image_id")
                if logo_id:
                    platform.logo_image_id = logo_id
                new_platforms.append(platform)
                by_slug[slug] = platform
            else:
                existing_platform = by_slug[slug]
                logo_id = e.get("logo_image_id")
                if existing_platform.logo_image_id is None and logo_id:
                    existing_platform.logo_image_id = logo_id

        if new_platforms:
            self.session.add_all(new_platforms)
            await self.session.flush()

        await self.session.execute(
            delete(MediaPlatform).where(
                MediaPlatform.media_item_id == media_item.id
            )
        )

        for e in entries:
            platform = by_slug[e["slug"]]
            self.session.add(
                MediaPlatform(
                    media_item_id=media_item.id,
                    platform_id=platform.id,
                )
            )

    # ── Game Modes ─────────────────────────────────────────────────

    async def hydrate_modes(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        entries = extract_modes(raw.get("game_modes", []))
        if not entries:
            return

        slugs = [e["slug"] for e in entries]
        existing = await self.session.scalars(
            select(GameMode).where(GameMode.slug.in_(slugs))
        )
        by_slug: dict[str, GameMode] = {m.slug: m for m in existing}

        new_modes = []
        for e in entries:
            slug = e["slug"]
            if slug not in by_slug:
                mode = GameMode(name=e["name"], slug=slug)
                new_modes.append(mode)
                by_slug[slug] = mode

        if new_modes:
            self.session.add_all(new_modes)
            await self.session.flush()

        await self.session.execute(
            delete(MediaGameMode).where(
                MediaGameMode.media_item_id == media_item.id
            )
        )

        for e in entries:
            mode = by_slug[e["slug"]]
            self.session.add(
                MediaGameMode(
                    media_item_id=media_item.id,
                    game_mode_id=mode.id,
                )
            )

    # ── Age ratings ────────────────────────────────────────────────────

    _AGE_RATING_ORG_MAP: dict[int, tuple[str, str]] = {
        1: ("ESRB", "us"),
        2: ("PEGI", "gb"),
        3: ("CERO", "jp"),
        4: ("USK", "de"),
        5: ("GRAC", "kr"),
        6: ("ClassInd", "br"),
        7: ("ACB", "au"),
    }

    _AGE_RATING_LABEL_MAP: dict[int, str] = {
        # ESRB (org=1)
        1: "RP", 2: "EC", 3: "E", 4: "E10+", 5: "T", 6: "M", 7: "AO",
        # PEGI (org=2)
        8: "3", 9: "7", 10: "12", 11: "16", 12: "18",
        # CERO (org=3)
        13: "A", 14: "B", 15: "C", 16: "D", 17: "Z",
        # USK (org=4)
        18: "0", 19: "6", 20: "12", 21: "16", 22: "18",
        # GRAC (org=5)
        23: "ALL", 24: "12+", 25: "15+", 26: "18+",
        # ClassInd (org=6)
        27: "ER", 28: "L", 29: "10", 30: "12", 31: "14", 32: "16", 33: "18",
        # ACB (org=7)
        34: "G", 35: "PG", 36: "M", 37: "MA15+", 38: "R18+",
    }

    async def hydrate_age_ratings(self, media_item: MediaItem, raw: dict[str, JSONValue]) -> None:
        """Fetch and store age ratings (ESRB, PEGI, etc.) for a game."""
        age_rating_ids: list[int] = raw.get("age_ratings", []) or []

        # If raw doesn't include age_ratings (e.g. from fields *), fetch explicitly
        if not age_rating_ids:
            igdb_id = raw.get("id")
            if not igdb_id:
                return
            try:
                game = await self.provider.get_game(int(igdb_id), fields="age_ratings")
            except Exception:
                return
            if not game:
                return
            age_rating_ids = game.get("age_ratings", []) or []

        if not age_rating_ids:
            return

        try:
            entries = await self.provider.get_age_ratings(age_rating_ids)
        except Exception:
            return

        if not entries:
            return

        await self.session.execute(
            delete(MediaRelease).where(MediaRelease.media_item_id == media_item.id)
        )

        for entry in entries:
            org_id = entry.get("organization")
            cat_id = entry.get("rating_category")
            if org_id is None or cat_id is None:
                continue

            org_info = self._AGE_RATING_ORG_MAP.get(org_id)
            if not org_info:
                continue

            system_name, country_code = org_info
            label = self._AGE_RATING_LABEL_MAP.get(cat_id)
            if not label:
                continue

            self.session.add(
                MediaRelease(
                    media_item_id=media_item.id,
                    country_code=country_code,
                    release_date=None,
                    certification=f"{system_name}: {label}",
                )
            )

    # ── Franchise ────────────────────────────────────────────────────

    async def hydrate_franchise(self, game, raw: dict[str, JSONValue]) -> None:
        """Link a game to a Franchise via IGDB franchise data.

        1. Extract franchise from raw game data
        2. Look up Franchise by igdb_franchise_id
        3. If not found, name-match against existing franchises
        4. If still not found, create new Franchise
        5. Set game.franchise_id
        6. Create FranchiseItem link (guarded)
        """
        data = extract_franchise(raw)
        if not data:
            return

        franchise = await self.session.scalar(
            select(Franchise).join(
                ExternalID,
                ExternalID.entity_id == Franchise.id,
            ).where(
                ExternalID.provider == "igdb",
                ExternalID.entity_type == "franchise",
                ExternalID.external_id == str(data["id"]),
            )
        )

        if franchise is None:
            # Cross-provider name match. Only runs for genuinely new IGDB
            # franchises — known ones hit the indexed external-ID lookup above,
            # so this table is small here. Fetch only id+name and normalize in
            # Python for exact parity with how franchises are created. No
            # LIMIT: a truncated scan would silently create duplicate
            # franchises once the table grows past the old 10k cap.
            normalized = normalize_franchise_name(data["name"])
            rows = (await self.session.execute(
                select(Franchise.id, Franchise.name)
            )).all()
            matched_id = next(
                (fid for fid, fname in rows if normalize_franchise_name(fname) == normalized),
                None,
            )
            if matched_id is not None:
                franchise = await self.session.get(Franchise, matched_id)

            if franchise is None:
                franchise = Franchise(
                    name=data["name"],
                    slug=_slugify(data["name"]),
                )
                self.session.add(franchise)
                await self.session.flush()
                franchise.igdb_franchise_id = data["id"]

        game.franchise_id = franchise.id

        exists = await self.session.scalar(
            select(FranchiseItem).where(
                FranchiseItem.franchise_id == franchise.id,
                FranchiseItem.media_item_id == game.media_item_id,
            )
        )
        if not exists:
            self.session.add(
                FranchiseItem(
                    franchise_id=franchise.id,
                    media_item_id=game.media_item_id,
                )
            )
