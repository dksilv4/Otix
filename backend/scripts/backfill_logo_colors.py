"""Backfill color_guess on real logo assets via the system-proposal + approval flow.

Mirrors tasks/maintenance/enrichment.py::_analyze_logo_colors (same pending-proposal
exclusion), but additionally approves each system proposal as the admin user so actual
color_guess values are written to media_assets — the enrichment task only creates
pending proposals that need a human admin.

Run from backend/ (loads .env for DATABASE_URL/REDIS_URL):
  .venv/bin/python scripts/backfill_logo_colors.py [--limit N]
"""

from __future__ import annotations

import argparse
import asyncio
import json

import httpx
import structlog
from sqlalchemy import exists as sa_exists, select

from otix.domain.admin_edit import MediaEditProposal
from otix.domain.asset import MediaAsset
from otix.infrastructure.database import async_session
from otix.services.admin_edit_service import AdminEditService
from otix.services.logo_color_analyzer import LogoColorAnalyzer

logger = structlog.get_logger()

ADMIN_USER_ID = "oti_52d0ad0133c6"


async def _fetch_candidates(limit: int) -> list[MediaAsset]:
    async with async_session() as session:
        pending_color_guess = sa_exists().where(
            MediaEditProposal.status == "pending",
            MediaEditProposal.changes["color_guess"].isnot(None),
            MediaEditProposal.changes["color_guess"]["asset_id"].astext == MediaAsset.id,
        )
        result = await session.execute(
            select(MediaAsset).where(
                MediaAsset.asset_type == "logo",
                MediaAsset.color_guess.is_(None),
                MediaAsset.url.isnot(None),
                ~pending_color_guess,
            ).limit(limit)
        )
        return list(result.scalars().all())


async def _process(
    asset: MediaAsset,
    analyzer: LogoColorAnalyzer,
) -> dict:
    entry = {
        "asset_id": asset.id,
        "media_item_id": asset.media_item_id,
        "url": asset.url,
        "guess": None,
        "status": "skipped",
        "error": None,
    }
    try:
        guess = await analyzer.analyze(asset.url)
        if guess is None:
            return entry  # download/decode failure or all-transparent

        async with async_session() as session:
            admin_svc = AdminEditService(session)
            proposal = await admin_svc.create_system_proposal_for_color_guess(
                media_item_id=asset.media_item_id,
                asset_id=asset.id,
                proposed_value=guess,
            )
            if proposal is None:
                entry["status"] = "proposal_failed"
                return entry
            await admin_svc.approve_proposal(proposal.id, ADMIN_USER_ID)
            await session.commit()

        entry["guess"] = guess
        entry["status"] = "written"
        return entry
    except Exception as exc:  # noqa: BLE001 - keep going on per-asset failures
        entry["status"] = "error"
        entry["error"] = f"{type(exc).__name__}: {exc}"
        return entry


async def _final_distribution() -> dict:
    """Fresh distribution of color_guess across all logo assets."""
    async with async_session() as session:
        dist: dict[str, int] = {}
        for (guess,) in await session.execute(
            select(MediaAsset.color_guess).where(
                MediaAsset.asset_type == "logo",
                MediaAsset.color_guess.isnot(None),
            )
        ):
            dist[guess] = dist.get(guess, 0) + 1
        return dist


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=30)
    args = parser.parse_args()

    # Sanity-check the admin before approving anything.
    from otix.domain.user import User

    async with async_session() as session:
        admin = await session.get(User, ADMIN_USER_ID)
        if not admin or not admin.is_admin:
            raise SystemExit(f"Admin {ADMIN_USER_ID} not found or not admin — aborting")
    print(f"Admin OK: {ADMIN_USER_ID}")

    assets = await _fetch_candidates(args.limit)
    if not assets:
        print("No eligible logo assets found.")
        return
    print(f"Processing {len(assets)} logo assets...\n")

    results: list[dict] = []
    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0)) as http_client:
        analyzer = LogoColorAnalyzer(session=None, http_client=http_client)
        for i, asset in enumerate(assets, 1):
            entry = await _process(asset, analyzer)
            results.append(entry)
            flag = {"written": "✓", "skipped": "–", "error": "✗"}.get(entry["status"], "?")
            guess = entry["guess"] or "—"
            status = entry["error"] or entry["status"]
            print(f"{i:>2}/{len(assets)} [{flag}] {entry['media_item_id'][:12]}… {guess:16} {status}")

    written = [r for r in results if r["status"] == "written"]
    errors = [r for r in results if r["error"]]

    dist = await _final_distribution()
    print("\n" + json.dumps(
        {
            "processed": len(results),
            "written": len(written),
            "skipped_or_failed": len(results) - len(written),
            "errors": len(errors),
            "total_color_guess_values_in_db": sum(dist.values()),
            "distribution": dist,
        },
        indent=2,
    ))
    if errors:
        print("\nErrors:")
        for r in errors:
            print(f"  {r['asset_id']} {r['url']}: {r['error']}")


if __name__ == "__main__":
    asyncio.run(main())
