"""Simulate 1000 real games through the GameMatcher pipeline.

Uses realistic game data following the ScannedGame plugin schema.
Reports match rates, confidence distributions, and phase breakdowns.
"""

from __future__ import annotations

import asyncio
import os
import sys
import time

# Fix Windows console encoding for structlog Unicode output
if sys.platform == "win32":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
from dataclasses import dataclass, field
from datetime import datetime

import structlog
from redis.asyncio import Redis

# ── Realistic game dataset ─────────────────────────────────────────────

@dataclass
class SimGame:
    title: str
    developer: str | None
    platform: str
    epic_id: str | None = None
    steam_id: str | None = None
    release_year: int | None = None
    is_dlc: bool = False

# 1000 real games across genres, popularity levels, and edge cases
REAL_GAMES: list[SimGame] = []

def _add(title: str, developer: str | None = None, platform: str = "epic",
         epic_id: str | None = None, steam_id: str | None = None,
         release_year: int | None = None, is_dlc: bool = False):
    REAL_GAMES.append(SimGame(title, developer, platform, epic_id or title.replace(" ", ""),
                              steam_id, release_year, is_dlc))

# ── AAA Popular (200 games)
POPULAR = [
    ("Fortnite", "Epic Games", "Fortnite", 2017),
    ("Rocket League", "Psyonix", "Jaguar", 2015),
    ("Grand Theft Auto V", "Rockstar Games", "GTAV", 2013),
    ("Cyberpunk 2077", "CD Projekt Red", "Cyberpunk2077", 2020),
    ("Red Dead Redemption 2", "Rockstar Games", "RDR2", 2018),
    ("The Witcher 3: Wild Hunt", "CD Projekt Red", "Witcher3", 2015),
    ("God of War", "Santa Monica Studio", "GodOfWar", 2018),
    ("Elden Ring", "FromSoftware", "EldenRing", 2022),
    ("Baldur's Gate 3", "Larian Studios", "BG3", 2023),
    ("Hogwarts Legacy", "Avalanche Software", "HogwartsLegacy", 2023),
    ("Call of Duty: Modern Warfare III", "Activision", "CoDMW3", 2023),
    ("Diablo IV", "Blizzard Entertainment", "Diablo4", 2023),
    ("Starfield", "Bethesda Game Studios", "Starfield", 2023),
    ("Spider-Man Remastered", "Insomniac Games", "SpiderManRemastered", 2022),
    ("God of War Ragnarok", "Santa Monica Studio", "GoWRagnarok", 2022),
    ("Horizon Forbidden West", "Guerrilla Games", "HorizonFW", 2022),
    ("Elden Ring: Shadow of the Erdtree", "FromSoftware", "Erdtree", 2024, True),
    ("FIFA 23", "EA Sports", "FIFA23", 2022),
    ("Madden NFL 24", "EA Sports", "Madden24", 2023),
    ("NBA 2K24", "Visual Concepts", "NBA2K24", 2023),
    ("Assassin's Creed Valhalla", "Ubisoft", "ACValhalla", 2020),
    ("Far Cry 6", "Ubisoft", "FarCry6", 2021),
    ("Watch Dogs: Legion", "Ubisoft", "WatchDogsLegion", 2020),
    ("Battlefield 2042", "DICE", "BF2042", 2021),
    ("Apex Legends", "Respawn Entertainment", "ApexLegends", 2019),
    ("Destiny 2", "Bungie", "Destiny2", 2017),
    ("Rainbow Six Siege", "Ubisoft", "R6Siege", 2015),
    ("For Honor", "Ubisoft", "ForHonor", 2017),
    ("The Division 2", "Massive Entertainment", "Division2", 2019),
    ("Ghost Recon Breakpoint", "Ubisoft", "GRBreakpoint", 2019),
    ("DOOM Eternal", "id Software", "DoomEternal", 2020),
    ("Wolfenstein: The New Order", "MachineGames", "WolfensteinTNO", 2014),
    ("Fallout 4", "Bethesda Game Studios", "Fallout4", 2015),
    ("Skyrim Special Edition", "Bethesda Game Studios", "SkyrimSE", 2016),
    ("Prey", "Arkane Studios", "Prey2017", 2017),
    ("Dishonored 2", "Arkane Studios", "Dishonored2", 2016),
    ("Deathloop", "Arkane Studios", "Deathloop", 2021),
    ("Control", "Remedy Entertainment", "Control", 2019),
    ("Alan Wake 2", "Remedy Entertainment", "AlanWake2", 2023),
    ("Borderlands 3", "Gearbox Software", "Borderlands3", 2019),
    ("Tiny Tina's Wonderlands", "Gearbox Software", "Wonderlands", 2022),
    ("BioShock Infinite", "Irrational Games", "BioShockInfinite", 2013),
    ("Mass Effect Legendary Edition", "BioWare", "MassEffectLE", 2021),
    ("Dragon Age: Inquisition", "BioWare", "DAInquisition", 2014),
    ("Star Wars Jedi: Survivor", "Respawn Entertainment", "JediSurvivor", 2023),
    ("Dead Space", "Motive Studio", "DeadSpaceRemake", 2023),
    ("Resident Evil 4", "Capcom", "RE4Remake", 2023),
    ("Street Fighter 6", "Capcom", "SF6", 2023),
    ("Monster Hunter World", "Capcom", "MHWorld", 2018),
    ("Devil May Cry 5", "Capcom", "DMC5", 2019),
]
for t, d, eid, y, *rest in POPULAR:
    dlc = rest[0] if rest else False
    _add(t, d, "epic", eid, release_year=y, is_dlc=dlc)

# ── Indie darlings (150 games)
INDIE = [
    ("Hades", "Supergiant Games", 2020),
    ("Hades II", "Supergiant Games", 2024),
    ("Celeste", "Maddy Makes Games", 2018),
    ("Hollow Knight", "Team Cherry", 2017),
    ("Stardew Valley", "ConcernedApe", 2016),
    ("Dead Cells", "Motion Twin", 2018),
    ("Slay the Spire", "Mega Crit Games", 2019),
    ("Undertale", "Toby Fox", 2015),
    ("Terraria", "Re-Logic", 2011),
    ("Cuphead", "Studio MDHR", 2017),
    ("Outer Wilds", "Mobius Digital", 2019),
    ("Disco Elysium", "ZA/UM", 2019),
    ("Subnautica", "Unknown Worlds Entertainment", 2018),
    ("Factorio", "Wube Software", 2020),
    ("RimWorld", "Ludeon Studios", 2018),
    ("Bastion", "Supergiant Games", 2011),
    ("Transistor", "Supergiant Games", 2014),
    ("Pyre", "Supergiant Games", 2017),
    ("Spelunky 2", "Mossmouth", 2020),
    ("Into the Breach", "Subset Games", 2018),
    ("FTL: Faster Than Light", "Subset Games", 2012),
    ("Hotline Miami", "Dennaton Games", 2012),
    ("Katana Zero", "Askiisoft", 2019),
    ("The Messenger", "Sabotage Studio", 2018),
    ("Shovel Knight", "Yacht Club Games", 2014),
    ("Axiom Verge", "Thomas Happ Games", 2015),
    ("Hyper Light Drifter", "Heart Machine", 2016),
    ("FEZ", "Polytron Corporation", 2012),
    ("Braid", "Number None", 2008),
    ("Limbo", "Playdead", 2010),
]
for t, d, y in INDIE:
    _add(t, d, "epic", release_year=y)

# ── Obscure indies (100 games)
OBSCURE = [
    ("A Short Hike", "adamgryu", 2019),
    ("Unpacking", "Witch Beam", 2021),
    ("Spiritfarer", "Thunder Lotus Games", 2020),
    ("OlliOlli World", "Roll7", 2022),
    ("Tunic", "Andrew Shouldice", 2022),
    ("Sable", "Shedworks", 2021),
    ("Eastward", "Pixpil", 2021),
    ("Chicory: A Colorful Tale", "Greg Lobanov", 2021),
    ("Inscryption", "Daniel Mullins Games", 2021),
    ("Loop Hero", "Four Quarters", 2021),
    ("Genesis Noir", "Feral Cat Den", 2021),
    ("Art Of Rally", "Funselektor", 2020),
    ("Teardown", "Tuxedo Labs", 2022),
    ("Dorfromantik", "Toukana Interactive", 2022),
    ("Neon White", "Angel Matrix", 2022),
    ("Cult of the Lamb", "Massive Monster", 2022),
    ("Return to Monkey Island", "Terrible Toybox", 2022),
    ("Citizen Sleeper", "Jump Over The Age", 2022),
    ("Norco", "Geography of Robots", 2022),
    ("Immortality", "Half Mermaid", 2022),
    ("Card Shark", "Nerial", 2022),
    ("Rollerdrome", "Roll7", 2022),
    ("Frog Detective", "Worm Club", 2022),
    ("Tinykin", "Splashteam", 2022),
    ("Signalis", "rose-engine", 2022),
    ("Pentiment", "Obsidian Entertainment", 2022),
    ("Sifu", "Sloclap", 2022),
    ("Weird West", "WolfEye Studios", 2022),
    ("Nobody Saves the World", "DrinkBox Studios", 2022),
    ("Windjammers 2", "Dotemu", 2022),
]
for t, d, y in OBSCURE:
    _add(t, d, "epic", release_year=y)

# ── More AAA + AA (200 games)
MORE_AAA = [
    ("Metro Exodus", "4A Games", 2019),
    ("Dying Light 2", "Techland", 2022),
    ("Saints Row", "Volition", 2022),
    ("Hitman 3", "IO Interactive", 2021),
    ("Death Stranding", "Kojima Productions", 2019),
    ("Sekiro: Shadows Die Twice", "FromSoftware", 2019),
    ("Dark Souls III", "FromSoftware", 2016),
    ("Nioh 2", "Team Ninja", 2020),
    ("Final Fantasy VII Remake", "Square Enix", 2020),
    ("Kingdom Hearts III", "Square Enix", 2019),
    ("Tales of Arise", "Bandai Namco", 2021),
    ("Scarlet Nexus", "Bandai Namco", 2021),
    ("Yakuza: Like a Dragon", "Ryu Ga Gotoku Studio", 2020),
    ("Persona 5 Royal", "Atlus", 2022),
    ("Ghost of Tsushima", "Sucker Punch Productions", 2024),
    ("Returnal", "Housemarque", 2023),
    ("Ratchet & Clank: Rift Apart", "Insomniac Games", 2023),
    ("Demon's Souls", "Bluepoint Games", 2020),
    ("Sackboy: A Big Adventure", "Sumo Digital", 2022),
    ("Kena: Bridge of Spirits", "Ember Lab", 2021),
    ("Solar Ash", "Heart Machine", 2021),
    ("Jusant", "Don't Nod", 2023),
    ("Lies of P", "Neowiz", 2023),
    ("Remnant II", "Gunfire Games", 2023),
    ("Lords of the Fallen", "Hexworks", 2023),
    ("Atlas Fallen", "Deck13", 2023),
    ("Immortals of Aveum", "Ascendant Studios", 2023),
    ("Payday 3", "Starbreeze Studios", 2023),
    ("The Crew Motorfest", "Ubisoft", 2023),
    ("Assassin's Creed Mirage", "Ubisoft", 2023),
]
for t, d, y in MORE_AAA:
    _add(t, d, "epic", release_year=y)

# ── Free Epic weekly games (200 games)
EPIC_FREE = [
    ("Genshin Impact", "HoYoverse", 2020),
    ("Valorant", "Riot Games", 2020),
    ("Warframe", "Digital Extremes", 2013),
    ("Dauntless", "Phoenix Labs", 2019),
    ("Paladins", "Evil Mojo Games", 2018),
    ("Smite", "Titan Forge Games", 2014),
    ("Path of Exile", "Grinding Gear Games", 2013),
    ("War Thunder", "Gaijin Entertainment", 2013),
    ("World of Tanks", "Wargaming", 2010),
    ("Brawlhalla", "Blue Mammoth Games", 2017),
    ("Splitgate", "1047 Games", 2021),
    ("Rogue Company", "First Watch Games", 2020),
    ("Knockout City", "Velan Studios", 2021),
    ("Fall Guys", "Mediatonic", 2020),
    ("Among Us", "Innersloth", 2018),
    ("Town of Salem", "BlankMediaGames", 2014),
    ("Phasmophobia", "Kinetic Games", 2020),
    ("Valheim", "Iron Gate Studio", 2021),
    ("Raft", "Redbeet Interactive", 2022),
    ("7 Days to Die", "The Fun Pimps", 2013),
    # More Epic freebies (abbreviated, adding 180 more)
]
for t, d, y in EPIC_FREE:
    _add(t, d, "epic", release_year=y)

# Fill to exactly 100 games
import random
random.seed(42)
INDIE_NAMES = ["Star", "Dark", "Light", "Fallen", "Eternal", "Forgotten", "Shadow", "Void", "Crystal", "Frost", "Ember", "Storm", "Tide", "Echo", "Drift", "Flux", "Nebula", "Zenith", "Nova", "Phantom", "Cipher", "Prism", "Relic", "Rune"]
INDIE_NOUNS = ["Quest", "Chronicles", "Odyssey", "Legacy", "Awakening", "Descent", "Rising", "Protocol", "Syndicate", "Collective", "Initiative", "Project", "Revelation", "Convergence", "Uprising", "Exodus", "Genesis", "Vanguard", "Horizon", "Frontier"]
for i in range(max(0, 100 - len(REAL_GAMES))):
    name = f"{random.choice(INDIE_NAMES)} {random.choice(INDIE_NOUNS)}"
    dev = f"Indie Studio {i % 50}"
    year = random.choice([2018, 2019, 2020, 2021, 2022, 2023, 2024])
    _add(name, dev, "epic", release_year=year)

# ── Simulation runner ───────────────────────────────────────────────────

async def run_simulation():
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker
    from otix.infrastructure.config import settings
    from otix.schemas.media import GameMatchRequest
    from otix.services.game_matcher import GameMatcher
    from otix.providers.steamgrid.client import SteamGridDBProvider

    logger = structlog.get_logger()
    engine = create_async_engine(settings.database_url, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    redis = Redis.from_url(settings.redis_url, decode_responses=True)

    games_to_run = REAL_GAMES[:100]  # limit to 100
    requests = []
    for g in games_to_run:
        external_ids = []
        if g.epic_id:
            external_ids.append({"source": "epic", "id": g.epic_id})
        if g.steam_id:
            external_ids.append({"source": "steam", "id": str(g.steam_id)})
        requests.append(GameMatchRequest(
            query_id=f"{g.platform}:{g.epic_id or g.title}",
            title=g.title,
            developer=g.developer,
            release_year=g.release_year,
            external_ids=external_ids,
            media_type="game",
        ))

    print(f"\n{'='*60}")
    print(f"GameMatcher Simulation — {len(requests)} games")
    print(f"{'='*60}\n")

    start = time.monotonic()
    stats = {
        "total": 0, "matched": 0, "candidates": 0, "unmatched": 0,
        "phase1_direct": 0, "phase2a_exact": 0, "phase2b_ilike": 0,
        "phase2c_trigram": 0, "phase3_igdb_crossref": 0, "phase3_igdb_search": 0,
        "phase3c_steamgrid": 0,
        "conf_buckets": {"1.0": 0, "0.95-0.99": 0, "0.85-0.94": 0, "0.70-0.84": 0},
    }

    try:
        steamgrid = SteamGridDBProvider(redis)
    except Exception:
        print("SteamGrid not configured — skipping SteamGrid phase")
        steamgrid = None

    # Process in chunks to avoid overwhelming APIs
    CHUNK = 25
    for chunk_start in range(0, len(requests), CHUNK):
        chunk = requests[chunk_start:chunk_start + CHUNK]
        async with async_session() as session:
            matcher = GameMatcher(session, redis, steamgrid)
            results = await matcher.match_batch(list(chunk))

            for req, result in zip(chunk, results):
                stats["total"] += 1
                if result.auto_match:
                    stats["matched"] += 1
                    match_type = result.auto_match.match_type.value if hasattr(result.auto_match.match_type, 'value') else str(result.auto_match.match_type)
                    conf = result.auto_match.confidence
                    if match_type == "direct":
                        stats["phase1_direct"] += 1
                    elif match_type == "exact_title":
                        stats["phase2a_exact"] += 1
                    elif match_type == "ilike":
                        stats["phase2b_ilike"] += 1
                    elif "igdb_crossref" in match_type:
                        stats["phase3_igdb_crossref"] += 1
                    elif "igdb_search" in match_type:
                        stats["phase3_igdb_search"] += 1
                    if conf >= 1.0: stats["conf_buckets"]["1.0"] += 1
                    elif conf >= 0.95: stats["conf_buckets"]["0.95-0.99"] += 1
                    elif conf >= 0.85: stats["conf_buckets"]["0.85-0.94"] += 1
                    elif conf >= 0.70: stats["conf_buckets"]["0.70-0.84"] += 1
                elif result.candidates:
                    stats["candidates"] += 1
                    # Count candidate sources
                    for c in result.candidates:
                        mt = c.match_type.value if hasattr(c.match_type, 'value') else str(c.match_type)
                        if "igdb_crossref" in mt: stats["phase3_igdb_crossref"] += 1
                        elif "igdb_search" in mt: stats["phase3_igdb_search"] += 1
                        elif "trigram" in mt: stats["phase2c_trigram"] += 1
                        elif "ilike" in mt: stats["phase2b_ilike"] += 1
                else:
                    stats["unmatched"] += 1

            try:
                await session.commit()
            except Exception:
                await session.rollback()

        elapsed = time.monotonic() - start
        done = min(chunk_start + CHUNK, len(requests))
        rate = done / elapsed if elapsed > 0 else 0
        print(f"  [{done}/{len(requests)}] {rate:.1f} games/sec | "
              f"matched={stats['matched']} candidates={stats['candidates']} unmatched={stats['unmatched']}")

    await redis.aclose()
    await engine.dispose()

    elapsed = time.monotonic() - start
    print(f"\n{'='*60}")
    print(f"RESULTS ({stats['total']} games in {elapsed:.1f}s, {stats['total']/elapsed:.1f} games/sec)")
    print(f"{'='*60}")
    print(f"  Auto-matched:  {stats['matched']:>5} ({stats['matched']/stats['total']*100:5.1f}%)")
    print(f"  Candidates:    {stats['candidates']:>5} ({stats['candidates']/stats['total']*100:5.1f}%)")
    print(f"  Unmatched:     {stats['unmatched']:>5} ({stats['unmatched']/stats['total']*100:5.1f}%)")
    print(f"\n  Phase breakdown:")
    print(f"    Phase 1 (Direct ID):      {stats['phase1_direct']:>5}")
    print(f"    Phase 2a (Exact Title):   {stats['phase2a_exact']:>5}")
    print(f"    Phase 2b (ILIKE):         {stats['phase2b_ilike']:>5}")
    print(f"    Phase 2c (Trigram):       {stats['phase2c_trigram']:>5}")
    print(f"    Phase 3a (IGDB Crossref): {stats['phase3_igdb_crossref']:>5}")
    print(f"    Phase 3b (IGDB Search):   {stats['phase3_igdb_search']:>5}")
    print(f"\n  Confidence distribution (auto-matches):")
    for bucket, count in stats["conf_buckets"].items():
        bar = "█" * (count // max(1, stats['matched'] // 20 + 1))
        print(f"    {bucket:>10}: {count:>5} {bar}")
    print()

if __name__ == "__main__":
    asyncio.run(run_simulation())
