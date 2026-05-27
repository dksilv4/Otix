"""TMDB relation hydration.

After the core entity is in the DB, hydrate credits, images, external IDs,
videos, releases, and collections using the TMDB API.
"""

from __future__ import annotations

import hashlib
import json

import structlog
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.base import gen_otix_id
from otix.domain.collection import Collection
from otix.domain.company import Company, InvolvedCompany
from otix.domain.genre import Genre, Keyword, MediaGenre
from otix.domain.media import ExternalID, MediaItem, Movie
from otix.domain.people import MediaCredit, Person, PersonAsset
from otix.lib.genres import normalize_genre_names
from otix.lib.slug import slugify
from otix.providers.tmdb.client import TMDBProvider
from otix.providers.tmdb.transformer import _parse_date

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

        await self.session.execute(
            delete(MediaCredit).where(MediaCredit.media_item_id == media_item.id)
        )

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

        Two-phase lookup:
          1. Resolve by tmdb_id (fast, most common path).
          2. For unmatched names, check if a Person exists without tmdb_id.
             If so, backfill the tmdb_id instead of creating a duplicate.
        """
        tmdb_ids = {e["id"] for e in entries if e.get("id") and e.get("name")}
        if not tmdb_ids:
            return {}

        existing = await self.session.scalars(
            select(Person).where(Person.tmdb_id.in_(tmdb_ids))
        )
        persons_by_tmdb: dict[int, Person] = {p.tmdb_id: p for p in existing}

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
            # Phase 2: check for existing persons by name with no tmdb_id
            names = list({e["name"] for e in unmatched_by_tmdb.values()})
            name_matches = await self.session.scalars(
                select(Person).where(Person.name.in_(names), Person.tmdb_id.is_(None))
            )
            # Build a name → Person lookup for backfilling
            names_to_persons: dict[str, Person] = {}
            for person in name_matches:
                if person.name not in names_to_persons:
                    names_to_persons[person.name] = person

            # Backfill tmdb_id on existing name-matched persons
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
        await self.session.execute(
            delete(MediaGenre).where(MediaGenre.media_item_id == media_item.id)
        )

        names_by_slug = normalize_genre_names(
            str(g["name"]) for g in genre_list if g.get("name")
        )
        if not names_by_slug:
            return

        genres_by_slug = await self._batch_get_or_create_genres(names_by_slug)

        for slug in names_by_slug:
            genre = genres_by_slug.get(slug)
            if genre is None:
                continue
            self.session.add(
                MediaGenre(media_item_id=media_item.id, genre_id=genre.id)
            )

    async def _batch_get_or_create_genres(
        self, names_by_slug: dict[str, str]
    ) -> dict[str, Genre]:
        """Resolve all genres in one batch."""
        slug_list = list(names_by_slug)
        existing = await self.session.scalars(
            select(Genre).where(Genre.slug.in_(slug_list))
        )
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

        for provider, ext_id in mappings:
            if not ext_id:
                continue
            exists = await self.session.scalar(
                select(ExternalID).where(
                    ExternalID.provider == provider,
                    ExternalID.external_id == ext_id,
                )
            )
            if not exists:
                self.session.add(
                    ExternalID(provider=provider, external_id=ext_id, media_item_id=media_item.id)
                )

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
            result = await self.session.scalars(
                select(MediaAsset.url).where(MediaAsset.url.in_(urls))
            )
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

        await self.session.execute(
            delete(MediaRelease).where(MediaRelease.media_item_id == media_item.id)
        )

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

        await self.session.execute(
            delete(MediaRelease).where(MediaRelease.media_item_id == media_item.id)
        )

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

        collection = await self.session.scalar(
            select(Collection).where(Collection.tmdb_id == tmdb_id)
        )

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

        coll_hash = hashlib.sha256(
            json.dumps(coll_raw, sort_keys=True, default=str).encode()
        ).hexdigest()

        if collection is not None and collection.content_hash == coll_hash:
            movie.collection_id = collection.id
            return

        if collection is None:
            collection = Collection(tmdb_id=tmdb_id)
            self.session.add(collection)

        collection.name = coll_raw.get("name", coll_data.get("name", ""))
        collection.overview = coll_raw.get("overview")
        collection.poster_url = _tmdb_image(coll_raw.get("poster_path"))
        collection.backdrop_url = _tmdb_image(coll_raw.get("backdrop_path"))
        collection.content_hash = coll_hash

        await self.session.flush()
        movie.collection_id = collection.id

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
                candidates.append({
                    "url": url,
                    "width": profile.get("width"),
                    "height": profile.get("height"),
                })

        if not candidates:
            return

        urls = {c["url"] for c in candidates}
        existing_urls = set()
        if urls:
            result = await self.session.scalars(
                select(PersonAsset.url).where(PersonAsset.url.in_(urls))
            )
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
        company.slug = slugify(company.name)
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
            company = await self.session.scalar(
                select(Company).where(Company.tmdb_id == tmdb_id)
            )
            if company is None:
                company = Company(tmdb_id=tmdb_id)
                self.session.add(company)
            await self.hydrate_company(company, entry)
            await self.session.flush()

            # Create InvolvedCompany link
            self.session.add(InvolvedCompany(
                media_item_id=media_item.id,
                company_id=company.id,
                production=True,
            ))

    # ── Keyword ────────────────────────────────────────────────────

    async def hydrate_keyword(self, keyword: Keyword, raw: dict) -> None:
        keyword.name = raw.get("name", keyword.name)


# ── Helpers ─────────────────────────────────────────────────────────


def _tmdb_image(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"
