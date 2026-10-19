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


class LogoLanguageRankingTests(TestCase):
    def setUp(self):
        self.item = MediaItem.objects.create(
            title="Language Ranking Movie",
            media_type="movie",
            slug="language-movie",
            original_language="ja",
        )
        # White Russian logo (theme contrast rank = 3 in dark mode)
        self.logo_ru_white = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/logo_ru_white.png",
            lang="ru",
            score=60,
            color_guess="guess_white",
        )
        # Colorful English logo (theme contrast rank = 2 in dark mode)
        self.logo_en_color = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/logo_en_color.png",
            lang="en",
            score=40,
            color_guess="guess_colorful",
        )
        # Japanese logo matching original_language
        self.logo_ja = MediaAsset.objects.create(
            media_item=self.item,
            asset_type="logo",
            url="https://example.com/logo_ja.png",
            lang="ja",
            score=50,
            color_guess="guess_colorful",
        )

    def test_english_logo_outranks_foreign_white_logo_in_dark_theme(self):
        # Even though Russian logo is white (score 3 in dark mode) and English is colorful (score 2),
        # English language priority (tier 3 vs 0) MUST outrank the foreign logo.
        best = _best_asset(self.item, "logo", context="dark")
        self.assertIsNotNone(best)
        self.assertEqual(best.pk, self.logo_en_color.pk)

    def test_original_language_outranks_other_foreign_when_no_english(self):
        # If English logo does not exist, original_language (ja) outranks foreign (ru)
        self.logo_en_color.delete()
        best = _best_asset(self.item, "logo", context="general")
        self.assertIsNotNone(best)
        self.assertEqual(best.pk, self.logo_ja.pk)


class RatingComputationTests(TestCase):
    def test_compute_overall_rating_blended(self):
        from apps.media.models import ExternalRating
        from apps.media.services.rating import compute_and_store_overall_rating

        item = MediaItem.objects.create(
            title="Rating Test",
            media_type="movie",
            slug="rating-test",
            avg_rating=8.0,
            rating_count=10,
        )
        # External rating of 7.0 / 10.0
        ExternalRating.objects.create(
            media_item=item,
            provider="tmdb",
            score=7.0,
            max_score=10.0,
            vote_count=1000,
        )
        # Community is 8.0, external is 7.0
        # Blended: 0.9 * 8.0 + 0.1 * 7.0 = 7.2 + 0.7 = 7.9 -> 79.0 on 0-100 scale
        score, source = compute_and_store_overall_rating(item.pk)
        self.assertEqual(score, 79.0)
        self.assertEqual(source, "community")

        item.refresh_from_db()
        self.assertEqual(item.overall_rating, 79.0)
        self.assertEqual(item.overall_rating_source, "community")

    def test_compute_overall_rating_external_fallback(self):
        from apps.media.models import ExternalRating
        from apps.media.services.rating import compute_and_store_overall_rating

        item = MediaItem.objects.create(
            title="External Rating Test",
            media_type="movie",
            slug="ext-rating-test",
        )
        ExternalRating.objects.create(
            media_item=item,
            provider="imdb",
            score=8.5,
            max_score=10.0,
            vote_count=5000,
        )
        score, source = compute_and_store_overall_rating(item.pk)
        self.assertEqual(score, 85.0)
        self.assertEqual(source, "external")

        item.refresh_from_db()
        self.assertEqual(item.overall_rating, 85.0)
        self.assertEqual(item.overall_rating_source, "external")

