"""Tests for Game Editions identification, deduplication, and serialization."""

from datetime import date

from django.test import TestCase

from apps.media.models import ExternalID, Game, GameEdition, MediaItem
from apps.media.serializers.catalog import GameDetailSerializer, MediaItemDetailSerializer
from apps.media.services.game_edition import (
    find_canonical_base_game,
    is_duplicate_edition,
    resolve_or_create_game_edition,
)


class GameEditionDetectionTests(TestCase):
    def test_duplicate_edition_heuristics_positive(self):
        cases = [
            ("The Witcher 3: Wild Hunt - Game of the Year Edition", "Game of the Year Edition"),
            ("Cyberpunk 2077: Ultimate Edition", "Ultimate Edition"),
            ("Control Ultimate Edition", "Ultimate Edition"),
            ("Doom: Eternal - Deluxe Edition", "Deluxe Edition"),
            ("Stellar Blade: Complete Edition", "Complete Edition"),
            ("Divinity: Original Sin II - Definitive Edition", "Definitive Edition"),
            ("Euro Truck Simulator: Gold Edition", "Gold Edition"),
            ("Resident Evil 7: Biohazard - Gold Edition", "Gold Edition"),
            ("Saints Row IV: Re-Elected", "Re-Elected"),
            ("Death Stranding Director's Cut", "Director's Cut"),
            ("Sniper Elite 5: Complete Edition", "Complete Edition"),
        ]
        for title, expected_name in cases:
            with self.subTest(title=title):
                is_ed, name = is_duplicate_edition(title)
                self.assertTrue(is_ed, f"Expected {title!r} to be recognized as duplicate edition")
                self.assertEqual(name, expected_name)

    def test_standalone_titles_excluded(self):
        standalone_titles = [
            "Super Smash Bros. Ultimate",
            "Black Gold",
            "Siralim Ultimate",
            "Fatal Fury Special",
            "Super Mario Bros. Special",
            "Super Fire Pro Wrestling Special",
            "Mario Bros. Special",
            "Empire Deluxe",
        ]
        for title in standalone_titles:
            with self.subTest(title=title):
                is_ed, _ = is_duplicate_edition(title)
                self.assertFalse(is_ed, f"Expected {title!r} to NOT be recognized as duplicate edition")

    def test_remakes_and_standalone_expansions_excluded_by_igdb_category(self):
        # Category 8 = Remake (e.g. Resident Evil 4)
        is_ed, _ = is_duplicate_edition("Resident Evil 4", igdb_category=8)
        self.assertFalse(is_ed)

        # Category 4 = Standalone expansion (e.g. Spider-Man: Miles Morales)
        is_ed, _ = is_duplicate_edition("Marvel's Spider-Man: Miles Morales", igdb_category=4)
        self.assertFalse(is_ed)

    def test_explicit_version_parent_id_from_igdb(self):
        is_ed, name = is_duplicate_edition(
            "Persona 5 Royal",
            version_parent_id=12345,
            parent_name="Persona 5",
        )
        self.assertTrue(is_ed)
        self.assertIn("Royal", name)


class GameEditionModelAndResolutionTests(TestCase):
    def setUp(self):
        self.base_item = MediaItem.objects.create(
            media_type="game",
            title="The Witcher 3: Wild Hunt",
            slug="the-witcher-3-wild-hunt",
        )
        self.base_game = Game.objects.create(media_item=self.base_item)

    def test_resolve_or_create_game_edition(self):
        edition_data = {
            "name": "Game of the Year Edition",
            "raw_title": "The Witcher 3: Wild Hunt - Game of the Year Edition",
            "igdb_id": "12345",
            "release_date": date(2016, 8, 30),
            "external_ids": {"steam": "292030"},
            "summary": "Includes Hearts of Stone and Blood and Wine.",
            "is_default": False,
        }

        edition = resolve_or_create_game_edition(self.base_item, edition_data)
        self.assertEqual(edition.name, "Game of the Year Edition")
        self.assertEqual(edition.game, self.base_game)
        self.assertEqual(edition.igdb_id, "12345")
        self.assertEqual(edition.external_ids, {"steam": "292030"})

        # Re-resolving with additional IDs merges cleanly
        updated_data = {
            "name": "Game of the Year Edition",
            "igdb_id": "12345",
            "external_ids": {"gog": "1495134320"},
        }
        updated_edition = resolve_or_create_game_edition(self.base_item, updated_data)
        self.assertEqual(updated_edition.id, edition.id)
        self.assertEqual(updated_edition.external_ids.get("steam"), "292030")
        self.assertEqual(updated_edition.external_ids.get("gog"), "1495134320")

    def test_find_canonical_base_game_by_stripped_title(self):
        found = find_canonical_base_game("The Witcher 3: Wild Hunt - Game of the Year Edition")
        self.assertIsNotNone(found)
        self.assertEqual(found.id, self.base_item.id)

    def test_game_detail_serialization_includes_editions(self):
        resolve_or_create_game_edition(
            self.base_item,
            {
                "name": "Game of the Year Edition",
                "raw_title": "The Witcher 3: Wild Hunt - Game of the Year Edition",
                "igdb_id": "12345",
            },
        )
        serializer = MediaItemDetailSerializer(self.base_item)
        data = serializer.data
        self.assertIn("game", data)
        editions = data["game"]["editions"]
        self.assertEqual(len(editions), 1)
        self.assertEqual(editions[0]["name"], "Game of the Year Edition")
        self.assertEqual(editions[0]["raw_title"], "The Witcher 3: Wild Hunt - Game of the Year Edition")
