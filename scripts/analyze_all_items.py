#!/usr/bin/env python3
import os
import json
import re

ROOT = "/Volumes/Games"

with open("scripts/inventory_items.json") as f:
    items = json.load(f)

print(f"Loaded {len(items)} items")

def inspect_item(item):
    p = item["path"]
    name = item["name"]
    is_f = item["is_file"]
    parent = item["parent"]

    # Gather files if dir
    dir_files = []
    dir_subdirs = []
    has_otix = False
    otix_data = None
    has_param_json = False
    ps5_title_id = ""
    ps5_title_name = ""

    if not is_f and os.path.exists(p):
        try:
            entries = os.listdir(p)
            dir_files = [e for e in entries if os.path.isfile(os.path.join(p, e))]
            dir_subdirs = [e for e in entries if os.path.isdir(os.path.join(p, e))]
            
            otix_path = os.path.join(p, ".otix")
            if os.path.exists(otix_path):
                has_otix = True
                try:
                    with open(otix_path) as f:
                        otix_data = json.load(f)
                except Exception:
                    pass

            # check for param.json
            for candidate_sce in [os.path.join(p, "sce_sys"), os.path.join(p, "PPSA33016-app0", "sce_sys")]:
                param_path = os.path.join(candidate_sce, "param.json")
                if os.path.exists(param_path):
                    has_param_json = True
                    try:
                        with open(param_path) as f:
                            pj = json.load(f)
                        ps5_title_id = pj.get("titleId", "")
                        loc = pj.get("localizedParameters", {})
                        for lang in ["en-GB", "en-US", "defaultLanguage", "en"]:
                            if lang in loc and isinstance(loc[lang], dict) and "titleName" in loc[lang]:
                                ps5_title_name = loc[lang]["titleName"]
                                break
                    except Exception:
                        pass
        except Exception as e:
            pass

    return {
        "name": name,
        "path": p,
        "rel": item["rel"],
        "parent": parent,
        "is_file": is_f,
        "dir_files": dir_files[:10],
        "dir_subdirs": dir_subdirs[:10],
        "has_otix": has_otix,
        "otix_media_id": otix_data.get("mediaId") if otix_data else None,
        "otix_title": otix_data.get("title") if otix_data else None,
        "otix_platform": otix_data.get("platforms", [{}])[0].get("name") if otix_data and otix_data.get("platforms") else None,
        "has_param_json": has_param_json,
        "ps5_title_id": ps5_title_id,
        "ps5_title_name": ps5_title_name
    }

audited = [inspect_item(it) for it in items]

with open("scripts/audited_games.json", "w") as f:
    json.dump(audited, f, indent=2)

print("Saved scripts/audited_games.json")
