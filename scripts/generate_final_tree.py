#!/usr/bin/env python3
import os

ROOT = "/Volumes/Games"

def generate_tree():
    lines = [f"{ROOT}/"]
    platforms = sorted([p for p in os.listdir(ROOT) if os.path.isdir(os.path.join(ROOT, p)) and not p.startswith(".")])
    
    for i, plat in enumerate(platforms):
        plat_is_last = (i == len(platforms) - 1)
        plat_prefix = "└── " if plat_is_last else "├── "
        plat_indent = "    " if plat_is_last else "│   "
        plat_path = os.path.join(ROOT, plat)
        lines.append(f"{plat_prefix}{plat}/")
        
        games = sorted([g for g in os.listdir(plat_path) if not g.startswith(".")])
        for j, game in enumerate(games):
            game_is_last = (j == len(games) - 1)
            game_prefix = f"{plat_indent}└── " if game_is_last else f"{plat_indent}├── "
            game_indent = f"{plat_indent}    " if game_is_last else f"{plat_indent}│   "
            game_path = os.path.join(plat_path, game)
            
            if os.path.isdir(game_path):
                lines.append(f"{game_prefix}{game}/")
                contents = sorted([c for c in os.listdir(game_path) if not c.startswith(".")])
                for k, c in enumerate(contents):
                    c_is_last = (k == len(contents) - 1)
                    c_prefix = f"{game_indent}└── " if c_is_last else f"{game_indent}├── "
                    c_path = os.path.join(game_path, c)
                    if os.path.isdir(c_path):
                        lines.append(f"{c_prefix}{c}/")
                    else:
                        lines.append(f"{c_prefix}{c}")
            else:
                lines.append(f"{game_prefix}{game}")
                
    result = "\n".join(lines)
    with open("scripts/final_folder_structure.txt", "w") as f:
        f.write(result)
    print(f"Generated final tree ({len(lines)} lines)")
    return result

if __name__ == "__main__":
    generate_tree()
