"""Tests for the freegames app (EpicFreeGamesProvider, FreeGamesAggregator, and API view)."""

from unittest.mock import MagicMock, patch

from django.core.cache import cache
from django.test import TestCase
from rest_framework import status
from rest_framework.test import APIClient

from apps.freegames.services.aggregator import CACHE_KEY, FreeGamesAggregator
from apps.freegames.services.base import BaseFreeGamesProvider, FreeGameItem
from apps.freegames.services.providers.epic import EpicFreeGamesProvider
from apps.freegames.services.providers.steam import SteamFreeGamesProvider
from apps.media.models import MediaItem

MOCK_STEAM_SEARCH_HTML = """
<html><body>
<a href="https://store.steampowered.com/app/440" data-ds-appid="440" data-discount="100">
  <img src="https://cdn.akamai.steamstatic.com/steam/apps/440/capsule_184x69.jpg">
  <span class="title">Team Fortress 2</span>
  <div class="discount_original_price">$19.99</div>
  <div class="discount_pct">-100%</div>
</a>
<a href="https://store.steampowered.com/app/570" data-ds-appid="570" data-discount="50">
  <img src="https://cdn.akamai.steamstatic.com/steam/apps/570/capsule_184x69.jpg">
  <span class="title">Dota 2 Half Off</span>
  <div class="discount_original_price">$0.00</div>
  <div class="discount_pct">-50%</div>
</a>
<a href="https://store.steampowered.com/app/730" data-ds-appid="730">
  <span class="title">Counter-Strike 2 Free</span>
  <div class="discount_pct">-100%</div>
</a>
</body></html>
"""

MOCK_EPIC_API_RESPONSE = {
    "data": {
        "Catalog": {
            "searchStore": {
                "elements": [
                    {
                        "id": "epic-item-1",
                        "namespace": "epic-ns",
                        "title": "Cosmic Mystery Adventure",
                        "description": "An exciting cosmic adventure.",
                        "productSlug": "cosmic-mystery-adventure",
                        "offerMappings": [{"pageSlug": "cosmic-mystery-adventure-offer"}],
                        "keyImages": [
                            {"type": "OfferImageTall", "url": "https://img.epic.com/tall.jpg"},
                            {"type": "OfferImageWide", "url": "https://img.epic.com/wide.jpg"},
                        ],
                        "price": {
                            "totalPrice": {
                                "originalPrice": 2999,
                                "fmtPrice": {"originalPrice": "$29.99"},
                            }
                        },
                        "promotions": {
                            "promotionalOffers": [
                                {
                                    "promotionalOffers": [
                                        {
                                            "startDate": "2026-09-24T15:00:00.000Z",
                                            "endDate": "2026-10-01T15:00:00.000Z",
                                            "discountSetting": {
                                                "discountType": "PERCENTAGE",
                                                "discountPercentage": 0,
                                            },
                                        }
                                    ]
                                }
                            ],
                            "upcomingPromotionalOffers": [],
                        },
                    },
                    {
                        "id": "epic-item-2",
                        "namespace": "epic-ns-2",
                        "title": "Future Cyber War",
                        "description": "Fight in the neon cities.",
                        "productSlug": None,
                        "catalogNs": {"mappings": [{"pageSlug": "future-cyber-war-offer"}]},
                        "keyImages": [
                            {"type": "OfferImageTall", "url": "https://img.epic.com/cyber.jpg"}
                        ],
                        "price": {
                            "totalPrice": {
                                "originalPrice": 4999,
                                "fmtPrice": {"originalPrice": "$49.99"},
                            }
                        },
                        "promotions": {
                            "promotionalOffers": [],
                            "upcomingPromotionalOffers": [
                                {
                                    "promotionalOffers": [
                                        {
                                            "startDate": "2026-10-01T15:00:00.000Z",
                                            "endDate": "2026-10-08T15:00:00.000Z",
                                            "discountSetting": {
                                                "discountType": "PERCENTAGE",
                                                "discountPercentage": 0,
                                            },
                                        }
                                    ]
                                }
                            ],
                        },
                    },
                    {
                        "id": "paid-item-3",
                        "title": "Normal Paid Game",
                        "promotions": None,
                    },
                ]
            }
        }
    }
}


class EpicFreeGamesProviderTests(TestCase):
    @patch("apps.freegames.services.providers.epic.httpx.Client")
    def test_fetch_free_games_parses_current_and_upcoming(self, mock_client_cls):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.json.return_value = MOCK_EPIC_API_RESPONSE
        mock_response.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = EpicFreeGamesProvider()
        items = provider.fetch_free_games()

        self.assertEqual(len(items), 2)

        # First item: active freebie
        active_item = items[0]
        self.assertEqual(active_item.title, "Cosmic Mystery Adventure")
        self.assertTrue(active_item.is_free_now)
        self.assertEqual(active_item.original_price, "$29.99")
        self.assertEqual(
            active_item.claim_url, "https://store.epicgames.com/p/cosmic-mystery-adventure-offer"
        )
        self.assertEqual(active_item.poster_url, "https://img.epic.com/tall.jpg")
        self.assertEqual(active_item.backdrop_url, "https://img.epic.com/wide.jpg")
        self.assertEqual(active_item.start_date, "2026-09-24T15:00:00.000Z")
        self.assertEqual(active_item.end_date, "2026-10-01T15:00:00.000Z")

        # Second item: upcoming freebie
        upcoming_item = items[1]
        self.assertEqual(upcoming_item.title, "Future Cyber War")
        self.assertFalse(upcoming_item.is_free_now)
        self.assertEqual(upcoming_item.original_price, "$49.99")
        self.assertEqual(
            upcoming_item.claim_url, "https://store.epicgames.com/p/future-cyber-war-offer"
        )

    @patch("apps.freegames.services.providers.epic.httpx.Client")
    def test_fetch_free_games_handles_network_failure(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("Connection timed out")
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = EpicFreeGamesProvider()
        items = provider.fetch_free_games()
        self.assertEqual(items, [])


class SteamFreeGamesProviderTests(TestCase):
    @patch("apps.freegames.services.providers.steam.httpx.Client")
    def test_fetch_free_games_parses_100_percent_off_only(self, mock_client_cls):
        mock_client = MagicMock()
        mock_response = MagicMock()
        mock_response.text = MOCK_STEAM_SEARCH_HTML
        mock_response.raise_for_status = MagicMock()
        mock_client.get.return_value = mock_response
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = SteamFreeGamesProvider(max_pages=1)
        items = provider.fetch_free_games()

        self.assertEqual(len(items), 2)
        by_id = {item.external_id: item for item in items}

        tf2 = by_id["440"]
        self.assertEqual(tf2.title, "Team Fortress 2")
        self.assertEqual(tf2.store, "steam")
        self.assertTrue(tf2.is_free_now)
        self.assertEqual(tf2.original_price, "$19.99")
        self.assertEqual(tf2.claim_url, "https://store.steampowered.com/app/440")
        self.assertIn("library_600x900", tf2.poster_url or "")
        self.assertIn("library_hero", tf2.backdrop_url or "")
        self.assertIsNone(tf2.logo_url)

        cs2 = by_id["730"]
        self.assertEqual(cs2.title, "Counter-Strike 2 Free")
        self.assertNotIn("570", by_id)  # 50% off excluded

    @patch("apps.freegames.services.providers.steam.httpx.Client")
    def test_fetch_free_games_parses_dlc_and_subs(self, mock_client_cls):
        search_html = """
        <html><body>
        <a href="https://store.steampowered.com/app/2000000" data-ds-appid="2000000" data-discount="100">
          <img src="https://cdn.akamai.steamstatic.com/steam/apps/2000000/capsule_184x69.jpg">
          <span class="title">Rotwood: Drakin Armoury Pack</span>
          <div class="discount_original_price">$4.99</div>
          <div class="discount_pct">-100%</div>
        </a>
        <a href="https://store.steampowered.com/sub/987654" data-ds-packageid="987654" data-discount="100">
          <img src="https://cdn.akamai.steamstatic.com/steam/subs/987654/capsule_184x69.jpg">
          <span class="title">Special Bonus Pack</span>
          <div class="discount_original_price">$9.99</div>
          <div class="discount_pct">-100%</div>
        </a>
        </body></html>
        """
        mock_client = MagicMock()
        mock_search_resp = MagicMock()
        mock_search_resp.text = search_html
        mock_search_resp.status_code = 200
        mock_search_resp.raise_for_status = MagicMock()

        mock_appdetails_resp = MagicMock()
        mock_appdetails_resp.status_code = 200
        mock_appdetails_resp.json.return_value = {
            "2000000": {
                "success": True,
                "data": {
                    "type": "dlc",
                    "fullgame": {
                        "appid": 1801200,
                        "name": "Rotwood",
                    },
                    "header_image": "https://cdn.akamai.steamstatic.com/steam/apps/2000000/header.jpg",
                },
            }
        }

        def fake_get(url, *args, **kwargs):
            if "appdetails" in url:
                return mock_appdetails_resp
            return mock_search_resp

        mock_client.get.side_effect = fake_get
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = SteamFreeGamesProvider(max_pages=1)
        items = provider.fetch_free_games()

        self.assertEqual(len(items), 2)
        by_id = {item.external_id: item for item in items}

        dlc_item = by_id["2000000"]
        self.assertEqual(dlc_item.title, "Rotwood: Drakin Armoury Pack")
        self.assertEqual(dlc_item.item_type, "pack")
        self.assertEqual(dlc_item.base_game_title, "Rotwood")
        self.assertEqual(dlc_item.base_game_id, "1801200")
        self.assertEqual(
            dlc_item.poster_url, "https://cdn.akamai.steamstatic.com/steam/apps/2000000/header.jpg"
        )
        self.assertEqual(dlc_item.claim_url, "https://store.steampowered.com/app/2000000")

        sub_item = by_id["987654"]
        self.assertEqual(sub_item.title, "Special Bonus Pack")
        self.assertEqual(sub_item.item_type, "pack")
        self.assertEqual(sub_item.claim_url, "https://store.steampowered.com/sub/987654")

    @patch("apps.freegames.services.providers.steam.httpx.Client")
    def test_fetch_free_games_handles_network_failure(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client.get.side_effect = Exception("Connection timed out")
        mock_client.__enter__.return_value = mock_client
        mock_client_cls.return_value = mock_client

        provider = SteamFreeGamesProvider()
        self.assertEqual(provider.fetch_free_games(), [])


class DummyProvider(BaseFreeGamesProvider):
    @property
    def store_id(self) -> str:
        return "dummy"

    @property
    def store_name(self) -> str:
        return "Dummy Store"

    def fetch_free_games(self) -> list[FreeGameItem]:
        return [
            FreeGameItem(
                id="dummy:game-1",
                store="dummy",
                store_name="Dummy Store",
                title="Matched Game",
                is_free_now=True,
                original_price="$19.99",
            ),
            FreeGameItem(
                id="dummy:game-2",
                store="dummy",
                store_name="Dummy Store",
                title="Unmatched Future Game",
                is_free_now=False,
                original_price="$9.99",
            ),
        ]


class FreeGamesAggregatorTests(TestCase):
    def setUp(self):
        cache.delete(CACHE_KEY)

    def tearDown(self):
        cache.delete(CACHE_KEY)

    @patch("apps.media.services.igdb.configured", return_value=False)
    def test_aggregator_groups_and_caches_results(self, _configured):
        aggregator = FreeGamesAggregator(providers=[DummyProvider()])

        # Call 1: Populates cache
        res1 = aggregator.get_free_games(use_cache=True)
        self.assertEqual(len(res1["current"]), 1)
        self.assertEqual(len(res1["upcoming"]), 1)
        self.assertEqual(res1["current"][0]["title"], "Matched Game")
        self.assertEqual(res1["upcoming"][0]["title"], "Unmatched Future Game")

        # Check cache is set
        cached = cache.get(CACHE_KEY)
        self.assertIsNotNone(cached)
        self.assertEqual(cached["total"], 2)

    @patch("apps.media.services.igdb.configured", return_value=False)
    def test_aggregator_matches_local_catalog(self, _configured):
        # Create a matching catalog game
        MediaItem.objects.create(
            media_type="game",
            title="Matched Game",
            overview="A great matched game.",
        )

        aggregator = FreeGamesAggregator(providers=[DummyProvider()])
        res = aggregator.get_free_games(use_cache=False)

        current = res["current"][0]
        self.assertTrue(current["matched"])
        self.assertIsNotNone(current["media_item"])
        self.assertEqual(current["media_item"]["title"], "Matched Game")
        # Carousel payload uses the summary shape, not full detail.
        self.assertIn("poster_url", current["media_item"])
        self.assertNotIn("credits", current["media_item"])
        self.assertEqual(current["description"], "A great matched game.")

    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_aggregator_auto_hydrates_unmatched_game_from_igdb_by_epic_id(
        self, mock_igdb_provider_cls, _configured
    ):
        mock_provider = MagicMock()
        mock_igdb_provider_cls.return_value = mock_provider
        mock_provider.lookup_epic_ids.return_value = {"offer-999": 12345}
        mock_provider.get_game.return_value = {
            "id": 12345,
            "name": "Hydrated Epic Adventure",
            "slug": "hydrated-epic-adventure",
            "summary": "An epic adventure in the cosmos.",
            "first_release_date": 1700000000,
            "cover": {"image_id": "cover_123"},
            "genres": [{"name": "Action"}],
            "platforms": [{"name": "PC (Microsoft Windows)"}],
        }

        class EpicSingleProvider(BaseFreeGamesProvider):
            @property
            def store_id(self) -> str:
                return "epic"

            @property
            def store_name(self) -> str:
                return "Epic Games"

            def fetch_free_games(self) -> list[FreeGameItem]:
                return [
                    FreeGameItem(
                        id="epic:ns:offer-999",
                        store="epic",
                        store_name="Epic Games",
                        title="Hydrated Epic Adventure",
                        is_free_now=True,
                        external_id="ns:offer-999",
                        original_price="$39.99",
                    )
                ]

        aggregator = FreeGamesAggregator(providers=[EpicSingleProvider()])
        res = aggregator.get_free_games(use_cache=False)

        self.assertEqual(len(res["current"]), 1)
        item = res["current"][0]
        self.assertTrue(item["matched"])
        self.assertIsNotNone(item["media_item"])
        self.assertEqual(item["media_item"]["title"], "Hydrated Epic Adventure")
        self.assertEqual(item["description"], "An epic adventure in the cosmos.")
        self.assertIn("poster_url", item["media_item"])

        # Verify MediaItem and Game models were created in the database
        db_item = MediaItem.objects.filter(title="Hydrated Epic Adventure").first()
        self.assertIsNotNone(db_item)
        self.assertTrue(hasattr(db_item, "game"))

    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_aggregator_auto_hydrates_unmatched_game_by_title_search(
        self, mock_igdb_provider_cls, _configured
    ):
        mock_provider = MagicMock()
        mock_igdb_provider_cls.return_value = mock_provider
        mock_provider.lookup_epic_ids.return_value = {}  # No epic match
        mock_provider.search_games_by_name.return_value = [
            {"id": 54321, "name": "Mystery of the Void"}
        ]
        mock_provider.get_game.return_value = {
            "id": 54321,
            "name": "Mystery of the Void",
            "slug": "mystery-of-the-void",
            "summary": "Deep space mystery game.",
            "first_release_date": 1710000000,
            "cover": {"image_id": "void_cov"},
        }

        class TitleOnlyProvider(BaseFreeGamesProvider):
            @property
            def store_id(self) -> str:
                return "epic"

            @property
            def store_name(self) -> str:
                return "Epic Games"

            def fetch_free_games(self) -> list[FreeGameItem]:
                return [
                    FreeGameItem(
                        id="epic:mystery-void",
                        store="epic",
                        store_name="Epic Games",
                        title="Mystery of the Void: Deluxe Edition",
                        is_free_now=True,
                        external_id="unknown-offer",
                    )
                ]

        aggregator = FreeGamesAggregator(providers=[TitleOnlyProvider()])
        res = aggregator.get_free_games(use_cache=False)

        self.assertEqual(len(res["current"]), 1)
        item = res["current"][0]
        self.assertTrue(item["matched"])
        self.assertEqual(item["media_item"]["title"], "Mystery of the Void")

    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_aggregator_auto_hydrates_unmatched_steam_game_by_app_id(
        self, mock_igdb_provider_cls, _configured
    ):
        mock_provider = MagicMock()
        mock_igdb_provider_cls.return_value = mock_provider
        mock_provider.lookup_steam_app_ids.return_value = {440: 123}
        mock_provider.get_game.return_value = {
            "id": 123,
            "name": "Team Fortress 2",
            "slug": "team-fortress-2",
            "summary": "Nine classes of mayhem.",
            "first_release_date": 1191974400,
            "cover": {"image_id": "tf2_cov"},
        }

        class SteamSingleProvider(BaseFreeGamesProvider):
            @property
            def store_id(self) -> str:
                return "steam"

            @property
            def store_name(self) -> str:
                return "Steam"

            def fetch_free_games(self) -> list[FreeGameItem]:
                return [
                    FreeGameItem(
                        id="steam:440",
                        store="steam",
                        store_name="Steam",
                        title="Team Fortress 2",
                        is_free_now=True,
                        external_id="440",
                        original_price="$19.99",
                        claim_url="https://store.steampowered.com/app/440",
                    )
                ]

        aggregator = FreeGamesAggregator(providers=[SteamSingleProvider()])
        res = aggregator.get_free_games(use_cache=False)

        self.assertEqual(len(res["current"]), 1)
        item = res["current"][0]
        self.assertTrue(item["matched"])
        self.assertEqual(item["media_item"]["title"], "Team Fortress 2")
        mock_provider.lookup_steam_app_ids.assert_called_with([440])
        self.assertGreaterEqual(mock_provider.lookup_steam_app_ids.call_count, 1)

    @patch("apps.media.services.igdb.configured", return_value=False)
    def test_aggregator_degrades_gracefully_when_igdb_unconfigured(self, _configured):
        class UnknownProvider(BaseFreeGamesProvider):
            @property
            def store_id(self) -> str:
                return "epic"

            @property
            def store_name(self) -> str:
                return "Epic Games"

            def fetch_free_games(self) -> list[FreeGameItem]:
                return [
                    FreeGameItem(
                        id="epic:completely-unknown",
                        store="epic",
                        store_name="Epic Games",
                        title="Completely Unknown Indie Title 2099",
                        is_free_now=True,
                    )
                ]

        aggregator = FreeGamesAggregator(providers=[UnknownProvider()])
        res = aggregator.get_free_games(use_cache=False)
        self.assertEqual(len(res["current"]), 1)
        item = res["current"][0]
        self.assertFalse(item["matched"])
        self.assertIsNone(item["media_item"])

    @patch("apps.media.services.igdb.configured", return_value=True)
    @patch("apps.media.services.igdb.IGDBProvider")
    def test_aggregator_preserves_dlc_pack_title_and_links_base_game(
        self, mock_igdb_provider_cls, _configured
    ):
        mock_provider = MagicMock()
        mock_igdb_provider_cls.return_value = mock_provider
        mock_provider.lookup_steam_app_ids.return_value = {2015270: 999}
        mock_provider.get_game.return_value = {
            "id": 999,
            "name": "Rotwood",
            "slug": "rotwood",
            "summary": "Hack and slash through corrupted forests.",
            "first_release_date": 1714000000,
            "cover": {"image_id": "rotwood_cov"},
        }

        class SteamDLCProvider(BaseFreeGamesProvider):
            @property
            def store_id(self) -> str:
                return "steam"

            @property
            def store_name(self) -> str:
                return "Steam"

            def fetch_free_games(self) -> list[FreeGameItem]:
                return [
                    FreeGameItem(
                        id="steam:5067220",
                        store="steam",
                        store_name="Steam",
                        title="Rotwood: Drakin Armoury Pack",
                        is_free_now=True,
                        external_id="5067220",
                        original_price="$4.99",
                        claim_url="https://store.steampowered.com/app/5067220",
                        poster_url="https://shared.fastly.steamstatic.com/dlc_header.jpg",
                        item_type="pack",
                        base_game_title="Rotwood",
                        base_game_id="2015270",
                    )
                ]

        aggregator = FreeGamesAggregator(providers=[SteamDLCProvider()])
        res = aggregator.get_free_games(use_cache=False)

        self.assertEqual(len(res["current"]), 1)
        item = res["current"][0]
        # Title MUST NOT be replaced with the base game title!
        self.assertEqual(item["title"], "Rotwood: Drakin Armoury Pack")
        self.assertEqual(item["item_type"], "pack")
        self.assertEqual(item["base_game_title"], "Rotwood")
        self.assertEqual(item["poster_url"], "https://shared.fastly.steamstatic.com/dlc_header.jpg")
        self.assertTrue(item["matched"])
        self.assertEqual(item["media_item"]["title"], "Rotwood")

        # Test promotions lookup on base game media item
        rotwood_media = MediaItem.objects.get(pk=item["media_item"]["id"])
        promos = aggregator.get_promotions_for_media_item(rotwood_media)
        self.assertEqual(len(promos), 1)
        self.assertEqual(promos[0]["title"], "Rotwood: Drakin Armoury Pack")
        self.assertEqual(promos[0]["item_type"], "pack")


class FreeGamesApiTests(TestCase):
    def setUp(self):
        cache.delete(CACHE_KEY)
        self.client = APIClient()

    def tearDown(self):
        cache.delete(CACHE_KEY)

    @patch.object(FreeGamesAggregator, "get_free_games")
    def test_get_free_games_endpoint_public(self, mock_get_free_games):
        mock_get_free_games.return_value = {
            "current": [{"id": "epic:1", "title": "Free Game 1", "is_free_now": True}],
            "upcoming": [{"id": "epic:2", "title": "Upcoming Game 2", "is_free_now": False}],
            "total": 2,
        }

        # Test both trailing and non-trailing slash
        res = self.client.get("/api/v1/free-games/")
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(len(res.data["current"]), 1)
        self.assertEqual(len(res.data["upcoming"]), 1)

        res2 = self.client.get("/api/v1/free-games")
        self.assertEqual(res2.status_code, status.HTTP_200_OK)


class GOGFreeGamesProviderTests(TestCase):
    @patch("apps.freegames.services.providers.gog.httpx.Client")
    def test_fetch_free_games_parses_gamerpower_and_catalog(self, mock_client_cls):
        mock_client = MagicMock()
        mock_client_cls.return_value.__enter__.return_value = mock_client

        # 1. Gamerpower response
        gamerpower_resp = MagicMock()
        gamerpower_resp.status_code = 200
        gamerpower_resp.json.return_value = [
            {
                "id": 3801,
                "title": "Bounty Train (GOG) Giveaway",
                "worth": "$9.99",
                "thumbnail": "https://img.gamerpower.com/thumb.jpg",
                "image": "https://img.gamerpower.com/image.jpg",
                "description": "Rail simulation game.",
                "open_giveaway_url": "https://www.gamerpower.com/open/bounty-train",
                "published_date": "2026-10-02 09:30:56",
                "end_date": "2026-10-05 23:59:00",
            }
        ]

        # 2. GOG Catalog query lookup response for Bounty Train
        lookup_resp = MagicMock()
        lookup_resp.status_code = 200
        lookup_resp.json.return_value = {
            "products": [
                {
                    "id": 1455194922,
                    "title": "Bounty Train",
                    "slug": "bounty_train",
                    "coverVertical": "https://images.gog.com/cover_v.jpg",
                    "coverHorizontal": "https://images.gog.com/cover_h.jpg",
                }
            ]
        }

        # 3. GOG Catalog discounted query response
        catalog_resp = MagicMock()
        catalog_resp.status_code = 200
        catalog_resp.json.return_value = {
            "products": [
                {
                    "id": 1944143058,
                    "title": "Second Free Game",
                    "slug": "second_free_game",
                    "coverVertical": "https://images.gog.com/second_v.jpg",
                    "price": {"base": "$14.99"},
                }
            ]
        }

        def mock_get(url, **kwargs):
            if "gamerpower" in url:
                return gamerpower_resp
            elif "query=like:" in url:
                return lookup_resp
            else:
                return catalog_resp

        mock_client.get.side_effect = mock_get

        from apps.freegames.services.providers.gog import GOGFreeGamesProvider

        provider = GOGFreeGamesProvider()
        items = provider.fetch_free_games()

        self.assertEqual(len(items), 2)
        bounty = next(i for i in items if i.title == "Bounty Train")
        self.assertEqual(bounty.store, "gog")
        self.assertEqual(bounty.external_id, "1455194922")
        self.assertEqual(bounty.claim_url, "https://www.gog.com/en/game/bounty_train")
        self.assertEqual(bounty.original_price, "$9.99")

        second = next(i for i in items if i.title == "Second Free Game")
        self.assertEqual(second.external_id, "1944143058")
        self.assertEqual(second.claim_url, "https://www.gog.com/en/game/second_free_game")
        self.assertEqual(second.original_price, "$14.99")
