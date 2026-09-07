#!/usr/bin/env python3
"""
fanart_logo_processor.py
========================

Processes logo images to comply with Fanart.tv clearlogo upload rules.

Rules enforced:
  - Canvas size: 800 × 310 px (transparent PNG)
  - 10px gutter on all sides → usable area is 780 × 290 px
  - Logo is centred both vertically and horizontally
  - Logo fills as much width/height as possible (aspect-ratio preserved)
  - Multi-layer dark shadow/glow so the logo is visible on any background
  - No taglines, actors, directors, or studios — just the title
  - Output is always RGBA PNG with transparency

Usage:
  python fanart_logo_processor.py <input_image> [output_image]

  If output_image is omitted, the result is saved as
  <input_basename>_processed.png in the same directory.

Examples:
  python fanart_logo_processor.py ~/Downloads/my_logo.png
  python fanart_logo_processor.py ~/Downloads/my_logo.png ~/Downloads/final.png

Dependencies:
  pip install Pillow
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

# ── Constants ────────────────────────────────────────────────────────────────

CANVAS_W = 800
CANVAS_H = 310
GUTTER = 10
MAX_CONTENT_W = CANVAS_W - 2 * GUTTER   # 780
MAX_CONTENT_H = CANVAS_H - 2 * GUTTER   # 290

# Shadow / glow configuration
# Each tuple: (blur_radius, opacity_fraction, y_offset)
SHADOW_LAYERS = [
    # 1. Soft wide ambient glow
    {"blur": 8, "opacity": 0.45, "dy": 0},
    # 2. Medium drop shadow for depth
    {"blur": 3, "opacity": 0.70, "dy": 2},
    # 3. Tight sharp edge shadow for crisp contrast
    {"blur": 1, "opacity": 0.90, "dy": 1},
]


# ── Core processing ─────────────────────────────────────────────────────────

def process_logo(
    input_path: str | Path,
    output_path: str | Path | None = None,
    *,
    preview: bool = False,
) -> Path:
    """
    Process a single logo image according to Fanart.tv clearlogo rules.

    Parameters
    ----------
    input_path : path to the source logo (any format Pillow supports).
    output_path : where to save the result.  If None, derived from input.
    preview : if True, also generate a verification composite showing the
              logo on white, gray, and black backgrounds.

    Returns
    -------
    Path to the saved processed logo.
    """
    input_path = Path(input_path)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    if output_path is None:
        output_path = input_path.with_name(f"{input_path.stem}_processed.png")
    output_path = Path(output_path)

    img = Image.open(input_path).convert("RGBA")

    # ── Step 1: Tight-crop to non-transparent content ────────────────────
    bbox = img.getbbox()
    if bbox is None:
        raise ValueError("Image is completely transparent — nothing to process.")

    cropped = img.crop(bbox)
    cw, ch = cropped.size
    print(f"  Source       : {img.size[0]}×{img.size[1]}")
    print(f"  Tight crop   : {cw}×{ch}  (bbox {bbox})")

    # ── Step 2: Scale to fill the usable area ────────────────────────────
    scale = min(MAX_CONTENT_W / cw, MAX_CONTENT_H / ch)
    new_w = int(cw * scale)
    new_h = int(ch * scale)
    resized = cropped.resize((new_w, new_h), Image.Resampling.LANCZOS)
    print(f"  Scaled       : {new_w}×{new_h}  (×{scale:.4f})")

    # ── Step 3: Centre on transparent canvas ─────────────────────────────
    canvas = Image.new("RGBA", (CANVAS_W, CANVAS_H), (0, 0, 0, 0))
    x = (CANVAS_W - new_w) // 2
    y = (CANVAS_H - new_h) // 2
    print(f"  Offset       : x={x}, y={y}")

    # ── Step 4: Build shadow / glow layers ───────────────────────────────
    alpha = resized.split()[-1]

    for layer_cfg in SHADOW_LAYERS:
        blur_r = layer_cfg["blur"]
        opacity = layer_cfg["opacity"]
        dy = layer_cfg["dy"]

        shadow_alpha = alpha.filter(ImageFilter.GaussianBlur(blur_r))
        shadow_alpha = shadow_alpha.point(lambda p, o=opacity: int(p * o))
        shadow = Image.new("RGBA", resized.size, (0, 0, 0))
        shadow.putalpha(shadow_alpha)
        canvas.paste(shadow, (x, y + dy), shadow)

    # ── Step 5: Paste the actual logo on top ─────────────────────────────
    canvas.paste(resized, (x, y), resized)

    # ── Step 6: Save ─────────────────────────────────────────────────────
    canvas.save(output_path, "PNG")
    print(f"  Saved        : {output_path}")

    # ── Optional: verification preview ───────────────────────────────────
    if preview:
        preview_path = output_path.with_name(
            f"{output_path.stem}_preview.png"
        )
        _generate_preview(canvas, preview_path)
        print(f"  Preview      : {preview_path}")

    return output_path


def _generate_preview(canvas: Image.Image, preview_path: Path) -> None:
    """Save a 3-row composite: logo on white, gray, and black backgrounds."""
    backgrounds = [
        ("White", (255, 255, 255, 255)),
        ("Gray",  (128, 128, 128, 255)),
        ("Black", (20,  20,  20,  255)),
    ]
    preview = Image.new("RGB", (CANVAS_W, CANVAS_H * len(backgrounds)))

    for idx, (label, colour) in enumerate(backgrounds):
        bg = Image.new("RGBA", (CANVAS_W, CANVAS_H), colour)
        bg.alpha_composite(canvas)
        row = bg.convert("RGB")

        # Label
        draw = ImageDraw.Draw(row)
        text_fill = (0, 0, 0) if label == "White" else (255, 255, 255)
        draw.text((12, 8), f"On {label}", fill=text_fill)

        preview.paste(row, (0, idx * CANVAS_H))

    # Separator lines
    draw = ImageDraw.Draw(preview)
    for i in range(1, len(backgrounds)):
        y = i * CANVAS_H
        draw.line([(0, y), (CANVAS_W, y)], fill=(200, 0, 0), width=2)

    preview.save(preview_path)


# ── Batch helper ─────────────────────────────────────────────────────────────

def process_batch(
    input_dir: str | Path,
    output_dir: str | Path | None = None,
    *,
    preview: bool = False,
) -> list[Path]:
    """
    Process every image in *input_dir* and write results to *output_dir*.

    Supported extensions: .png, .jpg, .jpeg, .webp, .tiff, .bmp
    """
    input_dir = Path(input_dir)
    if output_dir is None:
        output_dir = input_dir / "processed"
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    exts = {".png", ".jpg", ".jpeg", ".webp", ".tiff", ".bmp"}
    results: list[Path] = []

    for f in sorted(input_dir.iterdir()):
        if f.suffix.lower() not in exts:
            continue
        out = output_dir / f"{f.stem}.png"
        print(f"\n── Processing: {f.name}")
        try:
            process_logo(f, out, preview=preview)
            results.append(out)
        except Exception as exc:
            print(f"  ⚠ Skipped: {exc}")

    print(f"\n✓ Processed {len(results)} logo(s) → {output_dir}")
    return results


# ── CLI ──────────────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Process logos for Fanart.tv clearlogo compliance.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument(
        "input",
        help="Path to a single logo image or a directory for batch processing.",
    )
    parser.add_argument(
        "output",
        nargs="?",
        default=None,
        help="Output path (file for single, directory for batch). "
             "Defaults to <input>_processed.png or <input>/processed/.",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Also generate a verification composite (white/gray/black bg).",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    if input_path.is_dir():
        process_batch(input_path, args.output, preview=args.preview)
    elif input_path.is_file():
        process_logo(input_path, args.output, preview=args.preview)
    else:
        print(f"Error: {input_path} is neither a file nor a directory.", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
