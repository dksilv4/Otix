"""Image color and luminance analyzer for theme-aware artwork selection.

Analyzes logos, icons, backdrops, and posters to classify their dominant color
and brightness characteristics into standard ``color_guess`` labels:
- ``guess_white``: Light/bright image — contrasts with dark themes.
- ``guess_black``: Dark image — contrasts with light themes.
- ``guess_multicolor``: Multi-colored image with diverse hues.
- ``guess_colorful``: Saturated chromatic image with a clear dominant color.
- ``guess_gray``: Neutral mid-tone image.

Used when provider metadata (e.g. SteamGridDB style) does not specify color data,
ensuring UI/UX always contrasts cleanly across light and dark themes.
"""

from __future__ import annotations

import io
import logging
from pathlib import Path

import httpx
from PIL import Image

logger = logging.getLogger(__name__)

# HSL saturation below which a pixel counts as neutral (achromatic).
_NEUTRAL_SAT = 0.12
# Lightness bounds for "reads as dark" vs "reads as light".
_DARK_LIGHTNESS = 0.28
_LIGHT_LIGHTNESS = 0.75
# Minimum chromatic share and hue-bin spread for a logo to count as multicolor.
_MULTICOLOR_CHROMATIC_MIN = 0.5
_HUE_BIN_COUNT = 12
_HUE_BIN_MIN_SHARE = 0.08
_HUE_DOMINANT_MAX = 0.8

_TIMEOUT = httpx.Timeout(15.0)


def _rgb_to_hsl(r: int, g: int, b: int) -> tuple[float, float, float]:
    """Convert an 8-bit RGB pixel to HSL (h in 0..360, s/l in 0..1)."""
    rn, gn, bn = r / 255.0, g / 255.0, b / 255.0
    mx = max(rn, gn, bn)
    mn = min(rn, gn, bn)
    delta = mx - mn
    l_val = (mx + mn) / 2.0
    if delta == 0:
        return 0.0, 0.0, l_val
    s_val = delta / (2.0 - mx - mn) if l_val > 0.5 else delta / (mx + mn)
    if mx == rn:
        h_val = ((gn - bn) / delta + (6.0 if gn < bn else 0.0)) / 6.0
    elif mx == gn:
        h_val = ((bn - rn) / delta + 2.0) / 6.0
    else:
        h_val = ((rn - gn) / delta + 4.0) / 6.0
    return h_val * 360.0, s_val, l_val


def _relative_luminance(r: int, g: int, b: int) -> float:
    """ITU-R BT.709 perceived luminance in 0..1."""
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0


def _classify_transparent_graphic(image: Image.Image) -> str | None:
    """Classify logos or transparent icons based on visible pixels."""
    if image.mode != "RGBA":
        image = image.convert("RGBA")

    # Resize to 64x64 for fast and consistent analysis
    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())

    visible = [(r, g, b) for r, g, b, a in raw_pixels if a >= 128]
    if not visible:
        return None
    total = len(visible)

    black = white = gray = dark_color = light_color = colorful = 0
    hue_bins = [0] * _HUE_BIN_COUNT
    chromatic = 0

    for r, g, b in visible:
        h, s, l_val = _rgb_to_hsl(r, g, b)
        if s < _NEUTRAL_SAT:
            if l_val < _DARK_LIGHTNESS:
                black += 1
            elif l_val > _LIGHT_LIGHTNESS:
                white += 1
            else:
                gray += 1
        else:
            chromatic += 1
            hue_bins[int(h // (360.0 / _HUE_BIN_COUNT)) % _HUE_BIN_COUNT] += 1
            if l_val < _DARK_LIGHTNESS:
                dark_color += 1
            elif l_val > _LIGHT_LIGHTNESS:
                light_color += 1
            else:
                colorful += 1

    dark = (black + dark_color) / total
    light = (white + light_color) / total
    gray_ratio = gray / total
    colorful_ratio = colorful / total
    chromatic_ratio = chromatic / total

    if chromatic_ratio >= _MULTICOLOR_CHROMATIC_MIN and chromatic > 0:
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
    best = max(ratios, key=ratios.get)  # type: ignore[arg-type]
    if ratios[best] >= 0.5:
        return best

    # No clear absolute majority — select strongest contrast indicator
    if colorful_ratio >= 0.35 and colorful_ratio >= max(dark, light, gray_ratio):
        return "guess_colorful"
    if dark >= 0.3 and dark >= light:
        return "guess_black"
    if light >= 0.3:
        return "guess_white"
    if gray_ratio >= 0.3:
        return "guess_gray"
    return "guess_gray"


def _classify_opaque_image(image: Image.Image, asset_type: str) -> str | None:
    """Classify backdrops or posters based on perceived luminance and color."""
    if image.mode != "RGB":
        image = image.convert("RGB")

    # Standard size for backdrop / poster analysis
    image = image.resize((64, 64), resample=Image.Resampling.BILINEAR)
    raw_pixels = list(image.getdata())
    if not raw_pixels:
        return None

    total = len(raw_pixels)
    total_lum = 0.0
    total_sat = 0.0

    for r, g, b in raw_pixels:
        total_lum += _relative_luminance(r, g, b)
        _, s, _ = _rgb_to_hsl(r, g, b)
        total_sat += s

    avg_lum = total_lum / total
    avg_sat = total_sat / total

    # Thresholds tailored for UI background and card readability
    if asset_type in ("backdrop", "textless_backdrop"):
        if avg_lum < 0.35:
            return "guess_black"  # Reads dark; ideal for dark UI with white typography
        if avg_lum > 0.65:
            return "guess_white"  # Reads light; ideal for light UI with dark typography
    else:  # poster, textless_poster, icon
        if avg_lum < 0.30:
            return "guess_black"
        if avg_lum > 0.70:
            return "guess_white"

    if avg_sat > 0.25:
        return "guess_colorful"
    return "guess_gray"


def classify_image(image: Image.Image, asset_type: str = "logo") -> str | None:
    """Classify a PIL Image instance into a standard ``color_guess`` string.

    For logos and transparent icons, uses alpha-aware HSL quantization.
    For backdrops, posters, and opaque icons, uses perceived luminance and saturation.
    """
    has_alpha = image.mode in ("RGBA", "LA") or (
        image.mode == "P" and "transparency" in image.info
    )

    if asset_type in ("logo", "icon") and has_alpha:
        # Check if alpha is actually used
        if image.mode != "RGBA":
            image = image.convert("RGBA")
        alphas = [a for _, _, _, a in image.getdata()]
        if any(a < 250 for a in alphas):
            return _classify_transparent_graphic(image)

    if asset_type in ("logo", "icon"):
        # Opaque logo/icon
        return _classify_transparent_graphic(image)

    return _classify_opaque_image(image, asset_type)


def analyze_image_bytes(data: bytes, asset_type: str = "logo") -> str | None:
    """Classify raw image bytes into a ``color_guess`` string."""
    if not data:
        return None
    try:
        with Image.open(io.BytesIO(data)) as img:
            return classify_image(img, asset_type)
    except Exception as exc:
        logger.debug("Failed to decode/analyze image bytes: %s", exc)
        return None


def analyze_image_file(path: Path | str, asset_type: str = "logo") -> str | None:
    """Classify an image file on disk into a ``color_guess`` string."""
    file_path = Path(path)
    if not file_path.is_file():
        return None
    try:
        with Image.open(file_path) as img:
            return classify_image(img, asset_type)
    except Exception as exc:
        logger.debug("Failed to read/analyze image file %s: %s", file_path, exc)
        return None


def analyze_image_url(url: str, asset_type: str = "logo") -> str | None:
    """Download an image from a URL and classify its color characteristics."""
    if not url:
        return None
    try:
        with httpx.Client(timeout=_TIMEOUT, follow_redirects=True) as client:
            resp = client.get(url)
        if resp.status_code != 200 or not resp.content:
            return None
        return analyze_image_bytes(resp.content, asset_type)
    except Exception as exc:
        logger.debug("Failed to fetch image %s for analysis: %s", url, exc)
        return None
