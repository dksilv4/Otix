"""Tests for logo colour classification (otix.services.logo_color_analyzer)."""

from __future__ import annotations

from unittest.mock import MagicMock

from PIL import Image, ImageDraw

from otix.services.logo_color_analyzer import LogoColorAnalyzer, _classify_pixels


def _pixels(rgb, count, a=255):
    return [(rgb[0], rgb[1], rgb[2], a)] * count


class TestClassifyPixels:
    def test_all_transparent_returns_none(self):
        assert _classify_pixels([(0, 0, 0, 0)] * 100) is None

    def test_white_logo_on_transparent_background_is_white(self):
        # Transparent background pixels must be ignored, not counted as black.
        pixels = _pixels((0, 0, 0), 1800, a=0) + _pixels((255, 255, 255), 200)
        assert _classify_pixels(pixels) == "guess_white"

    def test_black_logo_on_transparent_background_is_black(self):
        pixels = _pixels((0, 0, 0), 1800, a=0) + _pixels((0, 0, 0), 200)
        assert _classify_pixels(pixels) == "guess_black"

    def test_gray_logo_is_gray(self):
        assert _classify_pixels(_pixels((128, 128, 128), 2000)) == "guess_gray"

    def test_single_hue_logo_is_colorful_not_multicolor(self):
        assert _classify_pixels(_pixels((255, 0, 0), 2000)) == "guess_colorful"

    def test_two_distinct_hues_is_multicolor(self):
        pixels = _pixels((255, 0, 0), 1000) + _pixels((0, 0, 255), 1000)
        assert _classify_pixels(pixels) == "guess_multicolor"

    def test_dark_chromatic_logo_reads_as_black(self):
        # A dark-navy logo is invisible on a dark UI, so it should be guess_black.
        assert _classify_pixels(_pixels((0, 0, 90), 2000)) == "guess_black"

    def test_mostly_light_logo_with_colour_accents_is_white(self):
        pixels = _pixels((255, 255, 255), 1200) + _pixels((255, 0, 0), 400) + _pixels((0, 0, 255), 400)
        assert _classify_pixels(pixels) == "guess_white"


class TestAnalyzerClassify:
    async def test_transparent_background_not_counted_as_black(self):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        ImageDraw.Draw(img).rectangle([16, 16, 48, 48], fill=(255, 255, 255, 255))
        analyzer = LogoColorAnalyzer(session=MagicMock())
        try:
            assert analyzer._classify(img) == "guess_white"
        finally:
            await analyzer.close()
