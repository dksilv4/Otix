#!/usr/bin/env python3
import json
import os
import sys

def render():
    with open("scripts/games_volume_scan.json") as f:
        scan_data = json.load(f)
    with open("scripts/daemon_preview.json") as f:
        daemon_data = json.load(f)
    with open("scripts/sim_output.json") as f:
        sim_data = json.load(f)
    with open("scripts/resolved_game_entities.json") as f:
        resolved_entities = json.load(f)

    # 1. Generate Raw Tree
    def fmt_tree(node, prefix="", is_last=True):
        lines = []
        name = os.path.basename(node.get("path", "")) or "Games"
        t = node.get("type", "")
        k = node.get("kind", "")
        files = node.get("files", [])
        children = node.get("children", {})
        
        tag = f" [{k}]" if k else ""
        lines.append(f"{prefix}{'└── ' if is_last else '├── '}{name}/{tag}")
        
        new_prefix = prefix + ("    " if is_last else "│   ")
        
        all_children = []
        # Non-noise files
        vis_files = [f for f in files if not f.startswith(".") and f not in ["desktop.ini", "Thumbs.db"]]
        for f in sorted(vis_files):
            all_children.append(("file", f))
        for cname in sorted(children.keys()):
            all_children.append(("dir", children[cname]))
            
        for i, (ctype, cobj) in enumerate(all_children):
            c_is_last = (i == len(all_children) - 1)
            if ctype == "file":
                lines.append(f"{new_prefix}{'└── ' if c_is_last else '├── '}{cobj}")
            else:
                lines.extend(fmt_tree(cobj, new_prefix, c_is_last))
        return lines

    raw_tree_lines = fmt_tree(scan_data, is_last=True)
    with open("scripts/tree_raw.txt", "w") as f:
        f.write("\n".join(raw_tree_lines))

    # 2. Generate Code Preview Output Tree
    # Group target paths from daemon_preview.json
    targets = {}
    for item in daemon_data:
        tgt = item.get("targetPath", "")
        src = item.get("sourcePath", "")
        status = item.get("status", "")
        platform = item.get("extracted", {}).get("Platform", "")
        title = item.get("extracted", {}).get("Title", "")
        title_id = item.get("extracted", {}).get("TitleId", "")
        targets[src] = {
            "target": tgt,
            "status": status,
            "platform": platform,
            "title": title,
            "title_id": title_id,
            "subdirs": item.get("subdirectories", [])
        }
    with open("scripts/code_preview_targets.json", "w") as f:
        json.dump(targets, f, indent=2)

    print("Rendered raw tree and code targets")

if __name__ == "__main__":
    render()
