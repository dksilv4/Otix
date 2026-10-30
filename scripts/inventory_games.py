#!/usr/bin/env python3
import os
import json
import re

ROOT = "/Volumes/Games"

# We want to identify every discrete item that could be organized:
# - Top-level files or folders
# - Nested games in "AI Limit [PC]", "Baldur's Gate 3 Digital [PC]", "PC", "Switch"
# - Updates, DLC, Crack folders
# - Standalone files (ISOs, PKGs, ROMs, URLs, Images)

items = []

def parse_ps5_param(sce_sys_dir):
    param_path = os.path.join(sce_sys_dir, "param.json")
    if os.path.exists(param_path):
        try:
            with open(param_path) as f:
                data = json.load(f)
            title_id = data.get("titleId", "")
            title_name = ""
            loc = data.get("localizedParameters", {})
            for lang in ["defaultLanguage", "en-GB", "en-US", "en"]:
                if lang in loc and isinstance(loc[lang], dict) and "titleName" in loc[lang]:
                    title_name = loc[lang]["titleName"]
                    break
            if not title_name:
                for k, v in loc.items():
                    if isinstance(v, dict) and "titleName" in v:
                        title_name = v["titleName"]
                        break
            return title_id, title_name
        except Exception:
            pass
    return None, None

def find_game_items():
    results = []
    
    # Check top level
    for entry in sorted(os.listdir(ROOT)):
        if entry.startswith("."):
            continue
        p = os.path.join(ROOT, entry)
        if os.path.isfile(p):
            results.append({
                "path": p,
                "rel": entry,
                "is_file": True,
                "name": entry,
                "parent": ""
            })
        elif os.path.isdir(p):
            # Check if this top-level dir is a container of multiple games (e.g. AI Limit [PC], Baldur's Gate 3 Digital [PC], PC, Switch)
            # or if it is a single game folder
            sub_entries = sorted(os.listdir(p))
            visible_subs = [s for s in sub_entries if not s.startswith(".")]
            
            # Check if it has multiple subdirectories that look like games
            # Or if it's a known multi-game bucket
            is_bucket = entry in ["AI Limit [PC]", "Baldur's Gate 3 Digital [PC]", "PC", "Switch"]
            
            if is_bucket:
                for sub in visible_subs:
                    sub_p = os.path.join(p, sub)
                    if os.path.isfile(sub_p):
                        results.append({
                            "path": sub_p,
                            "rel": os.path.join(entry, sub),
                            "is_file": True,
                            "name": sub,
                            "parent": entry
                        })
                    elif os.path.isdir(sub_p):
                        # Could sub have games inside? e.g. Baldur's Gate 3 Digital [PC]/Black Myth - Wukong
                        sub_children = sorted(os.listdir(sub_p))
                        vis_sub_children = [c for c in sub_children if not c.startswith(".")]
                        # Check if sub_children has scene releases (like NSW-VENOM, PS5-DUPLEX, etc.)
                        has_nested_releases = any(
                            any(tag in c for tag in ["NSW-", "PS5-", "PS4-", "ElAmigos", "voices38", "Razor1911"])
                            for c in vis_sub_children
                        )
                        if has_nested_releases:
                            # It's a nested folder containing releases!
                            for c in vis_sub_children:
                                cp = os.path.join(sub_p, c)
                                results.append({
                                    "path": cp,
                                    "rel": os.path.join(entry, sub, c),
                                    "is_file": os.path.isfile(cp),
                                    "name": c,
                                    "parent": os.path.join(entry, sub)
                                })
                        else:
                            results.append({
                                "path": sub_p,
                                "rel": os.path.join(entry, sub),
                                "is_file": False,
                                "name": sub,
                                "parent": entry
                            })
            else:
                results.append({
                    "path": p,
                    "rel": entry,
                    "is_file": False,
                    "name": entry,
                    "parent": ""
                })
    return results

all_items = find_game_items()
print(f"Total candidate entities: {len(all_items)}")
with open("scripts/inventory_items.json", "w") as f:
    json.dump(all_items, f, indent=2)
