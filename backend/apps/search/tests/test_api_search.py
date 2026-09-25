"""Endpoint tests for the search API area (DRF).

Seeds a movie, show, game, person and company, then exercises the
ported legacy routes: ``/search`` (with SearchLog writes), ``/search/suggestions``,
``/search/grouped``, ``/search/companies``, ``/search/poll``, the external/empty
provider contracts and the Otix-catalog branch of ``/search/providers``.
"""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.company.models import Company
from apps.integrations.models import SyncJob
from apps.media.models import Game, MediaItem, Movie, Show
from apps.people.models import Person
from apps.search.models import SearchLog

User = get_user_model()

SEARCH_ENVELOPE_KEYS = {
    "items",
    "tracks",
    "has_more",
    "total",
    "backfill_pending",
    "next_cursor",
}
COMPANY_ITEM_KEYS = {
    "id",
    "name",
    "slug",
    "logo_url",
    "origin_country",
    "follower_count",
    "is_followed",
    "avg_rating",
    "user_rating",
}


def _seed_media(media_type: str, title: str, slug: str) -> MediaItem:
    """Create a hub row plus its concrete subtype row."""
    item = MediaItem.objects.create(media_type=media_type, title=title, slug=slug)
    subtype = {"movie": Movie, "show": Show, "game": Game}[media_type]
    subtype.objects.create(media_item=item)
    return item


class SearchApiTests(TestCase):
    def setUp(self) -> None:
        self.user = User.objects.create_user(username="alice", password="a-strong-pass")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()  # anonymous
        self.auth_client = APIClient()
        self.auth_client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

        self.movie = _seed_media("movie", "Inception", "inception")
        self.show = _seed_media("show", "Inception: Origins", "inception-origins")
        self.game = _seed_media("game", "Inception Game", "inception-game")
        self.person = Person.objects.create(
            name="Inception Artist", photo_url="https://img.example.com/artist.jpg"
        )
        self.company = Company.objects.create(
            name="Inception Pictures", slug="inception-pictures", origin_country="US"
        )

    # --- base search ---
    def test_search_returns_media_items_and_writes_log(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), SEARCH_ENVELOPE_KEYS)

        items = response.data["items"]
        titles = {item["title"] for item in items}
        self.assertIn("Inception", titles)
        self.assertIn("Inception Game", titles)
        self.assertEqual(response.data["total"], 3)
        self.assertIs(response.data["backfill_pending"], False)
        self.assertIsNone(response.data["next_cursor"])
        self.assertTrue(all("media_type" in item for item in items))
        movie_item = next(item for item in items if item["media_type"] == "movie")
        self.assertEqual(movie_item["id"], self.movie.pk)
        self.assertEqual(movie_item["slug"], "inception")

        log = SearchLog.objects.get()
        self.assertEqual(log.query, "inception")
        self.assertIsNone(log.media_type)
        self.assertIsNone(log.user_id)
        self.assertEqual(log.result_count, 3)
        self.assertEqual(log.items_returned, len(items))
        self.assertEqual(log.tracks_returned, 0)
        self.assertFalse(log.cache_hit)
        self.assertFalse(log.backfill_triggered)

    def test_search_accepts_path_without_trailing_slash(self) -> None:
        response = self.client.get("/api/v1/search", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("items", response.data)

    def test_search_filters_by_media_type(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "inception", "media_type": "movie"})
        self.assertEqual(response.status_code, 200)
        items = response.data["items"]
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]["media_type"], "movie")
        self.assertEqual(response.data["total"], 1)

    def test_search_is_public(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        first = response.data["items"][0]
        self.assertEqual(first["media_type"], "movie")  # "Inception" ranks first by title
        self.assertEqual(first["title"], "Inception")

    def test_search_logs_authenticated_user(self) -> None:
        response = self.auth_client.get("/api/v1/search/", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        log = SearchLog.objects.get()
        self.assertEqual(log.user_id, self.user.pk)

    def test_search_requires_q(self) -> None:
        response = self.client.get("/api/v1/search/")
        self.assertEqual(response.status_code, 400)

    def test_search_validates_page_size(self) -> None:
        response = self.client.get("/api/v1/search/", {"q": "inception", "page_size": 500})
        self.assertEqual(response.status_code, 400)

    # --- suggestions ---
    def test_suggestions_return_compact_summaries(self) -> None:
        response = self.client.get("/api/v1/search/suggestions", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertGreaterEqual(len(response.data), 3)
        summary = response.data[0]
        self.assertIn("media_type", summary)
        self.assertIn("title", summary)

    def test_media_suggestions_alias_matches_search_suggestions(self):
        response = self.client.get(
            "/api/v1/media/suggestions", {"q": "inception", "media_type": "game"}
        )
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.data, list)
        self.assertTrue(all(item["media_type"] == "game" for item in response.data))

    # --- grouped ---
    def test_grouped_returns_type_groups(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        data = response.data
        self.assertEqual(
            set(data),
            {
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
            },
        )
        self.assertEqual(data["movies"][0]["media_type"], "movie")
        self.assertEqual(data["movies"][0]["title"], "Inception")
        self.assertEqual(data["shows"][0]["media_type"], "show")
        self.assertEqual(data["games"][0]["media_type"], "game")
        self.assertEqual(data["music"], [])
        self.assertEqual(data["music_count"], 0)
        self.assertEqual(data["tracks"], [])
        self.assertEqual(data["tracks_count"], 0)
        self.assertEqual(data["people"][0]["media_type"], "person")
        self.assertEqual(data["people"][0]["name"], "Inception Artist")
        self.assertEqual(data["users"], [])
        self.assertEqual(data["users_count"], 0)
        self.assertEqual(data["movies_count"], 1)
        self.assertGreaterEqual(data["total"], 4)
        self.assertTrue(data["best_results"])

    def test_grouped_with_no_existing_media_backfills_without_error(self) -> None:
        response = self.client.get("/api/v1/search/grouped", {"q": "nomatchanywhere"})
        self.assertEqual(response.status_code, 200)
        self.assertIn("games", response.data)
        self.assertIn("movies", response.data)
        self.assertIn("shows", response.data)

    # --- companies ---
    def test_companies_returns_company_items(self) -> None:
        response = self.client.get("/api/v1/search/companies", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"items", "total", "has_more"})
        self.assertIs(response.data["has_more"], False)
        self.assertIsNone(response.data["total"])
        self.assertEqual(len(response.data["items"]), 1)
        item = response.data["items"][0]
        self.assertEqual(set(item), COMPANY_ITEM_KEYS)
        self.assertEqual(item["name"], "Inception Pictures")
        self.assertEqual(item["follower_count"], 0)
        self.assertIsNone(item["is_followed"])

    # --- poll ---
    def test_poll_returns_matches_excluding_known_ids(self) -> None:
        response = self.client.get(
            "/api/v1/search/poll",
            {"q": "inception", "known_ids": str(self.movie.pk), "page_size": 50},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), SEARCH_ENVELOPE_KEYS)
        returned_ids = {item["id"] for item in response.data["items"]}
        self.assertNotIn(self.movie.pk, returned_ids)
        self.assertIn(self.show.pk, returned_ids)
        self.assertEqual(response.data["total"], 3)
        self.assertIs(response.data["backfill_pending"], False)

    # --- external / providers (third-party contract) ---
    def test_external_returns_empty_contract(self) -> None:
        response = self.client.get("/api/v1/search/external", {"q": "inception"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), SEARCH_ENVELOPE_KEYS)
        self.assertEqual(response.data["items"], [])
        self.assertEqual(response.data["total"], 0)
        self.assertIs(response.data["backfill_pending"], False)

    def test_providers_returns_otix_game_branch(self) -> None:
        response = self.client.post(
            "/api/v1/search/providers", {"query": "inception", "limit": 10}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(set(response.data), {"items", "backfill_pending"})
        self.assertTrue(response.data["items"])
        otix_ids = {
            int(item["id"]) for item in response.data["items"] if item["provider"] == "otix"
        }
        self.assertIn(self.game.pk, otix_ids)

    def test_providers_requires_query(self) -> None:
        response = self.client.post("/api/v1/search/providers", {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_steamgrid_returns_empty_contract(self) -> None:
        url = "/api/v1/search/steamgrid"
        response = self.client.post(url, {"query": "inception"}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {"items": []})

    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="secret")
    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_game_suggestions_backfill_igdb_placeholders(self, mock_provider, _configured) -> None:
        mock_provider.return_value.search_games.return_value = [
            {
                "id": 1942,
                "name": "The Witcher 3",
                "slug": "witcher-3",
                "cover": {"image_id": "abc"},
            }
        ]
        response = self.client.get(
            "/api/v1/search/suggestions",
            {"q": "witcher", "media_type": "game", "limit": 8},
        )
        self.assertEqual(response.status_code, 200)
        titles = {item["title"] for item in response.data}
        self.assertIn("The Witcher 3", titles)
        self.assertIn("igdb:1942", {str(item["id"]) for item in response.data})

    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="secret")
    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_game_search_enqueues_igdb_backfill(self, mock_provider, _configured) -> None:
        mock_provider.return_value.search_games.return_value = [
            {"id": 1942, "name": "The Witcher 3", "slug": "witcher-3", "cover": None}
        ]
        response = self.client.get("/api/v1/search/", {"q": "witcher", "media_type": "game"})
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.data["backfill_pending"])
        self.assertIn("igdb:1942", {str(item["id"]) for item in response.data["items"]})
        self.assertTrue(
            SyncJob.objects.filter(provider="igdb", entity_type="game", external_id="1942").exists()
        )

    @override_settings(IGDB_CLIENT_ID="id", IGDB_CLIENT_SECRET="secret")
    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_game_search_include_external_returns_igdb_placeholders(
        self, mock_provider, _configured
    ) -> None:
        mock_provider.return_value.search_games.return_value = [
            {"id": 1942, "name": "The Witcher 3", "slug": "witcher-3", "cover": None}
        ]
        response = self.client.get(
            "/api/v1/search/",
            {"q": "witcher", "media_type": "game", "include_external": "true"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("igdb:1942", {str(item["id"]) for item in response.data["items"]})

    def test_prehydrate_queues_unique_titles(self) -> None:
        response = self.auth_client.post(
            "/api/v1/search/prehydrate",
            {"titles": ["Portal", "portal", "x"]},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["queued"], 1)

    def test_prehydrate_requires_auth(self) -> None:
        response = self.client.post(
            "/api/v1/search/prehydrate",
            {"titles": ["Portal"]},
            format="json",
        )
        self.assertIn(response.status_code, (401, 403))
