"""Tests for Fanart.tv transformers."""

from __future__ import annotations

from django.test import SimpleTestCase

from core.providers.fanart.transformers import (
    MOVIE_CATEGORIES,
    fanart_asset_specs,
    transform_movie_assets,
    transform_show_assets,
)
from core.providers.framework import NormalizedAsset, load_fixture


def _entry(url: str, lang: str | None = None, width: int | None = None, height: int | None = None):
    res: dict[str, object] = {"url": url, "lang": lang}
    if width is not None:
        res["width"] = width
    if height is not None:
        res["height"] = height
    return res


class FanartTransformersTests(SimpleTestCase):
    def test_movie_categories_mapping(self) -> None:
        raw = {
            "hdmovielogo": [
                _entry("https://a.fanart.tv/logo1.png", lang="en", width=800, height=310)
            ],
            "movielogo": [_entry("https://a.fanart.tv/logo2.png", lang="")],
            "movieposter": [
                _entry("https://a.fanart.tv/poster1.jpg", lang="en", width=1000, height=1500),
                _entry("https://a.fanart.tv/poster2.jpg", lang="zxx", width=1000, height=1500),
            ],
            "moviebackground": [
                _entry("https://a.fanart.tv/bg1.jpg", lang="en", width=1920, height=1080)
            ],
        }
        assets = transform_movie_assets(raw)
        self.assertEqual(len(assets), 5)
        types = {a.asset_type for a in assets}
        self.assertEqual(types, {"logo", "poster", "textless_poster", "backdrop"})

        # Check logo
        logos = [a for a in assets if a.asset_type == "logo"]
        self.assertEqual(len(logos), 2)
        self.assertEqual(logos[0].score, 90)
        self.assertEqual(logos[0].width, 800)
        self.assertEqual(logos[0].height, 310)

        # Check poster vs textless_poster
        posters = [a for a in assets if a.asset_type == "poster"]
        self.assertEqual(len(posters), 1)
        self.assertEqual(posters[0].url, "https://a.fanart.tv/poster1.jpg")
        self.assertEqual(posters[0].score, 55)
        self.assertEqual(posters[0].language, "en")

        textless = [a for a in assets if a.asset_type == "textless_poster"]
        self.assertEqual(len(textless), 1)
        self.assertEqual(textless[0].url, "https://a.fanart.tv/poster2.jpg")
        self.assertEqual(textless[0].score, 90)
        self.assertIsNone(textless[0].language)

        # Check backdrop
        backdrops = [a for a in assets if a.asset_type == "backdrop"]
        self.assertEqual(len(backdrops), 1)
        self.assertEqual(backdrops[0].score, 55)

        for a in assets:
            self.assertEqual(a.provider, "fanart")

    def test_show_categories_mapping(self) -> None:
        raw = {
            "hdtvlogo": [_entry("https://a.fanart.tv/tvlogo1.png", lang="en")],
            "clearlogo": [_entry("https://a.fanart.tv/tvlogo2.png", lang="en")],
            "tvposter": [
                _entry("https://a.fanart.tv/tvposter1.jpg", lang="en"),
                _entry("https://a.fanart.tv/tvposter2.jpg", lang="00"),
            ],
            "seasonposter": [_entry("https://a.fanart.tv/season1.jpg", lang="en")],
            "showbackground": [_entry("https://a.fanart.tv/tvbg1.jpg", lang="en")],
        }
        assets = transform_show_assets(raw)
        self.assertEqual(len(assets), 6)
        types = {a.asset_type for a in assets}
        self.assertEqual(types, {"logo", "poster", "textless_poster", "backdrop"})

    def test_deduplication(self) -> None:
        raw = {
            "hdmovielogo": [_entry("https://a.fanart.tv/logo.png", lang="en")],
            "movielogo": [_entry("https://a.fanart.tv/logo.png", lang="en")],
        }
        assets = transform_movie_assets(raw)
        self.assertEqual(len(assets), 1)

    def test_empty_and_invalid_entries_skipped(self) -> None:
        raw = {
            "hdmovielogo": [
                {"url": ""},
                "not-a-dict",
                {"url": "https://a.fanart.tv/valid.png", "lang": "en"},
            ]
        }
        assets = transform_movie_assets(raw)
        self.assertEqual(len(assets), 1)
        self.assertEqual(assets[0].url, "https://a.fanart.tv/valid.png")

    def test_capping_per_type(self) -> None:
        raw = {"hdmovielogo": [_entry(f"https://a.fanart.tv/logo/{i}.png") for i in range(15)]}
        assets = transform_movie_assets(raw, max_per_type=5)
        self.assertEqual(len(assets), 5)

    def test_fanart_asset_specs(self) -> None:
        raw = {
            "hdmovielogo": [_entry("https://a.fanart.tv/logo1.png", lang="en")],
            "movieposter": [_entry("https://a.fanart.tv/poster1.jpg", lang="zxx")],
        }
        specs = fanart_asset_specs(raw, MOVIE_CATEGORIES)
        self.assertEqual(len(specs), 2)
        self.assertEqual(specs[0]["asset_type"], "logo")
        self.assertEqual(specs[0]["label"], "multicolor")
        self.assertEqual(specs[1]["asset_type"], "textless_poster")
        self.assertIsNone(specs[1]["lang"])

    def test_transform_with_fixture(self) -> None:
        raw = load_fixture("fanart", "movie_artwork")
        assets = transform_movie_assets(raw)
        self.assertGreater(len(assets), 0)
        self.assertTrue(all(isinstance(a, NormalizedAsset) for a in assets))
        self.assertTrue(all(a.provider == "fanart" for a in assets))
