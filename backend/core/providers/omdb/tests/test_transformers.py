"""Tests for OMDb transformers."""

from __future__ import annotations

from django.test import SimpleTestCase

from core.providers.framework import NormalizedRating, load_fixture
from core.providers.omdb.transformers import (
    parse_score,
    parse_votes,
    rating_specs,
    transform_ratings,
)


class OmdbTransformersTests(SimpleTestCase):
    def test_parse_votes(self) -> None:
        self.assertEqual(parse_votes("2,304,528"), 2304528)
        self.assertEqual(parse_votes("900"), 900)
        self.assertIsNone(parse_votes(""))
        self.assertIsNone(parse_votes(None))
        self.assertIsNone(parse_votes("N/A"))

    def test_parse_score_formats(self) -> None:
        self.assertEqual(parse_score("8.8/10"), 8.8)
        self.assertEqual(parse_score("79%"), 79.0)
        self.assertEqual(parse_score("66/100"), 66.0)
        self.assertEqual(parse_score("8.8"), 8.8)
        self.assertIsNone(parse_score("N/A"))
        self.assertIsNone(parse_score(None))
        self.assertIsNone(parse_score(88))
        self.assertIsNone(parse_score("invalid"))

    def test_transform_ratings_three_sources(self) -> None:
        raw = {
            "Title": "Fight Club",
            "imdbRating": "8.8",
            "imdbVotes": "2,304,528",
            "Ratings": [
                {"Source": "Internet Movie Database", "Value": "8.8/10"},
                {"Source": "Rotten Tomatoes", "Value": "79%"},
                {"Source": "Metacritic", "Value": "66/100"},
            ],
        }
        ratings = transform_ratings(raw)
        self.assertEqual(len(ratings), 3)

        imdb = ratings[0]
        self.assertIsInstance(imdb, NormalizedRating)
        self.assertEqual(imdb.provider, "imdb")
        self.assertEqual(imdb.score, 8.8)
        self.assertEqual(imdb.max_score, 10.0)
        self.assertEqual(imdb.votes, 2304528)
        self.assertEqual(imdb.type, "audience")

        rt = ratings[1]
        self.assertEqual(rt.provider, "rotten_tomatoes")
        self.assertEqual(rt.score, 79.0)
        self.assertEqual(rt.max_score, 100.0)
        self.assertIsNone(rt.votes)
        self.assertEqual(rt.type, "critic")

        mc = ratings[2]
        self.assertEqual(mc.provider, "metacritic")
        self.assertEqual(mc.score, 66.0)
        self.assertEqual(mc.max_score, 100.0)
        self.assertIsNone(mc.votes)
        self.assertEqual(mc.type, "critic")

    def test_top_level_imdb_fallback(self) -> None:
        raw = {
            "imdbRating": "8.5",
            "imdbVotes": "500,000",
            "Ratings": [
                {"Source": "Rotten Tomatoes", "Value": "85%"},
            ],
        }
        ratings = transform_ratings(raw)
        providers = [r.provider for r in ratings]
        self.assertEqual(providers, ["rotten_tomatoes", "imdb"])
        imdb = next(r for r in ratings if r.provider == "imdb")
        self.assertEqual(imdb.score, 8.5)
        self.assertEqual(imdb.votes, 500000)

    def test_na_entries_are_skipped(self) -> None:
        raw = {
            "imdbRating": "N/A",
            "imdbVotes": "N/A",
            "Ratings": [
                {"Source": "Internet Movie Database", "Value": "N/A"},
                {"Source": "Rotten Tomatoes", "Value": "75%"},
            ],
        }
        ratings = transform_ratings(raw)
        self.assertEqual(len(ratings), 1)
        self.assertEqual(ratings[0].provider, "rotten_tomatoes")

    def test_unknown_sources_ignored(self) -> None:
        raw = {
            "imdbRating": "N/A",
            "imdbVotes": "N/A",
            "Ratings": [
                {"Source": "Some Website", "Value": "9/10"},
            ],
        }
        self.assertEqual(transform_ratings(raw), [])

    def test_rating_specs(self) -> None:
        raw = {
            "imdbRating": "8.8",
            "imdbVotes": "1,000",
            "Ratings": [
                {"Source": "Internet Movie Database", "Value": "8.8/10"},
            ],
        }
        specs = rating_specs(raw)
        self.assertEqual(len(specs), 1)
        self.assertEqual(
            specs[0],
            {
                "provider": "imdb",
                "score": 8.8,
                "max_score": 10.0,
                "vote_count": 1000,
            },
        )

    def test_transform_with_fixture(self) -> None:
        raw = load_fixture("omdb", "movie_ratings")
        ratings = transform_ratings(raw)
        self.assertEqual(len(ratings), 3)
        self.assertEqual({r.provider for r in ratings}, {"imdb", "rotten_tomatoes", "metacritic"})
