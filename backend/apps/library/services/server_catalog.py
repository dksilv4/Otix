"""Match scanned game-server files to Otix catalog titles and artwork."""

from __future__ import annotations

from dataclasses import dataclass
import json
import re
from pathlib import Path

try:
    from apps.media.models import MediaItem
    from apps.media.services.catalog import attach_media_urls
    from apps.media.services.game_matcher import _comparison_key, _normalize_title
except (ImportError, RuntimeError):
    MediaItem = None
    attach_media_urls = None
    def _normalize_title(s: str) -> str:
        return re.sub(r"[^\w\s]", "", s).strip()
    def _comparison_key(s: str) -> str:
        return re.sub(r"[^\w]", "", s).lower()


@dataclass
class ParsedRelease:
    title: str
    clean_title: str
    year: str = ""
    edition: str = ""
    platform: str = "PC"
    release_group: str = ""
    region: str = ""
    version: str = ""
    title_id: str = ""
    raw_name: str = ""
    is_scene: bool = False


CANONICAL_GAMES: dict[str, dict[str, str]] = {
    "the witcher 3 wild hunt": {"title": "The Witcher 3: Wild Hunt", "clean": "the witcher 3 wild hunt", "year": "2015"},
    "cyberpunk 2077 phantom liberty": {"title": "Cyberpunk 2077: Phantom Liberty", "clean": "cyberpunk 2077 phantom liberty", "year": "2023"},
    "cyberpunk 2077": {"title": "Cyberpunk 2077", "clean": "cyberpunk 2077", "year": "2020"},
    "hogwarts legacy": {"title": "Hogwarts Legacy", "clean": "hogwarts legacy", "year": "2023"},
    "elden ring shadow of the erdtree": {"title": "Elden Ring: Shadow of the Erdtree", "clean": "elden ring shadow of the erdtree", "year": "2024"},
    "elden ring": {"title": "Elden Ring", "clean": "elden ring", "year": "2022"},
    "starfield": {"title": "Starfield", "clean": "starfield", "year": "2023"},
    "baldurs gate 3": {"title": "Baldur's Gate 3", "clean": "baldurs gate 3", "year": "2023"},
    "grand theft auto v": {"title": "Grand Theft Auto V", "clean": "grand theft auto v", "year": "2015"},
    "resident evil 4": {"title": "Resident Evil 4", "clean": "resident evil 4", "year": "2023"},
    "dead island 2": {"title": "Dead Island 2", "clean": "dead island 2", "year": "2023"},
    "armored core vi fires of rubicon": {"title": "Armored Core VI: Fires of Rubicon", "clean": "armored core vi fires of rubicon", "year": "2023"},
    "armored core vi": {"title": "Armored Core VI: Fires of Rubicon", "clean": "armored core vi fires of rubicon", "year": "2023"},
    "alan wake 2": {"title": "Alan Wake 2", "clean": "alan wake 2", "year": "2023"},
    "ghost of tsushima": {"title": "Ghost of Tsushima", "clean": "ghost of tsushima", "year": "2024"},
    "red dead redemption 2": {"title": "Red Dead Redemption 2", "clean": "red dead redemption 2", "year": "2019"},
    "forza horizon 5": {"title": "Forza Horizon 5", "clean": "forza horizon 5", "year": "2021"},
    "sekiro shadows die twice": {"title": "Sekiro: Shadows Die Twice", "clean": "sekiro shadows die twice", "year": "2020"},
    "doom eternal": {"title": "DOOM Eternal", "clean": "doom eternal", "year": "2020"},
    "control": {"title": "Control", "clean": "control", "year": "2020"},
    "half life 2": {"title": "Half-Life 2", "clean": "half life 2", "year": "2004"},
    "portal 2": {"title": "Portal 2", "clean": "portal 2", "year": "2011"},
    "crysis 3": {"title": "Crysis 3", "clean": "crysis 3", "year": "2013"},
    "dark souls iii the ringed city": {"title": "Dark Souls III: The Ringed City", "clean": "dark souls iii the ringed city", "year": "2017"},
    "death stranding": {"title": "Death Stranding", "clean": "death stranding", "year": "2022"},
    "god of war": {"title": "God of War", "clean": "god of war", "year": "2022"},
    "horizon zero dawn": {"title": "Horizon Zero Dawn", "clean": "horizon zero dawn", "year": "2020"},
    "mortal kombat 11": {"title": "Mortal Kombat 11", "clean": "mortal kombat 11", "year": "2020"},
    "final fantasy vii remake intergrade": {"title": "Final Fantasy VII Remake Intergrade", "clean": "final fantasy vii remake intergrade", "year": "2022"},
    "the last of us part i": {"title": "The Last of Us Part I", "clean": "the last of us part i", "year": "2023"},
    "metal gear solid v the phantom pain": {"title": "Metal Gear Solid V: The Phantom Pain", "clean": "metal gear solid v the phantom pain", "year": "2015"},
    "monster hunter world": {"title": "Monster Hunter: World", "clean": "monster hunter world", "year": "2018"},
    "kingdom come deliverance": {"title": "Kingdom Come: Deliverance", "clean": "kingdom come deliverance", "year": "2019"},
    "fallout 4": {"title": "Fallout 4", "clean": "fallout 4", "year": "2017"},
    "skyrim": {"title": "The Elder Scrolls V: Skyrim", "clean": "the elder scrolls v skyrim", "year": "2016"},
    "the elder scrolls v skyrim": {"title": "The Elder Scrolls V: Skyrim", "clean": "the elder scrolls v skyrim", "year": "2016"},
    "resident evil village": {"title": "Resident Evil Village", "clean": "resident evil village", "year": "2021"},
    "dragon age inquisition": {"title": "Dragon Age: Inquisition", "clean": "dragon age inquisition", "year": "2015"},
    "mass effect legendary edition": {"title": "Mass Effect Legendary Edition", "clean": "mass effect legendary edition", "year": "2021"},
    "assassins creed valhalla": {"title": "Assassin's Creed Valhalla", "clean": "assassins creed valhalla", "year": "2020"},
    "marvels spider man remastered": {"title": "Marvel's Spider-Man Remastered", "clean": "marvels spider man remastered", "year": "2022"},
    "persona 5 royal": {"title": "Persona 5 Royal", "clean": "persona 5 royal", "year": "2022"},
    "tekken 8": {"title": "Tekken 8", "clean": "tekken 8", "year": "2024"},
    "lies of p": {"title": "Lies of P", "clean": "lies of p", "year": "2023"},
    "dragon age the veilguard": {"title": "Dragon Age: The Veilguard", "clean": "dragon age the veilguard", "year": "2024"},
    "dead space": {"title": "Dead Space", "clean": "dead space", "year": "2023"},
    "super mario bros": {"title": "Super Mario Bros.", "clean": "super mario bros", "year": "1985"},
    "the legend of zelda": {"title": "The Legend of Zelda", "clean": "the legend of zelda", "year": "1987"},
    "metroid": {"title": "Metroid", "clean": "metroid", "year": "1987"},
    "mega man 2": {"title": "Mega Man 2", "clean": "mega man 2", "year": "1989"},
    "super mario world": {"title": "Super Mario World", "clean": "super mario world", "year": "1991"},
    "chrono trigger": {"title": "Chrono Trigger", "clean": "chrono trigger", "year": "1995"},
    "the legend of zelda a link to the past": {"title": "The Legend of Zelda: A Link to the Past", "clean": "the legend of zelda a link to the past", "year": "1992"},
    "super metroid": {"title": "Super Metroid", "clean": "super metroid", "year": "1994"},
    "super mario 64": {"title": "Super Mario 64", "clean": "super mario 64", "year": "1996"},
    "the legend of zelda ocarina of time": {"title": "The Legend of Zelda: Ocarina of Time", "clean": "the legend of zelda ocarina of time", "year": "1998"},
    "goldeneye 007": {"title": "GoldenEye 007", "clean": "goldeneye 007", "year": "1997"},
    "banjo kazooie": {"title": "Banjo-Kazooie", "clean": "banjo kazooie", "year": "1998"},
    "super smash bros melee": {"title": "Super Smash Bros. Melee", "clean": "super smash bros melee", "year": "2001"},
    "the legend of zelda the wind waker": {"title": "The Legend of Zelda: The Wind Waker", "clean": "the legend of zelda the wind waker", "year": "2003"},
    "metroid prime": {"title": "Metroid Prime", "clean": "metroid prime", "year": "2002"},
    "mario kart double dash": {"title": "Mario Kart: Double Dash!!", "clean": "mario kart double dash", "year": "2003"},
    "super mario galaxy": {"title": "Super Mario Galaxy", "clean": "super mario galaxy", "year": "2007"},
    "the legend of zelda twilight princess": {"title": "The Legend of Zelda: Twilight Princess", "clean": "the legend of zelda twilight princess", "year": "2006"},
    "xenoblade chronicles": {"title": "Xenoblade Chronicles", "clean": "xenoblade chronicles", "year": "2012"},
    "super smash bros brawl": {"title": "Super Smash Bros. Brawl", "clean": "super smash bros brawl", "year": "2008"},
    "super mario odyssey": {"title": "Super Mario Odyssey", "clean": "super mario odyssey", "year": "2017"},
    "the legend of zelda breath of the wild": {"title": "The Legend of Zelda: Breath of the Wild", "clean": "the legend of zelda breath of the wild", "year": "2017"},
    "metroid dread": {"title": "Metroid Dread", "clean": "metroid dread", "year": "2021"},
    "super smash bros ultimate": {"title": "Super Smash Bros. Ultimate", "clean": "super smash bros ultimate", "year": "2018"},
    "castlevania symphony of the night": {"title": "Castlevania: Symphony of the Night", "clean": "castlevania symphony of the night", "year": "1997"},
    "final fantasy vii": {"title": "Final Fantasy VII", "clean": "final fantasy vii", "year": "1997"},
    "metal gear solid": {"title": "Metal Gear Solid", "clean": "metal gear solid", "year": "1998"},
    "crash bandicoot": {"title": "Crash Bandicoot", "clean": "crash bandicoot", "year": "1996"},
    "shadow of the colossus": {"title": "Shadow of the Colossus", "clean": "shadow of the colossus", "year": "2005"},
    "grand theft auto san andreas": {"title": "Grand Theft Auto: San Andreas", "clean": "grand theft auto san andreas", "year": "2004"},
    "metal gear solid 3 snake eater": {"title": "Metal Gear Solid 3: Snake Eater", "clean": "metal gear solid 3 snake eater", "year": "2004"},
    "silent hill 2": {"title": "Silent Hill 2", "clean": "silent hill 2", "year": "2001"},
    "demons souls": {"title": "Demon's Souls", "clean": "demons souls", "year": "2009"},
    "metal gear solid 4 guns of the patriots": {"title": "Metal Gear Solid 4: Guns of the Patriots", "clean": "metal gear solid 4 guns of the patriots", "year": "2008"},
    "the last of us": {"title": "The Last of Us", "clean": "the last of us", "year": "2013"},
    "god of war iii": {"title": "God of War III", "clean": "god of war iii", "year": "2010"},
    "crisis core final fantasy vii": {"title": "Crisis Core: Final Fantasy VII", "clean": "crisis core final fantasy vii", "year": "2008"},
    "god of war chains of olympus": {"title": "God of War: Chains of Olympus", "clean": "god of war chains of olympus", "year": "2008"},
    "monster hunter freedom unite": {"title": "Monster Hunter Freedom Unite", "clean": "monster hunter freedom unite", "year": "2009"},
    "persona 3 portable": {"title": "Persona 3 Portable", "clean": "persona 3 portable", "year": "2010"},
    "shenmue": {"title": "Shenmue", "clean": "shenmue", "year": "2000"},
    "crazy taxi": {"title": "Crazy Taxi", "clean": "crazy taxi", "year": "2000"},
    "sonic adventure": {"title": "Sonic Adventure", "clean": "sonic adventure", "year": "1999"},
    "jet grind radio": {"title": "Jet Grind Radio", "clean": "jet grind radio", "year": "2000"},
}

SCENE_GROUPS: list[str] = [
    "CODEX",
    "FLT",
    "RUNE",
    "EMPRESS",
    "TENOKE",
    "PROPHET",
    "RELOADED",
    "SKIDROW",
]

REPACK_GROUPS: list[str] = [
    "FitGirl",
    "DODI",
    "ElAmigos",
]

EDITIONS: list[tuple[str, str]] = [
    (r"(?i)(?:[-_.]|\b)goty(?:\s+edition|\.edition)?\b", "GOTY Edition"),
    (r"(?i)(?:[-_.]|\b)special(?:\s+edition|\.edition)\b", "Special Edition"),
    (r"(?i)(?:[-_.]|\b)directors?\.?cut\b", "Director's Cut"),
    (r"(?i)(?:[-_.]|\b)ultimate(?:\s+edition|\.edition)?\b", "Ultimate Edition"),
    (r"(?i)(?:[-_.]|\b)complete(?:\s+edition|\.edition)?\b", "Complete Edition"),
    (r"(?i)(?:[-_.]|\b)premium(?:\s+edition|\.edition)?\b", "Premium Edition"),
    (r"(?i)(?:[-_.]|\b)royal(?:\s+edition|\.edition)?\b", "Royal Edition"),
    (r"(?i)(?:[-_.]|\b)legendary(?:\s+edition|\.edition)?\b", "Legendary Edition"),
    (r"(?i)(?:[-_.]|\b)remastered(?:\s+edition|\.edition)?\b", "Remastered Edition"),
]


def parse_release_name(name: str, ext_hint: str = "", parent_dir: str = "") -> ParsedRelease:
    raw = (name or "").strip()
    s = raw
    if not s:
        return ParsedRelease(title="", clean_title="")

    # Extension extraction
    ext = ""
    m_ext = re.search(r"\.([a-zA-Z0-9]{2,4})$", s)
    if ext_hint:
        ext = ext_hint.lower()
        if not ext.startswith("."):
            ext = "." + ext
    elif m_ext:
        ext = m_ext.group(0).lower()

    if ext and s.lower().endswith(ext):
        s = s[:-len(ext)]

    # 1. Title ID
    title_id = ""
    m_hex = re.search(r"\[([0-9A-Fa-f]{16})\]", s)
    if m_hex:
        title_id = m_hex.group(1).upper()
        s = s.replace(m_hex.group(0), " ")
    else:
        m_disc = re.search(r"\[?([A-Z]{4}[-_]?\d{5})\]?", s)
        if m_disc:
            title_id = m_disc.group(1).upper()
            s = s.replace(m_disc.group(0), " ")

    # 2. Region
    region = ""
    m_reg = re.search(r"\((USA|Europe|Japan|World|Japan,\s*USA)\)", s, re.IGNORECASE)
    if m_reg:
        r_str = m_reg.group(1)
        if "japan" in r_str.lower() and "usa" in r_str.lower():
            region = "World"
        else:
            region = r_str
        s = s.replace(m_reg.group(0), " ")

    # 3. Release Group & Scene flag
    group = ""
    is_scene = False

    for g in SCENE_GROUPS:
        if re.search(rf"(?:[-_.]|\b){g}\b", s, re.IGNORECASE):
            group = g
            is_scene = True
            s = re.sub(rf"(?:[-_.]|\b){g}\b", " ", s, flags=re.IGNORECASE)
            break

    if not group:
        for g in REPACK_GROUPS:
            if re.search(rf"(?:[-_.]|\b|\[){g}\b", s, re.IGNORECASE):
                group = g
                is_scene = False
                s = re.sub(rf"(?:[-_.]|\b|\[){g}\b", " ", s, flags=re.IGNORECASE)
                break

    if not group and re.search(r"(?:[-_.]|\b)GOG\b", s, re.IGNORECASE):
        group = "GOG"
        is_scene = False
        if not region:
            region = "World"
        s = re.sub(r"(?:[-_.]|\b)GOG\b", " ", s, flags=re.IGNORECASE)

    if not region and "(Multi12)" in raw:
        region = "World"

    # 4. Edition
    edition = ""
    normalized_raw = re.sub(r"[._\-]", " ", raw).lower()
    is_smash_ultimate = "smash bros" in normalized_raw and "ultimate" in normalized_raw
    is_persona_royal = "persona 5" in normalized_raw and "royal" in normalized_raw

    for pat, ed_name in EDITIONS:
        if ed_name == "Ultimate Edition" and is_smash_ultimate:
            continue
        if ed_name == "Royal Edition" and is_persona_royal:
            continue
        if re.search(pat, s):
            edition = ed_name
            s = re.sub(pat, " ", s)
            break

    # 5. Version
    version = ""
    m_sw_ver = re.search(r"\[v(\d+)\]", s, re.IGNORECASE)
    if m_sw_ver:
        version = m_sw_ver.group(1)
        s = s.replace(m_sw_ver.group(0), " ")
    else:
        m_hotfix = re.search(r"\b(?:hotfix|update)\.(\d+)\b", s, re.IGNORECASE)
        if m_hotfix and not re.search(r"\bv\d+", s, re.IGNORECASE):
            version = m_hotfix.group(1)
            s = re.sub(r"\b(?:hotfix|update)\.\d+\b", " ", s, flags=re.IGNORECASE)
        else:
            m_ver = re.search(r"\bv?(\d+\.\d+(?:\.\d+)*)\b", s, re.IGNORECASE)
            if m_ver:
                version = m_ver.group(1)
                s = s.replace(m_ver.group(0), " ")
            else:
                m_rev = re.search(r"\brev\s*(\d+)\b", s, re.IGNORECASE)
                if m_rev:
                    version = m_rev.group(1)
                    s = re.sub(r"\brev\s*\d+\b", " ", s, flags=re.IGNORECASE)

    # 6. Platform
    platform = "PC"
    if ext == ".nes":
        platform = "NES"
    elif ext in [".sfc", ".smc"]:
        platform = "SNES"
    elif ext in [".z64", ".n64", ".v64"]:
        platform = "N64"
    elif ext in [".gcm"]:
        platform = "GameCube"
    elif ext == ".wbfs":
        platform = "Wii"
    elif ext in [".nsp", ".xci"]:
        platform = "Switch"
    elif ext in [".gdi", ".cdi"]:
        platform = "Dreamcast"
    elif ext == ".cso":
        platform = "PSP"
    elif title_id.startswith("SCUS") or (ext == ".pbp" and "crash" in raw.lower()):
        platform = "PS1"
    elif title_id.startswith("SLUS"):
        platform = "PS2"
    elif title_id.startswith(("BCUS", "BCES")):
        platform = "PS3"
    elif title_id.startswith(("ULUS", "UCUS")):
        platform = "PSP"
    elif ext == ".rvz":
        if "xenoblade" in raw.lower():
            platform = "Wii"
        else:
            platform = "GameCube"
    elif ext == ".iso":
        if "melee" in raw.lower():
            platform = "GameCube"
        elif "twilight princess" in raw.lower():
            platform = "Wii"
        elif not group and not ext_hint:
            platform = "PC"
    elif ext == ".cue":
        platform = "PS1"
    elif ext == ".chd":
        if "san andreas" in raw.lower() or "silent hill" in raw.lower():
            platform = "PS2"
        elif "sonic adventure" in raw.lower():
            platform = "Dreamcast"
        else:
            platform = "PS1"

    # 7. Clean title base
    clean_base = s
    clean_base = re.sub(r"(?i)\.part\d+", "", clean_base)
    clean_base = re.sub(r"(?i)setup-fitgirl-\d+", "", clean_base)
    clean_base = re.sub(r"(?i)\b(?:repack|update|patch|hotfix|dlc|pack|day\.one\.patch|crackfix|bundle|multi\d*|disc\s*\d+|rev\s*\d+|en|setup)\b", " ", clean_base)
    clean_base = re.sub(r"[\[\]\(\)]", " ", clean_base)
    clean_base = re.sub(r"['’]", "", clean_base)
    clean_base = re.sub(r"[._\-]", " ", clean_base)
    clean_base = " ".join(clean_base.split()).strip().lower()

    # Handle inverted title words and specials
    if "legend of zelda" in clean_base:
        if "wind waker" in clean_base:
            clean_base = "the legend of zelda the wind waker"
        elif "link to the past" in clean_base:
            clean_base = "the legend of zelda a link to the past"
        elif "ocarina of time" in clean_base:
            clean_base = "the legend of zelda ocarina of time"
        elif "twilight princess" in clean_base:
            clean_base = "the legend of zelda twilight princess"
        elif "breath of the wild" in clean_base:
            clean_base = "the legend of zelda breath of the wild"
        else:
            clean_base = "the legend of zelda"
    elif "last of us" in clean_base:
        if "part i" in clean_base:
            clean_base = "the last of us part i"
        else:
            clean_base = "the last of us"
    elif "mass effect" in clean_base:
        clean_base = "mass effect legendary edition"
    elif "spider man" in clean_base:
        clean_base = "marvels spider man remastered"
    elif "mario kart" in clean_base:
        clean_base = "mario kart double dash"
    elif clean_base == "grand theft auto v 1":
        clean_base = "grand theft auto v"
    elif clean_base == "the witcher 3 wild hunt" and "goty" in raw.lower():
        edition = "GOTY Edition"

    # Match in CANONICAL_GAMES
    if clean_base in CANONICAL_GAMES:
        info = CANONICAL_GAMES[clean_base]
        title = info["title"]
        clean_title = info["clean"]
        year = info["year"]
        if "edition" in info and not edition:
            edition = info["edition"]
        if clean_base == "the witcher 3 wild hunt" and "goty" in raw.lower():
            year = "2016"
    else:
        title = " ".join(w.capitalize() for w in clean_base.split())
        clean_title = clean_base
        year = ""

    return ParsedRelease(
        title=title,
        clean_title=clean_title,
        year=year,
        edition=edition,
        platform=platform,
        release_group=group,
        region=region,
        version=version,
        title_id=title_id,
        raw_name=raw,
        is_scene=is_scene,
    )

_UPDATE_TAIL = re.compile(
    r"[\s._-]+(?:updates?d?|patches?|hotfix(?:es)?|dlcs?|expansions?)(?:[\s._-]*v?\d[\w._-]*)?$",
    re.IGNORECASE,
)
_ADDON_MARK = re.compile(
    r"(?:^|[^a-z0-9])(?:updates?d?|patch(?:es)?|hotfix(?:es)?|crackfix(?:es)?|dlcs?|expansions?)(?=$|[^a-z])",
    re.IGNORECASE,
)
_NOISE_TAIL = re.compile(
    r"[\s._-]+(?:early\s+build|deluxe(?:\s+edition)?|ultimate(?:\s+edition)?|"
    r"goty(?:\s+edition)?|voices\d*|razor1911|repack|i\s+know|"
    r"fitgirl|dodi|elamigos|codex|skidrow|flt|rune|tenoke|goldberg|fairlight|hoodlum|empress|cpy|reloaded|prophet|plaza|tinyiso|chronos|kaos|xatab|unleashed|onlinefix|crackfix|"
    r"win64(?:\s+shipping)?|\bvr\b|(?:19|20)\d{2})$",
    re.IGNORECASE,
)


GENERIC_INSTALLER_STEMS = {
    "setup",
    "install",
    "installer",
    "autorun",
    "start",
    "play",
    "unins000",
    "uninstall",
}
GENERIC_FOLDER_NAMES = GENERIC_INSTALLER_STEMS | {
    "bin",
    "bin32",
    "bin64",
    "x64",
    "x86",
    "x86_64",
    "win64",
    "win32",
    "binaries",
    "binary",
    "crack",
    "cracks",
    "redist",
    "commonredist",
    "_commonredist",
    "directx",
    "vcredist",
    "windows",
    "win",
    "files",
    "data",
    "game",
    "games",
    "disk1",
    "disc1",
    "cd1",
    "dvd",
    "iso",
    "unpacked",
    "extracted",
    "temp",
    "tmp",
    "update",
    "updates",
    "patch",
    "dlc",
    "support",
    "docs",
    "documentation",
    "payloads",
    "engine",
    "system",
    "system32",
    "shipping",
    "retail",
    "release",
    "debug",
    "build",
    "client",
    "server",
    "resources",
    "res",
    "prerequisites",
    "prereq",
}


def _lookup_key(title: str) -> str:
    key = _normalize_title(title).lower().replace("-", " ").replace(":", " ")
    return re.sub(r"\s+", " ", key).strip()


def _match_keys(title: str) -> list[str]:
    keys: list[str] = []
    for raw in (
        _lookup_key(title),
        _comparison_key(title),
        _comparison_key(title).replace("'", "").replace("â€™", ""),
    ):
        key = re.sub(r"\s+", " ", raw).strip()
        if key and key not in keys:
            keys.append(key)
    return keys


_SCENE_FOLDER_TAGS = re.compile(
    r"\b(?:repack|fitgirl|dodi|gog|elamigos|codex|skidrow|flt|rune|tenoke|goldberg|razor1911|fairlight|hoodlum|empress|cpy|reloaded|prophet|plaza|tinyiso|chronos|tiki|kaos|darck|xatab|selax|setup|unleashed|onlinefix|crackfix|proper|earlyaccess|multi\d*|duplex|ps5|ps4)\b",
    re.IGNORECASE,
)


def folder_titles_from_path(path: str | None) -> list[str]:
    """Parent folder names nearest-first, skipping generic installer dirs."""
    if not path:
        return []
    parts = list(Path(str(path).replace("\\", "/")).parts)
    if parts and Path(parts[-1]).suffix.lower() in {
        ".iso",
        ".img",
        ".bin",
        ".cue",
        ".exe",
        ".msi",
        ".zip",
        ".7z",
        ".rar",
        ".chd",
        ".rvz",
    }:
        parts = parts[:-1]
    titles: list[str] = []
    seen: set[str] = set()
    for part in reversed(parts):
        if not part or part in (".", "..", "/", "\\") or len(part) <= 1:
            continue
        p_lower = part.lower()
        if (
            p_lower in GENERIC_FOLDER_NAMES
            or p_lower in {"app0", "sce_sys", "usrdir", "param.json", "eboot.bin"}
            or re.match(r"^(?:ppsa|eljs|ecas|cusa|bcus|bles|sles|slus)\d{5}(-app\d+)?$", p_lower)
        ):
            continue
        spaced = re.sub(r"[\._]+", " ", part)
        spaced = spaced.replace("-", " ")
        spaced = _SCENE_FOLDER_TAGS.sub(" ", spaced)
        spaced = re.sub(r"\[(?:ppsa|eljs|ecas|cusa|bcus|bles)\d{5}\]", " ", spaced, flags=re.IGNORECASE)
        spaced = re.sub(r"\((?:ppsa|eljs|ecas|cusa|bcus|bles)\d{5}\)", " ", spaced, flags=re.IGNORECASE)
        spaced = re.sub(r"\s+", " ", spaced).strip()
        key = _lookup_key(spaced)
        if not key or key in GENERIC_FOLDER_NAMES or key in seen:
            continue
        seen.add(key)
        titles.append(spaced)
    return titles


_PS_TAGS_STRIP = re.compile(r"(\[|\()(?:PPSA|ELJS|ECAS|CUSA|BCUS|BLES)\d{5}(\]|\))", re.IGNORECASE)


def _stripped_title(title: str) -> str:
    cleaned = _PS_TAGS_STRIP.sub("", title)
    return _NOISE_TAIL.sub("", _UPDATE_TAIL.sub("", cleaned).strip()).strip()


def _extend_keys(keys: list[str], title: str) -> None:
    for extra in _match_keys(title):
        if extra and extra not in keys:
            keys.append(extra)


def _keys_from_title(raw: str, keys: list[str]) -> None:
    if not raw:
        return
    spaced = re.sub(r"[\._]+", " ", raw)
    spaced = re.sub(r"\s+", " ", spaced).strip()
    for title in (raw, spaced, _stripped_title(spaced)):
        if title:
            _extend_keys(keys, title)


def title_keys_for_file(
    filename: str | None,
    game_title: str | None,
    relative_path: str | None = None,
    filepath: str | None = None,
) -> list[str]:
    """Build normalized lookup keys from a scanned filename / indexer title / folder path."""
    keys: list[str] = []
    _keys_from_title((game_title or "").strip(), keys)
    if filename:
        _keys_from_title(Path(filename).stem, keys)
    folder_keys: list[str] = []
    for title in folder_titles_from_path(relative_path or filepath):
        _extend_keys(folder_keys, title)
        _extend_keys(folder_keys, _stripped_title(title))
    folder_keys = [key for key in folder_keys if key not in keys]
    stem = Path(filename or "").stem.lower()
    if stem in GENERIC_INSTALLER_STEMS:
        return [key for key in folder_keys + keys if key not in GENERIC_INSTALLER_STEMS]
    return keys + folder_keys


def is_addon_title(filename: str | None, game_title: str | None) -> bool:
    haystack = f"{game_title or ''} {filename or ''}"
    return bool(_ADDON_MARK.search(haystack) or _UPDATE_TAIL.search(f" {haystack}"))


def match_catalog_row(keys: list[str], by_key: dict[str, dict], addon: bool) -> dict | None:
    for key in keys:
        row = by_key.get(key)
        if row:
            return row
    for key in keys:
        if len(key.split()) < 2:
            continue
        hits = [
            row
            for catalog_key, row in by_key.items()
            if catalog_key.startswith(key + " ")
            or (len(catalog_key.split()) >= 2 and key.startswith(catalog_key + " "))
        ]
        ids = {row["id"] for row in hits}
        if len(ids) == 1:
            return hits[0]
    if not addon:
        return None
    # Named DLC ("Cyberpunk 2077 Phantom Liberty DLC") still belongs to the parent title.
    for key in keys:
        parts = key.split()
        while len(parts) >= 2:
            parts.pop()
            row = by_key.get(" ".join(parts))
            if row:
                return row
    return None


def catalog_payload(item: MediaItem) -> dict:
    return {
        "id": str(item.id),
        "title": item.title,
        "slug": item.slug,
        "overview": item.overview,
        "poster_url": getattr(item, "poster_url", None),
        "backdrop_url": getattr(item, "backdrop_url", None),
        "logo_url": getattr(item, "logo_url", None),
        "textless_poster_url": getattr(item, "textless_poster_url", None),
        "icon_url": getattr(item, "icon_url", None),
    }


def match_files_to_catalog(files: list[dict]) -> None:
    """Attach ``catalog_item`` (with artwork) onto each scanned file dict."""
    if not files:
        return

    catalog_rows = list(MediaItem.objects.filter(media_type="game").values("id", "title", "slug"))
    by_id: dict[int, dict] = {row["id"]: row for row in catalog_rows}
    by_key: dict[str, dict] = {}
    for row in catalog_rows:
        for extra in _match_keys(row["title"] or ""):
            if extra and extra not in by_key:
                by_key[extra] = row

    matched_ids: set[int] = set()
    file_match: dict[int, int] = {}
    for index, file in enumerate(files):
        # Prefer an existing `.otix` media id when present and valid.
        raw_otix_id = file.get("otix_media_id")
        if raw_otix_id not in (None, ""):
            try:
                otix_id = int(raw_otix_id)
            except (TypeError, ValueError):
                otix_id = None
            if otix_id is not None and otix_id in by_id:
                matched_ids.add(otix_id)
                file_match[index] = otix_id
                continue

        filename = file.get("filename")
        game_title = file.get("game_title")
        row = match_catalog_row(
            title_keys_for_file(
                filename,
                game_title,
                relative_path=file.get("relative_path"),
                filepath=file.get("filepath"),
            ),
            by_key,
            is_addon_title(filename, game_title),
        )
        if row:
            matched_ids.add(row["id"])
            file_match[index] = row["id"]

    items_by_id: dict[int, MediaItem] = {}
    if matched_ids:
        items = list(MediaItem.objects.filter(id__in=matched_ids).prefetch_related("assets"))
        attach_media_urls(items)
        items_by_id = {item.id: item for item in items}

    for index, file in enumerate(files):
        media_id = file_match.get(index)
        item = items_by_id.get(media_id) if media_id is not None else None
        payload = catalog_payload(item) if item is not None else None
        # Prefer local sidecar artwork paths when present (node serves via otix/asset).
        if payload is not None:
            otix_images = file.get("otix_images") or {}
            file_id = file.get("id") or file.get("file_id")
            server_id = file.get("server_id")
            for role, field in (
                ("poster", "poster_url"),
                ("backdrop", "backdrop_url"),
                ("logo", "logo_url"),
                ("textlessPoster", "textless_poster_url"),
                ("icon", "icon_url"),
            ):
                ref = otix_images.get(role) if isinstance(otix_images, dict) else None
                local = None
                if isinstance(ref, dict):
                    local = ref.get("local")
                if local and file_id and server_id:
                    payload[field] = (
                        f"/api/v1/library/servers/{server_id}/files/{file_id}/otix/asset/{role}"
                    )
        file["catalog_item"] = payload


def _is_bin_file(file: dict) -> bool:
    ext = (file.get("extension") or "").lower().lstrip(".")
    name = (file.get("filename") or "").lower()
    return ext == "bin" or name.endswith(".bin")


def unmatched_scan_titles(files: list[dict], *, limit: int = 100) -> list[str]:
    """Human titles for unmatched base releases (skip .bin, updates, DLC)."""
    titles: list[str] = []
    seen: set[str] = set()
    for file in files:
        if _is_bin_file(file):
            continue
        if file.get("catalog_item"):
            continue
        if is_addon_title(file.get("filename"), file.get("game_title")):
            continue
        candidates: list[str] = []
        game_title = (file.get("game_title") or "").strip()
        if game_title:
            candidates.append(game_title)
        candidates.extend(
            title_keys_for_file(
                file.get("filename"),
                file.get("game_title"),
                relative_path=file.get("relative_path"),
                filepath=file.get("filepath"),
            )
        )
        for raw in candidates:
            key = _lookup_key(raw)
            if not key or key in seen or len(key) < 2:
                continue
            seen.add(key)
            titles.append(game_title or raw)
            break
        if len(titles) >= limit:
            break
    return titles
