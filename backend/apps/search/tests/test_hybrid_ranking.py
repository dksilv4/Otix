"""Comprehensive tests for Milestone 1: Hybrid Relevance Ranking & SQLite/PostgreSQL Fallback.

Covers:
1. Exact title match ranking above partial, prefix, and typo matches.
2. Popularity tie-breaking without leapfrogging higher-tier matches.
3. Typo resolution via trigram similarity ("inceptoin" -> "Inception", "spidrman" -> "Spider-Man").
4. Punctuation and spacing normalization ("Spider-Man" vs "Spider Man" vs "spiderman").
5. Pure Python ranking and similarity fallback functions.
6. Integration with REST search endpoints (/search, /search/suggestions, /search/grouped).
7. SQLite custom similarity function registration and execution.
"""

from datetime import date
from django.core.management import call_command
from django.db import connection
from django.test import TestCase
from rest_framework.test import APIClient

from apps.media.models import Game, MediaItem, Movie, Show
from apps.search.services.search import (
    compute_relevance_score,
    ensure_sqlite_search_functions,
    py_trigram_similarity,
    py_word_trigram_similarity,
    rank_media_items_python,
    search_media_payload,
    suggestions_payload,
    grouped_payload,
)


def _create_media(
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
        release_date=release_date or date(2020, 1, 1),
    )
    subtype = {"movie": Movie, "show": Show, "game": Game}.get(media_type)
    if subtype:
        subtype.objects.create(media_item=item)
    return item


class HybridRelevanceRankingTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    def test_exact_match_ranks_above_higher_popularity_partial_matches(self) -> None:
        """Exact title match must strictly outrank prefix and substring matches even if less popular."""
        exact = _create_media("movie", "Spider-Man", "spider-man", popularity=10.0)
        prefix = _create_media(
            "movie", "Spider-Man: Homecoming", "spider-man-homecoming", popularity=95.0
        )
        substring = _create_media(
            "movie", "The Amazing Spider-Man", "the-amazing-spider-man", popularity=99.0
        )

        res = self.client.get("/api/v1/search/", {"q": "Spider-Man"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 3)

        # Exact match MUST be ranked #1
        self.assertEqual(items[0]["id"], exact.id)
        self.assertEqual(items[0]["title"], "Spider-Man")

        # Prefix match MUST rank ahead of substring match
        self.assertEqual(items[1]["id"], prefix.id)
        self.assertEqual(items[2]["id"], substring.id)

    def test_typo_resolution_inceptoin_to_inception(self) -> None:
        """Typo query 'inceptoin' must resolve to 'Inception' via trigram similarity."""
        inception = _create_media("movie", "Inception", "inception", popularity=90.0)
        interstellar = _create_media("movie", "Interstellar", "interstellar", popularity=95.0)

        res = self.client.get("/api/v1/search/", {"q": "inceptoin"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], inception.id)
        self.assertEqual(items[0]["title"], "Inception")

        # Unrelated movie should not match
        item_ids = [item["id"] for item in items]
        self.assertNotIn(interstellar.id, item_ids)

    def test_typo_resolution_spidrman_to_spider_man(self) -> None:
        """Typo query 'spidrman' must resolve to 'Spider-Man'."""
        spiderman = _create_media("movie", "Spider-Man", "spider-man", popularity=80.0)
        superman = _create_media("movie", "Superman", "superman", popularity=85.0)

        res = self.client.get("/api/v1/search/", {"q": "spidrman"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], spiderman.id)
        self.assertEqual(items[0]["title"], "Spider-Man")

    def test_punctuation_and_spacing_normalization(self) -> None:
        """Query with spacing variation ('Spider Man') must resolve to 'Spider-Man' and rank #1."""
        spiderman = _create_media("movie", "Spider-Man", "spider-man", popularity=50.0)
        spiderman_two = _create_media(
            "movie", "Spider-Man 2", "spider-man-2", popularity=90.0
        )

        # Query with space instead of hyphen
        res = self.client.get("/api/v1/search/", {"q": "Spider Man"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 1)
        self.assertEqual(items[0]["id"], spiderman.id)
        self.assertEqual(items[0]["title"], "Spider-Man")

        # Query without punctuation or spacing ('spiderman')
        res2 = self.client.get("/api/v1/search/", {"q": "spiderman"})
        self.assertEqual(res2.status_code, 200)
        items2 = res2.data["items"]
        self.assertGreaterEqual(len(items2), 1)
        self.assertEqual(items2[0]["id"], spiderman.id)

    def test_popularity_tie_breaking_for_equal_match_tier(self) -> None:
        """Popularity correctly breaks ties among items in the same match tier without leapfrogging tiers."""
        # Tier: Prefix matches with different popularities
        sw_hope = _create_media(
            "movie", "Star Wars: Episode IV", "star-wars-iv", popularity=70.0
        )
        sw_empire = _create_media(
            "movie", "Star Wars: Episode V", "star-wars-v", popularity=98.0
        )

        res = self.client.get("/api/v1/search/", {"q": "Star Wars"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 2)
        # Episode V is more popular, so it ranks first among prefix matches
        self.assertEqual(items[0]["id"], sw_empire.id)
        self.assertEqual(items[1]["id"], sw_hope.id)

        # Now verify an exact match cannot be leapfrogged by higher popularity prefix
        avatar_exact = _create_media("movie", "Avatar", "avatar", popularity=15.0)
        avatar_prefix = _create_media(
            "movie", "Avatar: The Way of Water", "avatar-way-of-water", popularity=100.0
        )
        res_avatar = self.client.get("/api/v1/search/", {"q": "Avatar"})
        self.assertEqual(res_avatar.status_code, 200)
        avatar_items = res_avatar.data["items"]
        self.assertEqual(avatar_items[0]["id"], avatar_exact.id)
        self.assertEqual(avatar_items[1]["id"], avatar_prefix.id)

    def test_grouped_search_hybrid_and_best_results(self) -> None:
        """GET /api/v1/search/grouped must return typo items in media groups and best_results."""
        movie = _create_media("movie", "Inception", "inception", popularity=95.0)
        show = _create_media("show", "Inception: The Series", "inception-series", popularity=80.0)

        res = self.client.get("/api/v1/search/grouped", {"q": "inceptoin"})
        self.assertEqual(res.status_code, 200)
        self.assertGreaterEqual(res.data["movies_count"], 1)
        self.assertEqual(res.data["movies"][0]["id"], movie.id)
        self.assertGreaterEqual(len(res.data["best_results"]), 1)
        self.assertEqual(res.data["best_results"][0]["id"], movie.id)

    def test_suggestions_payload_typo_resolution(self) -> None:
        """GET /api/v1/search/suggestions must include typo matches."""
        item = _create_media("movie", "Spider-Man", "spider-man", popularity=85.0)

        res = self.client.get("/api/v1/search/suggestions", {"q": "spidrman"})
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.data, list)
        self.assertGreaterEqual(len(res.data), 1)
        self.assertEqual(res.data[0]["id"], item.id)

    def test_pure_python_similarity_and_scoring(self) -> None:
        """Test pure-Python similarity and ranking helpers."""
        # 1. Trigram similarity
        sim_exact = py_trigram_similarity("Inception", "Inception")
        self.assertEqual(sim_exact, 1.0)

        sim_typo = py_trigram_similarity("inceptoin", "Inception")
        self.assertGreaterEqual(sim_typo, 0.40)

        sim_punct = py_trigram_similarity("Spider Man", "Spider-Man")
        self.assertEqual(sim_punct, 1.0)

        sim_unrelated = py_trigram_similarity("Inception", "Batman")
        self.assertLess(sim_unrelated, 0.20)

        # 2. Word similarity
        wsim = py_word_trigram_similarity("Spider Man", "Spider-Man: Across the Spider-Verse")
        self.assertGreaterEqual(wsim, 0.90)

        # 3. Hybrid score hierarchy
        score_exact = compute_relevance_score("Spider-Man", "Spider-Man", popularity=50.0)
        score_slug = compute_relevance_score("Spider-Man", "Spider Man", popularity=50.0, slug="spider-man")
        score_prefix = compute_relevance_score("Spider-Man: Homecoming", "Spider-Man", popularity=90.0)
        score_substring = compute_relevance_score("The Amazing Spider-Man", "Spider-Man", popularity=99.0)
        score_typo = compute_relevance_score("Inception", "inceptoin", popularity=80.0)

        # Verify strict hierarchy
        self.assertGreater(score_exact, score_slug)
        self.assertGreater(score_slug, score_prefix)
        self.assertGreater(score_prefix, score_substring)
        self.assertGreater(score_substring, score_typo)
        self.assertGreater(score_typo, 15.0)

        # 4. Python ranking helper
        item_exact = MediaItem(id=1, title="Spider-Man", slug="spider-man", popularity=10.0)
        item_prefix = MediaItem(id=2, title="Spider-Man: Homecoming", slug="spider-man-homecoming", popularity=90.0)
        item_sub = MediaItem(id=3, title="The Amazing Spider-Man", slug="the-amazing-spider-man", popularity=99.0)
        ranked = rank_media_items_python([item_sub, item_prefix, item_exact], "Spider-Man")
        self.assertEqual(ranked[0].id, item_exact.id)
        self.assertEqual(ranked[1].id, item_prefix.id)
        self.assertEqual(ranked[2].id, item_sub.id)

    def test_sqlite_similarity_sql_function(self) -> None:
        """Ensure SQLite custom SQL function 'similarity' is registered and callable."""
        if connection.vendor == "sqlite":
            ensure_sqlite_search_functions(connection)
            with connection.cursor() as cursor:
                cursor.execute("SELECT similarity('inceptoin', 'Inception')")
                row = cursor.fetchone()
                self.assertIsNotNone(row)
                self.assertGreaterEqual(row[0], 0.40)

                cursor.execute("SELECT word_similarity('Spider Man', 'Spider-Man')")
                row_w = cursor.fetchone()
                self.assertIsNotNone(row_w)
                self.assertGreaterEqual(row_w[0], 0.90)

                cursor.execute("SELECT ln(10.0)")
                row_ln = cursor.fetchone()
                self.assertIsNotNone(row_ln)
                self.assertAlmostEqual(row_ln[0], 2.302585, places=4)

    def test_sqlite_ln_null_safety(self) -> None:
        """Verify SQLite ln function handles NULL, 0, and negative numbers without OperationalError."""
        if connection.vendor == "sqlite":
            ensure_sqlite_search_functions(connection)
            with connection.cursor() as cursor:
                cursor.execute("SELECT ln(NULL)")
                row_null = cursor.fetchone()
                self.assertIsNotNone(row_null)
                self.assertEqual(row_null[0], 0.0)

                cursor.execute("SELECT ln(0.0)")
                row_zero = cursor.fetchone()
                self.assertIsNotNone(row_zero)
                self.assertEqual(row_zero[0], 0.0)

                cursor.execute("SELECT ln(-10.0)")
                row_neg = cursor.fetchone()
                self.assertIsNotNone(row_neg)
                self.assertEqual(row_neg[0], 0.0)

    def test_explicit_sort_relevance_floor(self) -> None:
        """Verify sort_by='popularity' filters out low-similarity fuzzy noise from high popularity."""
        batman = _create_media("movie", "Batman", "batman", popularity=30.0)
        batman_begins = _create_media("movie", "Batman Begins", "batman-begins", popularity=80.0)
        # Seed high-popularity noise titles that share substrings like 'Man' or weak trigrams
        breaking_bad = _create_media("show", "Breaking Bad", "breaking-bad", popularity=1000.0)
        running_man = _create_media("movie", "Running Man", "running-man", popularity=500.0)

        res = self.client.get("/api/v1/search/", {"q": "Batman", "sort_by": "popularity"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        item_ids = [it["id"] for it in items]

        # Top item should be Batman Begins (popularity 80), followed by Batman (popularity 30)
        self.assertIn(batman_begins.id, item_ids)
        self.assertIn(batman.id, item_ids)
        self.assertEqual(item_ids[0], batman_begins.id)
        self.assertEqual(item_ids[1], batman.id)

        # Breaking Bad and Running Man must be completely filtered out
        self.assertNotIn(breaking_bad.id, item_ids)
        self.assertNotIn(running_man.id, item_ids)

    def test_short_query_trigram_skip(self) -> None:
        """Queries shorter than 3 characters do not trigger fuzzy trigram candidate matching."""
        batman = _create_media("movie", "Batman", "batman", popularity=30.0)
        superman = _create_media("movie", "Superman", "superman", popularity=30.0)

        # 2-character query 'ba' matches 'Batman' (prefix/substring) but NOT 'Superman'
        res = self.client.get("/api/v1/search/", {"q": "ba"})
        self.assertEqual(res.status_code, 200)
        ids = [it["id"] for it in res.data["items"]]
        self.assertIn(batman.id, ids)
        self.assertNotIn(superman.id, ids)

    def test_migration_schema_state_parity(self) -> None:
        """Verify that makemigrations detects zero model state drift or uncommitted changes."""
        call_command("makemigrations", check=True, dry_run=True, verbosity=0)
