"""Unit tests for FandomProvider client."""

import unittest
from unittest.mock import AsyncMock, MagicMock

from core.providers.fandom.client import FandomProvider, clean_fandom_image_url


class FandomProviderTests(unittest.IsolatedAsyncioTestCase):
    def test_clean_fandom_image_url(self):
        scaled = "https://static.wikia.nocookie.net/clair-obscur/images/1/1d/COE33_char_icon_Gustave.png/revision/latest/scale-to-width-down/1000?cb=2025"
        cleaned = clean_fandom_image_url(scaled)
        self.assertNotIn("scale-to-width-down", cleaned)
        self.assertTrue(
            cleaned.startswith(
                "https://static.wikia.nocookie.net/clair-obscur/images/1/1d/COE33_char_icon_Gustave.png/revision/latest"
            )
        )

    def test_parse_wikitext(self):
        wikitext = """{{Character
| name = Gustave
| species = Human
| gender = Male
| aliases = Monsieur G<br>Brushface
| portrayed by = {{WP|Charlie Cox}} {{n|English}}<br>{{WP|Kenjiro Tsuda}} {{n|Japanese}}
}}
Gustave is the leader of the Expedition 33 team and an engineer.

== Background ==
He was born in Lumiere.
"""
        provider = FandomProvider()
        gender, species, aliases, actors, bio = provider._parse_wikitext(wikitext)
        self.assertEqual(gender, "male")
        self.assertEqual(species, "Human")
        self.assertIn("Monsieur G", aliases)
        self.assertIn("Brushface", aliases)
        self.assertEqual(len(actors), 2)
        self.assertEqual(actors[0].name, "Charlie Cox")
        self.assertEqual(actors[0].language, "English")
        self.assertEqual(actors[1].name, "Kenjiro Tsuda")
        self.assertEqual(actors[1].language, "Japanese")
        self.assertIn("leader of the Expedition 33", bio)
        self.assertNotIn("== Background ==", bio)

    async def test_detect_community_from_fandom_id(self):
        provider = FandomProvider()
        community = await provider.detect_community(
            "Expedition 33", "clair-obscur-expedition-33", "clair-obscur:Gustave"
        )
        self.assertEqual(community, "clair-obscur")

    async def test_get_character_page_success(self):
        mock_client = AsyncMock()

        # 1. Page query response
        page_query_resp = MagicMock()
        page_query_resp.status_code = 200
        page_query_resp.json.return_value = {
            "query": {
                "pages": {
                    "123": {
                        "pageid": 123,
                        "title": "Gustave",
                        "fullurl": "https://clair-obscur.fandom.com/wiki/Gustave",
                        "thumbnail": {
                            "source": "https://static.wikia.nocookie.net/clair-obscur/images/1/1d/portrait.png/revision/latest",
                            "width": 1000,
                            "height": 1000,
                        },
                        "images": [
                            {"title": "File:Gustave_full.png"},
                            {"title": "File:Icon_Playstation.png"},  # junk UI icon
                        ],
                    }
                }
            }
        }

        # 2. Imageinfo query response
        imageinfo_resp = MagicMock()
        imageinfo_resp.status_code = 200
        imageinfo_resp.json.return_value = {
            "query": {
                "pages": {
                    "456": {
                        "title": "File:Gustave_full.png",
                        "imageinfo": [
                            {
                                "url": "https://static.wikia.nocookie.net/clair-obscur/images/2/2e/Gustave_full.png/revision/latest",
                                "width": 800,
                                "height": 1200,
                            }
                        ],
                    }
                }
            }
        }

        # 3. Parse wikitext response
        parse_resp = MagicMock()
        parse_resp.status_code = 200
        parse_resp.json.return_value = {
            "parse": {
                "wikitext": {
                    "*": "{{Character|gender=Male|species=Human}}\nGustave is a dedicated engineer."
                }
            }
        }

        mock_client.get.side_effect = [page_query_resp, imageinfo_resp, parse_resp]

        provider = FandomProvider(http_client=mock_client)
        result = await provider.get_character_page("clair-obscur", "Gustave")

        self.assertIsNotNone(result)
        self.assertEqual(result.name, "Gustave")
        self.assertEqual(result.gender, "male")
        self.assertEqual(result.species, "Human")
        self.assertEqual(len(result.images), 2)  # Primary + Gustave_full, junk icon filtered
        self.assertTrue(result.images[0].is_primary)
        self.assertFalse(result.images[1].is_primary)
