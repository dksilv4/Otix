#!/usr/bin/env python3
import json
import os

def generate_ground_truth():
    # Define Ground Truth Catalog
    library = {
        "PC": [
            {
                "title": "AI Limit [PC]",
                "files": ["AI Limit.iso", ".otix"]
            },
            {
                "title": "Balatro [PC]",
                "files": ["Balatro.exe", ".otix"]
            },
            {
                "title": "Balatro - Special Edition [PC]",
                "files": ["Balatro.exe", "engine data... (folder package)", ".otix"]
            },
            {
                "title": "Baldur's Gate 3 [PC]",
                "files": [
                    "Baldurs Gate 3.iso",
                    "Updates/Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "Black Myth: Wukong [PC]",
                "files": [
                    "Black.Myth.Wukong-voices38.iso",
                    "Crack/Black.Myth.Wukong.CRACKFIX-voices38/",
                    ".otix"
                ]
            },
            {
                "title": "Blade and Sorcery VR [PC]",
                "files": ["Blade and Sorcery VR.iso", ".otix"]
            },
            {
                "title": "Call of Duty: Black Ops II [PC]",
                "files": ["Call of Duty - Black Ops II.iso", ".otix"]
            },
            {
                "title": "Clair Obscur: Expedition 33 [PC]",
                "files": ["Clair Obscur Expedition 33.iso", "Updates/", ".otix"]
            },
            {
                "title": "Cyberpunk 2077 [PC]",
                "files": [
                    "Cyberpunk 2077.iso",
                    "Updates/Cyberpunk 2077 update 2.12 - 2.13.exe",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "Dead or Alive 6 [PC]",
                "files": ["Dead or Alive 6 Deluxe Edition.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Deus Ex: Mankind Divided [PC]",
                "files": ["Deus Ex Mankind Divided.iso", ".otix"]
            },
            {
                "title": "Dispatch [PC]",
                "files": ["Dispatch.iso", ".otix"]
            },
            {
                "title": "Doom: Eternal [PC]",
                "files": ["Doom - Eternal Deluxe Edition.iso", "Updates/", ".otix"]
            },
            {
                "title": "Dyson Sphere Program [PC]",
                "files": ["DSPGAME.exe", "DSPGAME_Data/", "Updates/", ".otix"]
            },
            {
                "title": "Elden Ring [PC]",
                "files": [
                    "Elden Ring Deluxe Edition.iso",
                    "Updates/Elden Ring update 1.12.3 - 1.13.0.exe",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "Final Fantasy VII Rebirth [PC]",
                "files": ["Final Fantasy VII Rebirth.iso", "Updates/", ".otix"]
            },
            {
                "title": "Five Hearts Under One Roof [PC]",
                "files": ["Five Hearts Under One Roof.iso", ".otix"]
            },
            {
                "title": "Five Hearts Under One Roof 2 [PC]",
                "files": ["Five Hearts Under One Roof 2.iso", ".otix"]
            },
            {
                "title": "FOUNDRY [PC]",
                "files": ["Foundry.exe", "Foundry_Data/", ".otix"]
            },
            {
                "title": "God of War [PC]",
                "files": ["God of War.iso", "Updates/", ".otix"]
            },
            {
                "title": "God of War Ragnarök [PC]",
                "files": [
                    "God of War Ragnarok.iso",
                    "Updates/",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "Hades II [PC]",
                "files": ["Hades II.iso", ".otix"]
            },
            {
                "title": "High on Life [PC]",
                "files": ["High On Life.iso", ".otix"]
            },
            {
                "title": "High on Life 2 [PC]",
                "files": [
                    "High On Life 2.iso",
                    "DLC/High_On_Life_High_On_Knife-Razor1911.iso",
                    "Updates/",
                    ".otix"
                ]
            },
            {
                "title": "Hogwarts Legacy [PC]",
                "files": [
                    "Hogwarts Legacy Deluxe Edition.iso",
                    "Crack/Hogwarts_Legacy_-_small_DLC_unlocker_+_CrackFix_Win11_24H2/",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "Invincible VS [PC]",
                "files": ["Invincible VS.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Kiborg [PC]",
                "files": ["Kiborg.iso", "Updates/", ".otix"]
            },
            {
                "title": "Kingdom Come: Deliverance II [PC]",
                "files": ["Kingdom Come Deliverance II.iso", ".otix"]
            },
            {
                "title": "Kingdom Hearts III and Re Mind [PC]",
                "files": ["Kingdom Hearts III and Re-Mind.iso", ".otix"]
            },
            {
                "title": "Lies of P [PC]",
                "files": ["Lies of P.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Lords of the Fallen 2023 [PC]",
                "files": ["Lords of the Fallen 2023.iso", "Updates/", ".otix"]
            },
            {
                "title": "Marvel's Spider-Man 2 [PC]",
                "files": [
                    "Marvels SpiderMan 2/ (Repack Folder Package Intact)",
                    "├── setup.exe",
                    "├── elamigos-1.bin ... elamigos-4.bin",
                    "└── .otix"
                ]
            },
            {
                "title": "Marvel's Spider-Man: Miles Morales [PC]",
                "files": ["Marvel's Spider Man Miles Morales.iso", "Updates/", ".otix"]
            },
            {
                "title": "Marvel's Spider-Man Remastered [PC]",
                "files": ["Marvel's Spider Man Remastered.iso", "Updates/", ".otix"]
            },
            {
                "title": "Need for Speed: Most Wanted (Black Edition) [PC]",
                "files": [
                    "speed.exe", "GLOBAL/", "CARS/", "NextGenGraphics/", ".otix"
                ]
            },
            {
                "title": "Pragmata [PC]",
                "files": ["Pragmata.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Red Dead Redemption [PC]",
                "files": ["Red Dead Redemption.iso", ".otix"]
            },
            {
                "title": "Red Dead Redemption 2 [PC]",
                "files": [
                    "Red_Dead_Redemption_2_Ultimate_Edition-Razor1911.iso",
                    "DLC/Red_Dead_Redemption_2_Ultimate_Edition_DLC_Unlocker-Razor1911/",
                    ".otix"
                ]
            },
            {
                "title": "Remnant II [PC]",
                "files": [
                    "Remnant II.iso",
                    "Updates/Remnant_II_update_444.163_-_453.438_ElAmigos/",
                    ".otix", "folder.jpg", "icon.ico"
                ]
            },
            {
                "title": "RuneScape: Dragonwilds [PC]",
                "files": [
                    "RuneScape Dragonwilds.iso",
                    "Crack/RuneScapeDragonwilds Fix Repair Steam/",
                    ".otix"
                ]
            },
            {
                "title": "Satisfactory [PC]",
                "files": ["Satisfactory.iso", ".otix"]
            },
            {
                "title": "Sifu [PC]",
                "files": ["Sifu Deluxe Edition.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Split Fiction [PC]",
                "files": ["Split Fiction.iso", ".otix"]
            },
            {
                "title": "Stellar Blade [PC]",
                "files": ["Stellar.Blade-voices38.iso", "voices38.nfo", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Summers Heartbeat [PC]",
                "files": ["Summers Heartbeat Deluxe Edition.iso", ".otix"]
            },
            {
                "title": "Tainted Grail: The Fall of Avalon [PC]",
                "files": ["Tainted Grail The Fall of Avalon.iso", ".otix"]
            },
            {
                "title": "The Alters [PC]",
                "files": ["The Alters.iso", ".otix"]
            },
            {
                "title": "The Elder Scrolls IV: Oblivion Remastered [PC]",
                "files": ["The Elder Scrolls IV Oblivion Remastered.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "The Last of Us Part I [PC]",
                "files": ["The Last of Us Part I.iso", ".otix"]
            },
            {
                "title": "The Last of Us Part II Remastered [PC]",
                "files": ["The Last of Us Part II Remastered.iso", ".otix"]
            },
            {
                "title": "The Universim [PC]",
                "files": ["The Universim.iso", ".otix", "folder.jpg", "icon.ico"]
            },
            {
                "title": "Tomb Raider IV-VI Remastered [PC]",
                "files": ["Tomb Raider IV VI Remastered.iso", ".otix"]
            },
            {
                "title": "Transport Fever 3 [PC]",
                "files": ["Transport Fever 3.iso", ".otix"]
            },
            {
                "title": "Valheim [PC]",
                "files": ["Valheim.iso", ".otix"]
            },
            {
                "title": "Warhammer 40,000: Space Marine 2 [PC]",
                "files": ["Warhammer 40,000 Space Marine 2 1 Year Anniversary Edition Bonuses.iso", ".otix"]
            }
        ],
        "PS5": [
            {
                "title": "Hollow Knight: Silksong [PS5] [PPSA12544]",
                "files": [
                    "eboot.bin (PS5 Executable)",
                    "sce_sys/ (param.json, icon0.png, pic0.png, snd0.at9.wav)",
                    "Media/ (assets)",
                    "sce_module/ (prx modules)",
                    "ampr_emu.index",
                    "fakelib/",
                    "_DUPLEX_/",
                    ".otix (with titleId: PPSA12544)"
                ]
            },
            {
                "title": "Rayman 30th Anniversary Edition [PS5] [PPSA33016]",
                "files": [
                    "PPSA33016-app0/ (eboot.bin, sce_sys/param.json, sce_module/, assets/)",
                    "duplex-rayman.30th.anniversary.edition.ps5.sfv",
                    "duplex.nfo",
                    ".otix (with titleId: PPSA33016)"
                ]
            },
            {
                "title": "Dead Cells [PS5] [PPSA15554]",
                "files": [
                    "Dead.Cells.PS5-DUPLEX.pak",
                    "PPSA15552.complete.txt",
                    "duplex-dead.cells.ps5.sfv",
                    "duplex.nfo",
                    ".otix (with titleId: PPSA15554)"
                ]
            }
        ],
        "Switch": [
            {
                "title": "The Legend of Zelda: Tears of the Kingdom [Switch]",
                "files": ["The_Legend_Of_Zelda_Tears_Of_The_Kingdom_NSW-NiiNTENDO.xci", ".otix"]
            },
            {
                "title": "Metroid Prime 4: Beyond [Switch]",
                "files": ["Metroid Prime 4 Beyond NSW-HR.xci", ".otix"]
            },
            {
                "title": "Super Mario Galaxy [Switch]",
                "files": [
                    "v-super_mario_galaxy.nsp.hdf",
                    "Updates/v-super_mario_galaxy_v131072.nsp.hdf",
                    "v-super_mario_galaxy.nfo", "v-super_mario_galaxy.sfv",
                    ".otix"
                ]
            },
            {
                "title": "Digimon Story: Time Stranger [Switch]",
                "files": [
                    "Updates/v-digimon_story_time_stranger_v262144.nsp.hdf",
                    "v-digimon_story_time_stranger_v262144.nfo",
                    ".otix"
                ]
            },
            {
                "title": "Tomb Raider I-III Remastered Starring Lara Croft [Switch]",
                "files": [
                    "Updates/v-tomb_raider_v851968.nsp.hdf",
                    "v-tomb_raider_v851968.nfo",
                    ".otix"
                ]
            }
        ],
        "PS4": [
            {
                "title": "Kingdom Hearts III [PS4]",
                "files": [
                    "Updates/Kingdom.Hearts.III.Update.v1.10.PS4-DUPLEX.pkg",
                    "DLC/Kingdom.Hearts.III.Dawn.Till.Dusk.Keyblade.DLC.PS4-DUPLEX.pkg",
                    "DLC/Kingdom.Hearts.III.Midnight.Blue.Keyblade.DLC.PS4-DUPLEX.pkg",
                    "DLC/Kingdom.Hearts.III.Re.Mind.DLC.PS4-DUPLEX.pkg",
                    "DLC/Kingdom.Hearts.III.Starlight.Keyblade.DLC.PS4-DUPLEX.pkg",
                    "DLC/Kingdom.Hearts.III.DLC.Unlocker.PS4-DUPLEX/",
                    ".otix"
                ]
            }
        ]
    }

    lines = ["/Volumes/Games/ (Ground Truth / Target Architecture)"]
    for plat in ["PS5", "Switch", "PS4", "PC"]:
        games = library[plat]
        lines.append(f"│")
        lines.append(f"├── 🎮 {plat} ({len(games)} Titles)")
        for i, g in enumerate(games):
            is_last_game = (i == len(games) - 1)
            g_prefix = "│   └── " if is_last_game else "│   ├── "
            f_prefix = "│       " if is_last_game else "│   │   "
            lines.append(f"{g_prefix}📁 {g['title']}/")
            for j, f in enumerate(g['files']):
                is_last_file = (j == len(g['files']) - 1)
                file_sym = "└── " if is_last_file else "├── "
                lines.append(f"{f_prefix}{file_sym}{f}")

    with open("scripts/tree_source_of_truth.txt", "w") as f:
        f.write("\n".join(lines))
    print("Saved scripts/tree_source_of_truth.txt")

if __name__ == "__main__":
    generate_ground_truth()
