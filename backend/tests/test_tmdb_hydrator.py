"""Tests for TMDB hydrator — relation hydration with mocked DB session."""

from __future__ import annotations

from datetime import date
from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.asset import ExternalRating, MediaAsset, MediaRelease, MediaVideo
from otix.domain.collection import Collection
from otix.domain.genre import Genre, MediaGenre
from otix.domain.media import MediaItem
from otix.domain.people import MediaCredit, Person
from otix.providers.tmdb.hydrator import TMDBHydrator


def _added_objects(mock_db_session: AsyncMock):
    """Collect all objects passed to session.add or session.add_all."""
    objs = []
    for c in mock_db_session.add.call_args_list:
        objs.append(c.args[0])
    for c in mock_db_session.add_all.call_args_list:
        objs.extend(c.args[0])
    return objs


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
        # Batch scalars returns empty iterable (no existing genres)
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_genres(media_item, raw)

        added = _added_objects(mock_db_session)
        genres = [o for o in added if isinstance(o, Genre)]
        links = [o for o in added if isinstance(o, MediaGenre)]

        assert len(genres) == 1
        assert genres[0].name == "Action"
        assert genres[0].slug == "action"
        assert len(links) == 1
        assert links[0].media_item_id == media_item.id
        assert links[0].genre_id == genres[0].id

    async def test_reuses_existing_genre(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        existing_genre = Genre(name="Action", slug="action")
        existing_genre.id = "oti_genre000001"

        mock_db_session.scalars.return_value = [existing_genre]

        raw = {"genres": [{"id": 18, "name": "Action"}]}
        await hydrator.hydrate_genres(media_item, raw)

        added = _added_objects(mock_db_session)
        genres = [o for o in added if isinstance(o, Genre)]
        assert len(genres) == 0  # No new genre created

        links = [o for o in added if isinstance(o, MediaGenre)]
        assert len(links) == 1

    async def test_splits_composite_genres(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"genres": [{"id": 10765, "name": "Sci-Fi & Fantasy"}]}
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_genres(media_item, raw)

        added = _added_objects(mock_db_session)
        genres = [o for o in added if isinstance(o, Genre)]
        links = [o for o in added if isinstance(o, MediaGenre)]

        assert {g.name for g in genres} == {"Sci-Fi", "Fantasy"}
        assert {g.slug for g in genres} == {"sci-fi", "fantasy"}
        assert len(links) == 2

    async def test_clears_existing_links(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        mock_db_session.scalars.return_value = []

        raw = {"genres": [{"id": 18, "name": "Action"}]}
        await hydrator.hydrate_genres(media_item, raw)

        # DELETE should have been executed for old links
        mock_db_session.execute.assert_called_once()

    async def test_empty_genres(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        raw = {"genres": []}
        await hydrator.hydrate_genres(media_item, raw)
        mock_db_session.scalars.assert_not_called()

    async def test_no_genres_key(self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock):
        raw = {}
        await hydrator.hydrate_genres(media_item, raw)
        mock_db_session.scalars.assert_not_called()


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
        # Batch person lookup returns empty (no existing persons)
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_credits(media_item, raw)

        added = _added_objects(mock_db_session)
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
        mock_db_session.scalars.return_value = []

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

        mock_db_session.scalars.return_value = [existing_person]

        raw = {"credits": {"cast": [{"id": 287, "name": "Brad Pitt", "character": "Tyler", "order": 1}], "crew": []}}
        await hydrator.hydrate_credits(media_item, raw)

        added = _added_objects(mock_db_session)
        people_added = [o for o in added if isinstance(o, Person)]
        assert len(people_added) == 0


# ── hydrate_external_ids ─────────────────────────────────────────────


class TestHydrateExternalIds:
    async def test_stores_non_tmdb_providers(
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

        assert mock_db_session.execute.call_count == 2
        inserted_providers = set()
        for call_args in mock_db_session.execute.call_args_list:
            stmt = call_args.args[0]
            inserted_providers.add(stmt.compile().params.get("provider"))
        assert inserted_providers == {"imdb", "tvdb"}

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
        assert len(added) == 0  # tmdb is skipped, imdb/tvdb are None


# ── hydrate_images ──────────────────────────────────────────────────


class TestHydrateImages:
    async def test_stores_posters_and_backdrops(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "images": {
                "posters": [
                    {"file_path": "/p1.jpg", "width": 2000, "height": 3000, "iso_639_1": "en"},
                    {"file_path": "/p2.jpg", "width": 1500, "height": 2250, "iso_639_1": "en"},
                ],
                "backdrops": [
                    {"file_path": "/bd1.jpg", "width": 3840, "height": 2160},
                ],
            }
        }
        # Batch URL check returns empty (no existing URLs)
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_images(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        assets = [o for o in added if isinstance(o, MediaAsset)]
        posters = [a for a in assets if a.asset_type == "poster"]
        backdrops = [a for a in assets if a.asset_type == "backdrop"]

        assert len(posters) == 2
        assert len(backdrops) == 1
        assert all(a.provider == "tmdb" for a in assets)
        assert posters[0].url == "https://image.tmdb.org/t/p/original/p1.jpg"

    async def test_limits_posters_to_10(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "images": {
                "posters": [{"file_path": f"/p{i}.jpg", "iso_639_1": "en"} for i in range(12)],
                "backdrops": [],
            }
        }
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_images(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        posters = [o for o in added if isinstance(o, MediaAsset)]
        assert len(posters) == 10

    async def test_skips_existing_urls(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "images": {
                "posters": [{"file_path": "/p1.jpg"}],
                "backdrops": [],
            }
        }
        # URL already exists
        mock_db_session.scalars.return_value = [
            "https://image.tmdb.org/t/p/original/p1.jpg"
        ]

        await hydrator.hydrate_images(media_item, raw)

        mock_db_session.add.assert_not_called()

    async def test_skips_missing_images(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_images(media_item, raw)
        mock_db_session.add.assert_not_called()


# ── hydrate_videos ──────────────────────────────────────────────────


class TestHydrateVideos:
    async def test_stores_videos(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "videos": {
                "results": [
                    {"id": "abc123", "key": "dQw4w9WgXcQ", "name": "Trailer", "site": "YouTube", "type": "Trailer"},
                ]
            }
        }

        await hydrator.hydrate_videos(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        videos = [o for o in added if isinstance(o, MediaVideo)]
        assert len(videos) == 1
        assert videos[0].url == "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
        assert videos[0].video_type == "Trailer"
        assert videos[0].provider == "tmdb"
        assert videos[0].provider_id == "abc123"

    async def test_limits_to_10(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "videos": {
                "results": [{"id": str(i), "key": f"key{i}", "type": "Featurette"} for i in range(15)]
            }
        }

        await hydrator.hydrate_videos(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        videos = [o for o in added if isinstance(o, MediaVideo)]
        assert len(videos) == 10

    async def test_skips_missing_key(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"videos": {"results": [{"id": "1", "type": "Trailer"}]}}

        await hydrator.hydrate_videos(media_item, raw)

        mock_db_session.add.assert_not_called()

    async def test_skips_empty_videos(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"videos": {"results": []}}
        await hydrator.hydrate_videos(media_item, raw)
        mock_db_session.add.assert_not_called()

    async def test_skips_missing_videos_key(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_videos(media_item, raw)
        mock_db_session.add.assert_not_called()


# ── hydrate_releases ────────────────────────────────────────────────


class TestHydrateReleases:
    async def test_stores_releases(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "release_dates": {
                "results": [
                    {
                        "iso_3166_1": "US",
                        "release_dates": [
                            {"certification": "R", "release_date": "1999-10-15T00:00:00.000Z", "type": 3},
                        ],
                    },
                    {
                        "iso_3166_1": "GB",
                        "release_dates": [
                            {"certification": "18", "release_date": "1999-11-12T00:00:00.000Z", "type": 3},
                        ],
                    },
                ]
            }
        }

        await hydrator.hydrate_releases(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        releases = [o for o in added if isinstance(o, MediaRelease)]
        assert len(releases) == 2
        assert {r.country_code for r in releases} == {"us", "gb"}
        assert {r.certification for r in releases} == {"R", "18"}
        assert releases[0].release_date == date(1999, 10, 15)

    async def test_prefers_theatrical_type(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {
            "release_dates": {
                "results": [
                    {
                        "iso_3166_1": "US",
                        "release_dates": [
                            {"certification": "", "release_date": "1999-10-14T00:00:00.000Z", "type": 1},
                            {"certification": "R", "release_date": "1999-10-15T00:00:00.000Z", "type": 3},
                        ],
                    },
                ]
            }
        }

        await hydrator.hydrate_releases(media_item, raw)

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        releases = [o for o in added if isinstance(o, MediaRelease)]
        assert len(releases) == 1
        assert releases[0].certification == "R"
        assert releases[0].release_date == date(1999, 10, 15)

    async def test_skips_empty_releases(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {"release_dates": {"results": []}}
        await hydrator.hydrate_releases(media_item, raw)
        mock_db_session.add.assert_not_called()

    async def test_skips_missing_release_dates_key(
        self, hydrator: TMDBHydrator, media_item: MediaItem, mock_db_session: AsyncMock
    ):
        raw = {}
        await hydrator.hydrate_releases(media_item, raw)
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

        added = [c.args[0] for c in mock_db_session.add.call_args_list]
        collections = [o for o in added if isinstance(o, Collection)]
        assert len(collections) == 1
        assert collections[0].tmdb_id == 123
        assert collections[0].name == "Fight Club Collection"
        assert movie.collection_id == collections[0].id

    async def test_reuses_existing_collection_when_hash_matches(
        self,
        hydrator: TMDBHydrator,
        mock_db_session: AsyncMock,
        sample_movie_raw_with_collection: dict,
    ):
        import hashlib
        import json

        from otix.providers.tmdb.transformer import to_movie

        movie = to_movie(sample_movie_raw_with_collection)
        movie.media_item.id = "oti_test00000001"

        coll_raw = {
            "id": 123,
            "name": "Fight Club Collection",
            "overview": "A collection",
            "poster_path": "/coll.jpg",
            "backdrop_path": "/coll_bd.jpg",
        }
        coll_hash = hashlib.sha256(
            json.dumps(coll_raw, sort_keys=True, default=str).encode()
        ).hexdigest()

        existing = Collection(
            tmdb_id=123, name="Fight Club Collection", content_hash=coll_hash
        )
        existing.id = "oti_coll000001"
        mock_db_session.scalar.return_value = MagicMock(entity_id="oti_coll000001")
        mock_db_session.get.return_value = existing
        hydrator.provider.get_collection = AsyncMock(return_value=coll_raw)

        await hydrator.hydrate_collection(movie, sample_movie_raw_with_collection)

        assert movie.collection_id == "oti_coll000001"
        hydrator.provider.get_collection.assert_called_once_with(123)
        # No new collection should be added since hash matched
        added = _added_objects(mock_db_session)
        collections = [o for o in added if isinstance(o, Collection)]
        assert len(collections) == 0

    async def test_no_collection_when_none(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock, sample_movie_raw: dict
    ):
        from otix.providers.tmdb.transformer import to_movie

        movie = to_movie(sample_movie_raw)
        movie.media_item.id = "oti_test00000001"

        await hydrator.hydrate_collection(movie, sample_movie_raw)

        mock_db_session.scalar.assert_not_called()
        assert movie.collection_id is None


class TestHydratePersonImages:
    async def test_stores_profile_images(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock, sample_person_raw: dict
    ):
        from otix.domain.people import Person, PersonAsset

        person = Person(name="Brad Pitt", tmdb_id=287)
        person.id = "oti_test00000001"
        mock_db_session.scalars.return_value = []

        await hydrator.hydrate_person_images(person, sample_person_raw)

        added = _added_objects(mock_db_session)
        assets = [o for o in added if isinstance(o, PersonAsset)]
        assert len(assets) == 2
        assert assets[0].url == "https://image.tmdb.org/t/p/original/brad1.jpg"
        assert assets[0].person_id == "oti_test00000001"
        assert assets[0].provider == "tmdb"

    async def test_skips_existing_urls(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock, sample_person_raw: dict
    ):
        from otix.domain.people import Person, PersonAsset

        person = Person(name="Brad Pitt", tmdb_id=287)
        person.id = "oti_test00000001"
        mock_db_session.scalars.return_value = [
            "https://image.tmdb.org/t/p/original/brad1.jpg"
        ]

        await hydrator.hydrate_person_images(person, sample_person_raw)

        added = _added_objects(mock_db_session)
        assets = [o for o in added if isinstance(o, PersonAsset)]
        assert len(assets) == 1
        assert assets[0].url == "https://image.tmdb.org/t/p/original/brad2.jpg"

    async def test_handles_empty_images(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        from otix.domain.people import Person

        person = Person(name="Test", tmdb_id=1)
        person.id = "oti_test00000001"

        await hydrator.hydrate_person_images(person, {"images": {"profiles": []}})

        added = _added_objects(mock_db_session)
        assert len(added) == 0

    async def test_handles_missing_images_key(
        self, hydrator: TMDBHydrator, mock_db_session: AsyncMock
    ):
        from otix.domain.people import Person

        person = Person(name="Test", tmdb_id=1)
        person.id = "oti_test00000001"

        await hydrator.hydrate_person_images(person, {})

        added = _added_objects(mock_db_session)
        assert len(added) == 0
