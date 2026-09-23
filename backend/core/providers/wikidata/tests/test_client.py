"""Unit tests for the Wikidata provider client and transformers."""

from unittest.mock import AsyncMock, patch

from django.test import SimpleTestCase

from core.providers.wikidata import (
    WikidataProvider,
    normalize_character_name,
    transform_cast_credit,
    transform_crew_credit,
)
from core.providers.wikidata.transformers import wikimedia_image_url


class WikidataTransformerTests(SimpleTestCase):
    def test_normalize_character_name(self):
        self.assertEqual(normalize_character_name("Maëlle"), "maelle")
        self.assertEqual(normalize_character_name("Gustave (voice)"), "gustave")
        self.assertEqual(normalize_character_name("  The Paintress  "), "the paintress")
        self.assertEqual(normalize_character_name("Geralt of Rivia (English)"), "geralt of rivia")
        self.assertEqual(normalize_character_name(""), "")
        self.assertEqual(normalize_character_name(None), "")

    def test_wikimedia_image_url(self):
        url = wikimedia_image_url("Charlie Cox 2017.jpg", width=400)
        expected = (
            "https://commons.wikimedia.org/wiki/Special:FilePath/Charlie_Cox_2017.jpg?width=400"
        )
        self.assertIn(expected, url)
        self.assertIsNone(wikimedia_image_url(None))

    def test_transform_cast_credit(self):
        credit = transform_cast_credit("Charlie Cox", "Gustave", "Charlie_Cox.jpg", sort_order=0)
        self.assertIsNotNone(credit)
        self.assertEqual(credit["person_name"], "Charlie Cox")
        self.assertEqual(credit["character_name"], "Gustave")
        self.assertEqual(credit["role"], "cast")
        self.assertIn("Charlie_Cox.jpg", credit["photo_url"])

    def test_transform_crew_credit(self):
        credit = transform_crew_credit("Andy Serkis", "director")
        self.assertIsNotNone(credit)
        self.assertEqual(credit["person_name"], "Andy Serkis")
        self.assertEqual(credit["role"], "director")


class WikidataProviderTests(SimpleTestCase):
    @patch.object(WikidataProvider, "_sparql_query", new_callable=AsyncMock)
    async def test_find_entity_by_steam_id(self, mock_sparql):
        mock_sparql.return_value = [
            {"item": {"type": "uri", "value": "http://www.wikidata.org/entity/Q126462072"}}
        ]
        provider = WikidataProvider()
        entity_id = await provider.find_entity_by_steam_id("1903340")
        self.assertEqual(entity_id, "Q126462072")
        mock_sparql.assert_awaited_once()

    @patch.object(WikidataProvider, "get_entities", new_callable=AsyncMock)
    @patch.object(WikidataProvider, "find_entity_by_steam_id", new_callable=AsyncMock)
    async def test_get_game_credits(self, mock_find, mock_entities):
        mock_find.return_value = "Q12345"
        mock_entities.side_effect = [
            # 1. Main game entity
            {
                "Q12345": {
                    "claims": {
                        "P674": [{"mainsnak": {"datavalue": {"value": {"id": "Q_CHAR1"}}}}],
                        "P57": [{"mainsnak": {"datavalue": {"value": {"id": "Q_DIR1"}}}}],
                    }
                }
            },
            # 2. Characters + Crew fetch
            {
                "Q_CHAR1": {
                    "labels": {"en": {"value": "Gustave"}},
                    "claims": {
                        "P175": [{"mainsnak": {"datavalue": {"value": {"id": "Q_ACTOR1"}}}}]
                    },
                },
                "Q_DIR1": {
                    "labels": {"en": {"value": "Guillaume Broche"}},
                    "claims": {},
                },
            },
            # 3. Person details fetch
            {
                "Q_ACTOR1": {
                    "labels": {"en": {"value": "Charlie Cox"}},
                    "claims": {"P18": [{"mainsnak": {"datavalue": {"value": "Charlie_Cox.jpg"}}}]},
                },
                "Q_DIR1": {
                    "labels": {"en": {"value": "Guillaume Broche"}},
                    "claims": {},
                },
            },
        ]

        provider = WikidataProvider()
        res = await provider.get_game_credits(steam_id="1903340")
        self.assertEqual(res["entity_id"], "Q12345")
        self.assertEqual(len(res["cast"]), 1)
        self.assertEqual(res["cast"][0]["person_name"], "Charlie Cox")
        self.assertEqual(res["cast"][0]["character_name"], "Gustave")
        self.assertEqual(len(res["crew"]), 1)
        self.assertEqual(res["crew"][0]["person_name"], "Guillaume Broche")
        self.assertEqual(res["crew"][0]["role"], "director")

    @patch.object(WikidataProvider, "find_entity_by_steam_id", new_callable=AsyncMock)
    @patch.object(WikidataProvider, "get_entities", new_callable=AsyncMock)
    async def test_get_game_credits_with_p725_qualifiers(self, mock_get_entities, mock_find_entity):
        mock_find_entity.return_value = "Q_BOND_GAME"
        mock_get_entities.side_effect = [
            # 1. Game entity fetch with P725 claims and qualifiers
            {
                "Q_BOND_GAME": {
                    "labels": {"en": {"value": "007 First Light"}},
                    "claims": {
                        "P725": [
                            {
                                "mainsnak": {"datavalue": {"value": {"id": "Q_PATRICK"}}},
                                "qualifiers": {
                                    "P453": [{"datavalue": {"value": {"id": "Q_BOND_CHAR"}}}]
                                },
                            },
                            {
                                "mainsnak": {"datavalue": {"value": {"id": "Q_NOEMIE"}}},
                                "qualifiers": {"P4633": [{"datavalue": {"value": "Isola Vale"}}]},
                            },
                        ]
                    },
                }
            },
            # 2. Actors & Characters entity fetch
            {
                "Q_BOND_CHAR": {"labels": {"en": {"value": "James Bond"}}, "claims": {}},
                "Q_PATRICK": {
                    "labels": {"en": {"value": "Patrick Gibson"}},
                    "claims": {"P18": [{"mainsnak": {"datavalue": {"value": "Patrick.jpg"}}}]},
                },
                "Q_NOEMIE": {
                    "labels": {"en": {"value": "Noemie Nakai"}},
                    "claims": {},
                },
            },
        ]

        provider = WikidataProvider()
        res = await provider.get_game_credits(steam_id="3768760")
        self.assertEqual(len(res["cast"]), 2)
        self.assertEqual(res["cast"][0]["person_name"], "Patrick Gibson")
        self.assertEqual(res["cast"][0]["character_name"], "James Bond")
        self.assertEqual(res["cast"][1]["person_name"], "Noemie Nakai")
        self.assertEqual(res["cast"][1]["character_name"], "Isola Vale")
