"""Tests for SteamGridDB transformers."""

from __future__ import annotations

from django.test import SimpleTestCase

from core.providers.framework import NormalizedAsset, load_fixture
from core.providers.steamgrid.transformers import (
    get_asset_type,
    get_style_label,
    transform_assets,
    transform_grid,
    transform_hero,
    transform_icon,
    transform_logo,
)


class SteamGridTransformersTests(SimpleTestCase):
    def test_get_asset_type(self) -> None:
        self.assertEqual(get_asset_type("grid"), "poster")
        self.assertEqual(get_asset_type("hero"), "backdrop")
        self.assertEqual(get_asset_type("logo"), "logo")
        self.assertEqual(get_asset_type("icon"), "icon")

    def test_get_style_label(self) -> None:
        self.assertEqual(get_style_label("grid", "no_logo"), "textless")
        self.assertEqual(get_style_label("grid", "material"), "material")
        self.assertEqual(get_style_label("grid", "white"), "white")
        self.assertEqual(get_style_label("hero", "blurred"), "blurred")
        self.assertEqual(get_style_label("logo", "official"), "multicolor")
        self.assertEqual(get_style_label("icon", "custom"), "custom")
        self.assertIsNone(get_style_label("grid", None))
        self.assertIsNone(get_style_label("grid", "unknown_style"))

    def test_transform_grid_standard(self) -> None:
        entry = {
            "url": "https://cdn.steamgriddb.com/grid/1.jpg",
            "style": "alternate",
            "score": 10,
            "width": 600,
            "height": 900,
            "language": "en",
        }
        assets = transform_grid(entry)
        self.assertEqual(len(assets), 1)
        asset = assets[0]
        self.assertEqual(asset.asset_type, "poster")
        self.assertEqual(asset.url, "https://cdn.steamgriddb.com/grid/1.jpg")
        self.assertEqual(asset.provider, "steamgrid")
        self.assertEqual(asset.score, 10)
        self.assertEqual(asset.width, 600)
        self.assertEqual(asset.height, 900)
        self.assertEqual(asset.language, "en")

    def test_transform_grid_textless_produces_poster_and_textless_poster(self) -> None:
        for style in ("no_logo", "material"):
            entry = {
                "url": f"https://cdn.steamgriddb.com/grid/{style}.jpg",
                "style": style,
                "score": 5,
                "width": 600,
                "height": 900,
                "language": "en",
            }
            assets = transform_grid(entry)
            self.assertEqual(len(assets), 2)
            types = {a.asset_type for a in assets}
            self.assertEqual(types, {"poster", "textless_poster"})
            for a in assets:
                self.assertEqual(a.url, f"https://cdn.steamgriddb.com/grid/{style}.jpg")
                self.assertEqual(a.provider, "steamgrid")
                self.assertEqual(a.score, 5)

    def test_transform_grid_empty_url_returns_empty(self) -> None:
        self.assertEqual(transform_grid({"url": ""}), [])
        self.assertEqual(transform_grid({"style": "no_logo"}), [])

    def test_transform_hero(self) -> None:
        entry = {
            "url": "https://cdn.steamgriddb.com/hero/1.jpg",
            "style": "material",
            "score": 15,
            "width": 1920,
            "height": 620,
            "language": "en",
        }
        asset = transform_hero(entry)
        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertEqual(asset.asset_type, "backdrop")
        self.assertEqual(asset.url, "https://cdn.steamgriddb.com/hero/1.jpg")
        self.assertEqual(asset.provider, "steamgrid")
        self.assertEqual(asset.score, 15)

    def test_transform_hero_empty_url_returns_none(self) -> None:
        self.assertIsNone(transform_hero({"url": ""}))
        self.assertIsNone(transform_hero({}))

    def test_transform_logo(self) -> None:
        entry = {
            "url": "https://cdn.steamgriddb.com/logo/1.png",
            "style": "official",
            "score": 8,
            "width": 800,
            "height": 310,
            "language": "en",
        }
        asset = transform_logo(entry)
        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertEqual(asset.asset_type, "logo")
        self.assertEqual(asset.url, "https://cdn.steamgriddb.com/logo/1.png")
        self.assertEqual(asset.provider, "steamgrid")

    def test_transform_icon(self) -> None:
        entry = {
            "url": "https://cdn.steamgriddb.com/icon/1.ico",
            "style": "official",
            "score": 3,
            "width": 128,
            "height": 128,
            "language": "en",
        }
        asset = transform_icon(entry)
        self.assertIsNotNone(asset)
        assert asset is not None
        self.assertEqual(asset.asset_type, "icon")
        self.assertEqual(asset.url, "https://cdn.steamgriddb.com/icon/1.ico")
        self.assertEqual(asset.provider, "steamgrid")

    def test_transform_assets_combined(self) -> None:
        grids = [{"url": "https://x/g1.jpg", "style": "alternate"}]
        heroes = [{"url": "https://x/h1.jpg"}]
        logos = [{"url": "https://x/l1.png"}]
        icons = [{"url": "https://x/i1.ico"}]

        assets = transform_assets(grids=grids, heroes=heroes, logos=logos, icons=icons)
        self.assertEqual(len(assets), 4)
        types = [a.asset_type for a in assets]
        self.assertEqual(types, ["poster", "backdrop", "logo", "icon"])

    def test_transform_with_fixture(self) -> None:
        fixture_data = load_fixture("steamgrid", "grids")
        self.assertIn("data", fixture_data)
        data = fixture_data["data"]
        assets: list[NormalizedAsset] = []
        for item in data:
            assets.extend(transform_grid(item))
        # 1 alternate grid (1 asset) + 1 no_logo grid (2 assets) = 3 assets
        self.assertEqual(len(assets), 3)
        self.assertEqual({a.provider for a in assets}, {"steamgrid"})
