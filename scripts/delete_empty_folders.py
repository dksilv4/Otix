#!/usr/bin/env python3
import os
import shutil

ROOT = "/Volumes/Games"

# Candidate wrapper folders that only contain .otix and/or .DS_Store
candidates = [
    "/Volumes/Games/PC/AI Limit/AI Limit",
    "/Volumes/Games/PC/Deus Ex/Deus Ex Mankind Divided 1.19.801.0",
    "/Volumes/Games/PC/Elden Ring/Elden Ring Deluxe Edition v1.12.0",
    "/Volumes/Games/PC/Five Hearts Under One Roof/Five.Hearts.Under.One.Roof..MULTi13-ElAmigos",
    "/Volumes/Games/PC/Hades II/Hades II v1.132940-ElAmigos",
    "/Volumes/Games/PC/High on Life 2/High On Life (build 03.10.2023)",
    "/Volumes/Games/PC/High on Life 2/High.On.Life.2.MULTi7-ElAmigos",
    "/Volumes/Games/PC/Hogwarts Legacy/Hogwarts_Legacy_Deluxe_Edition_MULTi11-ElAmigos",
    "/Volumes/Games/PC/Invincible VS/Invincible.VS.MULTi6-ElAmigos",
    "/Volumes/Games/PC/Kingdom Come - Deliverance II/Kingdom Come Deliverance II v1.5.0 ElAmigos",
    "/Volumes/Games/PC/Lies of P/Lies of P v1.5.0.0 H1",
    "/Volumes/Games/PC/Marvel's Spider-Man - Miles Morales/Marvel's Spider Man Miles Morales",
    "/Volumes/Games/PC/Marvel's Spider-Man - Miles Morales/Marvel's Spider Man Remastered",
    "/Volumes/Games/PC/Pragmata/Pragmata-ElAmigos",
    "/Volumes/Games/PC/Red Dead Redemption/Red Dead Redemption",
    "/Volumes/Games/PC/Satisfactory/Satisfactory (build 365306)",
    "/Volumes/Games/PC/Split Fiction/Split Fiction",
    "/Volumes/Games/PC/Tainted Grail - The Fall of Avalon/Tainted  Grail The Fall of Avalon",
    "/Volumes/Games/PC/The Alters/The Alters",
    "/Volumes/Games/PC/The Last of Us Part I/The Last of Us Part I"
]

def clean_empty():
    removed = []
    skipped = []
    
    for path in candidates:
        if not os.path.exists(path):
            continue
        
        # Check files excluding .DS_Store and .otix
        game_files = [f for f in os.listdir(path) if f not in [".DS_Store", ".otix"] and not f.startswith(".smbdelete")]
        if len(game_files) == 0:
            for f in os.listdir(path):
                fp = os.path.join(path, f)
                try: os.remove(fp)
                except Exception: pass
            
            try:
                os.rmdir(path)
                removed.append(path)
                print(f"[REMOVED] {path}")
            except Exception as e:
                try:
                    shutil.rmtree(path, ignore_errors=True)
                    if not os.path.exists(path):
                        removed.append(path)
                        print(f"[REMOVED] {path}")
                    else:
                        print(f"[FAILED] {path}: {e}")
                        skipped.append(path)
                except Exception as e2:
                    print(f"[FAILED] {path}: {e2}")
                    skipped.append(path)
        else:
            print(f"[SKIP NOT EMPTY] {path} contains: {game_files}")
            skipped.append(path)

    print(f"\nDone: {len(removed)} empty wrapper folders deleted, {len(skipped)} skipped.")

if __name__ == "__main__":
    clean_empty()
