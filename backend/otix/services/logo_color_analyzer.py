"""Analyzes logo images to classify dominant colors for theme-aware selection."""
from __future__ import annotations

import io

import httpx
import structlog
from PIL import Image

from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()

# HSL saturation below which a pixel counts as neutral (achromatic).
_NEUTRAL_SAT = 0.12
# Lightness bounds for "reads as dark" / "reads as light".
_DARK_LIGHTNESS = 0.25
_LIGHT_LIGHTNESS = 0.78
# Minimum chromatic share and hue-bin spread for a logo to count as multicolor.
_MULTICOLOR_CHROMATIC_MIN = 0.5
_HUE_BIN_COUNT = 12
_HUE_BIN_MIN_SHARE = 0.08
_HUE_DOMINANT_MAX = 0.8


def _rgb_to_hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert an 8-bit RGB pixel to HSL (h in degrees, s/l in 0..1)."""
    rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
    mx = max(rn, gn, bn)
    mn = min(rn, gn, bn)
    delta = mx - mn
    l = (mx + mn) / 2
    if delta == 0:
        return 0.0, 0.0, l
    s = delta / (2 - mx - mn) if l > 0.5 else delta / (mx + mn)
    if mx == rn:
        h = ((gn - bn) / delta + (6 if gn < bn else 0)) / 6
    elif mx == gn:
        h = ((bn - rn) / delta + 2) / 6
    else:
        h = ((rn - gn) / delta + 4) / 6
    return h * 360, s, l


def _classify_pixels(pixels: list[tuple[int, int, int, int]]) -> str | None:
    """Classify RGBA pixels into a color_guess label.

    Transparent pixels (alpha < 128) are ignored — logo backgrounds are usually
    transparent PNGs whose RGB channels are meaningless. Very dark and very light
    chromatic pixels fold into black/white respectively, so labels encode
    *contrast*: a dark-navy logo reads as dark even though it is colourful.
    """
    visible = [(r, g, b) for r, g, b, a in pixels if a >= 128]
    if not visible:
        return None
    total = len(visible)

    black = white = gray = dark_color = light_color = colorful = 0
    hue_bins = [0] * _HUE_BIN_COUNT
    chromatic = 0
    for r, g, b in visible:
        h, s, l = _rgb_to_hsl(r, g, b)
        if s < _NEUTRAL_SAT:
            if l < _DARK_LIGHTNESS:
                black += 1
            elif l > _LIGHT_LIGHTNESS:
                white += 1
            else:
                gray += 1
        else:
            chromatic += 1
            hue_bins[int(h // (360 / _HUE_BIN_COUNT)) % _HUE_BIN_COUNT] += 1
            if l < _DARK_LIGHTNESS:
                dark_color += 1
            elif l > _LIGHT_LIGHTNESS:
                light_color += 1
            else:
                colorful += 1

    dark = (black + dark_color) / total
    light = (white + light_color) / total
    gray_ratio = gray / total
    colorful_ratio = colorful / total
    chromatic_ratio = chromatic / total

    if chromatic_ratio >= _MULTICOLOR_CHROMATIC_MIN and chromatic:
        shares = [c / chromatic for c in hue_bins if c > 0]
        dominant = max(shares)
        distinct = sum(1 for s in shares if s >= _HUE_BIN_MIN_SHARE)
        if distinct >= 2 and dominant <= _HUE_DOMINANT_MAX:
            return "guess_multicolor"

    ratios = {
        "guess_black": dark,
        "guess_white": light,
        "guess_gray": gray_ratio,
        "guess_colorful": colorful_ratio,
    }
    best = max(ratios, key=ratios.get)
    if ratios[best] >= 0.5:
        return best

    # No clear majority — lean on whichever signal is strongest.
    if colorful_ratio >= 0.35 and colorful_ratio >= max(dark, light, gray_ratio):
        return "guess_colorful"
    if dark >= 0.3 and dark >= light:
        return "guess_black"
    if light >= 0.3:
        return "guess_white"
    if gray_ratio >= 0.3:
        return "guess_gray"
    return "guess_gray"


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
        """Classify logo by dominant colors using HSL + alpha-aware quantization.

        Returns one of: guess_black, guess_white, guess_gray, guess_colorful, guess_multicolor
        """
        if image.mode != "RGBA":
            image = image.convert("RGBA")

        # Resize for speed — 64x64 is enough for color analysis
        image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
        pixels = list(image.get_flattened_data())
        if not pixels:
            return None

        return _classify_pixels(pixels)

    async def close(self):
        await self.http.aclose()

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        await self.close()
