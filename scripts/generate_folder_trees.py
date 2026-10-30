#!/usr/bin/env python3
import json
import os
import sys

def build_source_of_truth():
    with open("scripts/resolved_game_entities.json") as f:
        entities = json.load(f)

    # We want a clean tree:
    # {Platform}/{Title} ({Year}) or {Title} [{Platform}]
    # Group into clean structure:
    # E.g.
    # /Volumes/Games/
    # ├── Baldur's Gate 3 [PC]/
    # │   ├── Baldur's Gate 3.iso
    # │   └── Updates/
    # │       └── Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin
    # ...
    # ├── Hollow Knight: Silksong [PS5] [PPSA12544]/
    # │   ├── eboot.bin
    # │   ├── sce_sys/
    # │   │   └── param.json
    # │   └── ... (intact dump)
    pass

if __name__ == "__main__":
    print("Helper ready")
