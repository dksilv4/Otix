#!/usr/bin/env python3
import os
import sys
import shutil
import json
import time

ROOT = "/Volumes/Games"

def safe_move(src, dst):
    if not os.path.exists(src):
        return False
    if os.path.abspath(src) == os.path.abspath(dst):
        return True
    
    # Ensure destination parent exists
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    
    if os.path.exists(dst):
        # Empty directory at dst? Remove it so we can rename
        if os.path.isdir(dst) and len(os.listdir(dst)) == 0:
            os.rmdir(dst)
        elif os.path.isdir(src) and os.path.isdir(dst):
            print(f"  [MERGE] Merging {src} -> {dst}")
            for item in sorted(os.listdir(src)):
                if item == ".DS_Store":
                    try: os.remove(os.path.join(src, item))
                    except Exception: pass
                    continue
                s_item = os.path.join(src, item)
                d_item = os.path.join(dst, item)
                safe_move(s_item, d_item)
            try:
                for it in os.listdir(src):
                    if it == ".DS_Store" or it.startswith(".smbdelete"):
                        try: os.remove(os.path.join(src, it))
                        except Exception: pass
                if len(os.listdir(src)) == 0:
                    os.rmdir(src)
            except Exception:
                pass
            return True
        else:
            # File conflict
            if os.path.basename(src) == ".DS_Store":
                try: os.remove(src)
                except Exception: pass
                return True
            s_size = os.path.getsize(src)
            d_size = os.path.getsize(dst)
            if s_size == d_size:
                print(f"  [IDENTICAL] Keeping existing: {dst}")
                try: os.remove(src)
                except Exception: pass
                return True
            else:
                print(f"  [CONFLICT] Destination exists with different size ({d_size} vs {s_size}): {dst}")
                base, ext = os.path.splitext(dst)
                alt_dst = f"{base}_alt{ext}"
                return safe_move(src, alt_dst)

    print(f"  [MOVE] {src} -> {dst}")
    t0 = time.time()
    try:
        os.rename(src, dst)
        print(f"    -> Done in {time.time()-t0:.3f}s")
        return True
    except OSError as e:
        print(f"  [ERROR] os.rename failed from {src} to {dst}: {e}")
        return False

def write_otix_sidecar(target_dir, title, title_id=None, platform_name=None):
    os.makedirs(target_dir, exist_ok=True)
    otix_path = os.path.join(target_dir, ".otix")
    data = {}
    if os.path.exists(otix_path):
        try:
            with open(otix_path) as f:
                data = json.load(f)
        except Exception:
            pass
    data["version"] = 1
    if title:
        data["title"] = title
    if title_id:
        data["titleId"] = title_id
    if platform_name:
        data["platforms"] = [{"name": platform_name, "slug": platform_name.lower().replace(" ", "-")}]
    
    with open(otix_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"  [OTIX] Wrote sidecar: {otix_path} (Title: '{title}', ID: '{title_id}')")

def main():
    print(f"Starting Physical Platform Organization on {ROOT}...")
    
    # Create base platform directories
    for p in ["PS5", "Switch", "PS4", "PC"]:
        os.makedirs(os.path.join(ROOT, p), exist_ok=True)

    # ── 1. PS5 Games ──
    print("\n--- 1. Organizing PlayStation 5 Games ---")
    
    # Hollow Knight: Silksong
    hk_src = os.path.join(ROOT, "app0 [PS5]")
    hk_dst = os.path.join(ROOT, "PS5", "Hollow Knight - Silksong [PPSA12544]")
    if os.path.exists(hk_src):
        safe_move(hk_src, hk_dst)
    write_otix_sidecar(hk_dst, "Hollow Knight: Silksong", "PPSA12544", "PlayStation 5")

    # Rayman 30th Anniversary Edition
    rayman_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Rayman.30th.Anniversary.Edition.PS5-DUPLEX")
    rayman_dst = os.path.join(ROOT, "PS5", "Rayman 30th Anniversary Edition [PPSA33016]")
    safe_move(rayman_src, rayman_dst)
    write_otix_sidecar(rayman_dst, "Rayman 30th Anniversary Edition", "PPSA33016", "PlayStation 5")

    # Dead Cells PS5
    deadcells_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Dead.Cells.PS5-DUPLEX")
    deadcells_dst = os.path.join(ROOT, "PS5", "Dead Cells [PPSA15554]")
    safe_move(deadcells_src, deadcells_dst)
    write_otix_sidecar(deadcells_dst, "Dead Cells", "PPSA15554", "PlayStation 5")

    # Hollow Knight NFO companion
    hk_nfo_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Hollow.Knight.Silksong.PS5-DUPLEX")
    if os.path.exists(hk_nfo_src):
        for f in os.listdir(hk_nfo_src):
            safe_move(os.path.join(hk_nfo_src, f), os.path.join(hk_dst, f))
        try: os.rmdir(hk_nfo_src)
        except Exception: pass

    # ── 2. Nintendo Switch Games ──
    print("\n--- 2. Organizing Nintendo Switch Games ---")
    
    # Zelda Tears of the Kingdom
    zelda_src = os.path.join(ROOT, "The Legend Of Zelda Tears Of The Kingdom NSW [Switch]")
    zelda_dst = os.path.join(ROOT, "Switch", "The Legend of Zelda - Tears of the Kingdom")
    safe_move(zelda_src, zelda_dst)
    write_otix_sidecar(zelda_dst, "The Legend of Zelda: Tears of the Kingdom", None, "Nintendo Switch")

    # Metroid Prime 4 Beyond
    metroid_src = os.path.join(ROOT, "Metroid Prime 4 Beyond HR [Switch]")
    metroid_dst = os.path.join(ROOT, "Switch", "Metroid Prime 4 - Beyond")
    safe_move(metroid_src, metroid_dst)
    write_otix_sidecar(metroid_dst, "Metroid Prime 4: Beyond", None, "Nintendo Switch")

    # Digimon Story Time Stranger
    digimon_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Digimon_Story_Time_Stranger_Update_v1.2.2_NSW-VENOM")
    digimon_dst = os.path.join(ROOT, "Switch", "Digimon Story - Time Stranger", "Updates")
    safe_move(digimon_src, digimon_dst)
    write_otix_sidecar(os.path.join(ROOT, "Switch", "Digimon Story - Time Stranger"), "Digimon Story: Time Stranger", None, "Nintendo Switch")

    # Super Mario Galaxy
    mario_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Super_Mario_Galaxy_NSW-VENOM")
    mario_dst = os.path.join(ROOT, "Switch", "Super Mario Galaxy")
    safe_move(mario_src, mario_dst)
    write_otix_sidecar(mario_dst, "Super Mario Galaxy", None, "Nintendo Switch")

    # Tomb Raider I-III Remastered Switch Update
    tr_src = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Tomb_Raider_I-III_Remastered_Starring_Lara_Croft_Update_v1.1.4_NSW-VENOM")
    tr_dst = os.path.join(ROOT, "Switch", "Tomb Raider I-III Remastered Starring Lara Croft", "Updates")
    safe_move(tr_src, tr_dst)
    write_otix_sidecar(os.path.join(ROOT, "Switch", "Tomb Raider I-III Remastered Starring Lara Croft"), "Tomb Raider I-III Remastered", None, "Nintendo Switch")

    # Clean Switch/Lies of P noise (desktop.ini / folder.jpg) into PC/Lies of P
    sw_lies_of_p = os.path.join(ROOT, "Switch", "Lies of P - Complete Edition")
    if os.path.exists(sw_lies_of_p):
        for f in os.listdir(sw_lies_of_p):
            safe_move(os.path.join(sw_lies_of_p, f), os.path.join(ROOT, "PC", "Lies of P", f))
        try: os.rmdir(sw_lies_of_p)
        except Exception: pass

    # ── 3. PlayStation 4 Games ──
    print("\n--- 3. Organizing PlayStation 4 Games ---")
    
    kh3_dst = os.path.join(ROOT, "PS4", "Kingdom Hearts III")
    
    # KH3 Updates & DLC from root
    kh3_update = os.path.join(ROOT, "Kingdom Hearts III DUPLEX [PS4]")
    if os.path.exists(kh3_update):
        for f in sorted(os.listdir(kh3_update)):
            safe_move(os.path.join(kh3_update, f), os.path.join(kh3_dst, "Updates", f))
        try: os.rmdir(kh3_update)
        except Exception: pass

    for dlc_folder in [
        "Kingdom Hearts III Dawn Till Dusk Keyblade DLC [PS4]",
        "Kingdom Hearts III Midnight Blue Keyblade DLC [PS4]",
        "Kingdom Hearts III Re Mind DLC [PS4]",
        "Kingdom Hearts III Starlight Keyblade DLC [PS4]"
    ]:
        p = os.path.join(ROOT, dlc_folder)
        if os.path.exists(p):
            for f in sorted(os.listdir(p)):
                safe_move(os.path.join(p, f), os.path.join(kh3_dst, "DLC", f))
            try: os.rmdir(p)
            except Exception: pass

    # Nested KH3 in Baldur's Gate 3 Digital
    bg_kh3_dlc = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Kingdom.Hearts.III.DLC.Unlocker.PS4-DUPLEX")
    if os.path.exists(bg_kh3_dlc):
        safe_move(bg_kh3_dlc, os.path.join(kh3_dst, "DLC", "Kingdom.Hearts.III.DLC.Unlocker.PS4-DUPLEX"))

    bg_kh3_upd = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]", "Black Myth - Wukong", "Kingdom.Hearts.III.Update.v1.10.PS4-DUPLEX")
    if os.path.exists(bg_kh3_upd):
        safe_move(bg_kh3_upd, os.path.join(kh3_dst, "Updates", "Kingdom.Hearts.III.Update.v1.10.PS4-DUPLEX"))

    write_otix_sidecar(kh3_dst, "Kingdom Hearts III", None, "PlayStation 4")

    # ── 4. PC Games ──
    print("\n--- 4. Organizing PC Games ---")
    
    # Fix PC/1 /Updates into PC/AI Limit/Updates
    pc_1 = os.path.join(ROOT, "PC", "1 ")
    if os.path.exists(pc_1):
        safe_move(os.path.join(pc_1, "Updates"), os.path.join(ROOT, "PC", "AI Limit", "Updates"))
        try: os.rmdir(pc_1)
        except Exception: pass

    # A. Un-nest games from AI Limit [PC]
    ai_limit_bucket = os.path.join(ROOT, "AI Limit [PC]")
    if os.path.exists(ai_limit_bucket):
        for entry in sorted(os.listdir(ai_limit_bucket)):
            if entry.startswith(".") or entry == "desktop.ini":
                continue
            src_p = os.path.join(ai_limit_bucket, entry)
            
            # Special handling for Crack folder in AI Limit
            if entry.lower() == "crack":
                for crack_sub in sorted(os.listdir(src_p)):
                    if crack_sub.startswith("."): continue
                    cp = os.path.join(src_p, crack_sub)
                    if "wukong" in crack_sub.lower():
                        safe_move(cp, os.path.join(ROOT, "PC", "Black Myth - Wukong", "Crack", crack_sub))
                    elif "hogwarts" in crack_sub.lower():
                        safe_move(cp, os.path.join(ROOT, "PC", "Hogwarts Legacy", "Crack", crack_sub))
                    else:
                        safe_move(cp, os.path.join(ROOT, "PC", crack_sub, "Crack"))
                try: os.rmdir(src_p)
                except Exception: pass
                continue
            
            # Map clean name
            target_game_name = entry
            if target_game_name == "Cyberpunk 2077 (2077)":
                target_game_name = "Cyberpunk 2077"
            elif target_game_name == "Lords of the Fallen 2023 (2023)":
                target_game_name = "Lords of the Fallen 2023"
            elif target_game_name == "Red Dead Redemption 2 Ultimate Edition":
                target_game_name = "Red Dead Redemption 2"
            elif target_game_name == "Elden Ring Deluxe Edition":
                target_game_name = "Elden Ring"
            elif target_game_name == "Baldurs Gate 3":
                target_game_name = "Baldur's Gate 3"
            elif target_game_name == "Black Myth Wukong":
                target_game_name = "Black Myth - Wukong"
            elif target_game_name == "High On Life High On Knife":
                dst_p = os.path.join(ROOT, "PC", "High on Life 2", "DLC")
                safe_move(src_p, dst_p)
                continue
            elif target_game_name == "RuneScapeDragonwilds Fix Repair Steam":
                dst_p = os.path.join(ROOT, "PC", "RuneScape - Dragonwilds", "Crack", target_game_name)
                safe_move(src_p, dst_p)
                continue
            elif target_game_name == "Dead or Alive 6 Deluxe Edition":
                target_game_name = "Dead or Alive 6"
            elif target_game_name == "Sifu Deluxe Edition":
                target_game_name = "Sifu"
            elif target_game_name == "Marvels SpiderMan Miles Morales":
                target_game_name = "Marvel's Spider-Man - Miles Morales"
            elif target_game_name == "Marvels SpiderMan Remastered":
                target_game_name = "Marvel's Spider-Man Remastered"
            elif target_game_name == "Marvels SpiderMan 2":
                target_game_name = "Marvel's Spider-Man 2"
            elif target_game_name == "God of War Ragnarok":
                target_game_name = "God of War Ragnarök"
            elif target_game_name == "DOOM Eternal":
                target_game_name = "Doom - Eternal"
            elif target_game_name == "High On Life":
                target_game_name = "High on Life"
            elif target_game_name == "High On Life 2":
                target_game_name = "High on Life 2"
            elif target_game_name == "Hogwarts Legacy Deluxe Edition":
                target_game_name = "Hogwarts Legacy"
            elif target_game_name == "Deus Ex Mankind Divided":
                target_game_name = "Deus Ex - Mankind Divided"
            elif target_game_name == "Kingdom Come Deliverance II":
                target_game_name = "Kingdom Come - Deliverance II"
            elif target_game_name == "Kingdom Hearts III and Re Mind":
                target_game_name = "Kingdom Hearts III and Re Mind"
            elif target_game_name == "Summers Heartbeat Deluxe Edition I KnoW":
                target_game_name = "Summers Heartbeat"
            elif target_game_name == "Tainted Grail The Fall of Avalon":
                target_game_name = "Tainted Grail - The Fall of Avalon"
            elif target_game_name == "The Elder Scrolls IV Oblivion Remastered":
                target_game_name = "The Elder Scrolls IV - Oblivion Remastered"
            elif target_game_name == "Tomb Raider IV VI Remastered":
                target_game_name = "Tomb Raider IV-VI Remastered"
            elif target_game_name == "Warhammer 40,000 Space Marine 2 1 Year Anniversary Edition Bonuses":
                target_game_name = "Warhammer 40,000 - Space Marine 2"
            elif target_game_name == "Need for Speed Most Wanted (Black Edition)":
                target_game_name = "Need for Speed - Most Wanted (Black Edition)"
            elif target_game_name == "Launcher":
                try: shutil.rmtree(src_p)
                except Exception: pass
                continue

            dst_p = os.path.join(ROOT, "PC", target_game_name)
            safe_move(src_p, dst_p)

    # B. Un-nest games from Baldur's Gate 3 Digital [PC]
    bg3_bucket = os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]")
    if os.path.exists(bg3_bucket):
        for entry in sorted(os.listdir(bg3_bucket)):
            if entry.startswith(".") or entry == "desktop.ini":
                continue
            src_p = os.path.join(bg3_bucket, entry)
            
            if entry == "Black Myth - Wukong":
                for sub in sorted(os.listdir(src_p)):
                    if sub.startswith("."): continue
                    sub_p = os.path.join(src_p, sub)
                    if sub == "Five.Hearts.Under.One.Roof..MULTi13-ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Five Hearts Under One Roof", sub))
                    elif sub == "Five.Hearts.Under.One.Roof.2.MULTi10-ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Five Hearts Under One Roof 2", sub))
                    elif sub == "Kingdom Come Deliverance II v1.5.0 ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Kingdom Come - Deliverance II", sub))
                    elif sub == "Kingdom Hearts III and Re-Mind (build 13.06.2024)-ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Kingdom Hearts III and Re Mind", sub))
                    elif sub == "Summers.Heartbeat.Deluxe.Edition-I KnoW":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Summers Heartbeat", sub))
                    elif sub == "Transport.Fever.3.Deluxe.Edition.v40408.MULTi13-ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Transport Fever 3", sub))
                    elif sub == "Valheim.v1.0.7.MULTi14-ElAmigos":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Valheim", sub))
                    elif sub == "Black.Myth.Wukong-voices38":
                        safe_move(sub_p, os.path.join(ROOT, "PC", "Black Myth - Wukong", sub))
                    elif os.path.isdir(sub_p):
                        safe_move(sub_p, os.path.join(ROOT, "PC", sub))
                try: os.rmdir(src_p)
                except Exception: pass
                continue
            
            clean_name = entry
            clean_name = clean_name.replace(" - Deluxe Edition", "").replace(" - Digital Deluxe Edition", "").replace(" - Collector's Edition", "").strip()
            if clean_name.endswith(" [PC]"):
                clean_name = clean_name[:-5].strip()

            dst_p = os.path.join(ROOT, "PC", clean_name)
            safe_move(src_p, dst_p)

    # C. Un-nest games from PC/ root folder
    pc_bucket = os.path.join(ROOT, "PC")
    if os.path.exists(pc_bucket):
        for entry in sorted(os.listdir(pc_bucket)):
            if entry.startswith(".") or entry in ["1 ", "1"]:
                continue
            src_p = os.path.join(pc_bucket, entry)
            if entry == "Baldur's Gate III":
                safe_move(src_p, os.path.join(ROOT, "PC", "Baldur's Gate 3"))
            elif entry == "Red Dead Redemption":
                dlc_src = os.path.join(src_p, "Red_Dead_Redemption_2_Ultimate_Edition_DLC_Unlocker-Razor1911")
                if os.path.exists(dlc_src):
                    safe_move(dlc_src, os.path.join(ROOT, "PC", "Red Dead Redemption 2", "DLC", "Red_Dead_Redemption_2_Ultimate_Edition_DLC_Unlocker-Razor1911"))

    # D. Move top-level PC games into PC/
    for entry in sorted(os.listdir(ROOT)):
        if entry.startswith(".") or entry in ["PS5", "Switch", "PS4", "PC", "TODO", "1 [PC]", "g4u to games 4 you url [PC]"]:
            continue
        src_p = os.path.join(ROOT, entry)
        if not os.path.isdir(src_p):
            continue

        clean_name = entry.replace(" [PC]", "").strip()
        if clean_name == "Cyberpunk 2077":
            safe_move(src_p, os.path.join(ROOT, "PC", "Cyberpunk 2077"))
        elif clean_name == "Dead or Alive 6 Digital":
            safe_move(src_p, os.path.join(ROOT, "PC", "Dead or Alive 6"))
        elif clean_name == "Elden Ring":
            safe_move(src_p, os.path.join(ROOT, "PC", "Elden Ring"))
        elif clean_name.startswith("God of War Ragnaro"):
            safe_move(src_p, os.path.join(ROOT, "PC", "God of War Ragnarök"))
        elif clean_name == "God of War":
            safe_move(src_p, os.path.join(ROOT, "PC", "God of War"))
        elif clean_name == "Lies of P H1":
            safe_move(src_p, os.path.join(ROOT, "PC", "Lies of P"))
        elif clean_name == "Lords of the Fallen 2023":
            safe_move(src_p, os.path.join(ROOT, "PC", "Lords of the Fallen 2023"))
        elif clean_name == "Marvel's Spider Man Miles Morales":
            safe_move(src_p, os.path.join(ROOT, "PC", "Marvel's Spider-Man - Miles Morales"))
        elif clean_name == "Marvel's Spider Man Remastered":
            safe_move(src_p, os.path.join(ROOT, "PC", "Marvel's Spider-Man Remastered"))
        elif clean_name == "Red Dead Redemption 2":
            safe_move(src_p, os.path.join(ROOT, "PC", "Red Dead Redemption 2"))
        elif clean_name == "Red Dead Redemption":
            safe_move(src_p, os.path.join(ROOT, "PC", "Red Dead Redemption"))
        elif clean_name == "Sifu":
            safe_move(src_p, os.path.join(ROOT, "PC", "Sifu"))
        elif clean_name == "Stellar Blade Digital":
            safe_move(src_p, os.path.join(ROOT, "PC", "Stellar Blade"))
        elif os.path.isdir(src_p):
            safe_move(src_p, os.path.join(ROOT, "PC", clean_name))

    # ── 5. Cleanup empty directories and noise ──
    print("\n--- 5. Cleaning Empty Directories and Noise ---")
    for trash in [
        os.path.join(ROOT, "1 [PC]"),
        os.path.join(ROOT, "TODO"),
        os.path.join(ROOT, "g4u to games 4 you url [PC]"),
        os.path.join(ROOT, "PC", "1 "),
        os.path.join(ROOT, "AI Limit [PC]"),
        os.path.join(ROOT, "Baldur's Gate 3 Digital [PC]")
    ]:
        if os.path.exists(trash):
            try:
                # Remove .DS_Store or .smbdelete
                for root_dir, dirs, files in os.walk(trash, topdown=False):
                    for f in files:
                        if f == ".DS_Store" or f.startswith(".smbdelete"):
                            try: os.remove(os.path.join(root_dir, f))
                            except Exception: pass
                    for d in dirs:
                        try: os.rmdir(os.path.join(root_dir, d))
                        except Exception: pass
                if os.path.isdir(trash):
                    if len(os.listdir(trash)) == 0:
                        os.rmdir(trash)
                        print(f"  [REMOVED] Cleaned empty: {trash}")
                    else:
                        print(f"  [NOTE] {trash} still has files: {os.listdir(trash)}")
                else:
                    os.remove(trash)
                    print(f"  [REMOVED] Cleaned: {trash}")
            except Exception as e:
                print(f"  [WARN] Could not clean {trash}: {e}")

    # Write .otix sidecars for all PC games in PC/
    for pc_game in sorted(os.listdir(os.path.join(ROOT, "PC"))):
        if pc_game.startswith("."): continue
        game_path = os.path.join(ROOT, "PC", pc_game)
        if os.path.isdir(game_path):
            write_otix_sidecar(game_path, pc_game, None, "PC")

    print("\n✔ Platform organization completed successfully!")

if __name__ == "__main__":
    main()
