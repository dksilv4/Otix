"""Comprehensive E2E Test Suite for the Otix Search Overhaul.

Covers Tiers 1-4 per the authoritative requirements in ORIGINAL_REQUEST.md (§ 2026-11-04T22:33:44Z)
and PROJECT.md:
- Tier 1: Feature Coverage (Exact title search, media filtering, sorting, pagination, external backfill triggering)
- Tier 2: Boundary & Corner Cases (Empty queries, extreme string lengths, SQL injection, regex/XSS vectors, unicode/accents, punctuation/spacing)
- Tier 3: Cross-Feature Combinations (Typo + media_type filter, grouped local+external, sorting + similarity, external ingestion into MediaItem and local retrieval)
- Tier 4: Real-World Workload Scenarios (Popular franchises with typos, external discovery scenario with authentic integer PK)
"""

from datetime import date
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.company.models import Company
from apps.media.models import ExternalID, Game, MediaAsset, MediaItem, Movie, Show
from apps.people.models import Person
from apps.search.models import SearchLog
from core.providers.igdb.hydrators import seed_game_from_igdb
from core.providers.tmdb.hydrators import seed_movie_from_tmdb

User = get_user_model()

SEARCH_ENVELOPE_KEYS = {
    "items",
    "tracks",
    "has_more",
    "total",
    "backfill_pending",
    "next_cursor",
}

GROUPED_ENVELOPE_KEYS = {
    "best_results",
    "movies",
    "shows",
    "games",
    "music",
    "tracks",
    "people",
    "users",
    "total",
    "movies_count",
    "shows_count",
    "games_count",
    "music_count",
    "tracks_count",
    "people_count",
    "users_count",
    "backfill_pending",
}


def _seed_media(
    media_type: str,
    title: str,
    slug: str,
    popularity: float = 10.0,
    avg_rating: float = 8.0,
    release_date: date | None = None,
    overview: str = "",
) -> MediaItem:
    """Helper to seed a hub MediaItem and its corresponding concrete subtype."""
    item = MediaItem.objects.create(
        media_type=media_type,
        title=title,
        slug=slug,
        popularity=popularity,
        avg_rating=avg_rating,
        release_date=release_date or date(2020, 1, 1),
        overview=overview,
    )
    subtype = {"movie": Movie, "show": Show, "game": Game}.get(media_type)
    if subtype:
        subtype.objects.create(media_item=item)
    return item


class SearchTier1FeatureCoverageTests(TestCase):
    """Tier 1: Feature Coverage (>=5 test cases per core feature)."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.user = User.objects.create_user(username="testuser", password="password123")
        self.token = Token.objects.create(user=self.user)
        self.auth_client = APIClient()
        self.auth_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        # Seed diverse media items across types with varied popularity and release dates
        self.movie_inception = _seed_media(
            "movie", "Inception", "inception", popularity=95.0, avg_rating=8.8, release_date=date(2010, 7, 16)
        )
        self.movie_interstellar = _seed_media(
            "movie", "Interstellar", "interstellar", popularity=98.0, avg_rating=8.7, release_date=date(2014, 11, 7)
        )
        self.movie_dark_knight = _seed_media(
            "movie", "The Dark Knight", "the-dark-knight", popularity=99.0, avg_rating=9.0, release_date=date(2008, 7, 18)
        )
        self.show_breaking_bad = _seed_media(
            "show", "Breaking Bad", "breaking-bad", popularity=96.0, avg_rating=9.5, release_date=date(2008, 1, 20)
        )
        self.show_origins = _seed_media(
            "show", "Inception: Origins", "inception-origins", popularity=40.0, avg_rating=7.2, release_date=date(2021, 5, 1)
        )
        self.game_witcher = _seed_media(
            "game", "The Witcher 3: Wild Hunt", "the-witcher-3-wild-hunt", popularity=97.0, avg_rating=9.3, release_date=date(2015, 5, 19)
        )
        self.game_inception = _seed_media(
            "game", "Inception Game", "inception-game", popularity=30.0, avg_rating=6.5, release_date=date(2011, 2, 10)
        )

        self.person = Person.objects.create(name="Christopher Nolan", photo_url="https://img.example.com/nolan.jpg")
        self.company = Company.objects.create(name="Warner Bros. Pictures", slug="warner-bros-pictures", origin_country="US")

    # 1. Exact Title Search (/api/v1/search, /grouped, /suggestions)
    def test_exact_title_search_movie(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), SEARCH_ENVELOPE_KEYS)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Inception", titles)
        # Verify first item matches title and is of type movie
        first_item = response.data["items"][0]
        self.assertEqual(first_item["title"], "Inception")
        self.assertEqual(first_item["media_type"], "movie")
        self.assertEqual(first_item["id"], self.movie_inception.pk)

    def test_exact_title_search_show(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Breaking Bad"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Breaking Bad", titles)
        first_item = response.data["items"][0]
        self.assertEqual(first_item["media_type"], "show")
        self.assertEqual(first_item["id"], self.show_breaking_bad.pk)

    def test_exact_title_search_game(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "The Witcher 3: Wild Hunt"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("The Witcher 3: Wild Hunt", titles)
        first_item = response.data["items"][0]
        self.assertEqual(first_item["media_type"], "game")
        self.assertEqual(first_item["id"], self.game_witcher.pk)

    def test_exact_title_suggestions(self) -> None:
        response = self.client.get("/api/v1/search/suggestions", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertGreaterEqual(len(response.data), 1)
        first = response.data[0]
        self.assertIn("id", first)
        self.assertIn("title", first)
        self.assertIn("media_type", first)
        self.assertEqual(first["title"], "Inception")

    def test_exact_title_grouped(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), GROUPED_ENVELOPE_KEYS)
        self.assertGreaterEqual(response.data["movies_count"], 1)
        self.assertGreaterEqual(response.data["shows_count"], 1)
        self.assertGreaterEqual(response.data["games_count"], 1)
        self.assertEqual(response.data["movies"][0]["title"], "Inception")
        self.assertTrue(len(response.data["best_results"]) >= 1)

    def test_exact_title_route_without_trailing_slash(self) -> None:
        response_with_slash = self.client.get("/api/v1/search/", {"q": "Inception"})
        response_without_slash = self.client.get("/api/v1/search", {"q": "Inception"})
        self.assertEqual(response_without_slash.status_code, 200)
        self.assertEqual(response_with_slash.data["total"], response_without_slash.data["total"])
        self.assertEqual(len(response_with_slash.data["items"]), len(response_without_slash.data["items"]))

    # 2. Media Type Filtering (movie, show, game, music)
    def test_filter_by_media_type_movie(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "media_type": "movie"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        items = response.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["media_type"], "movie")
        self.assertEqual(items[0]["title"], "Inception")

    def test_filter_by_media_type_show(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "media_type": "show"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        items = response.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["media_type"], "show")
        self.assertEqual(items[0]["title"], "Inception: Origins")

    def test_filter_by_media_type_game(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "media_type": "game"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        items = response.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["media_type"], "game")
        self.assertEqual(items[0]["title"], "Inception Game")

    def test_filter_by_media_type_music(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "media_type": "music"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)
        self.assertEqual(response.data["items"], [])

    def test_filter_by_unknown_media_type(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "media_type": "nonexistent_type"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)
        self.assertEqual(response.data["items"], [])

    # 3. Sorting (popularity, rating, release_date, title)
    def test_sort_by_popularity(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "sort_by": "popularity"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertGreaterEqual(len(items), 2)
        popularities = [item["popularity"] for item in items]
        self.assertEqual(popularities, sorted(popularities, reverse=True))

    def test_sort_by_rating(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "sort_by": "rating"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        ratings = [item["avg_rating"] for item in items]
        self.assertEqual(ratings, sorted(ratings, reverse=True))

    def test_sort_by_release_date(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "sort_by": "release_date"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        release_dates = [item["release_date"] for item in items]
        self.assertEqual(release_dates, sorted(release_dates, reverse=True))

    def test_sort_by_title(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "sort_by": "title"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        titles = [item["title"] for item in items]
        self.assertEqual(titles, sorted(titles))

    def test_default_sort_ranks_prefix_and_popularity(self) -> None:
        # Default sort places prefix match first, then orders by popularity
        response = self.client.get("/api/v1/search/", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertEqual(items[0]["title"], "Inception")

    # 4. Pagination & Cursor Handling
    def test_pagination_first_page_has_more(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page": 1, "page_size": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 2)
        self.assertEqual(response.data["total"], 3)
        self.assertIs(response.data["has_more"], True)

    def test_pagination_second_page_total_is_none(self) -> None:
        # DRF legacy contract: total is only computed and returned on page 1
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page": 2, "page_size": 2})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data["items"]), 1)
        self.assertIsNone(response.data["total"])
        self.assertIs(response.data["has_more"], False)

    def test_pagination_out_of_bounds_page_returns_empty(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page": 999, "page_size": 24})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], [])
        self.assertIsNone(response.data["total"])
        self.assertIs(response.data["has_more"], False)

    def test_pagination_invalid_page_size_exceeds_maximum(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page_size": 101})
        self.assertEqual(response.status_code, 400)

    def test_pagination_invalid_page_size_below_minimum(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page_size": 0})
        self.assertEqual(response.status_code, 400)

    def test_pagination_invalid_page_below_minimum(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "page": 0})
        self.assertEqual(response.status_code, 400)

    # 5. External Backfill Triggering on Low Local Results
    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="secret")
    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_backfill_triggered_when_local_results_sparse(self, mock_provider, _configured) -> None:
        mock_provider.return_value.search_games.return_value = [
            {"id": 9999, "name": "Unknown Game", "slug": "unknown-game", "cover": None}
        ]
        response = self.client.get("/api/v1/search/", {"q": "UnknownGame", "media_type": "game"})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["backfill_pending"], True)

    def test_backfill_not_triggered_when_local_results_adequate(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        # Even with 3 items, in base search without configured provider credentials, backfill is False
        self.assertIs(response.data["backfill_pending"], False)

    def test_backfill_not_triggered_for_single_character_query(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "z"})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["backfill_pending"], False)

    def test_backfill_not_triggered_for_numeric_query(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "999999"})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["backfill_pending"], False)

    def test_backfill_not_triggered_for_scene_release_consonants(self) -> None:
        # Queries with 8+ consecutive consonants are treated as scene release noise
        response = self.client.get("/api/v1/search/", {"q": "bcdfghjklmnp"})
        self.assertEqual(response.status_code, 200)
        self.assertIs(response.data["backfill_pending"], False)


class SearchTier2BoundaryAndCornerCaseTests(TestCase):
    """Tier 2: Boundary & Corner Cases (>=5 test cases per feature)."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.movie_amelie = _seed_media("movie", "Amélie", "amelie", popularity=80.0)
        self.show_pokemon = _seed_media("show", "Pokémon", "pokemon", popularity=92.0)
        self.movie_spiderman = _seed_media("movie", "Spider-Man", "spider-man", popularity=90.0)
        self.movie_inception = _seed_media("movie", "Inception", "inception", popularity=95.0)

    # 1. Empty Query String q="" (Expected 400 ParseError)
    def test_empty_query_string_search_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": ""})
        self.assertEqual(response.status_code, 400)

    def test_whitespace_only_query_search_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "     "})
        self.assertEqual(response.status_code, 400)

    def test_missing_q_param_search_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/")
        self.assertEqual(response.status_code, 400)

    def test_empty_query_suggestions_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/suggestions", {"q": ""})
        self.assertEqual(response.status_code, 400)

    def test_empty_query_grouped_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": ""})
        self.assertEqual(response.status_code, 400)

    def test_empty_query_poll_returns_400(self) -> None:
        response = self.client.get("/api/v1/search/poll", {"q": ""})
        self.assertEqual(response.status_code, 400)

    # 2. Extremely Long Search Strings (>500 chars)
    def test_extremely_long_search_string_500_chars(self) -> None:
        long_q = "alpha " * 100  # 600 chars
        response = self.client.get("/api/v1/search/", {"q": long_q})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)
        self.assertEqual(response.data["items"], [])

    def test_extremely_long_search_string_1000_chars(self) -> None:
        long_q = "x" * 1000
        response = self.client.get("/api/v1/search/", {"q": long_q})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["items"], [])

    def test_extremely_long_search_suggestions(self) -> None:
        long_q = "word " * 120
        response = self.client.get("/api/v1/search/suggestions", {"q": long_q})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, [])

    def test_extremely_long_search_grouped(self) -> None:
        long_q = "test " * 110
        response = self.client.get("/api/v1/search/grouped", {"q": long_q})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["movies"], [])
        self.assertEqual(response.data["shows"], [])
        self.assertEqual(response.data["games"], [])

    def test_extremely_long_query_repeating_pattern_safety(self) -> None:
        long_q = "((a+)+)+" * 50
        response = self.client.get("/api/v1/search/", {"q": long_q})
        self.assertEqual(response.status_code, 200)

    # 3. Special Characters, Regex Symbols, SQL Injection Vectors
    def test_sql_injection_tautology_vector(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "' OR '1'='1"})
        self.assertEqual(response.status_code, 200)
        # Must not bypass query filtering to dump all records
        self.assertEqual(response.data["total"], 0)

    def test_sql_injection_ddl_drop_table_vector(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "'; DROP TABLE media_mediaitem; --"})
        self.assertEqual(response.status_code, 200)
        # Ensure media items still exist
        self.assertTrue(MediaItem.objects.filter(pk=self.movie_inception.pk).exists())

    def test_regex_meta_characters_safety(self) -> None:
        meta_chars = ".*+?^$[](){}|\\"
        response = self.client.get("/api/v1/search/", {"q": meta_chars})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)

    def test_windows_and_unix_path_separators(self) -> None:
        path_query = r"C:\Program Files\Otix\games/roms\test.iso"
        response = self.client.get("/api/v1/search/", {"q": path_query})
        self.assertEqual(response.status_code, 200)

    def test_html_and_xss_vector(self) -> None:
        xss_query = '<script>alert("xss")</script><img src="x" onerror="alert(1)"/>'
        response = self.client.get("/api/v1/search/", {"q": xss_query})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 0)

    # 4. Unicode & Multi-Byte Strings
    def test_unicode_accent_search_amelie(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Amélie"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Amélie", titles)

    def test_unicode_accent_search_pokemon(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Pokémon"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Pokémon", titles)

    def test_unicode_japanese_cjk_search(self) -> None:
        _seed_media("movie", "千と千尋の神隠し", "spirited-away", popularity=91.0)
        response = self.client.get("/api/v1/search/", {"q": "千と千尋の神隠し"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("千と千尋の神隠し", titles)

    def test_unicode_cyrillic_search(self) -> None:
        _seed_media("movie", "Солярис", "solaris", popularity=75.0)
        response = self.client.get("/api/v1/search/", {"q": "Солярис"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Солярис", titles)

    def test_unicode_emoji_query_preservation(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "🎬 🎮 🍿"})
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data["items"], list)

    # 5. Spacing and Punctuation Boundaries
    def test_leading_and_trailing_whitespace_stripped(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "   Inception   "})
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(len(response.data["items"]), 1)
        self.assertEqual(response.data["items"][0]["title"], "Inception")

    def test_multiple_internal_whitespace_handling(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Spider    Man"})
        self.assertEqual(response.status_code, 200)

    def test_punctuation_boundary_hyphen_exact(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Spider-Man"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Spider-Man", titles)

    def test_punctuation_boundary_colon_exact(self) -> None:
        _seed_media("show", "Inception: Origins", "inception-origins-colon")
        response = self.client.get("/api/v1/search/", {"q": "Inception: Origins"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Inception: Origins", titles)

    def test_punctuation_boundary_quotes(self) -> None:
        _seed_media("movie", "The 'Dark' Knight", "the-dark-knight-quotes")
        response = self.client.get("/api/v1/search/", {"q": "The 'Dark' Knight"})
        self.assertEqual(response.status_code, 200)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("The 'Dark' Knight", titles)


class SearchTier3CrossFeatureCombinationTests(TestCase):
    """Tier 3: Cross-Feature Combinations."""

    def setUp(self) -> None:
        self.client = APIClient()
        self.movie_inception = _seed_media(
            "movie", "Inception", "inception", popularity=95.0, avg_rating=8.8, release_date=date(2010, 7, 16)
        )
        self.game_inception = _seed_media(
            "game", "Inception Game", "inception-game", popularity=30.0, avg_rating=6.5, release_date=date(2011, 2, 10)
        )
        self.show_inception = _seed_media(
            "show", "Inception: Origins", "inception-origins", popularity=40.0, avg_rating=7.2, release_date=date(2021, 5, 1)
        )

    def test_typo_query_with_media_type_filter_movie(self) -> None:
        # Typo query 'inceptoin' with media_type='movie'
        response = self.client.get("/api/v1/search/", {"q": "inceptoin", "media_type": "movie"})
        self.assertEqual(response.status_code, 200)
        # All returned items must strictly be of media_type movie
        for item in response.data["items"]:
            self.assertEqual(item["media_type"], "movie")

    def test_typo_query_with_media_type_filter_game(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "inceptoin", "media_type": "game"})
        self.assertEqual(response.status_code, 200)
        for item in response.data["items"]:
            self.assertEqual(item["media_type"], "game")

    def test_grouped_search_with_mixed_local_results(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": "Inception"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("movies", response.data)
        self.assertIn("shows", response.data)
        self.assertIn("games", response.data)
        self.assertIn("best_results", response.data)
        self.assertGreaterEqual(response.data["total"], 3)
        self.assertEqual(response.data["movies"][0]["title"], "Inception")

    def test_sorting_combined_with_query_ranking(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Inception", "sort_by": "popularity"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertGreaterEqual(len(items), 2)
        # Ensure ordered by descending popularity
        self.assertGreaterEqual(items[0]["popularity"], items[1]["popularity"])

    def test_ingestion_of_external_movie_creates_authentic_media_item(self) -> None:
        raw_tmdb_movie = {
            "id": 550,
            "title": "Fight Club",
            "overview": "A ticking-time-bomb insomniac and a slippery soap salesman...",
            "poster_path": "/pB8BM7pdSp6B6Ih7QZ4DrQ3PmJK.jpg",
            "backdrop_path": "/hZkgoQYus5vegHoetLkCJzb17zJ.jpg",
            "release_date": "1999-10-15",
            "popularity": 85.5,
            "original_language": "en",
            "adult": False,
            "runtime": 139,
            "budget": 63000000,
            "revenue": 100853753,
            "tagline": "Mischief. Mayhem. Soap.",
            "genres": [{"id": 18, "name": "Drama"}],
            "credits": {"cast": [], "crew": []},
        }

        # Seed the movie via authentic provider hydrator
        media_pk = seed_movie_from_tmdb(raw_tmdb_movie)
        self.assertIsInstance(media_pk, int)
        self.assertGreater(media_pk, 0)

        # Verify authentic MediaItem exists in DB
        seeded = MediaItem.objects.get(pk=media_pk)
        self.assertEqual(seeded.title, "Fight Club")
        self.assertEqual(seeded.media_type, "movie")

        # Verify external ID attached
        ext_id = ExternalID.objects.filter(provider="tmdb", external_id="550", media_type="movie").first()
        self.assertIsNotNone(ext_id)
        self.assertEqual(ext_id.object_id, media_pk)

        # Verify MediaAsset created
        poster = MediaAsset.objects.filter(media_item=seeded, asset_type="poster").first()
        self.assertIsNotNone(poster)

        # Issue subsequent local search: item must resolve immediately as an authentic local item
        search_res = self.client.get("/api/v1/search/", {"q": "Fight Club"})
        self.assertEqual(search_res.status_code, 200)
        self.assertGreaterEqual(search_res.data["total"], 1)
        found_item = next(item for item in search_res.data["items"] if item["id"] == media_pk)
        self.assertEqual(found_item["title"], "Fight Club")
        self.assertIsInstance(found_item["id"], int)  # Authentic integer PK, NOT synthetic string

    def test_ingestion_of_external_game_creates_authentic_media_item(self) -> None:
        raw_igdb_game = {
            "id": 1942,
            "name": "The Witcher 3: Wild Hunt - Complete Edition",
            "slug": "the-witcher-3-wild-hunt-complete-edition",
            "summary": "You are Geralt of Rivia, mercenary monster slayer.",
            "first_release_date": 1472515200,
            "cover": {"image_id": "co1wyy"},
            "genres": [{"id": 12, "name": "Role-playing (RPG)"}],
        }

        game_pk = seed_game_from_igdb(raw_igdb_game, igdb_id=1942)
        self.assertIsInstance(game_pk, int)
        self.assertGreater(game_pk, 0)

        # Verify local DB contains Game and MediaItem
        media_game = MediaItem.objects.get(pk=game_pk)
        self.assertEqual(media_game.media_type, "game")
        self.assertTrue(Game.objects.filter(media_item=media_game).exists())

        # Verify local search retrieves newly ingested game with real integer PK
        search_res = self.client.get("/api/v1/search/", {"q": "The Witcher 3: Wild Hunt - Complete Edition"})
        self.assertEqual(search_res.status_code, 200)
        found_item = next(item for item in search_res.data["items"] if item["id"] == game_pk)
        self.assertEqual(found_item["title"], "The Witcher 3: Wild Hunt - Complete Edition")
        self.assertIsInstance(found_item["id"], int)


class SearchTier4RealWorldWorkloadScenarioTests(TestCase):
    """Tier 4: Real-World Workload Scenarios."""

    def setUp(self) -> None:
        self.client = APIClient()

        # Seed popular franchises
        self.hp1 = _seed_media(
            "movie", "Harry Potter and the Sorcerer's Stone", "harry-potter-1", popularity=90.0, avg_rating=8.2, release_date=date(2001, 11, 16)
        )
        self.hp2 = _seed_media(
            "movie", "Harry Potter and the Chamber of Secrets", "harry-potter-2", popularity=88.0, avg_rating=8.0, release_date=date(2002, 11, 15)
        )
        self.sw_hope = _seed_media(
            "movie", "Star Wars: Episode IV - A New Hope", "star-wars-a-new-hope", popularity=96.0, avg_rating=8.6, release_date=date(1977, 5, 25)
        )
        self.sw_empire = _seed_media(
            "movie", "Star Wars: Episode V - The Empire Strikes Back", "star-wars-empire", popularity=98.0, avg_rating=8.7, release_date=date(1980, 5, 21)
        )
        self.lotr = _seed_media(
            "movie", "The Lord of the Rings: The Fellowship of the Ring", "lotr-fellowship", popularity=99.0, avg_rating=8.9, release_date=date(2001, 12, 19)
        )
        self.witcher_game = _seed_media(
            "game", "The Witcher 3: Wild Hunt", "witcher-3", popularity=95.0, avg_rating=9.4, release_date=date(2015, 5, 19)
        )
        self.witcher_show = _seed_media(
            "show", "The Witcher", "the-witcher", popularity=93.0, avg_rating=8.1, release_date=date(2019, 12, 20)
        )

    def test_popular_franchise_search_harry_potter(self) -> None:
        # Standard query across franchise
        response = self.client.get("/api/v1/search/", {"q": "Harry Potter"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 2)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Harry Potter and the Sorcerer's Stone", titles)
        self.assertIn("Harry Potter and the Chamber of Secrets", titles)
        # Search log verification
        log = SearchLog.objects.filter(query="Harry Potter").first()
        self.assertIsNotNone(log)
        self.assertEqual(log.result_count, 2)

    def test_popular_franchise_search_star_wars(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Star Wars"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 2)
        titles = [item["title"] for item in response.data["items"]]
        self.assertIn("Star Wars: Episode IV - A New Hope", titles)
        self.assertIn("Star Wars: Episode V - The Empire Strikes Back", titles)

    def test_popular_franchise_search_lord_of_the_rings(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "Lord of the Rings"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total"], 1)
        self.assertEqual(response.data["items"][0]["title"], "The Lord of the Rings: The Fellowship of the Ring")

    def test_popular_franchise_cross_media_witcher(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": "Witcher"})
        self.assertEqual(response.status_code, 200)
        self.assertGreaterEqual(response.data["games_count"], 1)
        self.assertGreaterEqual(response.data["shows_count"], 1)
        self.assertEqual(response.data["games"][0]["title"], "The Witcher 3: Wild Hunt")
        self.assertEqual(response.data["shows"][0]["title"], "The Witcher")

    def test_external_discovery_scenario_unindexed_movie(self) -> None:
        # Phase 1: Search for unindexed popular movie 'Dune: Part Two'
        initial_search = self.client.get("/api/v1/search/", {"q": "Dune: Part Two"})
        self.assertEqual(initial_search.status_code, 200)
        self.assertEqual(initial_search.data["total"], 0)
        self.assertEqual(initial_search.data["items"], [])

        # Phase 2: Provider discovers and seeds the unindexed item inline
        dune_tmdb_payload = {
            "id": 693134,
            "title": "Dune: Part Two",
            "overview": "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen...",
            "poster_path": "/8b8R8l88Qje9dn9OE8PY05Nxl1X.jpg",
            "backdrop_path": "/xOMo8BRK7PfcJv9JCnx7s520bEx.jpg",
            "release_date": "2024-03-01",
            "popularity": 195.0,
            "original_language": "en",
            "adult": False,
            "runtime": 166,
            "budget": 190000000,
            "revenue": 711844358,
            "tagline": "Long live the fighters.",
            "genres": [{"id": 878, "name": "Science Fiction"}, {"id": 12, "name": "Adventure"}],
            "credits": {"cast": [], "crew": []},
        }
        seeded_pk = seed_movie_from_tmdb(dune_tmdb_payload)
        self.assertIsInstance(seeded_pk, int)
        self.assertGreater(seeded_pk, 0)

        # Phase 3: Verify the item is now locally available and routes cleanly
        subsequent_search = self.client.get("/api/v1/search/", {"q": "Dune: Part Two"})
        self.assertEqual(subsequent_search.status_code, 200)
        self.assertGreaterEqual(subsequent_search.data["total"], 1)
        dune_item = next(item for item in subsequent_search.data["items"] if item["id"] == seeded_pk)
        self.assertEqual(dune_item["title"], "Dune: Part Two")
        self.assertEqual(dune_item["media_type"], "movie")
        self.assertIsInstance(dune_item["id"], int)

        # Phase 4: Suggestions typeahead also resolves the item with authentic integer ID
        suggestions_res = self.client.get("/api/v1/search/suggestions", {"q": "Dune"})
        self.assertEqual(suggestions_res.status_code, 200)
        suggestion_ids = [item["id"] for item in suggestions_res.data]
        self.assertIn(seeded_pk, suggestion_ids)
