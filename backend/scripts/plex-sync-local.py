#!/usr/bin/env python3
"""
Local Plex sync — runs on the host machine.

Pre-fetches all library items from Plex first (each with a fresh httpx
client), then processes everything against the DB.

Usage: python scripts/plex-sync-local.py <user_id>
"""

from __future__ import annotations

import asyncio
import importlib
import os
import sys
import time
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine


async def main() -> int:
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <user_id>", file=sys.stderr)
        return 1
    user_id = sys.argv[1]
    t0 = time.monotonic()

    backend = os.path.join(os.path.dirname(__file__), "..")
    if backend not in sys.path:
        sys.path.insert(0, backend)
    importlib.invalidate_caches()

    from otix.infrastructure.config import settings
    from otix.domain.media import UserPlexServer, UserPlexLibrary
    from otix.services.plex_sync_service import (
        sync_plex_library, _fetch_plex_library_items, _build_guid_cache,
        _build_album_context, _build_episode_cache, extract_guids,
    )
    from otix.domain.user import User
    from otix.domain.media import Track

    engine = create_async_engine(
        settings.database_url, echo=False, pool_size=3, pool_pre_ping=False,
        connect_args={"timeout": settings.db_connect_timeout, "statement_cache_size": 0},
    )
    sf = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with sf() as db:
        user = await db.scalar(select(User).where(User.id == user_id))
        if not user:
            print(f"User {user_id} not found", file=sys.stderr); return 1

        # Get all selected servers + libraries
        servers = (await db.scalars(
            select(UserPlexServer).where(
                UserPlexServer.user_id == user.id, UserPlexServer.selected
            )
        )).all()

        libs = (await db.scalars(
            select(UserPlexLibrary).where(
                UserPlexLibrary.user_id == user.id, UserPlexLibrary.selected
            )
        )).all()

        server_map = {s.id: s for s in servers}
        library_plans = [l for l in libs if l.server_id in server_map]

        print(f"User: {user.username or user.email}")
        print(f"Libraries: {len(library_plans)}")

        # ── Phase 1: Fetch ALL items from Plex (fresh client each) ──
        fetched = []
        for lib in library_plans:
            srv = server_map[lib.server_id]
            print(f"  Fetching {lib.title}...", end=" ", flush=True)
            items = await _fetch_plex_library_items(
                base_url=srv.base_url, section_key=lib.section_key,
                library_type=lib.library_type,
                token=srv.access_token or user.plex_auth_token,
            )
            if items is None:
                print("FAILED")
                continue
            print(f"{len(items)} items")
            fetched.append((srv, lib, items))

        print(f"\n  Fetched {sum(len(i) for _,_,i in fetched)} items total\n")

        # ── Phase 2: Process each library sequentially (DB only) ──
        total_all = matched_all = seeded_all = 0
        for srv, lib, items in fetched:
            print(f"  Processing {lib.title} ({len(items)} items)...")
            t1 = time.monotonic()

            guid_cache = await _build_guid_cache(db, items)

            # Pre-build caches for music
            music_ids = []
            for item in items:
                guids = extract_guids(item)
                pg = item.get("guid")
                if pg and (found := guid_cache.find("plex", str(pg))):
                    music_ids.append(found); continue
                for p, e in guids.items():
                    if found := guid_cache.find(p, e):
                        music_ids.append(found); break
            album_ctx = await _build_album_context(db, music_ids) if music_ids else None

            show_ids = set()
            for item in items:
                if item.get("type") == "episode" and (gpg := item.get("grandparentGuid")):
                    gg = extract_guids({"guid": gpg, "Guid": item.get("GrandparentGuid")} if gpg else {})
                    for _p, _e in gg.items():
                        if found := guid_cache.find(_p, _e):
                            show_ids.add(found)
            ep_cache = await _build_episode_cache(db, show_ids) if show_ids else None

            track_ids = set()
            if music_ids:
                existing = (await db.scalars(
                    select(Track.album_id).where(Track.album_id.in_(music_ids))
                )).all()
                track_ids = set(existing)

            result = await sync_plex_library(
                db, user, srv, lib,
                guid_cache=guid_cache, album_ctx=album_ctx,
                episode_cache=ep_cache, album_ids_with_tracks=track_ids,
                items=items,
            )
            elapsed = time.monotonic() - t1
            print(f"    {result.get('total')} items, {result.get('matched')} matched, {result.get('seeded')} seeded ({elapsed:.1f}s)")
            for k in ("total", "matched", "seeded"):
                total_all += result.get(k, 0)
                matched_all += result.get(k, 0) if k == "matched" else 0
                seeded_all += result.get(k, 0) if k == "seeded" else 0

    await engine.dispose()
    elapsed = time.monotonic() - t0
    print(f"\nTotal: {total_all} items, {matched_all} matched, {seeded_all} seeded")
    print(f"Time: {elapsed:.1f}s")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
