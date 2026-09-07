#!/usr/bin/env python3
"""
hydrate_album_covers.py
=======================

Hydrate album cover art for music MediaItems that don't have a poster_url.

Two-phase approach:
  1. Direct MBID → CAA — for albums that already have a MusicBrainz release
     MBID stored in ExternalID (from Plex).
  2. Search fallback — for albums without a stored MBID, search MusicBrainz
     by artist name + album title, then hit CAA.

Creates MediaAsset rows (poster type, musicbrainz_caa provider) and sets
poster_url on the MediaItem.

Usage:
    python scripts/hydrate_album_covers.py [--dry-run] [--user USER_ID]
                                          [--phase {direct,search,both}]
Options:
    --dry-run     Log what would be updated without making changes.
    --user        Only process albums for a specific user (by user ID).
    --phase       Which phase(s) to run:
                    direct  — only albums with existing MBIDs (CAA)
                    search  — only albums without MBIDs (MusicBrainz search → CAA)
                    both    — run both phases (default)
"""

from __future__ import annotations

import asyncio
import importlib
import os
import sys
import time

# ── Bootstrap ──────────────────────────────────────────────────────────────────

backend = os.path.join(os.path.dirname(__file__), "..")
if backend not in sys.path:
    sys.path.insert(0, backend)
importlib.invalidate_caches()

import httpx  # noqa: E402
from sqlalchemy import select  # noqa: E402

from otix.domain.asset import MediaAsset  # noqa: E402
from otix.domain.media import ExternalID, MediaItem  # noqa: E402
from otix.domain.people import MediaCredit, Person  # noqa: E402
from otix.infrastructure.database import async_session, dispose_engine  # noqa: E402
from otix.infrastructure.redis import close_redis, get_redis  # noqa: E402
from otix.providers.musicbrainz.client import MusicBrainzProvider  # noqa: E402

# ── Shared HTTP clients ─────────────────────────────────────────────────────────

_caa_client: httpx.AsyncClient | None = None


def get_caa_client() -> httpx.AsyncClient:
    global _caa_client
    if _caa_client is None or _caa_client.is_closed:
        _caa_client = httpx.AsyncClient(follow_redirects=True, timeout=30)
    return _caa_client


# ── Config ─────────────────────────────────────────────────────────────────────

COMMIT_EVERY_N = 50  # Commit every N items to avoid losing progress on DB errors

# ── Stats ──────────────────────────────────────────────────────────────────────

stats = {
    # Phase 1 (direct)
    "direct_scanned": 0,
    "direct_hit": 0,
    "direct_miss": 0,
    # Phase 2 (search)
    "search_scanned": 0,
    "search_mbid_found": 0,
    "search_mbid_miss": 0,
    "search_caa_hit": 0,
    "search_caa_miss": 0,
    # Shared
    "assets_added": 0,
    "poster_set": 0,
    "errors": 0,
    "commits": 0,
}


async def safe_commit(db, phase_label: str, idx: int, dry_run: bool):
    """Commit if not a dry run, handling stale-transaction recovery."""
    if dry_run:
        return True
    try:
        await db.commit()
        stats["commits"] += 1
        return True
    except Exception as exc:
        print(f"  ⚠ Commit failed at {phase_label}[{idx}]: {exc} — rolling back")
        try:
            await db.rollback()
        except Exception:
            pass  # already hosed
        return False


async def fetch_caa_cover(mbid: str) -> str | None:
    """Fetch the front cover image URL from Cover Art Archive."""
    client = get_caa_client()
    url = f"https://coverartarchive.org/release/{mbid}"
    try:
        resp = await client.get(url)
        if resp.status_code != 200:
            return None
        data = resp.json()
        for img in data.get("images", []):
            if img.get("front"):
                return img["image"]
        images = data.get("images", [])
        return images[0]["image"] if images else None
    except httpx.HTTPStatusError as e:
        return None if e.response.status_code == 404 else None
    except Exception:
        return None


async def set_cover(db, media_item, cover_url: str, dry_run: bool) -> bool:
    """Set poster_url + MediaAsset for one album. Returns True if anything changed."""
    label = "Would set" if dry_run else "✓ Found cover"
    print(f"  {label}: {cover_url[:80]}…")

    if dry_run:
        return False

    any_change = False
    if not media_item.poster_url:
        media_item.poster_url = cover_url
        stats["poster_set"] += 1
        any_change = True

    exists = await db.scalar(
        select(MediaAsset.url).where(MediaAsset.url == cover_url)
    )
    if not exists:
        db.add(MediaAsset(
            media_item_id=media_item.id,
            asset_type="poster",
            url=cover_url,
            provider="musicbrainz_caa",
        ))
        stats["assets_added"] += 1
        any_change = True

    return any_change


# ── Phase 1: Direct MBID → CAA ─────────────────────────────────────────────────

async def phase_direct(db, media_items, dry_run: bool) -> int:
    """Process albums that already have a musicbrainz ExternalID."""
    total = len(media_items)
    updated = 0
    for idx, media_item in enumerate(media_items, 1):
        stats["direct_scanned"] += 1
        print(f"[D{idx}/{total}] ", end="")

        try:
            eid = await db.scalar(
                select(ExternalID.external_id).where(
                    ExternalID.entity_id == media_item.id,
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "musicbrainz",
                )
            )
            if not eid:
                print(f"  ⚠ {media_item.title} — no musicbrainz MBID (race condition)")
                stats["direct_miss"] += 1
                continue

            print(f"  → {media_item.title} (MBID: {eid[:12]}…)")

            cover_url = await fetch_caa_cover(eid)
            if not cover_url:
                print(f"  - No cover in CAA for MBID {eid[:12]}…")
                stats["direct_miss"] += 1
                continue

            stats["direct_hit"] += 1
            if await set_cover(db, media_item, cover_url, dry_run):
                updated += 1

            # Periodic commit
            if idx % COMMIT_EVERY_N == 0:
                if not await safe_commit(db, "D", idx, dry_run):
                    # Commit + rollback failed — connection is hosed.
                    # Close it and open a fresh one.
                    print(f"  ↻ Reopening DB connection at D[{idx}]")
                    try:
                        await db.close()
                    except Exception:
                        pass
                    await db.connection()

        except Exception as exc:
            print(f"  ✗ Error: {exc}")
            stats["errors"] += 1
            try:
                await db.rollback()
            except Exception:
                pass

    return updated


# ── Phase 2: MusicBrainz search → CAA ──────────────────────────────────────────

async def phase_search(db, mb_provider, media_items, dry_run: bool) -> int:
    """Process albums without a stored MBID by searching MusicBrainz by artist+title."""
    total = len(media_items)
    updated = 0

    for idx, media_item in enumerate(media_items, 1):
        stats["search_scanned"] += 1
        print(f"[S{idx}/{total}] ", end="")

        try:
            # Get artist name from credits
            artist_row = await db.execute(
                select(Person.name)
                .select_from(Person)
                .join(MediaCredit, MediaCredit.person_id == Person.id)
                .where(
                    MediaCredit.media_item_id == media_item.id,
                    MediaCredit.role.in_(["primary", "artist"]),
                )
                .order_by(MediaCredit.sort_order)
                .limit(1)
            )
            artist_name = artist_row.scalar_one_or_none()
            if not artist_name:
                print(f"  ⚠ {media_item.title} — no artist credit found")
                continue

            print(f"  → {media_item.title} by {artist_name}")

            # Search MusicBrainz
            try:
                query = f'artist:"{artist_name}" AND release:"{media_item.title}"'
                results = await mb_provider.search_release(query, limit=5)
            except Exception as exc:
                print(f"  ✗ MB search failed: {exc}")
                stats["errors"] += 1
                continue

            if not results:
                print(f"  - No MB result for \"{media_item.title}\" by {artist_name}")
                stats["search_mbid_miss"] += 1
                continue

            # Pick the best match (prefer exact title match, same year if available)
            best = _pick_best_release(results, media_item.title, media_item.release_date.year if media_item.release_date else None)
            if not best:
                print(f"  - No good MB match for \"{media_item.title}\" by {artist_name}")
                stats["search_mbid_miss"] += 1
                continue

            release_mbid = best["id"]
            stats["search_mbid_found"] += 1

            # Try CAA
            cover_url = await fetch_caa_cover(release_mbid)
            if not cover_url:
                print(f"  - No CAA cover for MBID {release_mbid[:12]}…")
                stats["search_caa_miss"] += 1
                continue

            stats["search_caa_hit"] += 1
            if await set_cover(db, media_item, cover_url, dry_run):
                updated += 1

            # Also save the found MBID as an ExternalID for future runs
            if not dry_run:
                existing = await db.scalar(
                    select(ExternalID).where(
                        ExternalID.entity_id == media_item.id,
                        ExternalID.entity_type == "media_item",
                        ExternalID.provider == "musicbrainz",
                    )
                )
                if not existing:
                    db.add(ExternalID(
                        entity_id=media_item.id,
                        entity_type="media_item",
                        media_item_id=media_item.id,
                        provider="musicbrainz",
                        external_id=release_mbid,
                    ))

            # Periodic commit
            if idx % COMMIT_EVERY_N == 0:
                if not await safe_commit(db, "S", idx, dry_run):
                    # Commit + rollback failed — connection is hosed.
                    # Close it and open a fresh one.
                    print(f"  ↻ Reopening DB connection at S[{idx}]")
                    try:
                        await db.close()
                    except Exception:
                        pass
                    await db.connection()

        except Exception as exc:
            print(f"  ✗ Error: {exc}")
            stats["errors"] += 1
            try:
                await db.rollback()
            except Exception:
                pass

    return updated


def _pick_best_release(releases: list[dict], title: str, year: int | None) -> dict | None:
    """Pick the best matching release from MusicBrainz search results.

    Prefers exact title match, then primary album type, then matching year.
    """
    title_lower = title.lower().strip()
    candidates = []

    for r in releases:
        r_title = (r.get("title") or "").lower().strip()
        r_year = None
        date = r.get("date", "")
        if date and len(date) >= 4:
            try:
                r_year = int(date[:4])
            except ValueError:
                pass

        score = 0
        # Exact title match
        if r_title == title_lower:
            score += 10
        elif r_title.startswith(title_lower) or title_lower.startswith(r_title):
            score += 5

        # Prefer album-type releases
        group_type = r.get("release-group", {}).get("primary-type", "")
        if group_type.lower() in ("album", "ep", "single"):
            score += 3

        # Year matches
        if year and r_year and r_year == year:
            score += 2
        elif year and r_year and abs(r_year - year) <= 1:
            score += 1

        # Primary-created / official status
        status = r.get("status", "").lower()
        if status == "official":
            score += 2

        candidates.append((score, r))

    if not candidates:
        return None

    candidates.sort(key=lambda x: -x[0])
    return candidates[0][1] if candidates[0][0] > 0 else releases[0] if releases else None


# ── Main ────────────────────────────────────────────────────────────────────────

async def main() -> int:
    t0 = time.monotonic()

    # ── Parse args ──────────────────────────────────────────────────────────
    dry_run = "--dry-run" in sys.argv
    target_user_id = None
    phase = "both"
    for i, arg in enumerate(sys.argv):
        if arg == "--user" and i + 1 < len(sys.argv):
            target_user_id = sys.argv[i + 1]
        if arg == "--phase" and i + 1 < len(sys.argv):
            phase = sys.argv[i + 1]

    run_direct = phase in ("direct", "both")
    run_search = phase in ("search", "both")

    if dry_run:
        print("═══ DRY RUN — no changes will be made ═══\n")

    # ── Init infra ──────────────────────────────────────────────────────────
    print("Connecting to DB and Redis…")

    redis_conn = await get_redis()
    mb_provider = MusicBrainzProvider(redis_conn) if run_search else None

    # Quick CAA sanity check
    test_url = await fetch_caa_cover("8a6ddc74-2e06-4139-b27e-70464f428053")
    print(f"CAA test: {'OK' if test_url else 'FAILED'}")

    async with async_session() as db:
        try:
            await db.connection()
        except Exception as exc:
            print(f"  DB connect failed: {exc}")
            return 1

        # ── Phase 1: Direct MBID → CAA ──────────────────────────────────────
        if run_direct:
            query = (
                select(MediaItem)
                .join(ExternalID, ExternalID.entity_id == MediaItem.id)
                .where(
                    MediaItem.media_type == "music",
                    MediaItem.poster_url.is_(None),
                    ExternalID.entity_type == "media_item",
                    ExternalID.provider == "musicbrainz",
                )
                .distinct()
                .order_by(MediaItem.title.asc())
            )
            if target_user_id:
                from otix.domain.media import UserPlexItem
                query = (
                    select(MediaItem)
                    .join(ExternalID, ExternalID.entity_id == MediaItem.id)
                    .join(UserPlexItem, UserPlexItem.media_item_id == MediaItem.id)
                    .where(
                        MediaItem.media_type == "music",
                        MediaItem.poster_url.is_(None),
                        ExternalID.entity_type == "media_item",
                        ExternalID.provider == "musicbrainz",
                        UserPlexItem.user_id == target_user_id,
                    )
                    .distinct()
                    .order_by(MediaItem.title.asc())
                )

            result = await db.execute(query)
            direct_items = result.scalars().all()
            if direct_items:
                print(f"\n{'=' * 50}")
                print(f"Phase 1: Direct MBID → CAA ({len(direct_items)} albums)")
                print(f"{'=' * 50}\n")
                await phase_direct(db, direct_items, dry_run)
            else:
                print("\nNo albums with direct MBIDs remaining.\n")

            if not dry_run:
                await safe_commit(db, "D-final", len(direct_items), dry_run)

        # ── Phase 2: MusicBrainz search → CAA ───────────────────────────────
        if run_search:
            # Find albums that still have no poster_url AND no musicbrainz MBID
            query = (
                select(MediaItem)
                .outerjoin(
                    ExternalID,
                    (ExternalID.entity_id == MediaItem.id)
                    & (ExternalID.entity_type == "media_item")
                    & (ExternalID.provider == "musicbrainz"),
                )
                .where(
                    MediaItem.media_type == "music",
                    MediaItem.poster_url.is_(None),
                    ExternalID.id.is_(None),
                )
                .order_by(MediaItem.title.asc())
            )
            if target_user_id:
                from otix.domain.media import UserPlexItem
                query = (
                    select(MediaItem)
                    .join(UserPlexItem, UserPlexItem.media_item_id == MediaItem.id)
                    .outerjoin(
                        ExternalID,
                        (ExternalID.entity_id == MediaItem.id)
                        & (ExternalID.entity_type == "media_item")
                        & (ExternalID.provider == "musicbrainz"),
                    )
                    .where(
                        MediaItem.media_type == "music",
                        MediaItem.poster_url.is_(None),
                        ExternalID.id.is_(None),
                        UserPlexItem.user_id == target_user_id,
                    )
                    .order_by(MediaItem.title.asc())
                )

            result = await db.execute(query)
            search_items = result.scalars().all()
            if search_items:
                print(f"\n{'=' * 50}")
                print(f"Phase 2: MusicBrainz search → CAA ({len(search_items)} albums)")
                print(f"{'=' * 50}\n")
                await phase_search(db, mb_provider, search_items, dry_run)
            else:
                print("\nNo albums remaining to search.\n")

            if not dry_run:
                await safe_commit(db, "S-final", len(search_items), dry_run)

    # ── Cleanup ──────────────────────────────────────────────────────────────
    if _caa_client:
        await _caa_client.aclose()
    await dispose_engine()
    await close_redis()

    elapsed = time.monotonic() - t0
    print(f"\n{'═' * 50}")
    print(f"Done in {elapsed:.1f}s")
    print("── Phase 1 (direct MBID → CAA) ──")
    print(f"  Scanned: {stats['direct_scanned']}")
    print(f"  Covers found: {stats['direct_hit']}")
    print(f"  Missed:       {stats['direct_miss']}")
    print("── Phase 2 (search → CAA) ──")
    print(f"  Scanned:        {stats['search_scanned']}")
    print(f"  MBID found:     {stats['search_mbid_found']}")
    print(f"  MBID miss:      {stats['search_mbid_miss']}")
    print(f"  CAA hit:        {stats['search_caa_hit']}")
    print(f"  CAA miss:       {stats['search_caa_miss']}")
    print("── Shared ──")
    print(f"  MediaAssets added:  {stats['assets_added']}")
    print(f"  poster_url set:     {stats['poster_set']}")
    if stats["errors"]:
        print(f"  Errors:             {stats['errors']}")
    return 0


if __name__ == "__main__":
    exit(asyncio.run(main()))
