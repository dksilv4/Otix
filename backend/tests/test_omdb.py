"""Tests for OMDb provider — transformer, hydrator, and client."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from otix.domain.asset import ExternalRating
from otix.domain.media import ExternalID
from otix.providers.omdb.client import OMDbError, OMDbProvider
from otix.providers.omdb.hydrator import OMDbHydrator
from otix.providers.omdb.transformer import omdb_to_ratings


# ═══════════════════════════════════════════════════════════════════════════════
# Sample OMDb response
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def omdb_movie_raw() -> dict:
    return {
        "Title": "Fight Club",
        "Year": "1999",
        "Rated": "R",
        "Released": "15 Oct 1999",
        "Runtime": "139 min",
        "Genre": "Drama",
        "Director": "David Fincher",
        "Writer": "Chuck Palahniuk, Jim Uhls",
        "Actors": "Brad Pitt, Edward Norton, Meat Loaf",
        "Plot": "An insomniac office worker and a devil-may-care soap maker...",
        "Language": "English",
        "Country": "United States, Germany",
        "Awards": "Nominated for 1 Oscar. 11 wins & 38 nominations total",
        "Poster": "https://m.media-amazon.com/images/M/MV5BMmEzNTkxYjQtZTc0MC00YTVjLTg5MTQtMGQ0NDRmZGE0YjRiXkEyXkFqcGc@._V1_SX300.jpg",
        "Ratings": [
            {"Source": "Internet Movie Database", "Value": "8.8/10"},
            {"Source": "Rotten Tomatoes", "Value": "80%"},
            {"Source": "Metacritic", "Value": "67/100"},
        ],
        "Metascore": "67",
        "imdbRating": "8.8",
        "imdbVotes": "2,304,528",
        "imdbID": "tt0137523",
        "Type": "movie",
        "DVD": "06 Jun 2000",
        "BoxOffice": "$37,030,102",
        "Production": "N/A",
        "Website": "N/A",
        "Response": "True",
    }


@pytest.fixture
def omdb_show_raw() -> dict:
    return {
        "Title": "Game of Thrones",
        "Year": "2011–2019",
        "Rated": "TV-MA",
        "Released": "17 Apr 2011",
        "Runtime": "57 min",
        "Genre": "Action, Adventure, Drama",
        "Director": "N/A",
        "Writer": "David Benioff, D.B. Weiss",
        "Actors": "Emilia Clarke, Peter Dinklage, Kit Harington",
        "Plot": "Nine noble families fight for control over the lands of Westeros...",
        "Language": "English",
        "Country": "United States, United Kingdom",
        "Awards": "Won 59 Primetime Emmys. 389 wins & 634 nominations total",
        "Poster": "https://m.media-amazon.com/images/M/MV5BN2IzYzBiOTQtNGZmMi00NDI5LTgxMzMtN2VjOTcyMmY2ODE5XkEyXkFqcGc@._V1_SX300.jpg",
        "Ratings": [
            {"Source": "Internet Movie Database", "Value": "9.2/10"},
            {"Source": "Rotten Tomatoes", "Value": "89%"},
        ],
        "Metascore": "N/A",
        "imdbRating": "9.2",
        "imdbVotes": "2,287,549",
        "imdbID": "tt0944947",
        "Type": "series",
        "totalSeasons": "8",
        "Response": "True",
    }


# ═══════════════════════════════════════════════════════════════════════════════
# Transformer tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestOMDbTransformer:

    def test_extracts_all_three_ratings(self, omdb_movie_raw: dict):
        ratings = omdb_to_ratings(omdb_movie_raw, "oti_test00000001")

        providers = {r.provider for r in ratings}
        assert providers == {"imdb", "rotten_tomatoes", "metacritic"}

    def test_extracts_imdb_with_votes(self, omdb_movie_raw: dict):
        ratings = omdb_to_ratings(omdb_movie_raw, "oti_test00000001")

        imdb = next(r for r in ratings if r.provider == "imdb")
        assert imdb.score == 8.8
        assert imdb.max_score == 10.0
        assert imdb.vote_count == 2304528

    def test_extracts_rotten_tomatoes(self, omdb_movie_raw: dict):
        ratings = omdb_to_ratings(omdb_movie_raw, "oti_test00000001")

        rt = next(r for r in ratings if r.provider == "rotten_tomatoes")
        assert rt.score == 80.0
        assert rt.max_score == 100.0
        assert rt.vote_count is None  # RT doesn't provide vote count via OMDb

    def test_extracts_metacritic(self, omdb_movie_raw: dict):
        ratings = omdb_to_ratings(omdb_movie_raw, "oti_test00000001")

        mc = next(r for r in ratings if r.provider == "metacritic")
        assert mc.score == 67.0
        assert mc.max_score == 100.0

    def test_all_ratings_have_correct_media_item_id(self, omdb_movie_raw: dict):
        ratings = omdb_to_ratings(omdb_movie_raw, "oti_test00000001")

        for r in ratings:
            assert r.media_item_id == "oti_test00000001"

    def test_show_with_missing_metacritic(self, omdb_show_raw: dict):
        """Game of Thrones has no Metacritic in Ratings array."""
        ratings = omdb_to_ratings(omdb_show_raw, "oti_test00000002")

        providers = {r.provider for r in ratings}
        assert providers == {"imdb", "rotten_tomatoes"}

    def test_empty_ratings_list(self):
        raw = {"Response": "True", "Ratings": [], "imdbVotes": ""}
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []

    def test_missing_ratings_field(self):
        raw = {"Response": "True"}
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []

    def test_ratings_not_a_list(self):
        raw = {"Response": "True", "Ratings": "not_a_list"}
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []

    def test_unparseable_score_skipped(self):
        raw = {
            "Response": "True",
            "Ratings": [
                {"Source": "Internet Movie Database", "Value": "N/A"},
            ],
            "imdbVotes": "",
        }
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []

    def test_unknown_source_skipped(self):
        raw = {
            "Response": "True",
            "Ratings": [
                {"Source": "Some Random Site", "Value": "5/10"},
            ],
            "imdbVotes": "",
        }
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []

    def test_votes_parsing_handles_empty(self, omdb_movie_raw: dict):
        raw = {**omdb_movie_raw, "imdbVotes": "N/A"}
        ratings = omdb_to_ratings(raw, "oti_test00000001")

        imdb = next(r for r in ratings if r.provider == "imdb")
        assert imdb.vote_count is None

    def test_votes_parsing_handles_non_string(self, omdb_movie_raw: dict):
        raw = {**omdb_movie_raw, "imdbVotes": None}
        ratings = omdb_to_ratings(raw, "oti_test00000001")

        imdb = next(r for r in ratings if r.provider == "imdb")
        assert imdb.vote_count is None

    def test_imdb_fallback_from_top_level(self):
        """When Ratings array is empty, falls back to top-level imdbRating."""
        raw = {
            "Response": "True",
            "Title": "Some Movie",
            "Ratings": [],
            "imdbRating": "7.5",
            "imdbVotes": "50,000",
        }
        ratings = omdb_to_ratings(raw, "oti_test00000001")

        assert len(ratings) == 1
        assert ratings[0].provider == "imdb"
        assert ratings[0].score == 7.5
        assert ratings[0].max_score == 10.0
        assert ratings[0].vote_count == 50000

    def test_imdb_fallback_skipped_when_n_a(self):
        raw = {
            "Response": "True",
            "Title": "Unknown Movie",
            "Ratings": [],
            "imdbRating": "N/A",
            "imdbVotes": "N/A",
        }
        ratings = omdb_to_ratings(raw, "oti_test00000001")
        assert ratings == []


# ═══════════════════════════════════════════════════════════════════════════════
# Hydrator tests
# ═══════════════════════════════════════════════════════════════════════════════


@pytest.fixture
def omdb_hydrator(mock_db_session: AsyncMock) -> OMDbHydrator:
    provider = MagicMock(spec=OMDbProvider)
    provider.get_by_imdb_id = AsyncMock()
    return OMDbHydrator(provider, mock_db_session)


@pytest.fixture
def media_item(make_media_item):
    return make_media_item()


class TestOMDbHydrator:

    async def test_hydrate_ratings_inserts_new(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock,
        media_item, omdb_movie_raw: dict,
    ):
        imdb_ext_id = ExternalID(provider="imdb", external_id="tt0137523", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = imdb_ext_id
        mock_db_session.scalars.return_value = []  # no existing ratings
        omdb_hydrator.provider.get_by_imdb_id.return_value = omdb_movie_raw

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is True
        omdb_hydrator.provider.get_by_imdb_id.assert_called_once_with("tt0137523")
        assert mock_db_session.add.call_count == 3  # imdb + rt + metacritic

    async def test_hydrate_ratings_updates_changed_score(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock,
        media_item, omdb_movie_raw: dict,
    ):
        imdb_ext_id = ExternalID(provider="imdb", external_id="tt0137523", media_item_id=media_item.id)
        existing_imdb = ExternalRating(
            media_item_id=media_item.id, provider="imdb", score=8.0, max_score=10.0, vote_count=2000000,
        )
        mock_db_session.scalar.return_value = imdb_ext_id
        mock_db_session.scalars.return_value = [existing_imdb]  # only imdb exists, rt+mc are new
        omdb_hydrator.provider.get_by_imdb_id.return_value = omdb_movie_raw

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is True
        assert existing_imdb.score == 8.8
        assert existing_imdb.vote_count == 2304528
        assert mock_db_session.add.call_count == 2  # only rt + mc are new

    async def test_hydrate_ratings_skips_unchanged(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock,
        media_item, omdb_movie_raw: dict,
    ):
        imdb_ext_id = ExternalID(provider="imdb", external_id="tt0137523", media_item_id=media_item.id)
        existing_imdb = ExternalRating(
            media_item_id=media_item.id, provider="imdb", score=8.8, max_score=10.0, vote_count=2304528,
        )
        existing_rt = ExternalRating(
            media_item_id=media_item.id, provider="rotten_tomatoes", score=80.0, max_score=100.0,
        )
        existing_mc = ExternalRating(
            media_item_id=media_item.id, provider="metacritic", score=67.0, max_score=100.0,
        )
        mock_db_session.scalar.return_value = imdb_ext_id
        mock_db_session.scalars.return_value = [existing_imdb, existing_rt, existing_mc]
        omdb_hydrator.provider.get_by_imdb_id.return_value = omdb_movie_raw

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is False
        mock_db_session.add.assert_not_called()

    async def test_hydrate_ratings_no_imdb_id(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock, media_item,
    ):
        mock_db_session.scalar.return_value = None

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is False
        omdb_hydrator.provider.get_by_imdb_id.assert_not_called()

    async def test_hydrate_ratings_handles_provider_error(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock, media_item,
    ):
        imdb_ext_id = ExternalID(provider="imdb", external_id="tt0137523", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = imdb_ext_id
        omdb_hydrator.provider.get_by_imdb_id.side_effect = Exception("API error")

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is False

    async def test_hydrate_ratings_with_no_ratings_in_response(
        self, omdb_hydrator: OMDbHydrator, mock_db_session: AsyncMock, media_item,
    ):
        imdb_ext_id = ExternalID(provider="imdb", external_id="tt0000000", media_item_id=media_item.id)
        mock_db_session.scalar.return_value = imdb_ext_id
        omdb_hydrator.provider.get_by_imdb_id.return_value = {"Response": "True", "Ratings": []}

        added = await omdb_hydrator.hydrate_ratings(media_item)

        assert added is False


# ═══════════════════════════════════════════════════════════════════════════════
# Client tests
# ═══════════════════════════════════════════════════════════════════════════════


class TestOMDbClient:
    async def test_get_by_imdb_id(self, fakeredis, omdb_movie_raw: dict):
        import json
        import httpx

        class OMDbTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                url = str(request.url)
                if "apikey=" in url and "i=tt0137523" in url:
                    return httpx.Response(200, content=json.dumps(omdb_movie_raw).encode(), request=request)
                return httpx.Response(200, content=b'{"Response":"False","Error":"Movie not found!"}', request=request)

        client = httpx.AsyncClient(transport=OMDbTransport(), base_url="https://www.omdbapi.com")
        provider = OMDbProvider(fakeredis, client)

        result = await provider.get_by_imdb_id("tt0137523")
        assert result["Title"] == "Fight Club"
        assert result["imdbID"] == "tt0137523"
        assert len(result["Ratings"]) == 3

    async def test_get_by_imdb_id_not_found(self, fakeredis):
        import json
        import httpx

        class OMDbTransport(httpx.AsyncBaseTransport):
            async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
                return httpx.Response(200, content=b'{"Response":"False","Error":"Movie not found!"}', request=request)

        client = httpx.AsyncClient(transport=OMDbTransport(), base_url="https://www.omdbapi.com")
        provider = OMDbProvider(fakeredis, client)

        with pytest.raises(OMDbError, match="Movie not found!"):
            await provider.get_by_imdb_id("tt0000000")
