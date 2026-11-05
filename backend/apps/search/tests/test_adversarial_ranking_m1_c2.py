"""Adversarial stress-test suite 2 for Milestone 1:
Query Length Boundaries (1-char, 2-char, 3-char trigram thresholding),
Exact Match Absolute Supremacy, Typo Robustness, SQLite Math Safety, and
Explicit Sort Relevance Floor.
"""

from __future__ import annotations

import math
from datetime import date
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
)


def _create_item(
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


class AdversarialRankingEngineStressTests(TestCase):
    def setUp(self) -> None:
        self.client = APIClient()

    # =========================================================================
    # 1. Query Length Boundaries (1-char vs 2-char vs >=3-char trigrams)
    # =========================================================================

    def test_1char_query_no_trigram_fuzzy_leak(self) -> None:
        """1-char query matches only exact/prefix/substring, never fuzzy trigram candidates."""
        zorro = _create_item("movie", "Zorro", "zorro", popularity=10.0)
        dragon_z = _create_item("show", "Dragon Ball Z", "dragon-ball-z", popularity=50.0)
        superman = _create_item("movie", "Superman", "superman", popularity=100000.0)
        batman = _create_item("movie", "Batman", "batman", popularity=50000.0)

        res = self.client.get("/api/v1/search/", {"q": "z"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        ids = [it["id"] for it in items]

        # Only items with literal 'z' / 'Z' must match
        self.assertIn(zorro.id, ids)
        self.assertIn(dragon_z.id, ids)
        self.assertNotIn(superman.id, ids)
        self.assertNotIn(batman.id, ids)

        # Prefix 'Zorro' must rank ahead of substring 'Dragon Ball Z'
        self.assertEqual(items[0]["id"], zorro.id)

        # 1-char query with no substring match returns 0 items
        res_q = self.client.get("/api/v1/search/", {"q": "q"})
        self.assertEqual(res_q.status_code, 200)
        self.assertEqual(len(res_q.data["items"]), 0)

    def test_2char_query_no_trigram_fuzzy_leak(self) -> None:
        """2-char queries must strictly match prefix/substring; fuzzy typos must NOT leak."""
        batman = _create_item("movie", "Batman", "batman", popularity=20.0)
        superman = _create_item("movie", "Superman", "superman", popularity=100000.0)
        spider = _create_item("movie", "Spider-Man", "spider-man", popularity=50000.0)

        # 'ba' matches 'Batman' (prefix)
        res_ba = self.client.get("/api/v1/search/", {"q": "ba"})
        self.assertEqual(res_ba.status_code, 200)
        ids_ba = [it["id"] for it in res_ba.data["items"]]
        self.assertIn(batman.id, ids_ba)
        self.assertNotIn(superman.id, ids_ba)
        self.assertNotIn(spider.id, ids_ba)

        # 'bt' is a 2-char typo of 'Batman'. Because len('bt') == 2 < 3,
        # trigram matching is inactive and 'bt' is NOT a substring of 'Batman'.
        # Result MUST be 0 items.
        res_bt = self.client.get("/api/v1/search/", {"q": "bt"})
        self.assertEqual(res_bt.status_code, 200)
        ids_bt = [it["id"] for it in res_bt.data["items"]]
        self.assertNotIn(batman.id, ids_bt)
        self.assertEqual(len(ids_bt), 0)

    def test_3char_query_trigram_activated(self) -> None:
        """Queries with len >= 3 activate trigram similarity matching for typos."""
        batman = _create_item("movie", "Batman", "batman", popularity=20.0)
        dune = _create_item("movie", "Dune", "dune", popularity=20.0)

        # 'batmn' (len 5 >= 3) has trigram similarity 0.444 >= 0.30 -> Matches Batman!
        res_batmn = self.client.get("/api/v1/search/", {"q": "batmn"})
        self.assertEqual(res_batmn.status_code, 200)
        ids_batmn = [it["id"] for it in res_batmn.data["items"]]
        self.assertIn(batman.id, ids_batmn)

        # 'dne' (len 3 >= 3) has word_trigram similarity 0.50 >= 0.45 -> Matches Dune!
        res_dne = self.client.get("/api/v1/search/", {"q": "dne"})
        self.assertEqual(res_dne.status_code, 200)
        ids_dne = [it["id"] for it in res_dne.data["items"]]
        self.assertIn(dune.id, ids_dne)

        # Random 3-char nonsense 'xqz' returns 0 results cleanly
        res_xqz = self.client.get("/api/v1/search/", {"q": "xqz"})
        self.assertEqual(res_xqz.status_code, 200)
        self.assertEqual(len(res_xqz.data["items"]), 0)

    # =========================================================================
    # 2. Exact Match Absolute Supremacy (Popularity-Immune)
    # =========================================================================

    def test_exact_match_strictly_dominates_regardless_of_popularity(self) -> None:
        """An exact title match with pop=0.0 must ALWAYS outrank prefix and substring competitors."""
        matrix_exact = _create_item("movie", "The Matrix", "the-matrix", popularity=0.0, avg_rating=1.0)
        matrix_prefix = _create_item("movie", "The Matrix Reloaded", "the-matrix-reloaded", popularity=100000.0, avg_rating=10.0)
        matrix_sub = _create_item("movie", "Enter The Matrix", "enter-the-matrix", popularity=1000000.0, avg_rating=10.0)

        res = self.client.get("/api/v1/search/", {"q": "The Matrix"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 3)

        # Exact match MUST be #1
        self.assertEqual(items[0]["id"], matrix_exact.id)
        self.assertEqual(items[0]["title"], "The Matrix")

        # Prefix match MUST be #2
        self.assertEqual(items[1]["id"], matrix_prefix.id)

        # Substring match MUST be #3
        self.assertEqual(items[2]["id"], matrix_sub.id)

    def test_case_insensitive_exact_match_supremacy(self) -> None:
        """Case variations in query preserve exact match #1 rank."""
        dune = _create_item("movie", "Dune", "dune", popularity=0.0)
        dune_two = _create_item("movie", "Dune: Part Two", "dune-part-two", popularity=100000.0)

        for q in ["dune", "DUNE", "DuNe", "Dune"]:
            res = self.client.get("/api/v1/search/", {"q": q})
            self.assertEqual(res.status_code, 200)
            items = res.data["items"]
            self.assertGreaterEqual(len(items), 2)
            self.assertEqual(items[0]["id"], dune.id, f"Failed for query variant: {q}")

    def test_punctuation_stripped_supremacy_over_substring(self) -> None:
        """A punctuation-stripped match (e.g. 'spiderman' for 'Spider-Man') outranks high-pop substring matches."""
        spider_exact = _create_item("movie", "Spider-Man", "spider-man", popularity=0.0)
        spider_sub = _create_item("movie", "The Amazing Spiderman", "the-amazing-spiderman", popularity=100000.0)

        res = self.client.get("/api/v1/search/", {"q": "spiderman"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        self.assertGreaterEqual(len(items), 2)
        # Spider-Man gets 90.0 pts boost for normalized match and must rank #1
        self.assertEqual(items[0]["id"], spider_exact.id)

    # =========================================================================
    # 3. Typo Robustness & Cross-Engine Parity
    # =========================================================================

    def test_transposition_and_vowel_drop_typos(self) -> None:
        """Severe typos resolve to target titles."""
        interstellar = _create_item("movie", "Interstellar", "interstellar", popularity=50.0)
        gladiator = _create_item("movie", "Gladiator", "gladiator", popularity=50.0)

        # Transposition: 'itnerstellar' -> 'Interstellar'
        res_int = self.client.get("/api/v1/search/", {"q": "itnerstellar"})
        self.assertEqual(res_int.status_code, 200)
        self.assertEqual(res_int.data["items"][0]["id"], interstellar.id)

        # Transposition: 'gladaitor' -> 'Gladiator'
        res_glad = self.client.get("/api/v1/search/", {"q": "gladaitor"})
        self.assertEqual(res_glad.status_code, 200)
        self.assertEqual(res_glad.data["items"][0]["id"], gladiator.id)

    # =========================================================================
    # 4. SQLite Mathematical & Domain Safety
    # =========================================================================

    def test_sqlite_ln_comprehensive_domain_safety(self) -> None:
        """Verify SQLite ln function handles extreme and invalid domains without crashing."""
        if connection.vendor == "sqlite":
            ensure_sqlite_search_functions(connection)
            with connection.cursor() as cursor:
                # NULL test
                cursor.execute("SELECT ln(NULL)")
                self.assertEqual(cursor.fetchone()[0], 0.0)

                # 0.0 test
                cursor.execute("SELECT ln(0.0)")
                self.assertEqual(cursor.fetchone()[0], 0.0)

                # Negative test
                cursor.execute("SELECT ln(-100.5)")
                self.assertEqual(cursor.fetchone()[0], 0.0)

                # Positive test
                cursor.execute("SELECT ln(2.718281828)")
                self.assertAlmostEqual(cursor.fetchone()[0], 1.0, places=4)

    # =========================================================================
    # 5. Explicit Sorting with Relevance Floor
    # =========================================================================

    def test_explicit_sort_by_popularity_relevance_floor(self) -> None:
        """sort_by='popularity' filters out unrelated high-popularity candidates."""
        batman_one = _create_item("movie", "Batman", "batman", popularity=20.0)
        batman_two = _create_item("movie", "Batman Begins", "batman-begins", popularity=80.0)
        # Unrelated high popularity title sharing partial substring or letters
        unrelated = _create_item("show", "Breaking Bad", "breaking-bad", popularity=99999.0)

        res = self.client.get("/api/v1/search/", {"q": "Batman", "sort_by": "popularity"})
        self.assertEqual(res.status_code, 200)
        items = res.data["items"]
        ids = [it["id"] for it in items]

        # Top item should be Batman Begins (popularity 80), then Batman (popularity 20)
        self.assertEqual(ids[0], batman_two.id)
        self.assertEqual(ids[1], batman_one.id)

        # Breaking Bad must be excluded by the relevance floor
        self.assertNotIn(unrelated.id, ids)
