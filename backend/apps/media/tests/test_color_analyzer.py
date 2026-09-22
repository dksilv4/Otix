"""Unit tests for the image color and luminance analyzer."""

import io
from unittest import TestCase

from PIL import Image

from apps.media.services.color_analyzer import (
    analyze_image_bytes,
    classify_image,
)


class ColorAnalyzerTests(TestCase):
    def _create_transparent_image(
        self, width: int, height: int, fg_color: tuple[int, int, int]
    ) -> Image.Image:
        """Create an RGBA image with transparent border and filled center."""
        img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        # Fill center 50% with fg_color
        for x in range(width // 4, 3 * width // 4):
            for y in range(height // 4, 3 * height // 4):
                img.putpixel((x, y), (*fg_color, 255))
        return img

    def test_classify_white_logo(self):
        img = self._create_transparent_image(64, 64, (255, 255, 255))
        guess = classify_image(img, "logo")
        self.assertEqual(guess, "guess_white")

    def test_classify_black_logo(self):
        img = self._create_transparent_image(64, 64, (10, 10, 10))
        guess = classify_image(img, "logo")
        self.assertEqual(guess, "guess_black")

    def test_classify_gray_logo(self):
        img = self._create_transparent_image(64, 64, (128, 128, 128))
        guess = classify_image(img, "logo")
        self.assertEqual(guess, "guess_gray")

    def test_classify_colorful_logo(self):
        # Saturated red logo
        img = self._create_transparent_image(64, 64, (230, 25, 25))
        guess = classify_image(img, "logo")
        self.assertIn(guess, ("guess_colorful", "guess_multicolor"))

    def test_classify_multicolor_logo(self):
        img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
        # Four quadrants with red, green, blue, yellow
        colors = [
            (255, 0, 0, 255),
            (0, 255, 0, 255),
            (0, 0, 255, 255),
            (255, 255, 0, 255),
        ]
        coords = [
            (range(10, 30), range(10, 30)),
            (range(34, 54), range(10, 30)),
            (range(10, 30), range(34, 54)),
            (range(34, 54), range(34, 54)),
        ]
        for color, (xr, yr) in zip(colors, coords, strict=True):
            for x in xr:
                for y in yr:
                    img.putpixel((x, y), color)
        guess = classify_image(img, "logo")
        self.assertEqual(guess, "guess_multicolor")

    def test_classify_dark_backdrop(self):
        img = Image.new("RGB", (128, 72), (20, 25, 30))
        guess = classify_image(img, "backdrop")
        self.assertEqual(guess, "guess_black")

    def test_classify_light_backdrop(self):
        img = Image.new("RGB", (128, 72), (230, 235, 240))
        guess = classify_image(img, "backdrop")
        self.assertEqual(guess, "guess_white")

    def test_analyze_image_bytes(self):
        img = self._create_transparent_image(32, 32, (250, 250, 250))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        guess = analyze_image_bytes(buf.getvalue(), "logo")
        self.assertEqual(guess, "guess_white")

    def test_empty_or_corrupt_bytes(self):
        self.assertIsNone(analyze_image_bytes(b"", "logo"))
        self.assertIsNone(analyze_image_bytes(b"not an image", "logo"))
