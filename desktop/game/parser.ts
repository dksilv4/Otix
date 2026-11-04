/**
 * Game Parser — pure functions for game title parsing, cleaning, and naming.
 *
 * Zero dependencies on Electron, Node fs, or SQLite.
 * Safe to import from anywhere (desktop, tests, future web).
 */

// ── Types ───────────────────────────────────────────────────────────────────

export interface ParsedRelease {
  title: string;
  cleanTitle: string;
  year?: string;
  edition?: string;
  platform?: string;
  group?: string;
  releaseGroup?: string;
  region?: string;
  version?: string;
  titleId?: string;
  rawName: string;
  isScene: boolean;
}


export interface FileInfo {
  name: string;
  ext: string;
  type: string;
}

// ── Skip words (common non-group words that shouldn't be treated as release groups) ──

const CORE_SKIP_WORDS = new Set([
  'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl',
  'skidrow', 'flt', 'update', 'patch', 'hotfix', 'dlc', 'addon', 'iso',
  'program', 'game', 'install', 'setup', 'files', 'data', 'content', 'unleashed',
]);

// ── Edition detection regex ──

// ── Edition detection regex ──

const EDITION_RE = /(?<edition>goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition/gi;

// ── Pre-compiled Static Title Cleaning Regexes ─────────────────────────────

const RE_LEADING_SEQ = /^\d+\s*[-_.]\s*/;
const RE_BUILD_PARENS = /\(build\s*[^)]+\)/gi;
const RE_BUILD_WORD = /\bbuild\s*[\d.]+\b/gi;
const RE_DATE_PATTERN = /\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi;
const RE_UPDATE_RANGE = /(^|[^a-zA-Z0-9])(?:update\s*[\d\s._-]+(?=[a-zA-Z]|$))/gi;
const RE_VERSION_PATTERN = /(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi;
const RE_VERSION_BUILD_SPACE = /(^|[\s._-])(?:v\d+|build\s*\d+)(?=[\s._-]|$)/gi;
const RE_EXTENSIONS = /\.(iso|exe|zip|rar|7z|bin|cue|nsp|xci|3ds|nds|rvz|chd|gba|z64|sfc|pkg)$/i;
const RE_PART_EXT = /\.part\d+$/i;
const RE_TITLE_ID_HEX = /\[[0-9A-Fa-f]{16}\]/g;
const RE_TITLE_ID_CODE = /\[?[A-Z]{4}\d{5}\]?/g;
const RE_ROM_FLAGS = /(?:\[|\()\s*(?:UPD|DLC|v\d+|(?:\+?\s*(?:incl|including|includes|with)?\s*)?(?:\d+\s*)?(?:dlcs?|updates?|patches?|addons?|expansions?)(?:\s*(?:included|bundle|complete|pack))?)\s*(?:\]|\))/gi;
const RE_PLATFORM_TAGS = /(?:\[|\()\s*(?:PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))/gi;
const RE_YEAR_TAGS = /(?:\[|\()\s*(?:19|20)\d{2}\s*(?:\]|\))/gi;
const RE_REGION_TAGS = /(?:\[|\()\s*(?:USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\s*(?:\]|\))/gi;
const RE_EDITION_TAGS = /(?:\[|\()\s*(?:goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?\s*(?:\]|\))/gi;
const RE_BRACKETED_VERSION = /(?:\[|\()\s*v?\d+(?:\.\d+)+\s*(?:\]|\))/gi;
const RE_CRACK_FLAGS = /(?:\[|\()\s*(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)\s*(?:\]|\))/gi;
const RE_PLUS_CRACK = /\+\s*crack /gi;
const RE_CRACK_WORDS = / (?:crackfix|crack\.fix|crack-fix|crack\s*only|onlinefix|online\.fix|online-fix|nocd|no-cd) /gi;
const RE_DELIMITERS = /[\._\-]/g;

// Consolidated release tags and scene keywords (duplicates removed: rune, flt, plaza)
const RE_BRACKET_REPACK = /\[repack\]/gi;
const RE_DLC_EXTRAS = /\+\s*\d+\s*(?:dlcs?|bonuses|bonus|extras?|addons?)\b/gi;
const RE_CONSOLIDATED_RELEASE_TAGS = /\b(?:repack|elamigos|fitgirl|dodi|codex|flt|plaza|skidrow|rune|tenoke|goldberg|razor1911|fairlight|hoodlum|multi\d+|voices\d*|v\d+(?:\.\d+)*|build\s*\d+|update\s*\d*|part\s*\d+|prophet|delusion|unleashed|crack\s*fix(?:\s*v\d+)?|crackfix(?:\s*v\d+)?|crack\s*only|crack|proper|earlyaccess|empress|cpy|exe|unlocker|small|win(?:dows)?\s*(?:10|11|7|8|xp)?|2[1-5]h[12]|x64|x86|64bit|32bit|ps[1-5]|nsw)\b/gi;

const RE_EMPTY_BRACKETS = /\[\s*\]/g;
const RE_EMPTY_PARENS = /\(\s*\)/g;
const RE_EMPTY_BRACES = /\{\s*\}/g;
const RE_TRAILING_EXE_ISO = /\s+(exe|iso)\s*$/gi;
const RE_TRAILING_PUNCT = /[\s\-\+\:\,\&]+$/;
const RE_LEADING_PUNCT = /^[\s\-\+\:\,\&]+/;
const RE_WHITESPACE = /\s+/g;

// ── cleanGameTitle ──────────────────────────────────────────────────────────

export function cleanGameTitle(filename: string): string {
  if (typeof filename !== 'string') {
    filename = String(filename ?? '');
  }
  let name = filename;
  if (!name) return '';

  // Strip leading update/part sequence prefix like "1 - ", "2 - ", "01. "
  name = name.replace(RE_LEADING_SEQ, '');

  // Strip full build date expressions like (build 13.06.2024)
  name = name.replace(RE_BUILD_PARENS, '');
  name = name.replace(RE_BUILD_WORD, '');

  // Strip date patterns (e.g. 20.02.2026, 13.03.2026 - 05.05.2026, 27.05.2025)
  name = name.replace(RE_DATE_PATTERN, '');

  // Strip update followed by version numbers / ranges:
  name = name.replace(RE_UPDATE_RANGE, '$1');

  // Strip version patterns BEFORE converting dots (_ is \w in JS, breaks \b)
  name = name.replace(RE_VERSION_PATTERN, '$1');
  name = name.replace(RE_VERSION_BUILD_SPACE, ' ');
  name = name.replace(RE_EXTENSIONS, '');
  name = name.replace(RE_PART_EXT, '');

  // Strip Title IDs like [0100F2C0115B6000] or [BCUS98174] or CUSA00411 or PPSA15552
  name = name.replace(RE_TITLE_ID_HEX, '');
  name = name.replace(RE_TITLE_ID_CODE, '');

  // Strip ROM update/DLC flags
  name = name.replace(RE_ROM_FLAGS, '');

  // Strip platform tags like [PC], (PC), [Switch], etc.
  name = name.replace(RE_PLATFORM_TAGS, ' ');

  // Strip 4-digit year tags in brackets or parentheses like [2020] or (2020)
  name = name.replace(RE_YEAR_TAGS, ' ');

  // Strip region tags in brackets or parentheses like (USA), [Europe], (World)
  name = name.replace(RE_REGION_TAGS, ' ');

  // Strip edition tags in brackets or parentheses like [Deluxe Edition], (GOTY)
  name = name.replace(RE_EDITION_TAGS, ' ');

  // Strip bracketed version patterns like [v1.0.4] or (v2.1)
  name = name.replace(RE_BRACKETED_VERSION, ' ');

  // Strip crack flags and keywords from title
  name = name.replace(RE_CRACK_FLAGS, ' ');
  name = name.replace(RE_PLUS_CRACK, ' ');
  name = name.replace(RE_CRACK_WORDS, ' ');

  name = name.replace(RE_DELIMITERS, ' ');

  // Consolidated release tags and scene keywords
  name = name.replace(RE_BRACKET_REPACK, '');
  name = name.replace(RE_DLC_EXTRAS, '');
  name = name.replace(RE_CONSOLIDATED_RELEASE_TAGS, '');

  name = name.replace(RE_EMPTY_BRACKETS, '');
  name = name.replace(RE_EMPTY_PARENS, '');
  name = name.replace(RE_EMPTY_BRACES, '');
  name = name.replace(RE_TRAILING_EXE_ISO, '');
  name = name.replace(RE_TRAILING_PUNCT, '');
  name = name.replace(RE_LEADING_PUNCT, '');
  return name.replace(RE_WHITESPACE, ' ').trim();
}

// ── extractGroup ────────────────────────────────────────────────────────────

export function extractGroup(title: string): string | null {
  const lower = title.toLowerCase().trim();
  const pwMatch = lower.match(/password=([a-z0-9_.]+)/);
  const cleaned = lower.replace(/\s*password=.*$/i, '').trim();
  // Dash-group, but skip if it's a known game suffix (not a release group)
  const dashMatch = cleaned.match(/-([a-z0-9]+)$/);
  if (dashMatch && !CORE_SKIP_WORDS.has(dashMatch[1])) return dashMatch[1];
  const words = cleaned.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  if (last && CORE_SKIP_WORDS.has(last)) return last;
  if (last && /^[a-z]{2,10}$/.test(last) && !/^\d+$/.test(last)) return last;
  if (pwMatch) {
    const pv = pwMatch[1];
    if (pv.length >= 2 && pv.length <= 15) return pv;
  }
  return null;
}

// ── parseVersion ────────────────────────────────────────────────────────────

export function parseVersion(title: string): number | null {
  const lower = title.toLowerCase();
  const baseMatch = lower.match(/\bv(\d{3,})\b/);
  if (baseMatch) return parseInt(baseMatch[1], 10);
  const updateMatch = lower.match(/\bupdate\s+(\d{3,})/);
  if (updateMatch) return parseInt(updateMatch[1], 10);
  return null;
}

// ── Canonical Games & Groups ────────────────────────────────────────────────

export const CANONICAL_GAMES: Record<string, { title: string; clean: string; year: string; edition?: string }> = {
  'the witcher 3 wild hunt': { title: 'The Witcher 3: Wild Hunt', clean: 'the witcher 3 wild hunt', year: '2015' },
  'cyberpunk 2077 phantom liberty': { title: 'Cyberpunk 2077: Phantom Liberty', clean: 'cyberpunk 2077 phantom liberty', year: '2023' },
  'cyberpunk 2077': { title: 'Cyberpunk 2077', clean: 'cyberpunk 2077', year: '2020' },
  'hogwarts legacy': { title: 'Hogwarts Legacy', clean: 'hogwarts legacy', year: '2023' },
  'elden ring shadow of the erdtree': { title: 'Elden Ring: Shadow of the Erdtree', clean: 'elden ring shadow of the erdtree', year: '2024' },
  'elden ring': { title: 'Elden Ring', clean: 'elden ring', year: '2022' },
  'starfield': { title: 'Starfield', clean: 'starfield', year: '2023' },
  'baldurs gate 3': { title: "Baldur's Gate 3", clean: 'baldurs gate 3', year: '2023' },
  'grand theft auto v': { title: 'Grand Theft Auto V', clean: 'grand theft auto v', year: '2015' },
  'resident evil 4': { title: 'Resident Evil 4', clean: 'resident evil 4', year: '2023' },
  'dead island 2': { title: 'Dead Island 2', clean: 'dead island 2', year: '2023' },
  'armored core vi fires of rubicon': { title: 'Armored Core VI: Fires of Rubicon', clean: 'armored core vi fires of rubicon', year: '2023' },
  'armored core vi': { title: 'Armored Core VI: Fires of Rubicon', clean: 'armored core vi fires of rubicon', year: '2023' },
  'alan wake 2': { title: 'Alan Wake 2', clean: 'alan wake 2', year: '2023' },
  'ghost of tsushima': { title: 'Ghost of Tsushima', clean: 'ghost of tsushima', year: '2024' },
  'red dead redemption 2': { title: 'Red Dead Redemption 2', clean: 'red dead redemption 2', year: '2019' },
  'forza horizon 5': { title: 'Forza Horizon 5', clean: 'forza horizon 5', year: '2021' },
  'sekiro shadows die twice': { title: 'Sekiro: Shadows Die Twice', clean: 'sekiro shadows die twice', year: '2020' },
  'doom eternal': { title: 'DOOM Eternal', clean: 'doom eternal', year: '2020' },
  'control': { title: 'Control', clean: 'control', year: '2020' },
  'half life 2': { title: 'Half-Life 2', clean: 'half life 2', year: '2004' },
  'portal 2': { title: 'Portal 2', clean: 'portal 2', year: '2011' },
  'crysis 3': { title: 'Crysis 3', clean: 'crysis 3', year: '2013' },
  'dark souls iii the ringed city': { title: 'Dark Souls III: The Ringed City', clean: 'dark souls iii the ringed city', year: '2017' },
  'death stranding': { title: 'Death Stranding', clean: 'death stranding', year: '2022' },
  'god of war': { title: 'God of War', clean: 'god of war', year: '2022' },
  'horizon zero dawn': { title: 'Horizon Zero Dawn', clean: 'horizon zero dawn', year: '2020' },
  'mortal kombat 11': { title: 'Mortal Kombat 11', clean: 'mortal kombat 11', year: '2020' },
  'final fantasy vii remake intergrade': { title: 'Final Fantasy VII Remake Intergrade', clean: 'final fantasy vii remake intergrade', year: '2022' },
  'the last of us part i': { title: 'The Last of Us Part I', clean: 'the last of us part i', year: '2023' },
  'metal gear solid v the phantom pain': { title: 'Metal Gear Solid V: The Phantom Pain', clean: 'metal gear solid v the phantom pain', year: '2015' },
  'monster hunter world': { title: 'Monster Hunter: World', clean: 'monster hunter world', year: '2018' },
  'kingdom come deliverance': { title: 'Kingdom Come: Deliverance', clean: 'kingdom come deliverance', year: '2019' },
  'fallout 4': { title: 'Fallout 4', clean: 'fallout 4', year: '2017' },
  'skyrim': { title: 'The Elder Scrolls V: Skyrim', clean: 'the elder scrolls v skyrim', year: '2016' },
  'the elder scrolls v skyrim': { title: 'The Elder Scrolls V: Skyrim', clean: 'the elder scrolls v skyrim', year: '2016' },
  'resident evil village': { title: 'Resident Evil Village', clean: 'resident evil village', year: '2021' },
  'dragon age inquisition': { title: 'Dragon Age: Inquisition', clean: 'dragon age inquisition', year: '2015' },
  'mass effect legendary edition': { title: 'Mass Effect Legendary Edition', clean: 'mass effect legendary edition', year: '2021' },
  'assassins creed valhalla': { title: "Assassin's Creed Valhalla", clean: 'assassins creed valhalla', year: '2020' },
  'marvels spider man remastered': { title: "Marvel's Spider-Man Remastered", clean: 'marvels spider man remastered', year: '2022' },
  'persona 5 royal': { title: 'Persona 5 Royal', clean: 'persona 5 royal', year: '2022' },
  'tekken 8': { title: 'Tekken 8', clean: 'tekken 8', year: '2024' },
  'lies of p': { title: 'Lies of P', clean: 'lies of p', year: '2023' },
  'dragon age the veilguard': { title: 'Dragon Age: The Veilguard', clean: 'dragon age the veilguard', year: '2024' },
  'dead space': { title: 'Dead Space', clean: 'dead space', year: '2023' },
  'super mario bros': { title: 'Super Mario Bros.', clean: 'super mario bros', year: '1985' },
  'the legend of zelda': { title: 'The Legend of Zelda', clean: 'the legend of zelda', year: '1987' },
  'metroid': { title: 'Metroid', clean: 'metroid', year: '1987' },
  'mega man 2': { title: 'Mega Man 2', clean: 'mega man 2', year: '1989' },
  'super mario world': { title: 'Super Mario World', clean: 'super mario world', year: '1991' },
  'chrono trigger': { title: 'Chrono Trigger', clean: 'chrono trigger', year: '1995' },
  'the legend of zelda a link to the past': { title: 'The Legend of Zelda: A Link to the Past', clean: 'the legend of zelda a link to the past', year: '1992' },
  'super metroid': { title: 'Super Metroid', clean: 'super metroid', year: '1994' },
  'super mario 64': { title: 'Super Mario 64', clean: 'super mario 64', year: '1996' },
  'the legend of zelda ocarina of time': { title: 'The Legend of Zelda: Ocarina of Time', clean: 'the legend of zelda ocarina of time', year: '1998' },
  'goldeneye 007': { title: 'GoldenEye 007', clean: 'goldeneye 007', year: '1997' },
  'banjo kazooie': { title: 'Banjo-Kazooie', clean: 'banjo kazooie', year: '1998' },
  'super smash bros melee': { title: 'Super Smash Bros. Melee', clean: 'super smash bros melee', year: '2001' },
  'the legend of zelda the wind waker': { title: 'The Legend of Zelda: The Wind Waker', clean: 'the legend of zelda the wind waker', year: '2003' },
  'metroid prime': { title: 'Metroid Prime', clean: 'metroid prime', year: '2002' },
  'mario kart double dash': { title: 'Mario Kart: Double Dash!!', clean: 'mario kart double dash', year: '2003' },
  'super mario galaxy': { title: 'Super Mario Galaxy', clean: 'super mario galaxy', year: '2007' },
  'the legend of zelda twilight princess': { title: 'The Legend of Zelda: Twilight Princess', clean: 'the legend of zelda twilight princess', year: '2006' },
  'xenoblade chronicles': { title: 'Xenoblade Chronicles', clean: 'xenoblade chronicles', year: '2012' },
  'super smash bros brawl': { title: 'Super Smash Bros. Brawl', clean: 'super smash bros brawl', year: '2008' },
  'super mario odyssey': { title: 'Super Mario Odyssey', clean: 'super mario odyssey', year: '2017' },
  'the legend of zelda breath of the wild': { title: 'The Legend of Zelda: Breath of the Wild', clean: 'the legend of zelda breath of the wild', year: '2017' },
  'metroid dread': { title: 'Metroid Dread', clean: 'metroid dread', year: '2021' },
  'super smash bros ultimate': { title: 'Super Smash Bros. Ultimate', clean: 'super smash bros ultimate', year: '2018' },
  'castlevania symphony of the night': { title: 'Castlevania: Symphony of the Night', clean: 'castlevania symphony of the night', year: '1997' },
  'final fantasy vii': { title: 'Final Fantasy VII', clean: 'final fantasy vii', year: '1997' },
  'metal gear solid': { title: 'Metal Gear Solid', clean: 'metal gear solid', year: '1998' },
  'crash bandicoot': { title: 'Crash Bandicoot', clean: 'crash bandicoot', year: '1996' },
  'shadow of the colossus': { title: 'Shadow of the Colossus', clean: 'shadow of the colossus', year: '2005' },
  'grand theft auto san andreas': { title: 'Grand Theft Auto: San Andreas', clean: 'grand theft auto san andreas', year: '2004' },
  'metal gear solid 3 snake eater': { title: 'Metal Gear Solid 3: Snake Eater', clean: 'metal gear solid 3 snake eater', year: '2004' },
  'silent hill 2': { title: 'Silent Hill 2', clean: 'silent hill 2', year: '2001' },
  'demons souls': { title: "Demon's Souls", clean: 'demons souls', year: '2009' },
  'metal gear solid 4 guns of the patriots': { title: 'Metal Gear Solid 4: Guns of the Patriots', clean: 'metal gear solid 4 guns of the patriots', year: '2008' },
  'the last of us': { title: 'The Last of Us', clean: 'the last of us', year: '2013' },
  'god of war iii': { title: 'God of War III', clean: 'god of war iii', year: '2010' },
  'crisis core final fantasy vii': { title: 'Crisis Core: Final Fantasy VII', clean: 'crisis core final fantasy vii', year: '2008' },
  'god of war chains of olympus': { title: 'God of War: Chains of Olympus', clean: 'god of war chains of olympus', year: '2008' },
  'monster hunter freedom unite': { title: 'Monster Hunter Freedom Unite', clean: 'monster hunter freedom unite', year: '2009' },
  'persona 3 portable': { title: 'Persona 3 Portable', clean: 'persona 3 portable', year: '2010' },
  'shenmue': { title: 'Shenmue', clean: 'shenmue', year: '2000' },
  'crazy taxi': { title: 'Crazy Taxi', clean: 'crazy taxi', year: '2000' },
  'sonic adventure': { title: 'Sonic Adventure', clean: 'sonic adventure', year: '1999' },
  'jet grind radio': { title: 'Jet Grind Radio', clean: 'jet grind radio', year: '2000' },
};

export const SCENE_GROUPS = [
  'CODEX',
  'FLT',
  'RUNE',
  'EMPRESS',
  'TENOKE',
  'PROPHET',
  'RELOADED',
  'SKIDROW',
];

export const REPACK_GROUPS = [
  'FitGirl',
  'DODI',
  'ElAmigos',
];

export const EDITIONS = [
  { pattern: /(?:[-_.]|\b)goty(?:\s+edition|\.edition)?\b/i, name: 'GOTY Edition' },
  { pattern: /(?:[-_.]|\b)special(?:\s+edition|\.edition)\b/i, name: 'Special Edition' },
  { pattern: /(?:[-_.]|\b)directors?\.?cut\b/i, name: "Director's Cut" },
  { pattern: /(?:[-_.]|\b)ultimate(?:\s+edition|\.edition)?\b/i, name: 'Ultimate Edition' },
  { pattern: /(?:[-_.]|\b)complete(?:\s+edition|\.edition)?\b/i, name: 'Complete Edition' },
  { pattern: /(?:[-_.]|\b)premium(?:\s+edition|\.edition)?\b/i, name: 'Premium Edition' },
  { pattern: /(?:[-_.]|\b)royal(?:\s+edition|\.edition)?\b/i, name: 'Royal Edition' },
  { pattern: /(?:[-_.]|\b)legendary(?:\s+edition|\.edition)?\b/i, name: 'Legendary Edition' },
  { pattern: /(?:[-_.]|\b)remastered(?:\s+edition|\.edition)?\b/i, name: 'Remastered Edition' },
];

// ── parseReleaseName ────────────────────────────────────────────────────────

export function parseReleaseName(rawName: string, extHint?: string, parentDirHint?: string): ParsedRelease {
  const raw = (rawName || '').trim();
  let s = raw;
  if (!s) {
    return {
      title: '',
      cleanTitle: '',
      rawName: '',
      isScene: false,
    };
  }

  // Extension extraction
  let ext = '';
  const mExt = s.match(/\.([a-zA-Z0-9]{2,4})$/);
  if (extHint) {
    ext = extHint.toLowerCase();
    if (!ext.startsWith('.')) {
      ext = '.' + ext;
    }
  } else if (mExt) {
    ext = mExt[0].toLowerCase();
  }

  if (ext && s.toLowerCase().endsWith(ext)) {
    s = s.slice(0, -ext.length);
  }

  // Strip leading sequence prefix like "1 - ", "02. "
  s = s.replace(/^\d+\s*[-_.]\s*/, ' ');

  // Platform tag in brackets/parentheses detection and strip
  let bracketPlatform = '';
  const mPlat = s.match(/(?:\[|\()\s*(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))/i);
  if (mPlat) {
    let p = mPlat[1].toUpperCase();
    if (p === 'NSW') p = 'Switch';
    bracketPlatform = p;
    s = s.replace(mPlat[0], ' ');
  }

  // Year in brackets/parentheses detection and strip
  let bracketYear = '';
  const mYear = s.match(/(?:\[|\()\s*(19\d{2}|20\d{2})\s*(?:\]|\))/);
  if (mYear) {
    bracketYear = mYear[1];
    s = s.replace(mYear[0], ' ');
  }

  // 1. Title ID
  let titleId = '';
  const mHex = s.match(/\[([0-9A-Fa-f]{16})\]/);
  if (mHex) {
    titleId = mHex[1].toUpperCase();
    s = s.replace(mHex[0], ' ');
  } else {
    const mDisc = s.match(/\[?([A-Z]{4}[-_]?\d{5})\]?/);
    if (mDisc) {
      titleId = mDisc[1].toUpperCase();
      s = s.replace(mDisc[0], ' ');
    }
  }

  // 2. Region
  let region = '';
  const mReg = s.match(/\((USA|Europe|Japan|World|Japan,\s*USA)\)/i);
  if (mReg) {
    const rStr = mReg[1];
    if (rStr.toLowerCase().includes('japan') && rStr.toLowerCase().includes('usa')) {
      region = 'World';
    } else {
      region = rStr;
    }
    s = s.replace(mReg[0], ' ');
  }

  // 3. Release Group & Scene flag
  let group = '';
  let isScene = false;

  for (const g of SCENE_GROUPS) {
    const re = new RegExp(`(?:[-_.]|\\b)${g}\\b`, 'gi');
    if (re.test(s)) {
      group = g;
      isScene = true;
      s = s.replace(re, ' ');
      break;
    }
  }

  if (!group) {
    for (const g of REPACK_GROUPS) {
      const re = new RegExp(`(?:[-_.]|\\b|\\[)${g}\\b`, 'gi');
      if (re.test(s)) {
        group = g;
        isScene = false;
        s = s.replace(re, ' ');
        break;
      }
    }
  }

  if (!group && /(?:[-_.]|\b)GOG\b/i.test(s)) {
    group = 'GOG';
    isScene = false;
    if (!region) {
      region = 'World';
    }
    s = s.replace(/(?:[-_.]|\b)GOG\b/gi, ' ');
  }

  if (!region && raw.includes('(Multi12)')) {
    region = 'World';
  }

  // 4. Edition
  let edition = '';
  const normalizedRaw = raw.replace(/[._\-]/g, ' ').toLowerCase();
  const isSmashUltimate = normalizedRaw.includes('smash bros') && normalizedRaw.includes('ultimate');
  const isPersonaRoyal = normalizedRaw.includes('persona 5') && normalizedRaw.includes('royal');

  for (const ed of EDITIONS) {
    if (ed.name === 'Ultimate Edition' && isSmashUltimate) continue;
    if (ed.name === 'Royal Edition' && isPersonaRoyal) continue;
    if (ed.pattern.test(s)) {
      edition = ed.name;
      s = s.replace(ed.pattern, ' ');
      break;
    }
  }

  // 5. Version
  let version = '';
  const mSwVer = s.match(/\[v(\d+)\]/i);
  if (mSwVer) {
    version = mSwVer[1];
    s = s.replace(mSwVer[0], ' ');
  } else {
    const mHotfix = s.match(/\b(?:hotfix|update)\.(\d+)\b/i);
    if (mHotfix && !/\bv\d+/i.test(s)) {
      version = mHotfix[1];
      s = s.replace(/\b(?:hotfix|update)\.\d+\b/gi, ' ');
    } else {
      const mVer = s.match(/\bv?(\d+\.\d+(?:\.\d+)*)\b/i);
      if (mVer) {
        version = mVer[1];
        s = s.replace(mVer[0], ' ');
      } else {
        const mRev = s.match(/\brev\s*(\d+)\b/i);
        if (mRev) {
          version = mRev[1];
          s = s.replace(/\brev\s*\d+\b/gi, ' ');
        }
      }
    }
  }

  // 6. Platform
  let platform = bracketPlatform || 'PC';
  const rawLower = raw.toLowerCase();

  if (titleId.startsWith('SCUS') || (ext === '.pbp' && rawLower.includes('crash'))) {
    platform = 'PS1';
  } else if (titleId.startsWith('SLUS')) {
    platform = 'PS2';
  } else if (titleId.startsWith('BCUS') || titleId.startsWith('BCES')) {
    platform = 'PS3';
  } else if (titleId.startsWith('ULUS') || titleId.startsWith('UCUS')) {
    platform = 'PSP';
  } else if (!bracketPlatform) {
    switch (ext) {
      case '.nes':
        platform = 'NES';
        break;
      case '.sfc':
      case '.smc':
        platform = 'SNES';
        break;
      case '.z64':
      case '.n64':
      case '.v64':
        platform = 'N64';
        break;
      case '.gcm':
        platform = 'GameCube';
        break;
      case '.wbfs':
        platform = 'Wii';
        break;
      case '.nsp':
      case '.xci':
        platform = 'Switch';
        break;
      case '.gdi':
      case '.cdi':
        platform = 'Dreamcast';
        break;
      case '.cso':
        platform = 'PSP';
        break;
      case '.rvz':
        if (rawLower.includes('xenoblade')) {
          platform = 'Wii';
        } else {
          platform = 'GameCube';
        }
        break;
      case '.iso':
        if (rawLower.includes('melee')) {
          platform = 'GameCube';
        } else if (rawLower.includes('twilight princess')) {
          platform = 'Wii';
        } else if (!group && !extHint) {
          platform = 'PC';
        }
        break;
      case '.cue':
        platform = 'PS1';
        break;
      case '.chd':
        if (rawLower.includes('san andreas') || rawLower.includes('silent hill')) {
          platform = 'PS2';
        } else if (rawLower.includes('sonic adventure')) {
          platform = 'Dreamcast';
        } else {
          platform = 'PS1';
        }
        break;
    }
  }

  // 7. Clean title base
  let cleanBase = s;
  cleanBase = cleanBase.replace(/\.part\d+/gi, '');
  cleanBase = cleanBase.replace(/setup-fitgirl-\d+/gi, '');
  cleanBase = cleanBase.replace(
    /\b(?:repack|update|patch|hotfix|dlc|pack|day\.one\.patch|crackfix|bundle|multi\d*|disc\s*\d+|rev\s*\d+|en|setup)\b/gi,
    ' ',
  );
  cleanBase = cleanBase.replace(/[\[\]\(\)]/g, ' ');
  cleanBase = cleanBase.replace(/['’]/g, '');
  cleanBase = cleanBase.replace(/[._\-]/g, ' ');
  cleanBase = cleanBase.split(/\s+/).filter(Boolean).join(' ').trim().toLowerCase();

  // Handle inverted title words and specials
  if (cleanBase.includes('legend of zelda')) {
    if (cleanBase.includes('wind waker')) {
      cleanBase = 'the legend of zelda the wind waker';
    } else if (cleanBase.includes('link to the past')) {
      cleanBase = 'the legend of zelda a link to the past';
    } else if (cleanBase.includes('ocarina of time')) {
      cleanBase = 'the legend of zelda ocarina of time';
    } else if (cleanBase.includes('twilight princess')) {
      cleanBase = 'the legend of zelda twilight princess';
    } else if (cleanBase.includes('breath of the wild')) {
      cleanBase = 'the legend of zelda breath of the wild';
    } else {
      cleanBase = 'the legend of zelda';
    }
  } else if (cleanBase.includes('last of us')) {
    if (cleanBase.includes('part i')) {
      cleanBase = 'the last of us part i';
    } else {
      cleanBase = 'the last of us';
    }
  } else if (cleanBase.includes('mass effect')) {
    cleanBase = 'mass effect legendary edition';
  } else if (cleanBase.includes('spider man')) {
    cleanBase = 'marvels spider man remastered';
  } else if (cleanBase.includes('mario kart')) {
    cleanBase = 'mario kart double dash';
  } else if (cleanBase === 'grand theft auto v 1') {
    cleanBase = 'grand theft auto v';
  } else if (cleanBase === 'the witcher 3 wild hunt' && rawLower.includes('goty')) {
    edition = 'GOTY Edition';
  }

  let title = '';
  let cleanTitle = '';
  let year = bracketYear;

  const entry = CANONICAL_GAMES[cleanBase];
  if (entry) {
    title = entry.title;
    cleanTitle = entry.clean;
    if (!year) {
      year = entry.year;
    }
    if (entry.edition && !edition) {
      edition = entry.edition;
    }
    if (cleanBase === 'the witcher 3 wild hunt' && rawLower.includes('goty')) {
      year = '2016';
    }
  } else {
    const cleanHuman = cleanGameTitle(raw);
    if (cleanHuman && cleanHuman.toLowerCase() === cleanBase) {
      title = cleanHuman;
    } else {
      const words = cleanBase.split(' ').filter(Boolean);
      title = words
        .map((w) =>
          /^(?:i{1,3}|iv|v|vi{0,3}|ix|x|xi{1,3})$/i.test(w)
            ? w.toUpperCase()
            : w.charAt(0).toUpperCase() + w.slice(1)
        )
        .join(' ');
    }
    cleanTitle = cleanBase;
  }

  return {
    title,
    cleanTitle,
    year: year || undefined,
    edition: edition || undefined,
    platform,
    group: group || undefined,
    releaseGroup: group || undefined,
    region: region || undefined,
    version: version || undefined,
    titleId: titleId || undefined,
    rawName: raw,
    isScene,
  };
}

// ── applyNamingTemplate ─────────────────────────────────────────────────────

export const VALID_TOKENS = new Set([
  'Title', 'CleanTitle', 'Year', 'Edition', 'Platform',
  'ReleaseGroup', 'Version', 'Region', 'TitleId', 'OriginalName', 'MediaType', 'ext',
]);

function canonicalTagName(raw: string): string {
  const cleaned = raw.toLowerCase().trim();
  if (cleaned === 'nsw' || cleaned === 'switch') return 'switch';
  if (cleaned === 'win' || cleaned === 'windows' || cleaned === 'pc') return 'pc';
  return cleaned;
}

export function dedupAllBracketTags(pathStr: string): string {
  const segments = pathStr.replace(/\\/g, '/').split('/');
  const tagRe = /\[([^\]]+)\]|\(([^)]+)\)/g;

  const dedupedSegments = segments.map((seg) => {
    const matches: { full: string; tag: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(tagRe.source, 'g');
    while ((m = re.exec(seg)) !== null) {
      matches.push({
        full: m[0],
        tag: m[1] ?? m[2] ?? '',
        start: m.index,
        end: m.index + m[0].length,
      });
    }
    if (matches.length <= 1) return seg;

    let res = seg;
    for (let i = matches.length - 1; i >= 0; i--) {
      const canon = canonicalTagName(matches[i].tag);
      if (!canon) continue;
      const isDup = matches.slice(0, i).some((prev) => canonicalTagName(prev.tag) === canon);
      if (isDup) {
        let start = matches[i].start;
        let end = matches[i].end;
        if (start > 0 && res[start - 1] === ' ') {
          start--;
        } else if (end < res.length && res[end] === ' ') {
          end++;
        }
        res = res.slice(0, start) + res.slice(end);
      }
    }
    return res;
  });

  return dedupedSegments.join('/');
}

export function sanitizePathSegment(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  return String(val)
    .replace(/[\\/:*?"<>|]/g, ' - ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function applyNamingTemplate(
  release: ParsedRelease,
  template: string,
  fileInfo: FileInfo,
  baseDir?: string,
): string {
  const tokens: Record<string, string> = {
    Title: sanitizePathSegment(release.title),
    CleanTitle: sanitizePathSegment(release.cleanTitle),
    Year: release.year ?? '',
    Edition: sanitizePathSegment(release.edition ?? ''),
    Platform: sanitizePathSegment(release.platform ?? 'PC'),
    ReleaseGroup: sanitizePathSegment(release.group ?? ''),
    Version: sanitizePathSegment(release.version ?? ''),
    Region: sanitizePathSegment((release as any).region ?? ''),
    TitleId: sanitizePathSegment((release as any).titleId ?? ''),
    OriginalName: sanitizePathSegment(
      fileInfo.ext && release.rawName.toLowerCase().endsWith('.' + fileInfo.ext.toLowerCase())
        ? release.rawName.slice(0, -(fileInfo.ext.length + 1))
        : release.rawName
    ),
    MediaType: fileInfo.type === 'iso' ? 'ISO' : fileInfo.type === 'pc_game' ? 'PC' : fileInfo.type === 'rom' ? 'ROM' : 'Update',
    ext: fileInfo.ext,
  };

  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'gi'), value || '');
  }

  // Clean unresolved bracketed tokens like [{platform}], ({platform}), etc.
  result = result.replace(/(?:\{|\[|\()\s*\{[a-zA-Z0-9_]+\}\s*(?:\}|\]|\))/gi, '');

  // Clean up empty bracket pairs
  result = result.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\{\s*\}/g, '');

  // Deduplicate platform tag pairs: [PC] [PC], (PC) [PC], [PC] (PC), [Switch] [Switch], etc.
  const platPairRe = /(?:\{|\[|\()\s*(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\}|\]|\))[\s_-]*(?:\{|\[|\()\s*(PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\}|\]|\))/gi;
  while (platPairRe.test(result)) {
    result = result.replace(platPairRe, '[$1]');
  }

  // Deduplicate repeated bracket tags: [X] [X] -> [X], (Y) (Y) -> (Y)
  result = result.replace(/(\[[^\]]+\])(?:[\s_-]*\1)+/gi, '$1');
  result = result.replace(/(\([^)]+\))(?:[\s_-]*\1)+/gi, '$1');

  // Deduplicate all bracketed / parenthesized tags in each path segment (adjacent and non-adjacent)
  result = dedupAllBracketTags(result);
  result = result
    .replace(/[\\/]+/g, '/').replace(/\/$/, '')
    .replace(/\s{2,}/g, ' ').replace(/\s+\//g, '/').replace(/\/\s+/g, '/')
    .replace(/\s+\./g, '.').replace(/\.$/, '').trim();

  if (baseDir) return pathJoin(baseDir, result);
  return result;
}

function pathJoin(a: string, b: string): string {
  const sep = a.includes('\\') ? '\\' : '/';
  return a.replace(/[\\/]+$/, '') + sep + b.replace(/^[\\/]+/, '');
}

/**
 * Extracts the folder structure portion of a naming template.
 * If the template ends with a file name pattern (e.g. `/{CleanTitle}.{ext}`),
 * it returns the parent folder path. If the template is already a folder path
 * (e.g. `{Platform}/{Title}`), it preserves the full template so the game folder
 * token is never stripped.
 */
export function getFolderTemplate(template: string): string {
  if (!template) return '{Title} [{Platform}]';
  const parts = template.split('/');
  const last = parts[parts.length - 1].toLowerCase();
  if (
    last.includes('.{ext}') ||
    last.includes('{originalname}') ||
    last.includes('.iso') ||
    last.includes('.exe') ||
    (last.includes('.') && !last.includes('{title}'))
  ) {
    if (parts.length > 1) {
      return parts.slice(0, -1).join('/');
    }
  }
  return template;
}

// ── validateNamingTemplate ──────────────────────────────────────────────────

export function validateNamingTemplate(template: string): { valid: boolean; error?: string } {
  const foundTokens = template.match(/\{(\w+)\}/g) || [];
  const validLower = new Set(Array.from(VALID_TOKENS).map((t) => t.toLowerCase()));
  for (const tok of foundTokens) {
    const name = tok.slice(1, -1);
    if (!validLower.has(name.toLowerCase())) {
      return { valid: false, error: `Unknown token: {${name}}` };
    }
  }
  const tLower = template.toLowerCase();
  if (!tLower.includes('{title}') && !tLower.includes('{cleantitle}')) {
    return { valid: false, error: 'Template must include {Title} or {CleanTitle}' };
  }
  return { valid: true };
}

// ── previewNamingTemplate ───────────────────────────────────────────────────

export function previewNamingTemplate(
  template: string,
  sampleName: string,
): { valid: boolean; result?: string; error?: string } {
  const validation = validateNamingTemplate(template);
  if (!validation.valid) return validation;

  const release = parseReleaseName(sampleName);
  const ext = sampleName.includes('.iso') ? 'iso' : 'exe';
  const fileInfo: FileInfo = { name: sampleName, ext, type: 'iso' };
  const target = applyNamingTemplate(release, template, fileInfo, '/');
  return { valid: true, result: target.replace(/^\//, '') };
}

// ── analyzeRepackArchiveIntegrity ───────────────────────────────────────────

export interface RepackArchiveAnomaly {
  file?: string;
  type:
    | 'INCOMPLETE_DOWNLOAD'
    | 'DUPLICATE_NAME_COLLISION'
    | 'NAMING_VARIATION'
    | 'MISSING_ELAMIGOS_PREFIX'
    | 'MISSING_FITGIRL_PREFIX'
    | 'MISSING_SEQUENCE_CHUNK';
  suggested?: string;
  missing?: string;
  message: string;
}

export interface RepackArchiveAnalysis {
  isRepack: boolean;
  archiveType?: 'ElAmigos' | 'FitGirl' | 'DODI' | 'InnoSetup';
  health: 'HEALTHY' | 'CORRECTABLE_ANOMALY' | 'INCOMPLETE_DOWNLOAD' | 'GENERIC';
  anomalies: RepackArchiveAnomaly[];
  suggestedRenames: Record<string, string>;
}

export function analyzeRepackArchiveIntegrity(
  childFiles: string[] = [],
  folderName: string = '',
  releaseGroup: string = '',
): RepackArchiveAnalysis {
  const anomalies: RepackArchiveAnomaly[] = [];
  const suggestedRenames: Record<string, string> = {};
  const lowerFolder = folderName.toLowerCase();
  const lowerGroup = (releaseGroup || '').toLowerCase();

  const isElAmigos =
    lowerGroup.includes('elamigos') ||
    lowerFolder.includes('elamigos') ||
    childFiles.some((f) => f.toLowerCase().includes('elamigos'));
  const isFitGirl =
    lowerGroup.includes('fitgirl') ||
    lowerFolder.includes('fitgirl') ||
    childFiles.some((f) => f.toLowerCase().includes('fitgirl'));
  const isDodi =
    lowerGroup.includes('dodi') ||
    lowerFolder.includes('dodi') ||
    childFiles.some((f) => f.toLowerCase().includes('dodi'));

  const archiveFiles = childFiles.filter((f) => {
    const l = f.toLowerCase();
    return (
      l.endsWith('.bin') ||
      l.endsWith('.cab') ||
      l.endsWith('.doi') ||
      /\.bin(?:\.part|\.tmp|\.crdownload|\.downloading|\.bak|\.orig|\s*\(\d+\))$/i.test(l) ||
      /\b(?:setup|elamigos|data|game|archive)[-_0-9]+.*(?:\.bin|\.cab|\.doi)/i.test(l)
    );
  });

  if (archiveFiles.length === 0) {
    return { isRepack: false, anomalies, suggestedRenames, health: 'GENERIC' };
  }

  if (isElAmigos) {
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();

      if (/\.(part|crdownload|tmp|downloading)$/i.test(lower)) {
        anomalies.push({
          file: f,
          type: 'INCOMPLETE_DOWNLOAD',
          message: `Incomplete download part detected: '${f}'. The ElAmigos installer will fail until downloaded completely.`,
        });
        return;
      }

      const dupMatch =
        lower.match(/^(el[-_]?amigos[-_]?\d+)\s*\(\d+\)\.bin$/) ||
        lower.match(/^(el[-_]?amigos[-_]?\d+)\s*-\s*copy\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. ElAmigos setup.exe will fail ('File not found: ${canonical}'). Renaming to '${canonical}' required.`,
        });
        return;
      }

      const varMatch =
        lower.match(/^el[-_]amigos[-_](\d+)\.bin$/) || lower.match(/^elamigos_(\d+)\.bin$/);
      if (varMatch) {
        const canonical = `elamigos-${varMatch[1]}.bin`;
        if (f !== canonical) {
          suggestedRenames[f] = canonical;
          anomalies.push({
            file: f,
            type: 'NAMING_VARIATION',
            suggested: canonical,
            message: `Non-canonical separator: '${f}'. ElAmigos installer expects '${canonical}'.`,
          });
        }
        return;
      }

      if (!lower.startsWith('elamigos-') && !lower.startsWith('elamigos.')) {
        const numMatch = lower.match(/(?:^|[-_.a-z])(\d+)\.bin$/i);
        const chunkNum = numMatch ? numMatch[1] : archiveFiles.length === 1 ? '1' : String(idx + 1);
        const canonical = `elamigos-${chunkNum}.bin`;

        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_ELAMIGOS_PREFIX',
          suggested: canonical,
          message: `ElAmigos bin file missing prefix: '${f}' does not have 'elamigos-' in its name. The installer will fail to find it ('File not found: ${canonical}'). Renaming to '${canonical}' fixes the installer.`,
        });
      }
    });

    const foundIndices = new Set<number>();
    archiveFiles.forEach((f) => {
      const targetName = suggestedRenames[f] || f;
      const m = targetName.toLowerCase().match(/^elamigos-(\d+)\.bin$/);
      if (m) foundIndices.add(parseInt(m[1], 10));
    });

    if (foundIndices.size > 0) {
      const maxIndex = Math.max(...foundIndices);
      for (let i = 1; i <= maxIndex; i++) {
        if (!foundIndices.has(i)) {
          anomalies.push({
            type: 'MISSING_SEQUENCE_CHUNK',
            missing: `elamigos-${i}.bin`,
            message: `Missing archive chunk: 'elamigos-${i}.bin' is missing from the package sequence (found up to chunk ${maxIndex}). The installer will stop midway.`,
          });
        }
      }
    }
  } else if (isFitGirl) {
    archiveFiles.forEach((f, idx) => {
      const lower = f.toLowerCase();
      if (!lower.startsWith('setup-fitgirl-') && !lower.startsWith('fg-') && lower.endsWith('.bin')) {
        const numMatch = lower.match(/(\d+)\.bin$/);
        const chunk = numMatch ? numMatch[1] : String(idx + 1);
        const canonical = `setup-fitgirl-${chunk}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'MISSING_FITGIRL_PREFIX',
          suggested: canonical,
          message: `FitGirl bin file missing prefix: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  } else {
    archiveFiles.forEach((f) => {
      const lower = f.toLowerCase();
      const dupMatch = lower.match(/^(setup[-_]?\d+)\s*\(\d+\)\.bin$/);
      if (dupMatch) {
        const canonical = `${dupMatch[1].replace(/[-_]+/g, '-')}.bin`;
        suggestedRenames[f] = canonical;
        anomalies.push({
          file: f,
          type: 'DUPLICATE_NAME_COLLISION',
          suggested: canonical,
          message: `Improperly named duplicate: '${f}'. Installer expects '${canonical}'.`,
        });
      }
    });
  }

  const hasIncomplete = anomalies.some((a) => a.type === 'INCOMPLETE_DOWNLOAD');
  const hasRenames = Object.keys(suggestedRenames).length > 0;
  const health = hasIncomplete
    ? 'INCOMPLETE_DOWNLOAD'
    : hasRenames
    ? 'CORRECTABLE_ANOMALY'
    : 'HEALTHY';

  return {
    isRepack: true,
    archiveType: isElAmigos ? 'ElAmigos' : isFitGirl ? 'FitGirl' : isDodi ? 'DODI' : 'InnoSetup',
    health,
    anomalies,
    suggestedRenames,
  };
}

