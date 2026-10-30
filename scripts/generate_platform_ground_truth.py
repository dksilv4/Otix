#!/usr/bin/env python3
import json

def generate_platform_tree():
    # Load all distinct games catalog
    library = {
        "PS5": [
            {
                "folder": "Hollow Knight - Silksong [PPSA12544]",
                "files": [
                    "eboot.bin",
                    "Media/ (assets)",
                    "sce_module/ (prx modules)",
                    "ampr_emu.index",
                    "fakelib/",
                    "_DUPLEX_/",
                    "sce_sys/ (param.json, icon0.png, pic0.png, snd0.at9.wav)",
                    ".otix (Sidecar with TitleID: PPSA12544)"
                ]
            },
            {
                "folder": "Rayman 30th Anniversary Edition [PPSA33016]",
                "files": [
                    "PPSA33016-app0/ (eboot.bin, sce_sys/param.json, sce_module/, assets/)",
                    "duplex-rayman.30th.anniversary.edition.ps5.sfv",
                    "duplex.nfo",
                    ".otix (Sidecar with TitleID: PPSA33016)"
                ]
            },
            {
                "folder": "Dead Cells [PPSA15554]",
                "files": [
                    "Dead.Cells.PS5-DUPLEX.pak",
                    "PPSA15552.complete.txt",
                    "duplex-dead.cells.ps5.sfv",
                    "duplex.nfo",
                    ".otix (Sidecar with TitleID: PPSA15554)"
                ]
            }
        ],
        "Switch": [
            {
                "folder": "The Legend of Zelda - Tears of the Kingdom",
                "files": [
                    "The_Legend_Of_Zelda_Tears_Of_The_Kingdom_NSW-NiiNTENDO.xci",
                    ".otix"
                ]
            },
            {
                "folder": "Metroid Prime 4 - Beyond",
                "files": [
                    "Metroid Prime 4 Beyond NSW-HR.xci",
                    ".otix"
                ]
            },
            {
                "folder": "Super Mario Galaxy",
                "files": [
                    "v-super_mario_galaxy.nsp.hdf",
                    "Updates/v-super_mario_galaxy_v131072.nsp.hdf",
                    "v-super_mario_galaxy.nfo",
                    "v-super_mario_galaxy.sfv",
                    ".otix"
                ]
            },
            {
                "folder": "Digimon Story - Time Stranger",
                "files": [
                    "Updates/v-digimon_story_time_stranger_v262144.nsp.hdf",
                    "v-digimon_story_time_stranger_v262144.nfo",
                    ".otix"
                ]
            },
            {
                "folder": "Tomb Raider I-III Remastered Starring Lara Croft",
                "files": [
                    "Updates/v-tomb_raider_v851968.nsp.hdf",
                    "v-tomb_raider_v851968.nfo",
                    ".otix"
                ]
            }
        ],
        "PS4": [
            {
                "folder": "Kingdom Hearts III",
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
        ],
        "PC": [
            {"folder": "AI Limit", "files": ["AI Limit.iso", ".otix"]},
            {"folder": "Balatro", "files": ["Balatro.exe", ".otix"]},
            {"folder": "Balatro - Special Edition", "files": ["Balatro.exe", "engine data... (folder package intact)", ".otix"]},
            {"folder": "Baldur's Gate 3", "files": [
                "Baldurs Gate 3.iso (114.9 GB consolidated)",
                "Updates/Baldurs Gate 3 update 4 1 1 5009956 4 1 1 5849914 ElAmigos.bin",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "Black Myth - Wukong", "files": [
                "Black.Myth.Wukong-voices38.iso (143.6 GB)",
                "Crack/Black.Myth.Wukong.CRACKFIX-voices38/",
                ".otix"
            ]},
            {"folder": "Blade and Sorcery VR", "files": ["Blade and Sorcery VR.iso", ".otix"]},
            {"folder": "Call of Duty - Black Ops II", "files": ["Call of Duty - Black Ops II.iso", ".otix"]},
            {"folder": "Clair Obscur - Expedition 33", "files": ["Clair Obscur Expedition 33.iso", "Updates/", ".otix"]},
            {"folder": "Cyberpunk 2077", "files": [
                "Cyberpunk 2077.iso (103.6 GB consolidated)",
                "Updates/Cyberpunk 2077 update 2.12 - 2.13.exe",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "Dead or Alive 6", "files": ["Dead or Alive 6 Deluxe Edition.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Deus Ex - Mankind Divided", "files": ["Deus Ex Mankind Divided.iso", ".otix"]},
            {"folder": "Dispatch", "files": ["Dispatch.iso", ".otix"]},
            {"folder": "Doom - Eternal", "files": ["Doom - Eternal Deluxe Edition.iso", "Updates/", ".otix"]},
            {"folder": "Dyson Sphere Program", "files": ["DSPGAME.exe", "DSPGAME_Data/", "Updates/", ".otix"]},
            {"folder": "Elden Ring", "files": [
                "Elden Ring Deluxe Edition.iso (67.0 GB consolidated)",
                "Updates/Elden Ring update 1.12.3 - 1.13.0.exe",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "Final Fantasy VII Rebirth", "files": ["Final Fantasy VII Rebirth.iso", "Updates/", ".otix"]},
            {"folder": "Five Hearts Under One Roof", "files": ["Five Hearts Under One Roof.iso", ".otix"]},
            {"folder": "Five Hearts Under One Roof 2", "files": ["Five Hearts Under One Roof 2.iso", ".otix"]},
            {"folder": "FOUNDRY", "files": ["Foundry.exe", "Foundry_Data/", ".otix"]},
            {"folder": "God of War", "files": ["God of War.iso (32.7 GB)", "Updates/", ".otix"]},
            {"folder": "God of War Ragnarök", "files": [
                "God of War Ragnarok.iso (85.3 GB)",
                "Updates/",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "Hades II", "files": ["Hades II.iso", ".otix"]},
            {"folder": "High on Life", "files": ["High On Life.iso", ".otix"]},
            {"folder": "High on Life 2", "files": [
                "High On Life 2.iso",
                "DLC/High_On_Life_High_On_Knife-Razor1911.iso",
                "Updates/",
                ".otix"
            ]},
            {"folder": "Hogwarts Legacy", "files": [
                "Hogwarts Legacy Deluxe Edition.iso",
                "Crack/Hogwarts_Legacy_-_small_DLC_unlocker_+_CrackFix_Win11_24H2/",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "Invincible VS", "files": ["Invincible VS.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Kiborg", "files": ["Kiborg.iso", "Updates/", ".otix"]},
            {"folder": "Kingdom Come - Deliverance II", "files": ["Kingdom Come Deliverance II.iso", ".otix"]},
            {"folder": "Kingdom Hearts III and Re Mind", "files": ["Kingdom Hearts III and Re-Mind.iso (39.2 GB)", ".otix"]},
            {"folder": "Lies of P", "files": ["Lies of P.iso (28.1 GB consolidated)", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Lords of the Fallen 2023", "files": ["Lords of the Fallen 2023.iso", "Updates/", ".otix"]},
            {"folder": "Marvel's Spider-Man 2", "files": [
                "setup.exe",
                "elamigos-1.bin ... elamigos-4.bin",
                ".otix"
            ]},
            {"folder": "Marvel's Spider-Man - Miles Morales", "files": ["Marvel's Spider Man Miles Morales.iso", "Updates/", ".otix"]},
            {"folder": "Marvel's Spider-Man Remastered", "files": ["Marvel's Spider Man Remastered.iso", "Updates/", ".otix"]},
            {"folder": "Need for Speed - Most Wanted (Black Edition)", "files": [
                "speed.exe", "GLOBAL/", "CARS/", "NextGenGraphics/", ".otix"
            ]},
            {"folder": "Pragmata", "files": ["Pragmata.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Red Dead Redemption", "files": ["Red Dead Redemption.iso", ".otix"]},
            {"folder": "Red Dead Redemption 2", "files": [
                "Red_Dead_Redemption_2_Ultimate_Edition-Razor1911.iso (119 GB)",
                "DLC/Red_Dead_Redemption_2_Ultimate_Edition_DLC_Unlocker-Razor1911/",
                ".otix"
            ]},
            {"folder": "Remnant II", "files": [
                "Remnant II.iso",
                "Updates/Remnant_II_update_444.163_-_453.438_ElAmigos/",
                ".otix", "folder.jpg", "icon.ico"
            ]},
            {"folder": "RuneScape - Dragonwilds", "files": [
                "RuneScape Dragonwilds.iso",
                "Crack/RuneScapeDragonwilds Fix Repair Steam/",
                ".otix"
            ]},
            {"folder": "Satisfactory", "files": ["Satisfactory.iso", ".otix"]},
            {"folder": "Sifu", "files": ["Sifu Deluxe Edition.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Split Fiction", "files": ["Split Fiction.iso", ".otix"]},
            {"folder": "Stellar Blade", "files": ["Stellar.Blade-voices38.iso (62.5 GB)", "voices38.nfo", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Summers Heartbeat", "files": ["Summers Heartbeat Deluxe Edition.iso", ".otix"]},
            {"folder": "Tainted Grail - The Fall of Avalon", "files": ["Tainted Grail The Fall of Avalon.iso", ".otix"]},
            {"folder": "The Alters", "files": ["The Alters.iso", ".otix"]},
            {"folder": "The Elder Scrolls IV - Oblivion Remastered", "files": ["The Elder Scrolls IV Oblivion Remastered.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "The Last of Us Part I", "files": ["The Last of Us Part I.iso", ".otix"]},
            {"folder": "The Last of Us Part II Remastered", "files": ["The Last of Us Part II Remastered.iso", ".otix"]},
            {"folder": "The Universim", "files": ["The Universim.iso", ".otix", "folder.jpg", "icon.ico"]},
            {"folder": "Tomb Raider IV-VI Remastered", "files": ["Tomb Raider IV VI Remastered.iso", ".otix"]},
            {"folder": "Transport Fever 3", "files": ["Transport Fever 3.iso", ".otix"]},
            {"folder": "Valheim", "files": ["Valheim.iso", ".otix"]},
            {"folder": "Warhammer 40,000 - Space Marine 2", "files": ["Warhammer 40,000 Space Marine 2 1 Year Anniversary Edition Bonuses.iso", ".otix"]}
        ]
    }

    lines = ["/Volumes/Games/ (Platform-Based Organized Structure)"]
    platforms = ["PS5", "Switch", "PS4", "PC"]
    for p_idx, plat in enumerate(platforms):
        games = library[plat]
        is_last_plat = (p_idx == len(platforms) - 1)
        plat_prefix = "└── " if is_last_plat else "├── "
        plat_indent = "    " if is_last_plat else "│   "
        lines.append(f"{plat_prefix}📁 {plat}/ ({len(games)} Titles)")
        for g_idx, g in enumerate(games):
            is_last_game = (g_idx == len(games) - 1)
            g_prefix = f"{plat_indent}{'└── ' if is_last_game else '├── '}📁 {g['folder']}/"
            f_indent = f"{plat_indent}{'    ' if is_last_game else '│   '}"
            lines.append(g_prefix)
            for f_idx, f in enumerate(g['files']):
                is_last_f = (f_idx == len(g['files']) - 1)
                f_prefix = f"{f_indent}{'└── ' if is_last_f else '├── '}{f}"
                lines.append(f_prefix)

    with open("scripts/platform_based_tree.txt", "w") as f:
        f.write("\n".join(lines))
    print("Done. Generated scripts/platform_based_tree.txt")

if __name__ == "__main__":
    generate_platform_tree()
