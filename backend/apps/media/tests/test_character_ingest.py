"""Tests for game character ingest, backfill, and API endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

from django.contrib.contenttypes.models import ContentType
from django.core.management import call_command
from django.test import TestCase
from rest_framework.test import APIClient

from apps.media.models import Character, ExternalID, Game, MediaCharacter, MediaItem
from core.providers.igdb.hydrators import _upsert_game_characters, seed_game_from_igdb


class CharacterIngestTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.media = MediaItem.objects.create(
            media_type="game",
            title="The Witcher 3: Wild Hunt",
            slug="the-witcher-3-wild-hunt",
        )
        self.game = Game.objects.create(media_item=self.media)

    def test_upsert_game_characters_creates_characters_and_links(self):
        raw_characters = [
            {
                "id": 101,
                "name": "Geralt of Rivia",
                "slug": "geralt-of-rivia",
                "description": "A legendary Witcher of the School of the Wolf.",
                "gender": 1,  # male
                "species": 1,  # human
                "mug_shot": {"id": 55, "image_id": "geralt_mug"},
            },
            {
                "id": 102,
                "name": "Yennefer of Vengerberg",
                "slug": "yennefer-of-vengerberg",
                "description": "A powerful sorceress and love interest of Geralt.",
                "gender": 2,  # female
                "species": 1,  # human
                "mug_shot": {"id": 56, "image_id": "yennefer_mug"},
            },
        ]

        _upsert_game_characters(self.media, raw_characters)

        self.assertEqual(Character.objects.count(), 2)
        self.assertEqual(MediaCharacter.objects.filter(media_item=self.media).count(), 2)

        geralt = Character.objects.get(slug="geralt-of-rivia")
        self.assertEqual(geralt.name, "Geralt of Rivia")
        self.assertEqual(geralt.gender, "male")
        self.assertEqual(geralt.species, "human")
        self.assertIn("geralt_mug.jpg", geralt.mug_shot_url)

        # Check ExternalID
        char_ct = ContentType.objects.get_for_model(Character)
        ext = ExternalID.objects.get(content_type=char_ct, object_id=geralt.pk)
        self.assertEqual(ext.provider, "igdb")
        self.assertEqual(ext.external_id, "101")

        # Idempotency check: re-running should not duplicate
        _upsert_game_characters(self.media, raw_characters)
        self.assertEqual(Character.objects.count(), 2)
        self.assertEqual(MediaCharacter.objects.filter(media_item=self.media).count(), 2)

    def test_character_across_multiple_games(self):
        game2 = MediaItem.objects.create(
            media_type="game",
            title="Soulcalibur VI",
            slug="soulcalibur-vi",
        )
        raw_char = [
            {
                "id": 101,
                "name": "Geralt of Rivia",
                "slug": "geralt-of-rivia",
                "description": "A legendary Witcher.",
                "gender": 1,
                "species": 1,
                "mug_shot": {"image_id": "geralt_mug"},
            }
        ]

        _upsert_game_characters(self.media, raw_char)
        _upsert_game_characters(game2, raw_char)

        # Only one Character row created, but two MediaCharacter links
        self.assertEqual(Character.objects.filter(slug="geralt-of-rivia").count(), 1)
        self.assertEqual(
            MediaCharacter.objects.filter(character__slug="geralt-of-rivia").count(), 2
        )

    def test_seed_game_from_igdb_includes_characters(self):
        raw_game = {
            "id": 1942,
            "name": "Super Mario Odyssey",
            "slug": "super-mario-odyssey",
            "first_release_date": 1508976000,
            "characters": [
                {
                    "id": 201,
                    "name": "Mario",
                    "slug": "mario",
                    "description": "The Italian plumber hero of the Mushroom Kingdom.",
                    "gender": 1,
                    "species": 1,
                    "mug_shot": {"image_id": "mario_mug"},
                },
                {
                    "id": 202,
                    "name": "Bowser",
                    "slug": "bowser",
                    "description": "King of the Koopas.",
                    "gender": 1,
                    "species": 3,  # animal / monster
                    "mug_shot": {"image_id": "bowser_mug"},
                },
            ],
        }

        media_id = seed_game_from_igdb(raw_game, 1942)
        m = MediaItem.objects.get(pk=media_id)
        self.assertEqual(m.characters.count(), 2)

        mario = m.characters.first().character
        self.assertEqual(mario.name, "Mario")
        self.assertEqual(mario.gender, "male")


class CharacterApiTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.media = MediaItem.objects.create(
            media_type="game",
            title="The Witcher 3",
            slug="the-witcher-3",
        )
        self.game = Game.objects.create(media_item=self.media)
        self.character = Character.objects.create(
            name="Geralt of Rivia",
            slug="geralt-of-rivia",
            description="The White Wolf.",
            gender="male",
            species="human",
            mug_shot_url="https://images.igdb.com/igdb/image/upload/t_cover_big/geralt.jpg",
        )
        MediaCharacter.objects.create(media_item=self.media, character=self.character, order=0)

    def test_media_game_detail_endpoint_includes_characters(self):
        response = self.client.get(f"/api/v1/media/game/{self.media.pk}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("characters", data)
        self.assertEqual(len(data["characters"]), 1)
        char_item = data["characters"][0]
        self.assertEqual(char_item["character"]["name"], "Geralt of Rivia")
        self.assertEqual(char_item["character"]["gender"], "male")
        self.assertEqual(char_item["character"]["species"], "human")

    def test_character_detail_endpoint_by_id(self):
        response = self.client.get(f"/api/v1/character/{self.character.pk}")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["name"], "Geralt of Rivia")
        self.assertEqual(data["slug"], "geralt-of-rivia")
        self.assertIn("games", data)
        self.assertEqual(len(data["games"]), 1)
        self.assertEqual(data["games"][0]["title"], "The Witcher 3")

    def test_character_detail_endpoint_by_slug(self):
        response = self.client.get("/api/v1/character/geralt-of-rivia")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["id"], self.character.pk)

    def test_character_list_search(self):
        response = self.client.get("/api/v1/character/?search=Geralt")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        results = data.get("results", data)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["name"], "Geralt of Rivia")


class BackfillGameCharactersCommandTests(TestCase):
    def setUp(self):
        self.media = MediaItem.objects.create(
            media_type="game",
            title="Cyberpunk 2077",
            slug="cyberpunk-2077",
        )
        self.game = Game.objects.create(media_item=self.media)
        media_ct = ContentType.objects.get_for_model(MediaItem)
        ExternalID.objects.create(
            content_type=media_ct,
            object_id=self.media.pk,
            provider="igdb",
            external_id="1877",
        )

    @patch("apps.media.management.commands.backfill_game_characters.IGDBProvider")
    def test_backfill_command(self, mock_provider_cls):
        mock_provider = mock_provider_cls.return_value
        mock_provider.get_game_characters = AsyncMock(
            return_value=[
                {
                    "id": 501,
                    "name": "Johnny Silverhand",
                    "slug": "johnny-silverhand",
                    "description": "Legendary rockerboy and frontman of Samurai.",
                    "gender": 1,
                    "species": 1,
                    "mug_shot": {"image_id": "johnny_mug"},
                }
            ]
        )

        call_command("backfill_game_characters", game_id=self.media.pk, delay=0)

        self.assertEqual(Character.objects.count(), 1)
        char = Character.objects.get(slug="johnny-silverhand")
        self.assertEqual(char.name, "Johnny Silverhand")
        self.assertEqual(self.media.characters.count(), 1)
        self.assertEqual(self.media.characters.first().character, char)

    def test_character_scoping_isolates_unrelated_games(self):
        from apps.media.services.character_enrichment import get_or_create_character_for_media

        game1 = MediaItem.objects.create(media_type="game", title="God of War", slug="god-of-war")
        game2 = MediaItem.objects.create(media_type="game", title="Hades II", slug="hades-ii")

        char1, created1 = get_or_create_character_for_media(game1, "Zeus")
        self.assertTrue(created1)
        self.assertEqual(char1.slug, "zeus")
        MediaCharacter.objects.create(media_item=game1, character=char1, order=0)

        # Game 2 creates Zeus - must not reuse Game 1's Zeus
        char2, created2 = get_or_create_character_for_media(game2, "Zeus")
        self.assertTrue(created2)
        self.assertNotEqual(char1.pk, char2.pk)
        self.assertEqual(char2.slug, "hades-ii-zeus")

    @patch("apps.media.services.character_enrichment.enrich_game_characters")
    @patch("apps.media.services.game_credits.hydrate_game_credits")
    def test_automated_hydration_task(self, mock_hydrate, mock_enrich):
        from apps.media.tasks import hydrate_game_characters_and_credits_task

        mock_hydrate.return_value = 5
        mock_enrich.return_value = 10

        res = hydrate_game_characters_and_credits_task(self.media.pk)
        self.assertEqual(res["status"], "success")
        self.assertEqual(res["credits_hydrated"], 5)
        self.assertEqual(res["characters_enriched"], 10)
