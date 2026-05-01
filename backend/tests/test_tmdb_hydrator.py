"""Tests for TMDB hydrator — relation hydration with mocked DB session."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, call

import pytest

from otix.domain.asset import ExternalRating, MediaAsset
from otix.domain.collection import Collection
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import ExternalID, MediaItem, Movie
from otix.domain.people import MediaCredit, Person
from otix.providers.tmdb.hydrator import TMDBHydrator


@pytest.fixture
def hydrator(mock_db_session: AsyncMock) -> TMDBHydrator:
    provider = MagicMock()
    return TMDBHydrator(provider, mock_db_session)


@pytest.fixture
def media_item(make_media_item) -> MediaItem:
    return make_media_item()


@pytest.fixture
def media_item_id(media_item: MediaItem) -> str:
    return media_item.id


# ── hydrate_genres ──────────────────────────────────────────────────


class TestHydrateGenres:
    async def test_creates_new_genre(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        raw = {"genres": [{"id": 18, "name": "Action"}]}
        mock_db_session.scalar.return_value = None  # genre not found, link not found

        await hydrator.hydrate_genres(media_item, raw)

        # Should add a Genre and a MediaGenre
        added_objects = [c.args[0] for c in mock_db_session.add.call_args_list]
        genres = [o for o in added_objects if isinstance(o, Genre)]
        links = [o for o in added_objects if isinstance(o, MediaGenre)]

        assert len(genres) == 1
        assert genres[0].name == "Action"
        assert genres[0].slug == "action"
        assert len(links) == 1
        assert links[0].media_item_id == media_item.id
        assert links[0].genre_id == genres[0].id  # set after flush

    async def test_reuses_existing_genre(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        existing_genre = Genre(name="Action", slug="action")
        existing_genre.id = "oti_genre000001"
        existing_link = MediaGenre(media_item_id=media_item.id, genre_id=existing_genre.id)

        # First call finds genre, second call finds existing link
        mock_db_session.scalar.side_effect = [existing_genre, existing_link]

        raw = {"genres": [{"id": 18, "name": "Action"}]}
        await hydrator.hydrate_genres(media_item, raw)

        # Should NOT add any new objects
        added = [c.args[0] for c in mock_db_session.add.call_args_list if not isinstance(c.args[0], Genre)]
        assert len(added) == 0

    async def test_empty_genres(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        raw = {"genres": []}
        await hydrator.hydrate_genres(media_item, raw)
        mock_db_session.scalar.assert_not_called()

    async def test_no_genres_key(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        raw = {}
        await hydrator.hydrate_genres(media_item, raw)
        mock_db_session.scalar.assert_not_called()


# ── hydrate_credits ─────────────────────────────────────────────────


class TestHydrateCredits:
    async def test_creates_cast_and_crew(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "credits": {
                "cast": [
                    {"id": 819, "name": "Edward Norton", "character": "The Narrator", "order": 0},
                ],
                "crew": [
                    {"id": 7467, "name": "David Fincher", "job": "Director", "order": 0},
                ],
            }
        }
        # scalar calls: cast person, cast credit, crew person, crew credit
        mock_db_session.scalar.side_effect = [
            None,  # cast person not found
            None,  # cast credit not found
            None,  # crew person not found
            None,  # crew credit not found
        ]

        await hydrator.hydrate_credits(media_item, raw)

        # Should have added 2 people and 2 credits
        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        people = [o for o in added if isinstance(o, Person)]
        credits = [o for o in added if isinstance(o, MediaCredit)]

        assert len(people) == 2
        assert {p.name for p in people} == {"Edward Norton", "David Fincher"}
        assert len(credits) == 2
        assert {c.role for c in credits} == {"cast", "crew"}

    async def test_clears_existing_credits(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"credits": {"cast": [], "crew": []}}
        # No people to process, but delete should have been called
        mock_db_session.scalar.return_value = None

        await hydrator.hydrate_credits(media_item, raw)

        # DELETE should have been executed
        mock_db_session.execute.assert_called_once()

    async def test_skips_missing_credits_key(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_credits(media_item, raw)
        mock_db_session.execute.assert_not_called()

    async def test_reuses_existing_person(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        existing_person = Person(name="Brad Pitt", tmdb_id=287)
        existing_person.id = "oti_pers000001"

        # scalar is called for: person lookup, then credit lookup
        mock_db_session.scalar.side_effect = [
            existing_person,  # person lookup → found
            None,  # credit not found → create new
        ]

        raw = {"credits": {"cast": [{"id": 287, "name": "Brad Pitt", "character": "Tyler", "order": 1}], "crew": []}}
        await hydrator.hydrate_credits(media_item, raw)

        # Should NOT have added a new Person
        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        people_added = [o for o in added if isinstance(o, Person)]
        assert len(people_added) == 0


# ── hydrate_external_ids ─────────────────────────────────────────────


class TestHydrateExternalIds:
    async def test_stores_all_providers(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "external_ids": {
                "id": 550,
                "imdb_id": "tt0137523",
                "tvdb_id": 12345,
            }
        }
        mock_db_session.scalar.return_value = None  # no existing records

        await hydrator.hydrate_external_ids(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        assert len(added) == 3

        providers = {e.provider for e in added if isinstance(e, ExternalID)}
        assert providers == {"tmdb", "imdb", "tvdb"}

    async def test_skips_missing_external_ids(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_external_ids(media_item, raw)
        mock_db_session.scalar.assert_not_called()

    async def test_skips_none_values(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"external_ids": {"id": 550, "imdb_id": None, "tvdb_id": None}}
        mock_db_session.scalar.return_value = None

        await hydrator.hydrate_external_ids(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        assert len(added) == 1  # only tmdb
        assert added[0].provider == "tmdb"


# ── hydrate_images ──────────────────────────────────────────────────


class TestHydrateImages:
    async def test_stores_posters_and_backdrops(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "images": {
                "posters": [
                    {"file_path": "/p1.jpg", "width": 2000, "height": 3000},
                    {"file_path": "/p2.jpg", "width": 1500, "height": 2250},
                ],
                "backdrops": [
                    {"file_path": "/bd1.jpg", "width": 3840, "height": 2160},
                ],
            }
        }

        await hydrator.hydrate_images(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        assets = [o for o in added if isinstance(o, MediaAsset)]
        posters = [a for a in assets if a.asset_type == "poster"]
        backdrops = [a for a in assets if a.asset_type == "backdrop"]

        assert len(posters) == 2
        assert len(backdrops) == 1
        assert all(a.provider == "tmdb" for a in assets)
        assert posters[0].url == "https://image.tmdb.org/t/p/original/p1.jpg"

    async def test_limits_posters_to_5(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "images": {
                "posters": [{"file_path": f"/p{i}.jpg"} for i in range(10)],
                "backdrops": [],
            }
        }

        await hydrator.hydrate_images(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        posters = [o for o in added if isinstance(o, MediaAsset)]
        assert len(posters) == 5

    async def test_skips_missing_images(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_images(media_item, raw)
        mock_db_session.add.assert_not_called()


# ── hydrate_ratings ─────────────────────────────────────────────────


class TestHydrateRatings:
    async def test_creates_new_rating(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"vote_average": 8.4, "vote_count": 27000}
        mock_db_session.scalar.return_value = None  # no existing rating

        await hydrator.hydrate_ratings(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        ratings = [o for o in added if isinstance(o, ExternalRating)]
        assert len(ratings) == 1
        assert ratings[0].score == 8.4
        assert ratings[0].max_score == 10.0
        assert ratings[0].vote_count == 27000
        assert ratings[0].provider == "tmdb"

    async def test_updates_existing_rating(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"vote_average": 9.0, "vote_count": 30000}
        existing = ExternalRating(media_item_id=media_item.id, provider="tmdb", score=8.0, max_score=10.0, vote_count=10000)
        mock_db_session.scalar.return_value = existing

        await hydrator.hydrate_ratings(media_item, raw)

        assert existing.score == 9.0
        assert existing.vote_count == 30000
        mock_db_session.add.assert_not_called()

    async def test_skips_zero_average(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"vote_average": 0, "vote_count": 0}
        await hydrator.hydrate_ratings(media_item, raw)
        mock_db_session.scalar.assert_not_called()

    async def test_skips_missing_vote_average(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_ratings(media_item, raw)
        mock_db_session.scalar.assert_not_called()


# ── hydrate_collection ──────────────────────────────────────────────


class TestHydrateCollection:
    async def test_creates_and_links_collection(
        self,
        hydrator: TMDBHydrator,
        mock_db_session: AsyncMock,
        sample_movie_raw_with_collection: dict,
    ):
        from otix.providers.tmdb.transformer import to_movie

        movie = to_movie(sample_movie_raw_with_collection)
        movie.media_item.id = "oti_test00000001"

        # No existing collection
        mock_db_session.scalar.return_value = None
        hydrator.provider.get_collection = AsyncMock(return_value={
            "id": 123,
            "name": "Fight Club Collection",
            "overview": "A collection",
            "poster_path": "/coll.jpg",
            "backdrop_path": "/coll_bd.jpg",
        })

        await hydrator.hydrate_collection(movie, sample_movie_raw_with_collection)

        # Should have added a Collection
        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        collections = [o for o in added if isinstance(o, Collection)]
        assert len(collections) == 1
        assert collections[0].tmdb_id == 123
        assert collections[0].name == "Fight Club Collection"
        assert movie.collection_id == collections[0].id

    async def test_reuses_existing_collection(
        self,
        hydrator: TMDBHydrator,
        mock_db_session: AsyncMock,
        sample_movie_raw_with_collection: dict,
    ):
        from otix.providers.tmdb.transformer import to_movie

        movie = to_movie(sample_movie_raw_with_collection)
        movie.media_item.id = "oti_test00000001"

        existing = Collection(tmdb_id=123, name="Fight Club Collection")
        existing.id = "oti_coll000001"
        mock_db_session.scalar.return_value = existing

        await hydrator.hydrate_collection(movie, sample_movie_raw_with_collection)

        assert movie.collection_id == "oti_coll000001"
        hydrator.provider.get_collection.assert_not_called()

    async def test_no_collection_when_none(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock, sample_movie_raw: dict
    ):
        from otix.providers.tmdb.transformer import to_movie

        movie = to_movie(sample_movie_raw)
        movie.media_item.id = "oti_test00000001"

        await hydrator.hydrate_collection(movie, sample_movie_raw)

        mock_db_session.scalar.assert_not_called()
        assert movie.collection_id is None
