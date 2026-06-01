"""Run seeding/hydration test for 10 items of each media type."""
import asyncio
import json
import sys
import time
from datetime import datetime, timezone

# Patch Celery to use the app
from otix.infrastructure.celery import app

MOVIE_TMDB_IDS = [613092, 1640775, 1524492, 1644507, 1370380, 973484, 64956, 250845, 1359046, 350632]
GAME_STEAM_IDS = [3736420, 4160690, 4274120, 3212290, 3948960, 4532990, 3867360, 2867220, 4298210, 4200540]

# Music seeding via Deezer chart discovery (pulls real albums)
# We'll enqueue the deezer seed cycle which finds albums to sync

results = {
    "movies": {"enqueued": 0, "errors": []},
    "games": {"enqueued": 0, "errors": []},
    "music": {"enqueued": 0, "errors": []},
    "shows": {"enqueued": 0, "errors": []},
}

print("=" * 60)
print("SEEDING/HYDRATION TEST — 10 items per media type")
print(f"Start: {datetime.now(timezone.utc).isoformat()}")
print("=" * 60)

# ── Movies (sync existing stubs with TMDB) ──
print("\n📽️  MOVIES — Enqueuing 10 TMDB sync tasks...")
for tmdb_id in MOVIE_TMDB_IDS:
    try:
        app.send_task("sync.tmdb.movie", args=[tmdb_id], priority=9)
        results["movies"]["enqueued"] += 1
    except Exception as e:
        results["movies"]["errors"].append(str(e))
print(f"   Enqueued: {results['movies']['enqueued']}")

# ── Games (sync existing games with Steam) ──
print("\n🎮 GAMES — Enqueuing 10 Steam update tasks...")
for steam_id in GAME_STEAM_IDS:
    try:
        app.send_task("sync.steam.update_app", args=[steam_id], priority=9)
        results["games"]["enqueued"] += 1
    except Exception as e:
        results["games"]["errors"].append(str(e))
print(f"   Enqueued: {results['games']['enqueued']}")

# ── Music (seed via Deezer — charts provide real album IDs) ──
print("\n🎵 MUSIC — Enqueuing Deezer chart discovery...")
try:
    # seed.deezer_cycle pulls chart albums and creates stubs
    app.send_task("seed.deezer_cycle", priority=9)
    results["music"]["enqueued"] += 1
    print("   Enqueued: seed.deezer_cycle (will create stubs from Deezer charts)")
except Exception as e:
    results["music"]["errors"].append(str(e))

# ── Shows (seed via TMDB discover list) ──
print("\n📺 SHOWS — Enqueuing TMDB discover+changes tasks...")
try:
    app.send_task("sync.tmdb.discover_list", args=["popular", "show", 2], priority=9)
    results["shows"]["enqueued"] += 1
    print("   Enqueued: sync.tmdb.discover_list(popular, show, 2)")
except Exception as e:
    results["shows"]["errors"].append(str(e))
try:
    app.send_task("sync.tmdb.changes", args=["show", 24], priority=9)
    results["shows"]["enqueued"] += 1
    print("   Enqueued: sync.tmdb.changes(show, 24)")
except Exception as e:
    results["shows"]["errors"].append(str(e))

print("\n" + "=" * 60)
print("ALL TASKS ENQUEUED")
print(json.dumps(results, indent=2))
print("=" * 60)
print("\nWaiting 30s for tasks to begin processing...")
