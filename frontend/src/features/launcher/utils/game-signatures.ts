export const KNOWN_GAME_SIGNATURES: Record<string, string> = {
  'cyberpunk2077.exe': 'Cyberpunk 2077',
  'witcher3.exe': 'The Witcher 3: Wild Hunt',
  'gta5.exe': 'Grand Theft Auto V',
  'rdr2.exe': 'Red Dead Redemption 2',
  'eldenring.exe': 'Elden Ring',
  'starfield.exe': 'Starfield',
  'bg3.exe': "Baldur's Gate 3",
  'bg3_dx11.exe': "Baldur's Gate 3",
  'baldursgate3.exe': "Baldur's Gate 3",
  'hogwartslegacy.exe': 'Hogwarts Legacy',
  'forzahorizon5.exe': 'Forza Horizon 5',
  'monsterhunterworld.exe': 'Monster Hunter: World',
  'monsterhunterrise.exe': 'Monster Hunter Rise',
  'cs2.exe': 'Counter-Strike 2',
  'csgo.exe': 'Counter-Strike: Global Offensive',
  'dota2.exe': 'Dota 2',
  'valorant.exe': 'Valorant',
  'valorant-win64-shipping.exe': 'Valorant',
  'leagueclient.exe': 'League of Legends',
  'destiny2.exe': 'Destiny 2',
  'overwatch.exe': 'Overwatch 2',
  'r5apex.exe': 'Apex Legends',
  'fortniteclient-win64-shipping.exe': 'Fortnite',
  'rocketleague.exe': 'Rocket League',
  'deadbydaylight.exe': 'Dead by Daylight',
  'helldivers2.exe': 'Helldivers 2',
  'palworld-win64-shipping.exe': 'Palworld',
  'blackmythwukong.exe': 'Black Myth: Wukong',
  'b1-win64-shipping.exe': 'Black Myth: Wukong',
  'spacemarine2.exe': 'Warhammer 40,000: Space Marine 2',
  'warhammer3.exe': 'Total War: Warhammer III',
  'civ6.exe': "Sid Meier's Civilization VI",
  'civ7.exe': "Sid Meier's Civilization VII",
  'civ7_win64_dx12_finalrelease.exe': "Sid Meier's Civilization VII",
  'sekiro.exe': 'Sekiro: Shadows Die Twice',
  'darksoulsiii.exe': 'Dark Souls III',
  'armoredcore6.exe': 'Armored Core VI: Fires of Rubicon',
  'godofwar.exe': 'God of War',
  'gow_ragnarok.exe': 'God of War Ragnarök',
  'spiderman.exe': "Marvel's Spider-Man Remastered",
  'milesmorales.exe': "Marvel's Spider-Man: Miles Morales",
  'tlou-i.exe': 'The Last of Us Part I',
  'ghostotsushima.exe': 'Ghost of Tsushima',
  'horizonzerodawn.exe': 'Horizon Zero Dawn',
  'horizonforbiddenwest.exe': 'Horizon Forbidden West',
  'residentevil4.exe': 'Resident Evil 4',
  're4.exe': 'Resident Evil 4',
  're8.exe': 'Resident Evil Village',
  'fallout4.exe': 'Fallout 4',
  'skyrimse.exe': 'The Elder Scrolls V: Skyrim',
  'hades.exe': 'Hades',
  'hades2.exe': 'Hades II',
  'hollow_knight.exe': 'Hollow Knight',
  'silksong.exe': 'Hollow Knight: Silksong',
  'valheim.exe': 'Valheim',
  'stardew valley.exe': 'Stardew Valley',
  'stardewvalley.exe': 'Stardew Valley',
  'deadcells.exe': 'Dead Cells',
  'slaythespire.exe': 'Slay the Spire',
  'balatro.exe': 'Balatro',
  'bloonstd6.exe': 'Bloons TD 6',
  'bloonstd6': 'Bloons TD 6',
  'cleaner-btd6.exe': 'Bloons TD 6',
  'btd6.exe': 'Bloons TD 6',
  'factorygamesteam.exe': 'Satisfactory',
  'satisfactory.exe': 'Satisfactory',
  'modernwarfare.exe': 'Call of Duty: Modern Warfare',
  'supermarket together.exe': 'Supermarket Together',
  'supermarkettogether.exe': 'Supermarket Together',
  'rs2client.exe': 'RuneScape',
  'runescape.exe': 'RuneScape',
  'rsdragonwilds.exe': 'RuneScape Dragonwilds',
  'rsdragonwilds-win64-shipping.exe': 'RuneScape Dragonwilds',
  'oriwotw.exe': 'Ori and the Will of the Wisps',
  'oride.exe': 'Ori and the Blind Forest',
  'timberborn.exe': 'Timberborn',
  'pragmata.exe': 'Pragmata',
  'brawlhalla.exe': 'Brawlhalla',
  'pathofexilesteam.exe': 'Path of Exile 2',
  'pathofexile.exe': 'Path of Exile',
  'pathofexile_x64.exe': 'Path of Exile',
  'pathofexile2.exe': 'Path of Exile 2',
  'losslessscaling.exe': 'Lossless Scaling',
  'transportfever3.exe': 'Transport Fever 3',
  'transportfever2.exe': 'Transport Fever 2',
  'whiskerwood.exe': 'Whiskerwood',
  'whiskerwood-win64-shipping.exe': 'Whiskerwood',
  'ultimatechickenhorse.exe': 'Ultimate Chicken Horse',
  'tekken 8.exe': 'Tekken 8',
  'tekken8.exe': 'Tekken 8',
  'risk of rain 2.exe': 'Risk of Rain 2',
  'riskofrain2.exe': 'Risk of Rain 2',
  'wardogs.exe': 'Wardogs',
  'wardogsclient.exe': 'Wardogs',
  'wardogsclient-win64-shipping.exe': 'Wardogs',
  'wardogslauncher-shipping.exe': 'Wardogs',
  'wardogs-win64-shipping.exe': 'Wardogs',
  'subnautica.exe': 'Subnautica',
  'factorio.exe': 'Factorio',
  'terraria.exe': 'Terraria',
}

export function splitWordBoundaries(text: string): string {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-uw-zA-UW-Z])([0-9]+)/g, '$1 $2')
    .replace(/([0-9]+)([a-zA-Z])/g, '$1 $2')
}

export function cleanGameTitle(rawTitle: string, exePath?: string): string {
  const filename = (exePath || rawTitle || '').split(/[/\\]/).pop()?.toLowerCase() || ''
  if (KNOWN_GAME_SIGNATURES[filename]) {
    return KNOWN_GAME_SIGNATURES[filename]
  }

  if (exePath) {
    const parts = exePath.split(/[/\\]/).filter(Boolean)
    if (parts.length >= 2) {
      const parentDir = parts[parts.length - 2].toLowerCase()
      if (KNOWN_GAME_SIGNATURES[parentDir]) {
        return KNOWN_GAME_SIGNATURES[parentDir]
      }
      if (KNOWN_GAME_SIGNATURES[`${parentDir}.exe`]) {
        return KNOWN_GAME_SIGNATURES[`${parentDir}.exe`]
      }
    }
  }

  const cleanedFilename = filename
    .replace(/\.exe$/i, '')
    .replace(/\.bin$/i, '')
    .replace(/\.iso$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/_shipping$/i, '')
    .replace(/-shipping$/i, '')
    .replace(/_x64$/i, '')
    .replace(/_win64$/i, '')
    .replace(/client$/i, '')
    .replace(/launcher$/i, '')

  if (KNOWN_GAME_SIGNATURES[cleanedFilename]) {
    return KNOWN_GAME_SIGNATURES[cleanedFilename]
  }
  if (KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]) {
    return KNOWN_GAME_SIGNATURES[`${cleanedFilename}.exe`]
  }

  let title = rawTitle || cleanedFilename
  if (/^file_[a-f0-9]+$/i.test(title) && exePath) {
    const parts = exePath.split(/[/\\]/).filter(Boolean)
    if (parts.length >= 2) {
      title = parts[parts.length - 2]
    }
  }

  title = title
    .replace(/\.exe$/i, '')
    .replace(/\.iso$/i, '')
    .replace(/_dx11$/i, '')
    .replace(/_dx12$/i, '')
    .replace(/-win64-shipping$/i, '')
    .replace(/_shipping$/i, '')
    .replace(/-shipping$/i, '')
    .replace(/_x64$/i, '')
    .replace(/_win64$/i, '')
    .replace(/client$/i, '')
    .replace(/launcher$/i, '')
    .replace(/-voices\d*$/i, '')
    .replace(/-i know$/i, '')
    .replace(/-razor1911$/i, '')
    .replace(/[._-]+/g, ' ')

  title = splitWordBoundaries(title)

  title = title
    .replace(/\btd\b/gi, 'TD')
    .replace(/\bii\b/gi, 'II')
    .replace(/\biii\b/gi, 'III')
    .replace(/\biv\b/gi, 'IV')
    .replace(/\bvi\b/gi, 'VI')
    .replace(/\bvii\b/gi, 'VII')
    .replace(/\bviii\b/gi, 'VIII')
    .replace(/\s+/g, ' ')
    .trim()

  return title
}
