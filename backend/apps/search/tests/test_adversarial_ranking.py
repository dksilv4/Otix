"""Adversarial stress-test suite for Milestone 1: Hybrid Relevance Ranking & SQLite/PostgreSQL Fallback.

Covers:
1. Adversarial typo mutations:
   - Inverted adjacent characters ("inceptoin" -> "Inception", "itnerstellar" -> "Interstellar", "gladaitor" -> "Gladiator").
   - Missing vowels ("spidrman" -> "Spider-Man", "batmn" -> "Batman").
   - Doubled consonants ("spidder" -> "Spider-Man", "innoception" -> "Inception", "gladdiator" -> "Gladiator").
   - Punctuation stripping and spacing variation ("Spider-Man" vs "Spider Man" vs "spiderman", "WALL-E" vs "WALL E" vs "walle", "X-Men" vs "X Men" vs "xmen").
2. Exact matches strictly outranking fuzzy/partial matches regardless of popularity (e.g. pop=0.0 exact vs pop=1,000,000 prefix/substring).
3. Boundary inputs:
   - Whitespace padding (leading, trailing, multiple internal spaces).
   - Symbol resilience and SQL wildcard safety (%, _, quotes, slashes, regex metachars, script tags).
   - Unicode accents and diacritics ("Amélie", "Pokémon", "Mötley Crüe").
   - Non-Latin & CJK scripts ("千と千尋の神隠し", "기생충").
   - Giant input strings (1,000 and 5,000 characters).
4. Full integration across REST endpoints (/search, /suggestions, /grouped).
5. Database engine compatibility on both PostgreSQL (pg_trgm) and SQLite (custom Python SQL functions).
"""

from __future__ import annotations

import time
from datetime import date

from django.test import TestCase
from rest_framework.test import APIClient

from apps.media.models import Game, MediaItem, Movie, Show
from apps.search.services.search import (
    search_media_payload,
)


def _seed(
    media_type: str,
    title: str,
    slug: str,
    popularity: float = 10.0,
    avg_rating: float = 8.0,
    release_date: date | None = None,
) -> MediaItem:
    item = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=slug,
        popularity=popularity,
        avg_rating=avg_rating,
        release_date=release_date or date(2022, 1, 1),
    )
    subtype = {"movie": Movie, "show": Show, "game": Game}.get(media_type)
    if subtype:
        subtype.objects.create(media_item=item)
    return item


class AdversarialSearchRankingTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    # =========================================================================
    # 1. Adversarial Typo Mutations
    # =========================================================================
    def test_inverted_adjacent_characters(self) -> None:
        """Inverted adjacent characters must resolve to the correct titles."""
        inception = _seed("movie", "Inception", "inception", popularity=50.0)
        interstellar = _seed("movie", "Interstellar", "interstellar", popularity=50.0)
        gladiator = _seed("movie", "Gladiator", "gladiator", popularity=50.0)

        # "inceptoin" -> Inception
        res = self.client.get("/api/v1/search/", {"q": "inceptoin"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], inception.id)

        # "itnerstellar" -> Interstellar
        res = self.client.get("/api/v1/search/", {"q": "itnerstellar"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], interstellar.id)

        # "gladaitor" -> Gladiator
        res = self.client.get("/api/v1/search/", {"q": "gladaitor"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], gladiator.id)

    def test_missing_vowels(self) -> None:
        """Queries with dropped vowels must resolve to target titles."""
        spiderman = _seed("movie", "Spider-Man", "spider-man", popularity=40.0)
        batman = _seed("movie", "Batman", "batman", popularity=40.0)

        # "spidrman" -> Spider-Man
        res = self.client.get("/api/v1/search/", {"q": "spidrman"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], spiderman.id)

        # "batmn" -> Batman
        res = self.client.get("/api/v1/search/", {"q": "batmn"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], batman.id)

    def test_doubled_consonants(self) -> None:
        """Queries with unintentionally doubled consonants must resolve."""
        spiderman = _seed("movie", "Spider-Man", "spider-man", popularity=40.0)
        inception = _seed("movie", "Inception", "inception", popularity=50.0)
        gladiator = _seed("movie", "Gladiator", "gladiator", popularity=50.0)

        # "spidder" -> Spider-Man
        res = self.client.get("/api/v1/search/", {"q": "spidder"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], spiderman.id)

        # "innoception" -> Inception
        res = self.client.get("/api/v1/search/", {"q": "innoception"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], inception.id)

        # "gladdiator" -> Gladiator
        res = self.client.get("/api/v1/search/", {"q": "gladdiator"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], gladiator.id)

    def test_punctuation_stripping_and_variations(self) -> None:
        """Punctuation variations (hyphens, spaces, omitted chars) must resolve to exact targets."""
        spiderman = _seed("movie", "Spider-Man", "spider-man", popularity=40.0)
        walle = _seed("movie", "WALL-E", "wall-e", popularity=45.0)
        xmen = _seed("movie", "X-Men", "x-men", popularity=45.0)

        # "Spider Man" -> Spider-Man
        res = self.client.get("/api/v1/search/", {"q": "Spider Man"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], spiderman.id)

        # "spiderman" -> Spider-Man
        res = self.client.get("/api/v1/search/", {"q": "spiderman"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], spiderman.id)

        # "WALL E" -> WALL-E
        res = self.client.get("/api/v1/search/", {"q": "WALL E"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], walle.id)

        # "walle" -> WALL-E
        res = self.client.get("/api/v1/search/", {"q": "walle"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], walle.id)

        # "X Men" -> X-Men
        res = self.client.get("/api/v1/search/", {"q": "X Men"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], xmen.id)

        # "xmen" -> X-Men
        res = self.client.get("/api/v1/search/", {"q": "xmen"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], xmen.id)

    # =========================================================================
    # 2. Exact Match Strict Superiority Regardless of Popularity
    # =========================================================================
    def test_exact_match_strictly_outranks_fuzzy_prefix_substring_regardless_of_popularity(self) -> None:
        """An exact match with popularity 0.0 must rank above 1,000,000 popularity competitors."""
        dune_exact = _seed("movie", "Dune", "dune", popularity=0.0)
        _seed("movie", "Dune: Part Two", "dune-part-two", popularity=100000.0)
        _seed("movie", "Frank Herbert's Dune", "frank-herberts-dune", popularity=1000000.0)
        _seed("movie", "Dune Messiah", "dune-messiah", popularity=500000.0)

        res = self.client.get("/api/v1/search/", {"q": "Dune"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 4)

        # Rank 1 MUST be Dune exact
        self.assertEqual(items[0]["id"], dune_exact.id)
        self.assertEqual(items[0]["title"], "Dune")

        # Case-insensitivity check: "dune" query
        res_lower = self.client.get("/api/v1/search/", {"q": "dune"})
        self.assertEqual(res_lower.status_code, 200)
        self.assertEqual(res_lower.data["items"][0]["id"], dune_exact.id)

        # Uppercase check: "DUNE" query
        res_upper = self.client.get("/api/v1/search/", {"q": "DUNE"})
        self.assertEqual(res_upper.status_code, 200)
        self.assertEqual(res_upper.data["items"][0]["id"], dune_exact.id)

    # =========================================================================
    # 3. Boundary Inputs & Resilience
    # =========================================================================
    def test_whitespace_boundary_inputs(self) -> None:
        """Test whitespace padding and empty query boundaries."""
        dune = _seed("movie", "Dune", "dune", popularity=10.0)
        spiderman = _seed("movie", "Spider-Man", "spider-man", popularity=10.0)

        # Leading & trailing spaces
        res = self.client.get("/api/v1/search/", {"q": "   Dune    "})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], dune.id)

        # Multiple internal spaces
        res = self.client.get("/api/v1/search/", {"q": "Spider    Man"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], spiderman.id)

        # Pure whitespace query must return HTTP 400 from API view
        res_empty = self.client.get("/api/v1/search/", {"q": "    "})
        self.assertEqual(res_empty.status_code, 400)

        # Empty string query must return HTTP 400 from API view
        res_blank = self.client.get("/api/v1/search/", {"q": ""})
        self.assertEqual(res_blank.status_code, 400)

        # Direct service call returns empty items gracefully
        svc_empty = search_media_payload(q="   ", media_type=None, sort_by=None, page=1, page_size=20)
        self.assertEqual(svc_empty["items"], [])
        self.assertEqual(svc_empty["total"], 0)

    def test_symbols_and_sql_injection_resilience(self) -> None:
        """Symbols, quotes, SQL wildcards, and metachars must not crash or corrupt database."""
        _seed("movie", "Dune", "dune", popularity=10.0)

        payloads = [
            "' OR '1'='1",
            "'; DROP TABLE media_items; --",
            "Spider%Man",
            "Spider_Man",
            "Spider\\Man",
            'Spider"Man',
            "Dune (2021) [Remastered] + * ? ^ $",
            "???!!!@@@###$$$%%%^^^&&&***",
            "<script>alert('xss')</script>",
            "Dune's Return",
        ]
        for p in payloads:
            res = self.client.get("/api/v1/search/", {"q": p})
            self.assertEqual(res.status_code, 200)

        # Table count remains intact
        self.assertEqual(MediaItem.objects.count(), 1)

    def test_unicode_accents_and_diacritics(self) -> None:
        """Accented queries and unaccented equivalents must resolve to target."""
        amelie = _seed("movie", "Amélie", "amelie", popularity=60.0)
        pokemon = _seed("game", "Pokémon Emerald", "pokemon-emerald", popularity=70.0)
        motley = _seed("movie", "Mötley Crüe", "motley-crue", popularity=50.0)

        # "Amélie" exact
        res = self.client.get("/api/v1/search/", {"q": "Amélie"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], amelie.id)

        # "Amelie" without accent
        res = self.client.get("/api/v1/search/", {"q": "Amelie"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], amelie.id)

        # "Pokemon" without accent
        res = self.client.get("/api/v1/search/", {"q": "Pokemon"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], pokemon.id)

        # "Pokémon" with accent
        res = self.client.get("/api/v1/search/", {"q": "Pokémon"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], pokemon.id)

        # "Motley Crue" without umlauts
        res = self.client.get("/api/v1/search/", {"q": "Motley Crue"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], motley.id)

    def test_cjk_scripts_support(self) -> None:
        """CJK queries (Japanese, Korean) must match exact and substring records."""
        spirited = _seed("movie", "千と千尋の神隠し", "spirited-away", popularity=80.0)
        parasite = _seed("movie", "기생충", "parasite", popularity=85.0)

        # CJK Japanese exact
        res = self.client.get("/api/v1/search/", {"q": "千と千尋の神隠し"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], spirited.id)

        # CJK Japanese substring
        res = self.client.get("/api/v1/search/", {"q": "千と千尋"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], spirited.id)

        # CJK Korean exact
        res = self.client.get("/api/v1/search/", {"q": "기생충"})
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data["items"][0]["id"], parasite.id)

    def test_giant_query_strings(self) -> None:
        """Queries up to 5,000 characters must complete quickly without OOM or 500."""
        _seed("movie", "Inception", "inception", popularity=50.0)

        start = time.time()
        res_1k = self.client.get("/api/v1/search/", {"q": "a" * 1000})
        self.assertEqual(res_1k.status_code, 200)
        self.assertLess(time.time() - start, 0.5)

        start = time.time()
        res_5k = self.client.get("/api/v1/search/", {"q": "Dune " * 1000})
        self.assertEqual(res_5k.status_code, 200)
        self.assertLess(time.time() - start, 0.5)

    # =========================================================================
    # 4. Suggestions and Grouped Endpoints
    # =========================================================================
    def test_suggestions_and_grouped_typo_handling(self) -> None:
        """Suggestions and Grouped routes must resolve typos in media groups and best_results."""
        inception = _seed("movie", "Inception", "inception", popularity=50.0)
        spiderman = _seed("movie", "Spider-Man", "spider-man", popularity=40.0)

        # Suggestions
        res_sug = self.client.get("/api/v1/search/suggestions", {"q": "inceptoin"})
        self.assertEqual(res_sug.status_code, 200)
        self.assertGreaterEqual(len(res_sug.data), 1)
        self.assertEqual(res_sug.data[0]["id"], inception.id)

        # Grouped
        res_grp = self.client.get("/api/v1/search/grouped", {"q": "spidrman"})
        self.assertEqual(res_grp.status_code, 200)
        self.assertGreaterEqual(len(res_grp.data["movies"]), 1)
        self.assertEqual(res_grp.data["movies"][0]["id"], spiderman.id)
        self.assertGreaterEqual(len(res_grp.data["best_results"]), 1)
        self.assertEqual(res_grp.data["best_results"][0]["id"], spiderman.id)
