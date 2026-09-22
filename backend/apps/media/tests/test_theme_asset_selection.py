"""Unit tests for theme-aware asset selection, context resolution, and SteamGridDB color mapping."""

from django.test import RequestFactory, TestCase

from apps.media.models import MediaAsset, MediaItem
from apps.media.services.catalog import _best_asset, request_context
from apps.media.services.steamgrid_artwork import (
    _color_guess_for,
    _specs_for,
    attach_steamgrid_assets,
)


class SteamGridColorMappingTests(TestCase):
    def test_style_color_mapping(self):
        self.assertEqual(_color_guess_for("logo", "white"), "guess_white")
        self.assertEqual(_color_guess_for("logo", "black"), "guess_black")
        self.assertEqual(_color_guess_for("logo", "official"), "guess_multicolor")
        self.assertEqual(_color_guess_for("logo", "custom"), None)
        self.assertEqual(_color_guess_for("grid", "white"), "guess_white")
        self.assertEqual(_color_guess_for("grid", "white_logo"), "guess_white")
        self.assertEqual(_color_guess_for("grid", "alternate"), None)

    def test_specs_for_carries_color_guess(self):
        specs = _specs_for("logo", {"url": "https://example.com/logo.png", "style": "white"})
        self.assertEqual(len(specs), 1)
        self.assertEqual(specs[0][1]["color_guess"], "guess_white")

    def test_attach_steamgrid_assets_persists_color_guess(self):
        item = MediaItem.objects.create(title="Game Test", media_type="game", slug="game-test")
        attach_steamgrid_assets(
            media_item_id=item.pk,
            sgdb_game_id=9999,
            grids=[],
            heroes=[],
            logos=[
                {"url": "https://example.com/logo_w.png", "style": "white", "score": 10},
                {"url": "https://example.com/logo_b.png", "style": "black", "score": 12},
            ],
            icons=[],
        )
        asset_w = MediaAsset.objects.get(media_item=item, url="https://example.com/logo_w.png")
        asset_b = MediaAsset.objects.get(media_item=item, url="https://example.com/logo_b.png")
        self.assertEqual(asset_w.color_guess, "guess_white")
        self.assertEqual(asset_b.color_guess, "guess_black")


class ThemeAwareAssetSelectionTests(TestCase):
    def setUp(self):
        self.item = MediaItem.objects.create(
            title="Theme Selection Test", media_type="game", slug="theme-test"
        )
        # Higher scored black logo, lower scored white logo
        self.logo_black = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/black.png",
            score=100,
            color_guess="guess_black",
        )
        self.logo_white = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/white.png",
            score=50,
            color_guess="guess_white",
        )

    def test_dark_theme_selects_white_logo(self):
        best = _best_asset(self.item, "logo", context="dark")
        self.assertIsNotNone(best)
        # Even though black has score 100 vs 50, dark theme MUST pick white logo for contrast
        self.assertEqual(best.pk, self.logo_white.pk)

    def test_light_theme_selects_black_logo(self):
        best = _best_asset(self.item, "logo", context="light")
        self.assertIsNotNone(best)
        # Light theme MUST pick black logo for contrast
        self.assertEqual(best.pk, self.logo_black.pk)

    def test_general_theme_selects_higher_score(self):
        best = _best_asset(self.item, "logo", context="general")
        self.assertIsNotNone(best)
        # General has no theme bias; higher score wins
        self.assertEqual(best.pk, self.logo_black.pk)

    def test_admin_pin_overrides_theme_selection(self):
        # Admin explicitly pins black logo for dark theme
        self.logo_black.selected_context = "dark"
        self.logo_black.save(update_fields=["selected_context"])

        best = _best_asset(self.item, "logo", context="dark")
        self.assertIsNotNone(best)
        self.assertEqual(best.pk, self.logo_black.pk)


class RequestContextResolutionTests(TestCase):
    def setUp(self):
        self.rf = RequestFactory()

    def test_query_param_precedence(self):
        req = self.rf.get("/media/?theme=dark", HTTP_X_OTIX_THEME="light")
        self.assertEqual(request_context(req), "dark")

    def test_header_fallback(self):
        req = self.rf.get("/media/", HTTP_X_OTIX_THEME="light")
        self.assertEqual(request_context(req), "light")

    def test_default_general(self):
        req = self.rf.get("/media/")
        self.assertEqual(request_context(req), "general")

    def test_invalid_theme_defaults_to_general(self):
        req = self.rf.get("/media/?theme=neon")
        self.assertEqual(request_context(req), "general")
