"""Tests for SteamGridDB resolution of unmatched GOG games."""

from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase, override_settings
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from apps.integrations.models import UserGOGGame
from apps.integrations.services.gog_steamgrid import resolve_unmatched_gog_with_steamgrid
from apps.media.models import ExternalID, Game, MediaAsset, MediaItem

User = get_user_model()


class MockSteamGridProvider:
    def __init__(self, platform_data=None, search_data=None):
        self.platform_data = platform_data or {}
        self.search_data = search_data or []

    async def get_game_by_platform_id(self, platform: str, platform_id: str | int):
        return self.platform_data.get(str(platform_id))

    async def search_games(self, query: str):
        return self.search_data

    async def get_grids(self, game_id: int):
        return [
            {
                "id": 101,
                "url": "https://cdn.steamgriddb.com/grid/101.png",
                "width": 600,
                "height": 900,
                "score": 10,
                "style": "alternate",
                "language": "en",
            }
        ]

    async def get_heroes(self, game_id: int):
        return [
            {
                "id": 201,
                "url": "https://cdn.steamgriddb.com/hero/201.png",
                "width": 1920,
                "height": 620,
                "score": 8,
                "style": "material",
                "language": "en",
            }
        ]

    async def get_logos(self, game_id: int):
        return [
            {
                "id": 301,
                "url": "https://cdn.steamgriddb.com/logo/301.png",
                "width": 400,
                "height": 200,
                "score": 9,
                "style": "official",
                "language": "en",
            }
        ]

    async def get_icons(self, game_id: int):
        return [
            {
                "id": 401,
                "url": "https://cdn.steamgriddb.com/icon/401.ico",
                "width": 64,
                "height": 64,
                "score": 5,
                "style": "official",
                "language": "en",
            }
        ]


class GOGSteamGridResolutionTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="testuser", password="password")
        self.token = Token.objects.create(user=self.user)
        self.client = APIClient()
        self.client.credentials(HTTP_AUTHORIZATION=f"Token {self.token.key}")

    @override_settings(STEAMGRID_API_KEY="")
    def test_raises_without_api_key(self):
        UserGOGGame.objects.create(
            user=self.user,
            game_id="12345",
            title="The Witcher 3: Wild Hunt",
        )
        with self.assertRaises(ValueError) as ctx:
            resolve_unmatched_gog_with_steamgrid(self.user)
        self.assertIn("SteamGridDB API key is not configured", str(ctx.exception))

    def test_matches_via_platform_id_and_creates_catalog(self):
        gog_game = UserGOGGame.objects.create(
            user=self.user,
            game_id="1207658924",
            title="The Witcher 3: Wild Hunt",
        )

        mock_provider = MockSteamGridProvider(
            platform_data={
                "1207658924": {"id": 5001, "name": "The Witcher 3: Wild Hunt"},
            }
        )

        res = resolve_unmatched_gog_with_steamgrid(
            self.user,
            delay=0,
            provider=mock_provider,
        )

        self.assertEqual(res["total"], 1)
        self.assertEqual(res["matched"], 1)
        self.assertEqual(res["failed"], 0)
        self.assertGreater(res["assets_added"], 0)

        gog_game.refresh_from_db()
        self.assertIsNotNone(gog_game.media_item_id)

        media = gog_game.media_item
        self.assertEqual(media.title, "The Witcher 3: Wild Hunt")
        self.assertEqual(media.media_type, "game")
        self.assertTrue(Game.objects.filter(media_item=media).exists())

        # Check ExternalIDs
        self.assertTrue(
            ExternalID.objects.filter(
                provider="steamgrid", external_id="5001", object_id=media.id
            ).exists()
        )
        self.assertTrue(
            ExternalID.objects.filter(
                provider="gog", external_id="1207658924", object_id=media.id
            ).exists()
        )

        # Check Artwork assets
        self.assertTrue(MediaAsset.objects.filter(media_item=media, asset_type="poster").exists())
        self.assertTrue(MediaAsset.objects.filter(media_item=media, asset_type="backdrop").exists())
        self.assertTrue(MediaAsset.objects.filter(media_item=media, asset_type="logo").exists())
        self.assertTrue(MediaAsset.objects.filter(media_item=media, asset_type="icon").exists())

    def test_falls_back_to_title_search(self):
        gog_game = UserGOGGame.objects.create(
            user=self.user,
            game_id="99999",
            title="Thronebreaker: The Witcher Tales",
        )

        mock_provider = MockSteamGridProvider(
            platform_data={},  # no platform hit
            search_data=[
                {"id": 6002, "name": "Thronebreaker: The Witcher Tales"},
            ],
        )

        res = resolve_unmatched_gog_with_steamgrid(
            self.user,
            delay=0,
            provider=mock_provider,
        )

        self.assertEqual(res["matched"], 1)
        gog_game.refresh_from_db()
        self.assertIsNotNone(gog_game.media_item_id)
        self.assertEqual(gog_game.media_item.title, "Thronebreaker: The Witcher Tales")

    def test_reuses_existing_media_item(self):
        existing_media = MediaItem.objects.create(
            media_type="game",
            title="Cyberpunk 2077",
            slug="cyberpunk-2077",
        )
        Game.objects.create(media_item=existing_media)
        ExternalID.objects.create(
            content_type=ContentType.objects.get_for_model(MediaItem),
            provider="steamgrid",
            external_id="7003",
            media_type="game",
            object_id=existing_media.id,
        )

        gog_game = UserGOGGame.objects.create(
            user=self.user,
            game_id="1423049311",
            title="Cyberpunk 2077",
        )

        mock_provider = MockSteamGridProvider(
            platform_data={"1423049311": {"id": 7003, "name": "Cyberpunk 2077"}},
        )

        res = resolve_unmatched_gog_with_steamgrid(
            self.user,
            delay=0,
            provider=mock_provider,
        )

        self.assertEqual(res["matched"], 1)
        gog_game.refresh_from_db()
        self.assertEqual(gog_game.media_item_id, existing_media.id)

    @override_settings(STEAMGRID_API_KEY="")
    def test_api_view_400_without_key(self):
        resp = self.client.post("/api/v1/integrations/gog/resolve-steamgrid")
        self.assertEqual(resp.status_code, 400)
        self.assertIn("SteamGridDB API key is not configured", resp.json()["detail"])

    @override_settings(STEAMGRID_API_KEY="test_key")
    @patch("apps.integrations.services.gog_steamgrid.SteamGridDBProvider")
    def test_api_view_success(self, MockProvider):
        UserGOGGame.objects.create(
            user=self.user,
            game_id="8888",
            title="Game One",
        )
        mock_instance = MockSteamGridProvider(
            platform_data={"8888": {"id": 8001, "name": "Game One"}},
        )
        MockProvider.return_value = mock_instance

        resp = self.client.post(
            "/api/v1/integrations/gog/resolve-steamgrid", {"limit": 10}, format="json"
        )
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.json()["matched"], 1)
        self.assertEqual(resp.json()["total"], 1)

    @override_settings(STEAMGRID_API_KEY="test_key")
    @patch("apps.integrations.services.gog_steamgrid.SteamGridDBProvider")
    def test_management_command(self, MockProvider):
        UserGOGGame.objects.create(
            user=self.user,
            game_id="9999",
            title="Command Game",
        )
        MockProvider.return_value = MockSteamGridProvider(
            platform_data={"9999": {"id": 9001, "name": "Command Game"}},
        )

        call_command("match_gog_steamgrid", user="testuser", limit=1, delay=0)
        self.assertTrue(
            UserGOGGame.objects.get(user=self.user, game_id="9999").media_item_id is not None
        )
