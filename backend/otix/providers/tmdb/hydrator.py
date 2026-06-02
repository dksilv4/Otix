"""TMDB relation hydration.

After the core entity is in the DB, hydrate credits, images, external IDs,
videos, releases, and collections using the TMDB API.
"""

from __future__ import annotations

import hashlib
import json

import structlog
from sqlalchemy import delete, not_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.base import gen_otix_id
from otix.domain.collection import Collection, CollectionItem
from otix.domain.company import Company, InvolvedCompany
from otix.domain.franchise import Franchise, FranchiseItem
from otix.domain.genre import Genre, Keyword, MediaGenre, MediaKeyword
from otix.domain.media import ExternalID, MediaItem, Movie
from otix.domain.people import MediaCredit, Person, PersonAsset
from otix.domain.watch_provider import MediaWatchProvider, WatchProvider
from otix.lib.collection_matcher import normalize_franchise_name
from otix.lib.genres import normalize_genre_names
from otix.lib.slug import slugify
from otix.providers.tmdb.client import TMDBProvider
from otix.providers.tmdb.transformer import _parse_date
from otix.services.external_id_service import ExternalIDService

logger = structlog.get_logger()


class TMDBHydrator:
    """Fills in relations for a media item after its core data is saved."""

    def __init__(self, provider: TMDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    # ── Credits ──────────────────────────────────────────────────

    async def hydrate_credits(self, media_item: MediaItem, raw: dict) -> None:
        """Upsert cast and crew from TMDB credits data."""
        credits = raw.get("credits", {})
        if not credits:
            return

        await self.session.execute(delete(MediaCredit).where(MediaCredit.media_item_id == media_item.id))

        cast = credits.get("cast", [])
        crew = credits.get("crew", [])
        all_crew = cast + crew
        if not all_crew:
            return

        # Batch-resolve all persons
        persons_by_tmdb = await self._batch_get_or_create_persons(all_crew)

        new_credits: list[MediaCredit] = []
        for entry in cast:
            credit = self._build_credit(media_item, entry, "cast", persons_by_tmdb)
            if credit:
                new_credits.append(credit)

        for entry in crew:
            credit = self._build_credit(media_item, entry, "crew", persons_by_tmdb)
            if credit:
                new_credits.append(credit)

        if new_credits:
            self.session.add_all(new_credits)

    def _build_credit(
        self, media_item: MediaItem, raw: dict, role: str, persons_by_tmdb: dict[int, Person]
    ) -> MediaCredit | None:
        person_id = raw.get("id")
        person = persons_by_tmdb.get(person_id)
        if person is None:
            return None

        return MediaCredit(
            media_item_id=media_item.id,
            person_id=person.id,
            role=role,
            character_name=raw.get("character") if role == "cast" else raw.get("job"),
            sort_order=raw.get("order", 0),
        )

    # ── People ───────────────────────────────────────────────────

    async def _batch_get_or_create_persons(self, entries: list[dict]) -> dict[int, Person]:
        """Resolve all persons in one batch: existing from DB, new ones inserted.

        Three-phase lookup:
          1. Resolve by tmdb_id (fast, most common path).
          2. For unmatched, check wikidata_id for cross-provider matches.
          3. For still unmatched, check by name with no tmdb_id and backfill.
        """
        tmdb_ids = {e["id"] for e in entries if e.get("id") and e.get("name")}
        if not tmdb_ids:
            return {}

        eid_subq = (
            select(ExternalID.entity_id).where(
                ExternalID.provider == "tmdb",
                ExternalID.entity_type == "person",
                ExternalID.external_id.in_([str(x) for x in tmdb_ids]),
            )
        ).subquery()
        existing = await self.session.scalars(
            select(Person).where(Person.id.in_(select(eid_subq))).options(selectinload(Person._external_ids))
        )
        persons_by_tmdb: dict[int, Person] = {}
        for p in existing:
            tid = p.tmdb_id
            if tid is not None:
                persons_by_tmdb[int(tid)] = p

        # Collect unmatched entries — keep tmdb_id → entry (not name → entry,
        # since different people can share the same name).
        unmatched_by_tmdb: dict[int, dict] = {}
        for entry in entries:
            tmdb_id = entry.get("id")
            if not tmdb_id or not entry.get("name"):
                continue
            if tmdb_id in persons_by_tmdb:
                continue
            if tmdb_id not in unmatched_by_tmdb:
                unmatched_by_tmdb[tmdb_id] = entry

        if unmatched_by_tmdb:
            # Phase 2: check wikidata_id for cross-provider matches
            wiki_ids = {e.get("wikidata_id") for e in unmatched_by_tmdb.values() if e.get("wikidata_id")}
            wiki_matches: dict[str, Person] = {}
            if wiki_ids:
                wiki_subq = (
                    select(ExternalID.entity_id).where(
                        ExternalID.provider == "wikidata",
                        ExternalID.entity_type == "person",
                        ExternalID.external_id.in_(wiki_ids),
                    )
                ).subquery()
                existing_wiki = await self.session.scalars(
                    select(Person).where(Person.id.in_(select(wiki_subq))).options(selectinload(Person._external_ids))
                )
                for p in existing_wiki:
                    wid = p.wikidata_id
                    if wid is not None:
                        wiki_matches[str(wid)] = p

            for tmdb_id, entry in list(unmatched_by_tmdb.items()):
                wiki_id = entry.get("wikidata_id")
                if wiki_id and wiki_id in wiki_matches:
                    matched = wiki_matches[wiki_id]
                    matched.tmdb_id = tmdb_id
                    matched.photo_url = matched.photo_url or _tmdb_image(entry.get("profile_path"))
                    persons_by_tmdb[tmdb_id] = matched
                    del unmatched_by_tmdb[tmdb_id]

            # Phase 3: check for existing persons by name with no tmdb_id
            names = list({e["name"] for e in unmatched_by_tmdb.values()})
            has_tmdb = (
                select(ExternalID.entity_id).where(
                    ExternalID.provider == "tmdb",
                    ExternalID.entity_type == "person",
                    ExternalID.entity_id == Person.id,
                )
            ).exists()
            name_matches = await self.session.scalars(
                select(Person).where(Person.name.in_(names), not_(has_tmdb)).options(selectinload(Person._external_ids))
            )
            names_to_persons: dict[str, Person] = {}
            for person in name_matches:
                if person.name not in names_to_persons:
                    names_to_persons[person.name] = person

            for tmdb_id, entry in list(unmatched_by_tmdb.items()):
                matched = names_to_persons.get(entry["name"])
                if matched is None:
                    continue
                matched.tmdb_id = tmdb_id
                matched.photo_url = matched.photo_url or _tmdb_image(entry.get("profile_path"))
                persons_by_tmdb[tmdb_id] = matched
                del unmatched_by_tmdb[tmdb_id]

            # Remaining unmatched entries become new Person stubs.
            if unmatched_by_tmdb:
                new_people: list[Person] = []
                for entry in unmatched_by_tmdb.values():
                    person = Person(
                        id=gen_otix_id(),
                        name=entry["name"],
                        tmdb_id=entry["id"],
                        wikidata_id=entry.get("wikidata_id"),
                        photo_url=_tmdb_image(entry.get("profile_path")),
                    )
                    new_people.append(person)
                    persons_by_tmdb[entry["id"]] = person

                self.session.add_all(new_people)
                await self.session.flush()

        return persons_by_tmdb

    # ── Genres ───────────────────────────────────────────────────

    async def hydrate_genres(self, media_item: MediaItem, raw: dict) -> None:
        genre_list = raw.get("genres", [])
        if not genre_list:
            return

        # Clear existing links for clean re-sync
        await self.session.execute(delete(MediaGenre).where(MediaGenre.media_item_id == media_item.id))

        names_by_slug = normalize_genre_names(str(g["name"]) for g in genre_list if g.get("name"))
        if not names_by_slug:
            return

        genres_by_slug = await self._batch_get_or_create_genres(names_by_slug)

        for slug in names_by_slug:
            genre = genres_by_slug.get(slug)
            if genre is None:
                continue
            self.session.add(MediaGenre(media_item_id=media_item.id, genre_id=genre.id))

    async def _batch_get_or_create_genres(self, names_by_slug: dict[str, str]) -> dict[str, Genre]:
        """Resolve all genres in one batch."""
        slug_list = list(names_by_slug)
        existing = await self.session.scalars(select(Genre).where(Genre.slug.in_(slug_list)))
        genres_by_slug: dict[str, Genre] = {g.slug: g for g in existing}

        new_genres: list[Genre] = []
        for slug, name in names_by_slug.items():
            if slug in genres_by_slug:
                continue
            genre = Genre(name=name, slug=slug)
            new_genres.append(genre)
            genres_by_slug[slug] = genre

        if new_genres:
            self.session.add_all(new_genres)
            await self.session.flush()

        return genres_by_slug

    # ── External IDs ─────────────────────────────────────────────

    async def hydrate_external_ids(self, media_item: MediaItem, raw: dict) -> None:
        ids = raw.get("external_ids", {})
        if not ids:
            return

        # TMDB external_id is already created in the sync task — skip it here.
        mappings: list[tuple[str, str | None]] = [
            ("imdb", ids.get("imdb_id")),
            ("tvdb", str(ids.get("tvdb_id")) if ids.get("tvdb_id") else None),
        ]

        eid_svc = ExternalIDService(self.session)
        for provider, ext_id in mappings:
            if not ext_id:
                continue
            await eid_svc.upsert(provider, ext_id, "media_item", media_item.id)

    # ── Images ───────────────────────────────────────────────────

    async def hydrate_images(self, media_item: MediaItem, raw: dict) -> None:
        """Store posters, textless posters, and backdrops as MediaAsset rows.

        TMDB returns iso_639_1 for each image. When null/None, the poster
        has no text overlay — we store those as asset_type='textless_poster'
        and pick the best one for media_item.textless_poster_url.
        """
        images = raw.get("images", {})
        if not images:
            return

        candidates: list[tuple[str, dict]] = []
        best_textless: dict | None = None
        best_textless_width = 0

        for poster in images.get("posters", [])[:10]:
            iso_lang = poster.get("iso_639_1")
            if iso_lang is None:
                # Textless poster — track best one for media_item.textless_poster_url
                candidates.append(("textless_poster", poster))
                w = poster.get("width") or 0
                if w > best_textless_width:
                    best_textless = poster
                    best_textless_width = w
            else:
                candidates.append(("poster", poster))

        for backdrop in images.get("backdrops", [])[:5]:
            candidates.append(("backdrop", backdrop))

        if not candidates:
            return

        urls = {_tmdb_image(entry.get("file_path"), "original") for _, entry in candidates}
        urls.discard(None)

        # Batch-check existing URLs
        existing_urls = set()
        if urls:
            result = await self.session.scalars(select(MediaAsset.url).where(MediaAsset.url.in_(urls)))
            existing_urls = set(result)

        for asset_type, entry in candidates:
            url = _tmdb_image(entry.get("file_path"), "original")
            if url is None or url in existing_urls:
                continue
            self.session.add(
                MediaAsset(
                    media_item_id=media_item.id,
                    asset_type=asset_type,
                    url=url,
                    width=entry.get("width"),
                    height=entry.get("height"),
                    lang=entry.get("iso_639_1"),
                    provider="tmdb",
                )
            )
            existing_urls.add(url)

        # Textless posters are sourced from Fanart, not TMDB.
        # TMDB's iso_639_1=null is unreliable for detecting truly textless posters.

    # ── Videos ───────────────────────────────────────────────────

    async def hydrate_videos(self, media_item: MediaItem, raw: dict) -> None:
        """Store trailers, teasers, and other videos from TMDB."""
        videos = raw.get("videos", {})
        results = videos.get("results", [])
        if not results:
            return

        for video in results[:10]:
            key = video.get("key")
            if not key:
                continue
            url = f"https://www.youtube.com/watch?v={key}"
            self.session.add(
                MediaVideo(
                    media_item_id=media_item.id,
                    video_type=video.get("type"),
                    url=url,
                    provider="tmdb",
                    provider_id=str(video.get("id", "")),
                )
            )

    # ── Releases ─────────────────────────────────────────────────

    async def hydrate_releases(self, media_item: MediaItem, raw: dict) -> None:
        """Store release dates and certifications by country."""
        release_dates = raw.get("release_dates", {})
        results = release_dates.get("results", [])
        if not results:
            return

        await self.session.execute(delete(MediaRelease).where(MediaRelease.media_item_id == media_item.id))

        for country in results:
            country_code = country.get("iso_3166_1", "")
            if not country_code:
                continue
            dates = country.get("release_dates", [])
            if not dates:
                continue

            # Prefer theatrical (type 3), fall back to first entry
            entry = next((d for d in dates if d.get("type") == 3), dates[0])
            date_str = entry.get("release_date", "")
            if not date_str:
                continue

            # TMDB returns ISO-8601 with time; strip to date portion, then parse
            raw_date = date_str[:10] if "T" in date_str else date_str
            release_date = _parse_date(raw_date)
            if not release_date:
                continue

            self.session.add(
                MediaRelease(
                    media_item_id=media_item.id,
                    country_code=country_code.lower(),
                    release_date=release_date,
                    certification=entry.get("certification")[:20] if entry.get("certification") else None,
                )
            )

    # ── Content Ratings (TV) ─────────────────────────────────────

    async def hydrate_content_ratings(self, media_item: MediaItem, raw: dict) -> None:
        """Store TV content ratings by country (e.g., TV-G, TV-14)."""
        content_ratings = raw.get("content_ratings", {})
        results = content_ratings.get("results", [])
        if not results:
            return

        await self.session.execute(delete(MediaRelease).where(MediaRelease.media_item_id == media_item.id))

        for entry in results:
            country_code = entry.get("iso_3166_1", "")
            certification = entry.get("rating", "")
            if not country_code or not certification:
                continue

            self.session.add(
                MediaRelease(
                    media_item_id=media_item.id,
                    country_code=country_code.lower(),
                    release_date=None,
                    certification=certification[:20],
                )
            )

    # ── Ratings ──────────────────────────────────────────────────

    async def hydrate_ratings(self, media_item: MediaItem, raw: dict) -> None:
        vote_average = raw.get("vote_average")
        vote_count = raw.get("vote_count")

        if vote_average and vote_average > 0:
            existing = await self.session.scalar(
                select(ExternalRating).where(
                    ExternalRating.media_item_id == media_item.id,
                    ExternalRating.provider == "tmdb",
                )
            )
            if existing:
                existing.score = vote_average
                existing.vote_count = vote_count
            else:
                self.session.add(
                    ExternalRating(
                        media_item_id=media_item.id,
                        provider="tmdb",
                        score=vote_average,
                        max_score=10.0,
                        vote_count=vote_count,
                    )
                )

    # ── Collection ───────────────────────────────────────────────

    async def hydrate_collection(self, movie: Movie, raw: dict) -> None:
        coll_data = raw.get("belongs_to_collection")
        if not coll_data:
            return

        tmdb_id = coll_data.get("id")
        if not tmdb_id:
            return

        eid_svc = ExternalIDService(self.session)
        entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "collection")
        collection = await self.session.get(Collection, entity_id) if entity_id else None

        try:
            coll_raw = await self.provider.get_collection(tmdb_id)
        except Exception:
            logger.warning(
                "failed to fetch collection details",
                collection_tmdb_id=tmdb_id,
                exc_info=True,
            )
            if collection is not None:
                movie.collection_id = collection.id
            return

        coll_hash = hashlib.sha256(json.dumps(coll_raw, sort_keys=True, default=str).encode()).hexdigest()

        if collection is not None and collection.content_hash == coll_hash:
            movie.collection_id = collection.id
            return

        if collection is None:
            collection = Collection()
            collection.name = coll_data.get("name") or "Unknown Collection"
            self.session.add(collection)
            await self.session.flush()
            collection.tmdb_id = tmdb_id

        collection.name = coll_raw.get("name", coll_data.get("name", ""))
        collection.overview = coll_raw.get("overview")
        collection.poster_url = _tmdb_image(coll_raw.get("poster_path"))
        collection.backdrop_url = _tmdb_image(coll_raw.get("backdrop_path"))
        collection.content_hash = coll_hash

        await self.session.flush()
        movie.collection_id = collection.id

        # Link TMDB collection to a Franchise via name matching
        if collection.franchise_id is None:
            normalized = normalize_franchise_name(collection.name)
            all_franchises = (await self.session.scalars(select(Franchise))).all()
            for fr in all_franchises:
                if normalize_franchise_name(fr.name) == normalized:
                    collection.franchise_id = fr.id
                    break

        # Create FranchiseItem link for this movie if collection has a franchise
        if collection.franchise_id:
            exists = await self.session.scalar(
                select(FranchiseItem).where(
                    FranchiseItem.franchise_id == collection.franchise_id,
                    FranchiseItem.media_item_id == movie.media_item_id,
                )
            )
            if not exists:
                self.session.add(
                    FranchiseItem(
                        franchise_id=collection.franchise_id,
                        media_item_id=movie.media_item_id,
                    )
                )

    # ── Person images ──────────────────────────────────────────────

    async def hydrate_person_images(self, person: Person, raw: dict) -> None:
        """Store profile images as PersonAsset rows (URL is unique)."""
        images = raw.get("images", {})
        profiles = images.get("profiles", [])
        if not profiles:
            return

        candidates: list[dict] = []
        for profile in profiles[:10]:
            url = _tmdb_image(profile.get("file_path"), "original")
            if url:
                candidates.append(
                    {
                        "url": url,
                        "width": profile.get("width"),
                        "height": profile.get("height"),
                    }
                )

        if not candidates:
            return

        urls = {c["url"] for c in candidates}
        existing_urls = set()
        if urls:
            result = await self.session.scalars(select(PersonAsset.url).where(PersonAsset.url.in_(urls)))
            existing_urls = set(result)

        for c in candidates:
            if c["url"] in existing_urls:
                continue
            self.session.add(
                PersonAsset(
                    person_id=person.id,
                    url=c["url"],
                    width=c["width"],
                    height=c["height"],
                    provider="tmdb",
                )
            )
            existing_urls.add(c["url"])

    # ── Company (production company / network) ─────────────────────

    async def hydrate_company(self, company: Company, raw: dict) -> None:
        company.name = raw.get("name", company.name)
        logo = raw.get("logo_path")
        if logo:
            company.logo_url = _tmdb_image(logo)
        company.origin_country = raw.get("origin_country")

    # ── Involved companies (production companies / networks) ──────

    async def hydrate_involved_companies(self, media_item: MediaItem, raw: dict) -> None:
        """Create InvolvedCompany links for production companies (movies) and networks + production companies (shows)."""
        entries: list[dict] = list(raw.get("production_companies", []) or [])

        if media_item.media_type == "show":
            networks = raw.get("networks", []) or []
            for nw in networks:
                if not any(e.get("id") == nw.get("id") for e in entries):
                    entries.append(nw)

        if not entries:
            return

        # Delete existing production links for this media item
        await self.session.execute(
            delete(InvolvedCompany).where(
                InvolvedCompany.media_item_id == media_item.id,
                InvolvedCompany.production == True,  # noqa: E712
            )
        )

        for entry in entries:
            tmdb_id = entry.get("id")
            if not tmdb_id:
                continue

            # Upsert Company
            eid_svc = ExternalIDService(self.session)
            entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_id), "company")
            company = await self.session.get(Company, entity_id) if entity_id else None
            if company is None:
                computed_slug = f"{slugify(entry.get('name') or 'unknown-company')}-{tmdb_id}"
                company = await self.session.scalar(select(Company).where(Company.slug == computed_slug))
                if company is None:
                    company = Company(
                        name=entry.get("name") or "Unknown Company",
                        slug=computed_slug,
                    )
                    self.session.add(company)
                    await self.session.flush()
                company.tmdb_id = tmdb_id
            await self.hydrate_company(company, entry)
            await self.session.flush()

            # Create InvolvedCompany link
            self.session.add(
                InvolvedCompany(
                    media_item_id=media_item.id,
                    company_id=company.id,
                    production=True,
                )
            )

    # ── Watch Providers ───────────────────────────────────────────

    async def hydrate_watch_providers(self, media_item: MediaItem, raw_watch: dict) -> None:
        """Store watch provider availability from TMDB's JustWatch aggregation."""
        results = raw_watch.get("results", {})
        if not results:
            return

        await self.session.execute(delete(MediaWatchProvider).where(MediaWatchProvider.media_item_id == media_item.id))

        for country_code, country_data in results.items():
            if not isinstance(country_data, dict):
                continue
            cc = country_code.lower()
            link = country_data.get("link", "")

            for offering_type in ("flatrate", "rent", "buy", "free", "ads"):
                providers = country_data.get(offering_type, [])
                if not providers:
                    continue

                for entry in providers:
                    tmdb_pid = entry.get("provider_id")
                    if not tmdb_pid:
                        continue

                    wp = await self._get_or_create_watch_provider(
                        tmdb_pid,
                        entry.get("provider_name", ""),
                        entry.get("logo_path", ""),
                        entry.get("display_priority", 0),
                    )

                    self.session.add(
                        MediaWatchProvider(
                            media_item_id=media_item.id,
                            watch_provider_id=wp.id,
                            country_code=cc,
                            offering_type=offering_type,
                            url=link[:2000] if link else None,
                            display_priority=entry.get("display_priority", 0),
                        )
                    )

        await self.session.flush()

    async def _get_or_create_watch_provider(
        self,
        tmdb_provider_id: int,
        name: str,
        logo_path: str,
        priority: int,
    ) -> WatchProvider:
        eid_svc = ExternalIDService(self.session)
        entity_id = await eid_svc.find_entity_id_by_type("tmdb", str(tmdb_provider_id), "watch_provider")
        wp = await self.session.get(WatchProvider, entity_id) if entity_id else None
        if wp is not None:
            wp.name = name
            wp.display_priority = priority
            if logo_path:
                wp.logo_url = _tmdb_image(logo_path, "w92")
            return wp

        slug = f"{slugify(name)}-{tmdb_provider_id}"
        wp = await self.session.scalar(select(WatchProvider).where(WatchProvider.slug == slug))
        if wp is not None:
            wp.name = name
            wp.display_priority = priority
            if logo_path:
                wp.logo_url = _tmdb_image(logo_path, "w92")
            wp.tmdb_provider_id = tmdb_provider_id
            await self.session.flush()
            return wp

        try:
            async with self.session.begin_nested():
                wp = WatchProvider(
                    name=name,
                    slug=slug,
                    logo_url=_tmdb_image(logo_path, "w92") if logo_path else None,
                    display_priority=priority,
                    tmdb_provider_id=tmdb_provider_id,
                )
                self.session.add(wp)
                await self.session.flush()
        except IntegrityError:
            # Fallback in case of concurrent insert race condition
            wp = await self.session.scalar(select(WatchProvider).where(WatchProvider.slug == slug))
            if wp is not None:
                wp.name = name
                wp.display_priority = priority
                if logo_path:
                    wp.logo_url = _tmdb_image(logo_path, "w92")
                wp.tmdb_provider_id = tmdb_provider_id
                await self.session.flush()

        return wp

    # ── Keywords ───────────────────────────────────────────────────

    async def hydrate_keywords(self, media_item: MediaItem, raw: dict) -> None:
        """Create MediaKeyword links from TMDB keyword data.

        TMDB returns keywords as ``{"keywords": {"keywords": [...]}}`` for movies
        and ``{"keywords": {"results": [...]}}`` for shows.
        """
        keywords_data = raw.get("keywords", {})
        if not isinstance(keywords_data, dict):
            return

        keyword_list = keywords_data.get("keywords") or keywords_data.get("results", [])
        if not isinstance(keyword_list, list) or not keyword_list:
            return

        await self.session.execute(delete(MediaKeyword).where(MediaKeyword.media_item_id == media_item.id))

        for kw in keyword_list:
            if not isinstance(kw, dict):
                continue
            name = str(kw.get("name", ""))
            if not name:
                continue

            keyword = await self._get_or_create_keyword(name)
            if keyword is None:
                continue

            tmdb_id = kw.get("id")
            if tmdb_id and not keyword.tmdb_id:
                keyword.tmdb_id = int(tmdb_id)

            self.session.add(
                MediaKeyword(
                    media_item_id=media_item.id,
                    keyword_id=keyword.id,
                )
            )

    async def hydrate_keyword(self, keyword: Keyword, raw: dict) -> None:
        keyword.name = raw.get("name", keyword.name)

    async def _get_or_create_keyword(self, name: str) -> Keyword | None:
        from uuid import uuid4

        from sqlalchemy.dialects.postgresql import insert as pg_insert

        keyword = await self.session.scalar(
            select(Keyword).options(selectinload(Keyword._external_ids)).where(Keyword.name == name)
        )
        if keyword is not None:
            return keyword

        keyword_id = f"oti_{uuid4().hex[:12]}"
        await self.session.execute(
            pg_insert(Keyword).values(id=keyword_id, name=name).on_conflict_do_nothing(constraint="keywords_name_key")
        )
        return await self.session.scalar(
            select(Keyword).options(selectinload(Keyword._external_ids)).where(Keyword.name == name)
        )


# ── Helpers ─────────────────────────────────────────────────────────


def _tmdb_image(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"
