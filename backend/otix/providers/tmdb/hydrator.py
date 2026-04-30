"""TMDB relation hydration.

After the core entity is in the DB, hydrate credits, images, external IDs,
and collections using the TMDB API.
"""

from __future__ import annotations

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.collection import Collection
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import ExternalID, MediaItem, Movie, Show
from otix.domain.people import MediaCredit, Person
from otix.providers.tmdb.client import TMDBProvider


class TMDBHydrator:
    """Fills in relations for a media item after its core data is saved."""

    def __init__(self, provider: TMDBProvider, session: AsyncSession):
        self.provider = provider
        self.session = session

    # ── Credits ──────────────────────────────────────────────────

    async def hydrate_credits(
        self, media_item: MediaItem, raw: dict
    ) -> None:
        """Upsert cast and crew from TMDB credits data."""
        credits = raw.get("credits", {})
        if not credits:
            return

        # Clear existing credits for clean re-sync
        await self.session.execute(
            delete(MediaCredit).where(MediaCredit.media_item_id == media_item.id)
        )

        for cast_data in credits.get("cast", []):
            credit = await self._upsert_credit(media_item, cast_data, "cast")
            if credit:
                self.session.add(credit)

        for crew_data in credits.get("crew", []):
            credit = await self._upsert_credit(media_item, crew_data, "crew")
            if credit:
                self.session.add(credit)

    async def _upsert_credit(
        self, media_item: MediaItem, raw: dict, role: str
    ) -> MediaCredit | None:
        person = await self._get_or_create_person(raw)
        if person is None:
            return None

        existing = await self.session.scalar(
            select(MediaCredit).where(
                MediaCredit.media_item_id == media_item.id,
                MediaCredit.person_id == person.id,
                MediaCredit.role == role,
            )
        )
        if existing:
            return existing

        return MediaCredit(
            media_item_id=media_item.id,
            person_id=person.id,
            role=role,
            character_name=raw.get("character") if role == "cast" else raw.get("job"),
            sort_order=raw.get("order", 0),
        )

    # ── People ───────────────────────────────────────────────────

    async def _get_or_create_person(self, raw: dict) -> Person | None:
        person_id = raw.get("id")
        if not person_id or not raw.get("name"):
            return None

        person = await self.session.scalar(
            select(Person).where(Person.tmdb_id == person_id)
        )
        if person:
            return person

        person = Person(
            name=raw["name"],
            tmdb_id=person_id,
            photo_url=_tmdb_image(raw.get("profile_path")),
        )
        self.session.add(person)
        await self.session.flush()
        return person

    # ── Genres ───────────────────────────────────────────────────

    async def hydrate_genres(self, media_item: MediaItem, raw: dict) -> None:
        genre_list = raw.get("genres", [])
        for g in genre_list:
            genre = await self._get_or_create_genre(g.get("name", ""))
            if genre is None:
                continue
            link = await self.session.scalar(
                select(MediaGenre).where(
                    MediaGenre.media_item_id == media_item.id,
                    MediaGenre.genre_id == genre.id,
                )
            )
            if not link:
                self.session.add(MediaGenre(media_item_id=media_item.id, genre_id=genre.id))

    async def _get_or_create_genre(self, name: str) -> Genre | None:
        if not name:
            return None
        slug = name.lower().replace(" & ", "-").replace(" ", "-")
        genre = await self.session.scalar(select(Genre).where(Genre.slug == slug))
        if genre:
            return genre
        genre = Genre(name=name, slug=slug)
        self.session.add(genre)
        await self.session.flush()
        return genre

    # ── External IDs ─────────────────────────────────────────────

    async def hydrate_external_ids(self, media_item: MediaItem, raw: dict) -> None:
        ids = raw.get("external_ids", {})
        if not ids:
            return

        mappings = [
            ("tmdb", str(ids.get("id", ""))),
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
        """Store posters and backdrops as MediaAsset rows."""
        images = raw.get("images", {})
        if not images:
            return

        for poster in images.get("posters", [])[:5]:
            self.session.add(
                MediaAsset(
                    media_item_id=media_item.id,
                    asset_type="poster",
                    url=_tmdb_image(poster.get("file_path"), "original"),
                    width=poster.get("width"),
                    height=poster.get("height"),
                    provider="tmdb",
                )
            )

        for backdrop in images.get("backdrops", [])[:5]:
            self.session.add(
                MediaAsset(
                    media_item_id=media_item.id,
                    asset_type="backdrop",
                    url=_tmdb_image(backdrop.get("file_path"), "original"),
                    width=backdrop.get("width"),
                    height=backdrop.get("height"),
                    provider="tmdb",
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

        if collection is None:
            # Fetch full collection details
            try:
                coll_raw = await self.provider.get_collection(tmdb_id)
            except Exception:
                return

            collection = Collection(
                tmdb_id=tmdb_id,
                name=coll_raw.get("name", coll_data.get("name", "")),
                overview=coll_raw.get("overview"),
                poster_url=_tmdb_image(coll_raw.get("poster_path")),
                backdrop_url=_tmdb_image(coll_raw.get("backdrop_path")),
            )
            self.session.add(collection)
            await self.session.flush()

        movie.collection_id = collection.id


def _tmdb_image(path: str | None, size: str = "w500") -> str | None:
    if not path:
        return None
    return f"https://image.tmdb.org/t/p/{size}{path}"
