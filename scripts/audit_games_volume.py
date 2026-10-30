#!/usr/bin/env python3
import os
import sys
import json
import re

ROOT = "/Volumes/Games"

# Known noise folders or asset subdirectories that should not be treated as separate games
ASSET_DIRS = {
    "engine", "content", "binaries", "plugins", "saved", "intermediate", "config",
    "data", "levels", "materials", "models", "particles", "resource", "scripts", "sound",
    "textures", "cars", "global", "frontend", "tracks", "shader", "shaders",
    "mono", "monobleedingedge", "il2cpp_data", "managed",
    "directx", "vcredist", "_commonredist", "support", "redist", "dotnetfx",
    "crashreport", "crashreports", "easyanticheat", "battleye", "nativeui",
    "movies", "audio", "video", "ui", "locale", "locales", "localization",
    "pak", "paks", "dlc_data", "patch_data", "cache"
}

def is_game_root(entries):
    lower_entries = [e.lower() for e in entries]
    
    # Repack or installer package
    has_setup = any(e in ("setup.exe", "installer.exe") or (e.startswith("setup") and e.endswith(".exe")) for e in lower_entries)
    has_bins = any(e.endswith((".bin", ".cab", ".doi")) for e in lower_entries)
    if has_setup and has_bins:
        return True, "repack_package"

    # PS5 dump
    if "eboot.bin" in lower_entries or "sce_sys" in lower_entries or any(e.endswith(".pak") and "ps5" in e for e in lower_entries):
        return True, "ps5_dump"

    # PS4 / PS3 pkg package
    if any(e.endswith(".pkg") for e in lower_entries):
        return True, "playstation_pkg"

    # Switch ROMs
    if any(e.endswith((".nsp", ".xci", ".nsz", ".xcz")) for e in lower_entries):
        return True, "switch_rom"

    # PC ISO image
    if any(e.endswith((".iso", ".img")) for e in lower_entries):
        return True, "disc_image"

    # Check for direct game executables (not setup, not uninstall)
    game_exes = [
        e for e in lower_entries
        if e.endswith(".exe") and not any(k in e for k in [
            "unins", "setup", "install", "crash", "vcredist", "dxsetup",
            "easyanticheat", "battleye", "epic", "unity", "cef", "redist", "config"
        ])
    ]
    
    # Unity / Unreal engine indicators
    has_unity = any(e.endswith("_data") for e in lower_entries)
    has_engine = "engine" in lower_entries

    if game_exes and (has_unity or has_engine or len(lower_entries) > 5):
        return True, "installed_game"

    return False, None

def scan_path(current_path, rel_path=""):
    try:
        entries = sorted(os.listdir(current_path))
    except Exception as e:
        return {"error": str(e)}

    # Filter out hidden files
    visible_entries = [e for e in entries if not e.startswith(".")]

    is_root, kind = is_game_root(visible_entries)
    if is_root:
        # Check for sub-features like Updates, DLC, Crack
        sub_items = {}
        files = []
        for e in visible_entries:
            p = os.path.join(current_path, e)
            if os.path.isdir(p):
                e_lower = e.lower()
                if e_lower in ("updates", "update", "dlc", "dlcs", "crack", "cracks"):
                    sub_items[e] = scan_path(p, os.path.join(rel_path, e))
                elif not e_lower in ASSET_DIRS:
                    # Could be a nested game or standalone sub-package
                    # Check if it has an exe or game root
                    sub_entries = [se.lower() for se in os.listdir(p)] if os.path.exists(p) else []
                    sub_is_root, _ = is_game_root(sub_entries)
                    if sub_is_root:
                        sub_items[e] = scan_path(p, os.path.join(rel_path, e))
            else:
                files.append(e)
        return {
            "type": "game_container",
            "kind": kind,
            "path": rel_path,
            "files": files,
            "children": sub_items
        }

    # If not a game container, traverse directories
    sub_items = {}
    files = []
    for e in visible_entries:
        p = os.path.join(current_path, e)
        if os.path.isdir(p):
            e_lower = e.lower()
            if e_lower not in ASSET_DIRS:
                sub_items[e] = scan_path(p, os.path.join(rel_path, e))
        else:
            files.append(e)

    return {
        "type": "directory",
        "path": rel_path,
        "files": files,
        "children": sub_items
    }

def main():
    print(f"Scanning {ROOT}...")
    res = scan_path(ROOT)
    out_path = "/Users/dk/Documents/GitHub/Otix/scripts/games_volume_scan.json"
    with open(out_path, "w") as f:
        json.dump(res, f, indent=2)
    print(f"Scan complete! Saved to {out_path}")

if __name__ == "__main__":
    main()
