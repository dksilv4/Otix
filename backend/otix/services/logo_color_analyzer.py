"""Analyzes logo images to classify dominant colors for theme-aware selection."""
from __future__ import annotations

import io

import httpx
import structlog
from PIL import Image

from otix.domain.asset import MediaAsset
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


class LogoColorAnalyzer:
    """Downloads logo images and classifies their color characteristics.

    Returns one of: guess_black, guess_white, guess_multicolor, guess_colorful
    Used by the system proposal workflow so admins can approve before
    the color_guess is used for theme-aware logo selection.
    """

    def __init__(self, session: AsyncSession, http_client: httpx.AsyncClient | None = None):
        self.session = session
        self.http = http_client or httpx.AsyncClient(timeout=httpx.Timeout(15.0))

    async def analyze(self, url: str) -> str | None:
        """Download and classify a logo image by its dominant colors."""
        try:
            response = await self.http.get(url)
            response.raise_for_status()
        except Exception:
            logger.warning("logo_analyzer_download_failed", url=url)
            return None

        try:
            img = Image.open(io.BytesIO(response.content))
        except Exception:
            logger.warning("logo_analyzer_decode_failed", url=url)
            return None

        return self._classify(img)

    def _classify(self, image: Image.Image) -> str | None:
        """Classify logo by dominant colors using luminance buckets + quantization.

        Returns one of: guess_black, guess_white, guess_multicolor, guess_colorful, guess_gray
        """
        if image.mode != "RGB":
            image = image.convert("RGB")

        # Resize for speed — 50x50 is enough for color analysis
        image = image.resize((50, 50))
        pixels = list(image.getdata())
        total = len(pixels)
        if total == 0:
            return None

        black_count = sum(1 for r, g, b in pixels if r < 60 and g < 60 and b < 60)
        white_count = sum(1 for r, g, b in pixels if r > 200 and g > 200 and b > 200)
        gray_count = sum(1 for r, g, b in pixels if abs(r - g) < 30 and abs(g - b) < 30 and not (r < 60 or r > 200))
        colorful_count = total - black_count - white_count - gray_count

        black_ratio = black_count / total
        white_ratio = white_count / total
        gray_ratio = gray_count / total
        colorful_ratio = colorful_count / total

        # Classify based on dominant characteristic
        if colorful_ratio > 0.35:
            return "guess_multicolor"
        if black_ratio > 0.6:
            return "guess_black"
        if white_ratio > 0.6:
            return "guess_white"
        if gray_ratio > 0.6:
            return "guess_gray"

        # Edge case: mostly colorful with some dark/light
        if colorful_ratio > 0.2:
            return "guess_colorful"

        # Fall through to dominant non-neutral
        ratios = [
            ("guess_black", black_ratio),
            ("guess_white", white_ratio),
            ("guess_gray", gray_ratio),
            ("guess_colorful", colorful_ratio),
        ]
        ratios.sort(key=lambda x: x[1], reverse=True)
        return ratios[0][0] if ratios[0][1] > 0 else None

    async def close(self):
        await self.http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
