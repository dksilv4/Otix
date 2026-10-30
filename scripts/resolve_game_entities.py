#!/usr/bin/env python3
import os
import json
import re

with open("scripts/audited_games.json") as f:
    items = json.load(f)

# Known platforms mapping
PLATFORM_HINTS = {
    "switch": "Switch", "nsw": "Switch",
    "ps5": "PS5", "ppsa": "PS5",
    "ps4": "PS4", "cusa": "PS4",
    "ps3": "PS3", "bcus": "PS3", "bles": "PS3", "blus": "PS3",
    "pc": "PC", "win": "PC"
}

def resolve_game(item):
    rel = item["rel"]
    name = item["name"]
    is_f = item["is_file"]
    parent = item["parent"]
    has_param = item["has_param_json"]
    ps5_id = item["ps5_title_id"]
    ps5_name = item["ps5_title_name"]
    otix_title = item["otix_title"]
    otix_platform = item["otix_platform"]
    files = item.get("dir_files", [])
    subdirs = item.get("dir_subdirs", [])

    # 1. PS5 dump detection
    if has_param and ps5_name:
        return {
            "title": ps5_name,
            "platform": "PS5",
            "title_id": ps5_id,
            "category": "PS5 Dump (Container Package)",
            "source": rel,
            "notes": f"Verified from sce_sys/param.json (Title ID: {ps5_id})"
        }

    # 2. Check if it's app0 [PS5]
    if name.lower() == "app0 [ps5]" or rel.lower() == "app0 [ps5]":
        return {
            "title": ps5_name if ps5_name else "Hollow Knight: Silksong",
            "platform": "PS5",
            "title_id": ps5_id if ps5_id else "PPSA12544",
            "category": "PS5 Dump (Container Package)",
            "source": rel,
            "notes": "Verified from sce_sys/param.json and duplex.nfo"
        }

    # 3. Check for scene PS5 package like Rayman.30th.Anniversary.Edition.PS5-DUPLEX
    if "ps5" in name.lower() or "ps5" in rel.lower():
        plat = "PS5"
        title = name
        # Clean title
        m = re.match(r"^([A-Za-z0-9._\s\-]+?)(?:\.PS5|\-PS5|\[PS5\])", name, re.IGNORECASE)
        if m:
            title = m.group(1).replace(".", " ").strip()
        if ps5_name:
            title = ps5_name
        return {
            "title": title,
            "platform": "PS5",
            "title_id": ps5_id,
            "category": "PS5 Game Package",
            "source": rel,
            "notes": "PS5 scene release / package"
        }

    # 4. Check for Switch ROMs / packages
    if any(tag in name.lower() or tag in rel.lower() for tag in ["nsw", "switch"]) or any(f.lower().endswith((".xci", ".nsp")) for f in files) or name.lower().endswith((".xci", ".nsp")):
        # Extract title
        t = name
        if name.lower().endswith((".xci", ".nsp", ".hdf")):
            t = os.path.splitext(name)[0]
        t = re.sub(r"[._]", " ", t)
        t = re.sub(r"(?i)\b(?:NSW|HR|NiiNTENDO|VENOM|xci|nsp|hdf|Update|v\d+)\b.*", "", t).strip()
        is_update = "update" in name.lower() or "update" in rel.lower() or "v131072" in name or "v851968" in name or "v262144" in name
        return {
            "title": t,
            "platform": "Switch",
            "title_id": "",
            "category": "Switch Update" if is_update else "Switch ROM",
            "source": rel,
            "notes": "Nintendo Switch ROM / Update"
        }

    # 5. Check for PS4 PKG
    if any(f.lower().endswith(".pkg") for f in files) or name.lower().endswith(".pkg") or "[ps4]" in rel.lower() or "ps4" in name.lower():
        t = name
        t = re.sub(r"[._]", " ", t)
        t = re.sub(r"(?i)\b(?:PS4|DUPLEX|pkg|DLC|Update|Unlocker)\b.*", "", t).strip()
        is_update = "update" in name.lower() or "update" in rel.lower()
        is_dlc = "dlc" in name.lower() or "dlc" in rel.lower() or "keyblade" in name.lower()
        cat = "PS4 DLC" if is_dlc else ("PS4 Update" if is_update else "PS4 Package")
        return {
            "title": t,
            "platform": "PS4",
            "title_id": "",
            "category": cat,
            "source": rel,
            "notes": "PlayStation 4 PKG"
        }

    # 6. Noise / Empty folders / URLs
    if name in ["1 [PC]", "1 ", "TODO"]:
        return {
            "title": name,
            "platform": "None",
            "title_id": "",
            "category": "Empty Directory (To Clean/Remove)",
            "source": rel,
            "notes": "Empty folder"
        }
    if name.lower().endswith(".url") or name.lower() == "g4u to games 4 you url [pc]":
        return {
            "title": name,
            "platform": "None",
            "title_id": "",
            "category": "Noise / Web Shortcut (To Remove)",
            "source": rel,
            "notes": "URL shortcut"
        }
    if is_f and name.lower() in [".ds_store", "desktop.ini", "folder.jpg", "icon.ico"]:
        return {
            "title": parent or name,
            "platform": "None",
            "title_id": "",
            "category": "Preserved Artwork / Metadata",
            "source": rel,
            "notes": "Metadata file"
        }

    # 7. PC Games
    t = name
    if is_f and name.lower().endswith((".iso", ".exe", ".bin")):
        t = os.path.splitext(name)[0]
    # Clean title
    clean_t = otix_title if otix_title else t
    clean_t = re.sub(r"\[PC\]|\(PC\)", "", clean_t)
    clean_t = re.sub(r"(?i)(?:-Razor1911|-ElAmigos|-voices38|-I KnoW|MULTi\d+|v\d+(?:\.\d+)*|build \d+).*", "", clean_t)
    clean_t = clean_t.replace(".", " ").replace("_", " ").strip()

    is_update = "update" in rel.lower() or "updates" in rel.lower() or "patch" in name.lower()
    is_crack = "crack" in rel.lower() or "crackfix" in name.lower()
    is_dlc = "dlc" in rel.lower() or "unlocker" in name.lower()

    cat = "PC Update" if is_update else ("PC Crack" if is_crack else ("PC DLC" if is_dlc else "PC Base Game"))

    return {
        "title": clean_t,
        "platform": "PC",
        "title_id": "",
        "category": cat,
        "source": rel,
        "notes": f"PC {cat}"
    }

resolved = [resolve_game(it) for it in items]

with open("scripts/resolved_game_entities.json", "w") as f:
    json.dump(resolved, f, indent=2)

print(f"Resolved {len(resolved)} entities.")
