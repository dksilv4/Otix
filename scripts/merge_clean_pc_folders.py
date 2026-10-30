#!/usr/bin/env python3
import os
import shutil

ROOT = "/Volumes/Games/PC"

def safe_rm(path):
    if not os.path.exists(path):
        return
    for root, dirs, files in os.walk(path, topdown=False):
        for f in files:
            try: os.remove(os.path.join(root, f))
            except Exception: pass
        for d in dirs:
            try: os.rmdir(os.path.join(root, d))
            except Exception: pass
    try:
        if os.path.isdir(path):
            os.rmdir(path)
        else:
            os.remove(path)
    except Exception:
        pass

def merge(src_name, dst_name):
    src = os.path.join(ROOT, src_name)
    dst = os.path.join(ROOT, dst_name)
    if not os.path.exists(src):
        return
    os.makedirs(dst, exist_ok=True)
    print(f"Merging {src_name} -> {dst_name}")
    for item in sorted(os.listdir(src)):
        if item == ".DS_Store" or item == ".otix":
            continue
        s_item = os.path.join(src, item)
        d_item = os.path.join(dst, item)
        if os.path.exists(d_item):
            if os.path.isdir(s_item) and os.path.isdir(d_item):
                for sub in os.listdir(s_item):
                    if sub == ".DS_Store": continue
                    s_sub = os.path.join(s_item, sub)
                    d_sub = os.path.join(d_item, sub)
                    if not os.path.exists(d_sub):
                        os.rename(s_sub, d_sub)
                try: os.rmdir(s_item)
                except Exception: pass
            else:
                print(f"  Conflict for {item}, skipping overwrite")
        else:
            os.rename(s_item, d_item)
    safe_rm(src)
    print(f"  Cleaned {src_name}")

def main():
    # 1. Clean BG3 empty duplicates
    for bg in ["Baldur's Gate 3 Digital", "Baldur's Gate III"]:
        p = os.path.join(ROOT, bg)
        safe_rm(p)
        print(f"Removed empty duplicate: {bg}")

    # 2. Clair Obscur Expedition 33
    merge("Clair Obscur Expedition 33", "Clair Obscur - Expedition 33")

    # 3. Doom - Eternal Deluxe Edition
    merge("Doom - Eternal Deluxe Edition", "Doom - Eternal")

    # 4. RuneScape Dragonwilds
    merge("RuneScape Dragonwilds", "RuneScape - Dragonwilds")

    # 5. Balatro Special Edition
    merge("Balatro - Special Edition", "Balatro")

    # 6. Lords of the Fallen II
    merge("Lords of the Fallen II", "Lords of the Fallen 2023")

    print("✔ PC duplicates merged successfully!")

if __name__ == "__main__":
    main()
