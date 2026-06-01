"""Seed the most popular Steam games into Otix.

Runs inline (not via Celery) for each Steam app ID. Games already in the
database are skipped (ExternalID dedup).

After seeding, SteamGridDB artwork enrichment happens automatically via the
maintenance.enrich_steamgrid periodic task.

Usage:
    cd backend && python -m otix.tasks.seed.popular_games
"""

from __future__ import annotations

import asyncio
import time

from otix.infrastructure.database import async_session, dispose_engine


# ── Most popular Steam games by concurrent players & cultural impact ──────

POPULAR_STEAM_APPS: list[tuple[int, str]] = [
    # Top by player count (Steam Charts)
    (730, "Counter-Strike 2"),
    (570, "Dota 2"),
    (578080, "PUBG: BATTLEGROUNDS"),
    (440, "Team Fortress 2"),
    (252490, "Rust"),
    (271590, "Grand Theft Auto V"),
    (1085660, "Destiny 2"),
    (1623730, "Palworld"),
    (1174180, "Red Dead Redemption 2"),
    (1091500, "Cyberpunk 2077"),
    (1938090, "Call of Duty"),
    (1599340, "Lost Ark"),
    (381210, "Dead by Daylight"),
    (359550, "Tom Clancy's Rainbow Six Siege"),
    (1063730, "EA SPORTS FC 25"),
    (1778820, "TEKKEN 8"),
    (739630, "Phasmophobia"),
    (1245620, "ELDEN RING"),
    (1172470, "Apex Legends"),
    (304050, "Trove"),
    # All-time classics
    (4000, "Garry's Mod"),
    (550, "Left 4 Dead 2"),
    (620, "Portal 2"),
    (240, "Counter-Strike: Source"),
    (10, "Counter-Strike"),
    (300, "Day of Defeat: Source"),
    (70, "Half-Life"),
    (220, "Half-Life 2"),
    (72850, "The Elder Scrolls V: Skyrim"),
    (22380, "Fallout: New Vegas"),
    (489830, "The Elder Scrolls V: Skyrim Special Edition"),
    (377160, "Fallout 4"),
    (292030, "The Witcher 3: Wild Hunt"),
    (413150, "Stardew Valley"),
    (582010, "Monster Hunter: World"),
    (582660, "Monster Hunter Wilds"),
    (1145350, "Hogwarts Legacy"),
    (1086940, "Baldur's Gate 3"),
    (2358720, "Black Myth: Wukong"),
    # Multiplayer / live-service hits
    (427520, "Factorio"),
    (1182900, "Marvel Rivals"),
    (1790600, "DRAGON BALL: Sparking! ZERO"),
    (294100, "RimWorld"),
    (933110, "HELLDIVERS 2"),
    (1293830, "Forza Horizon 5"),
    (1250410, "Microsoft Flight Simulator 2024"),
    (1551360, "The First Descendant"),
    (281990, "Stellaris"),
    (394360, "Hearts of Iron IV"),
    (236390, "War Thunder"),
    (218620, "PAYDAY 2"),
    (1272080, "PAYDAY 3"),
    (438100, "VRChat"),
    (275850, "No Man's Sky"),
    (1151640, "Horizon Zero Dawn Remastered"),
    (2215430, "Kingdom Come: Deliverance II"),
    (1238810, "Battlefield 2042"),
    (1328670, "Splitgate 2"),
    (1811260, "EA SPORTS College Football 25"),
    (1248130, "Farming Simulator 25"),
    (2379780, "S.T.A.L.K.E.R. 2: Heart of Chornobyl"),
    (311210, "Call of Duty: Black Ops III"),
    (1934780, "Monster Hunter Rise"),
    (1240440, "Halo Infinite"),
    (1448440, "Wo Long: Fallen Dynasty"),
    (594570, "Total War: WARHAMMER II"),
    (364360, "Total War: WARHAMMER III"),
    (386360, "SMITE 2"),
    (1635340, "Party Animals"),
    (1446780, "Forza Horizon 4"),
    (1240440, "Halo Infinite"),
    (1693980, "Dead Space"),
    (1158850, "Atomic Heart"),
    (1262540, "Marvel's Spider-Man 2"),
    (1895880, "Marvel's Spider-Man Remastered"),
    (1817070, "Marvel's Spider-Man: Miles Morales"),
    (2050650, "Resident Evil 4"),
    (1966720, "Lies of P"),
    (1593500, "God of War Ragnarok"),
    (1547000, "It Takes Two"),
    (1145360, "Hades II"),
    (1426210, "Manor Lords"),
    (1678420, "Delta Force"),
    (1904540, "FragPunk"),
    (2088180, "Assassin's Creed Shadows"),
    (2322011, "God of War"),
    (1290000, "PowerWash Simulator"),
    (108600, "Project Zomboid"),
    (261550, "Mount & Blade II: Bannerlord"),
    (105600, "Terraria"),
    (480, "Spacewar"),  # Steamworks dev tool, perennially "popular"
]


async def _sync_steam_app(steam_app_id: int):
    from otix.tasks.sync.steam import _sync_steam_seed_app as _impl

    return await _impl(steam_app_id)


async def run_popular_games_seed() -> dict:
    started_at = time.monotonic()

    synced: list[str] = []
    skipped: list[str] = []
    errors: list[str] = []

    print(f"\nSeeding {len(POPULAR_STEAM_APPS)} popular Steam games...\n")

    for app_id, title in POPULAR_STEAM_APPS:
        try:
            result = await _sync_steam_app(app_id)
            if result:
                status = result.get("status", "synced")
                synced.append(f"{title} (steam:{app_id}) — {status}")
                print(f"  [OK] {title} ({app_id})")
            else:
                skipped.append(f"{title} (steam:{app_id})")
                print(f"  [SKIP] {title} ({app_id}) — already exists")
        except Exception as exc:
            errors.append(f"{title} (steam:{app_id}): {exc}")
            print(f"  [ERR] {title} ({app_id}) — {exc}")

    elapsed = time.monotonic() - started_at

    print(f"\n{'---' * 17}")
    print(f"  Done in {elapsed:.1f}s")
    print(f"  Synced: {len(synced)}")
    print(f"  Skipped (already in DB): {len(skipped)}")
    print(f"  Errors: {len(errors)}")

    if errors:
        print(f"\n  Errors:")
        for e in errors:
            print(f"    {e}")

    return {
        "synced": len(synced),
        "skipped": len(skipped),
        "errors": len(errors),
        "elapsed": elapsed,
    }


async def main() -> None:
    await run_popular_games_seed()
    await dispose_engine()


if __name__ == "__main__":
    asyncio.run(main())
