"""Classify real DB logo assets with the new LogoColorAnalyzer and write a report.

Compares the new HSL/alpha-aware classifier against the old luminance-bucket
classifier to show where accuracy improved on real data.

Run from backend/:  .venv/bin/python scripts/classify_logos_report.py
Writes: scripts/logo_color_analysis_report.md
"""

from __future__ import annotations

import asyncio
import io
import json
from pathlib import Path

import asyncpg
import httpx
from PIL import Image

from otix.services.logo_color_analyzer import LogoColorAnalyzer

DSN = "postgresql://otix:password@localhost:5433/otix_dev"
STEAMGRID_N = 12
FANART_N = 18
OUT = Path(__file__).resolve().parent / "logo_color_analysis_report.md"


def old_classify(image: Image.Image) -> str | None:
    """The pre-rewrite luminance-bucket classifier (for comparison)."""
    if image.mode != "RGB":
        image = image.convert("RGB")
    image = image.resize((50, 50))
    pixels = list(image.get_flattened_data())
    total = len(pixels)
    if total == 0:
        return None
    black_count = sum(1 for r, g, b in pixels if r < 60 and g < 60 and b < 60)
    white_count = sum(1 for r, g, b in pixels if r > 200 and g > 200 and b > 200)
    gray_count = sum(
        1 for r, g, b in pixels if abs(r - g) < 30 and abs(g - b) < 30 and not (r < 60 or r > 200)
    )
    colorful_count = total - black_count - white_count - gray_count
    black_ratio = black_count / total
    white_ratio = white_count / total
    gray_ratio = gray_count / total
    colorful_ratio = colorful_count / total
    if colorful_ratio > 0.35:
        return "guess_multicolor"
    if black_ratio > 0.6:
        return "guess_black"
    if white_ratio > 0.6:
        return "guess_white"
    if gray_ratio > 0.6:
        return "guess_gray"
    if colorful_ratio > 0.2:
        return "guess_colorful"
    ratios = [
        ("guess_black", black_ratio),
        ("guess_white", white_ratio),
        ("guess_gray", gray_ratio),
        ("guess_colorful", colorful_ratio),
    ]
    ratios.sort(key=lambda x: x[1], reverse=True)
    return ratios[0][0] if ratios[0][1] > 0 else None


def transparent_fraction(image: Image.Image) -> float:
    if image.mode == "P":
        image = image.convert("RGBA")
    if image.mode not in ("RGBA", "LA"):
        return 0.0
    data = list(image.convert("RGBA").get_flattened_data())
    if not data:
        return 0.0
    return sum(1 for r, g, b, a in data if a < 128) / len(data)


async def main() -> None:
    conn = await asyncpg.connect(DSN)
    rows = await conn.fetch(
        """
        SELECT ma.id, ma.url, ma.provider, ma.label, ma.width, ma.height, ma.lang,
               mi.title
        FROM media_assets ma
        JOIN media_items mi ON mi.id = ma.media_item_id
        WHERE ma.asset_type = 'logo'
          AND ma.provider IN ('steamgrid', 'fanart')
        ORDER BY random()
        """
    )
    sample = [r for r in rows if r["provider"] == "steamgrid"][:STEAMGRID_N]
    sample += [r for r in rows if r["provider"] == "fanart"][:FANART_N]
    await conn.close()

    rows_out: list[dict] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as client:
        analyzer = LogoColorAnalyzer(session=None, http_client=client)
        for r in sample:
            entry = {
                "title": r["title"],
                "provider": r["provider"],
                "label": r["label"],
                "width": r["width"],
                "height": r["height"],
                "url": r["url"],
                "new": None,
                "old": None,
                "mode": None,
                "transparent": None,
                "error": None,
            }
            try:
                resp = await client.get(r["url"])
                resp.raise_for_status()
                img = Image.open(io.BytesIO(resp.content))
                entry["mode"] = img.mode
                entry["transparent"] = transparent_fraction(img)
                entry["new"] = analyzer._classify(img)
                entry["old"] = old_classify(img)
            except Exception as exc:  # noqa: BLE001 - report any download/decode failure
                entry["error"] = f"{type(exc).__name__}: {exc}"
            rows_out.append(entry)

    changed = [e for e in rows_out if e["old"] != e["new"] and not e["error"]]
    failed = [e for e in rows_out if e["error"]]

    lines: list[str] = []
    lines.append("# Logo colour analysis — real DB assets")
    lines.append("")
    lines.append(
        f"- Sample: **{len(rows_out)}** logo assets from `otix_dev` "
        f"({STEAMGRID_N} SteamGridDB, {FANART_N} Fanart)."
    )
    lines.append(
        f"- New classifier differs from the old one on **{len(changed)}** assets; "
        f"**{len(failed)}** download failures."
    )
    lines.append("")
    lines.append("| # | Title | Provider | Label | Size | New guess | Old guess | Change | Transparent % |")
    lines.append("|---|-------|----------|-------|------|-----------|-----------|--------|---------------|")
    for i, e in enumerate(rows_out, 1):
        if e["error"]:
            cell_new = cell_old = f"ERR {e['error'][:24]}"
        else:
            cell_new = f"`{e['new']}`"
            cell_old = f"`{e['old']}`"
        changed_flag = "✅" if (e["old"] != e["new"] and not e["error"]) else ("❌" if e["error"] else "")
        size = f"{e['width']}×{e['height']}" if e["width"] else "—"
        trans = f"{e['transparent']*100:.0f}%" if e["transparent"] is not None else "—"
        title = (e["title"] or "")[:40]
        lines.append(
            f"| {i} | {title} | {e['provider']} | {e['label'] or '—'} | {size} | "
            f"{cell_new} | {cell_old} | {changed_flag} | {trans} |"
        )
    lines.append("")
    lines.append("## Cases the new classifier fixed")
    lines.append("")
    if changed:
        for e in changed:
            lines.append(
                f"- **{e['title'][:60]}** ({e['provider']}, label `{e['label']}`, "
                f"{e['width']}×{e['height']}, transparent {e['transparent']*100:.0f}%): "
                f"`{e['old']}` → `{e['new']}`\n  {e['url']}"
            )
    else:
        lines.append("None in this sample.")
    lines.append("")
    lines.append("## URL reference")
    lines.append("")
    for i, e in enumerate(rows_out, 1):
        lines.append(f"{i}. `{e['url']}`")

    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")

    summary = {
        "sampled": len(rows_out),
        "changed": len(changed),
        "failed": len(failed),
        "new_distribution": {},
    }
    for e in rows_out:
        if not e["error"] and e["new"]:
            summary["new_distribution"][e["new"]] = summary["new_distribution"].get(e["new"], 0) + 1
    print(json.dumps(summary, indent=2))
    print(f"\nReport written to {OUT}")


if __name__ == "__main__":
    asyncio.run(main())
