/* ── Known save locations for game save discovery ── */

export interface SaveLocationsDb {
  version: number;
  games: Array<{
    id: string;
    titlePatterns: string[];
    windows: string[];
    mac?: string[];
    linux?: string[];
  }>;
}

export const SAVE_LOCATIONS: SaveLocationsDb =
{
  "version": 1,
  "games": [
    {
      "id": "hollow-knight",
      "titlePatterns": ["Hollow Knight", "hollowknight"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\Team Cherry\\Hollow Knight\\"],
      "mac": ["~/Library/Application Support/com.teamcherry.hollowknight/"],
      "linux": []
    },
    {
      "id": "elden-ring",
      "titlePatterns": ["Elden Ring", "eldenring"],
      "windows": ["%APPDATA%\\EldenRing\\"],
      "linux": []
    },
    {
      "id": "cyberpunk-2077",
      "titlePatterns": ["Cyberpunk 2077", "cyberpunk2077"],
      "windows": ["%USERPROFILE%\\Saved Games\\CD Projekt Red\\Cyberpunk 2077\\"],
      "linux": []
    },
    {
      "id": "stardew-valley",
      "titlePatterns": ["Stardew Valley", "stardewvalley"],
      "windows": ["%APPDATA%\\StardewValley\\Saves\\"],
      "mac": ["~/Library/Application Support/StardewValley/Saves/"],
      "linux": ["~/.config/StardewValley/Saves/"]
    },
    {
      "id": "witcher-3",
      "titlePatterns": ["The Witcher 3", "witcher3", "witcher 3 wild hunt", "witcher3wildhunt"],
      "windows": [
        "%USERPROFILE%\\Documents\\The Witcher 3\\gamesaves\\",
        "%USERPROFILE%\\Saved Games\\CD Projekt Red\\The Witcher 3\\"
      ],
      "linux": ["~/.local/share/wineprefixes/witcher3/drive_c/users/steamuser/Saved Games/CD Projekt Red/The Witcher 3/"]
    },
    {
      "id": "skyrim-se",
      "titlePatterns": ["Skyrim", "skyrim", "The Elder Scrolls V", "theelderscrollsv", "Skyrim Special Edition", "skyrimspecialedition"],
      "windows": [
        "%USERPROFILE%\\Documents\\My Games\\Skyrim Special Edition\\Saves\\",
        "%USERPROFILE%\\Documents\\My Games\\Skyrim\\Saves\\"
      ],
      "linux": []
    },
    {
      "id": "dark-souls-3",
      "titlePatterns": ["Dark Souls III", "darksouls3", "Dark Souls 3", "darksoulsiii"],
      "windows": ["%APPDATA%\\DarkSoulsIII\\"],
      "linux": []
    },
    {
      "id": "disco-elysium",
      "titlePatterns": ["Disco Elysium", "discoelysium"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\ZAUM Studio\\Disco Elysium\\SaveGames\\"],
      "linux": []
    },
    {
      "id": "hades",
      "titlePatterns": ["Hades", "hades"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\Hades\\"],
      "mac": ["~/Library/Application Support/Supergiant Games/Hades/"],
      "linux": []
    },
    {
      "id": "baldurs-gate-3",
      "titlePatterns": ["Baldur's Gate 3", "baldursgate3", "baldur's gate 3", "bg3"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\Larian Studios\\Baldur's Gate 3\\PlayerProfiles\\"],
      "mac": ["~/Library/Application Support/Larian Studios/Baldur's Gate 3/PlayerProfiles/"],
      "linux": []
    },
    {
      "id": "celeste",
      "titlePatterns": ["Celeste", "celeste"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\Celeste\\Saves\\"],
      "mac": ["~/Library/Application Support/Celeste/Saves/"],
      "linux": []
    },
    {
      "id": "terraria",
      "titlePatterns": ["Terraria", "terraria"],
      "windows": ["%USERPROFILE%\\Documents\\My Games\\Terraria\\Players\\"],
      "mac": ["~/Library/Application Support/Terraria/Players/"],
      "linux": ["~/.local/share/Terraria/Players/"]
    },
    {
      "id": "factorio",
      "titlePatterns": ["Factorio", "factorio"],
      "windows": ["%APPDATA%\\Factorio\\saves\\"],
      "mac": ["~/Library/Application Support/factorio/saves/"],
      "linux": ["~/.factorio/saves/"]
    },
    {
      "id": "risk-of-rain-2",
      "titlePatterns": ["Risk of Rain 2", "riskofrain2"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\Hopoo Games\\Risk of Rain 2\\"],
      "linux": []
    },
    {
      "id": "subnautica",
      "titlePatterns": ["Subnautica", "subnautica"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\Unknown Worlds\\Subnautica\\"],
      "linux": []
    },
    {
      "id": "valheim",
      "titlePatterns": ["Valheim", "valheim"],
      "windows": ["%APPDATA%\\valheim\\worlds\\"],
      "linux": []
    },
    {
      "id": "portal-2",
      "titlePatterns": ["Portal 2", "portal2"],
      "windows": ["%USERPROFILE%\\Documents\\Portal 2\\savedata\\"],
      "linux": []
    },
    {
      "id": "half-life-2",
      "titlePatterns": ["Half-Life 2", "halflife2", "half life 2"],
      "windows": ["%USERPROFILE%\\Documents\\Half-Life 2\\savedata\\"],
      "linux": []
    },
    {
      "id": "borderlands-3",
      "titlePatterns": ["Borderlands 3", "borderlands3"],
      "windows": ["%USERPROFILE%\\Documents\\My Games\\Borderlands 3\\Saved\\SaveGames\\"],
      "linux": []
    },
    {
      "id": "fallout-4",
      "titlePatterns": ["Fallout 4", "fallout4"],
      "windows": ["%USERPROFILE%\\Documents\\My Games\\Fallout4\\Saves\\"],
      "linux": []
    },
    {
      "id": "mass-effect-le",
      "titlePatterns": ["Mass Effect Legendary Edition", "masseffectlegendary", "mass effect legendary"],
      "windows": ["%USERPROFILE%\\Documents\\BioWare\\Mass Effect Legendary Edition\\Save\\"],
      "linux": []
    },
    {
      "id": "resident-evil-4",
      "titlePatterns": ["Resident Evil 4", "residentevil4", "Resident Evil 4 Remake", "residentevil4remake"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\RE4\\"],
      "linux": []
    },
    {
      "id": "dead-cells",
      "titlePatterns": ["Dead Cells", "deadcells"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\DeadCells\\"],
      "mac": ["~/Library/Application Support/DeadCells/"],
      "linux": []
    },
    {
      "id": "slay-the-spire",
      "titlePatterns": ["Slay the Spire", "slaythespire"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\SlayTheSpire\\"],
      "mac": ["~/Library/Application Support/SlayTheSpire/"],
      "linux": ["~/.local/share/SlayTheSpire/"]
    },
    {
      "id": "rimworld",
      "titlePatterns": ["RimWorld", "rimworld", "Rimworld"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\Ludeon Studios\\RimWorld\\Saves\\"],
      "linux": []
    },
    {
      "id": "dave-the-diver",
      "titlePatterns": ["Dave the Diver", "davethediver"],
      "windows": ["%USERPROFILE%\\AppData\\Local\\DaveTheDiver\\Saved\\SaveGames\\"],
      "linux": []
    },
    {
      "id": "vampire-survivors",
      "titlePatterns": ["Vampire Survivors", "vampiresurvivors"],
      "windows": ["%APPDATA%\\Vampire Survivors\\"],
      "linux": []
    },
    {
      "id": "hollow-knight-silksong",
      "titlePatterns": ["Hollow Knight Silksong", "silksong", "hollowknightsilksong"],
      "windows": ["%USERPROFILE%\\AppData\\LocalLow\\Team Cherry\\Silksong\\"],
      "mac": ["~/Library/Application Support/com.teamcherry.silksong/"],
      "linux": []
    }
  ]
}
