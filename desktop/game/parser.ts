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
  version?: string;
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

const EDITION_RE = /(?<edition>goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary)\s*edition/gi;

// ── cleanGameTitle ──────────────────────────────────────────────────────────

export function cleanGameTitle(filename: string): string {
  let name = filename;

  // Strip leading update/part sequence prefix like "1 - ", "2 - ", "01. "
  name = name.replace(/^\d+\s*[-_.]\s*/, '');

  // Strip full build date expressions like (build 13.06.2024)
  name = name.replace(/\(build\s*[^)]+\)/gi, '');
  name = name.replace(/\bbuild\s*[\d.]+\b/gi, '');

  // Strip date patterns (e.g. 20.02.2026, 13.03.2026 - 05.05.2026, 27.05.2025)
  name = name.replace(/\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi, '');

  // Strip update followed by version numbers / ranges:
  // "update 4 1 1 5009956 4 1 1 5849914", "update 5849914 6758295", "update 2.12 - 2.13", "update 1.0.7 - 1.0.16"
  name = name.replace(/(^|[^a-zA-Z0-9])(?:update\s*[\d\s._-]+(?=[a-zA-Z]|$))/gi, '$1');

  // Strip version patterns BEFORE converting dots (_ is \w in JS, breaks \b)
  name = name.replace(/(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/(^|[\s._-])(?:v\d+|build\s*\d+)(?=[\s._-]|$)/gi, ' ');
  name = name.replace(/\.(iso|exe|zip|rar|7z|bin|cue|nsp|xci|3ds|nds|rvz|chd|gba|z64|sfc|pkg)$/i, '');
  name = name.replace(/\.part\d+$/i, '');

  // Strip Title IDs like [0100F2C0115B6000] or [BCUS98174] or CUSA00411 or PPSA15552
  name = name.replace(/\[[0-9A-Fa-f]{16}\]/g, '');
  name = name.replace(/\[?[A-Z]{4}\d{5}\]?/g, '');

  // Strip ROM update/DLC flags
  name = name.replace(/\[(?:UPD|DLC|v\d+)\]/gi, '');

  // Strip platform tags like [PC], (PC), [Switch], etc.
  name = name.replace(/(?:\[|\()\s*(?:PC|Switch|NSW|PS[1-5]|Xbox|Wii|GameCube|3DS|NDS|GBA|Genesis)\s*(?:\]|\))/gi, ' ');

  // Strip 4-digit year tags in brackets or parentheses like [2020] or (2020)
  name = name.replace(/(?:\[|\()\s*(?:19|20)\d{2}\s*(?:\]|\))/gi, ' ');

  // Strip region tags in brackets or parentheses like (USA), [Europe], (World)
  name = name.replace(/(?:\[|\()\s*(?:USA|Europe|Japan|World|En,Ja|En,Fr,De|Asia|Australia|Germany|France)\s*(?:\]|\))/gi, ' ');

  // Strip edition tags in brackets or parentheses like [Deluxe Edition], (GOTY)
  name = name.replace(/(?:\[|\()\s*(?:goty|game\s*of\s*the\s*year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors|special|legendary|anniversary|director['’]?s\s*cut)\s*(?:edition)?\s*(?:\]|\))/gi, ' ');

  // Strip bracketed version patterns like [v1.0.4] or (v2.1)
  name = name.replace(/(?:\[|\()\s*v?\d+(?:\.\d+)+\s*(?:\]|\))/gi, ' ');

  // Strip crack flags and keywords from title
  name = name.replace(/(?:\[|\()\s*(?:crack\s*fix|crackfix|crack\s*only|crack|cracked|online\s*fix|onlinefix|no\s*cd|nocd)\s*(?:\]|\))/gi, ' ');
  name = name.replace(/\+\s*crack/gi, ' ');
  name = name.replace(/(?:crackfix|crack\.fix|crack-fix|crack\s*only|onlinefix|online\.fix|online-fix|nocd|no-cd)/gi, ' ');

  name = name.replace(/[\._\-]/g, ' ');
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bpart\s*\d+\b/gi, /\bprophet\b/gi, /\bdelusion\b/gi, /\bunleashed\b/gi,
    /\bcrack\s*fix(?:\s*v\d+)?\b/gi, /\bcrackfix(?:\s*v\d+)?\b/gi,
    /\bcrack\s*only\b/gi, /\bcrack\b/gi, /\bproper\b/gi, /\bearlyaccess\b/gi,
    /\bempress\b/gi, /\bcpy\b/gi, /\brune\b/gi, /\bflt\b/gi, /\bplaza\b/gi,
    /\bexe\b/gi, /\bunlocker\b/gi, /\bsmall\b/gi,
    /\bwin(?:dows)?\s*(?:10|11|7|8|xp)?\b/gi,
    /\b(?:2[1-5]h[12]|x64|x86|64bit|32bit)\b/gi,
    /\b(?:ps[1-5]|nsw)\b/gi,
    /\+\s*\d+\s*(?:dlcs?|bonuses|bonus|extras?|addons?)\b/gi,
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  name = name.replace(/\s+(exe|iso)\s*$/gi, '');
  name = name.replace(/[\s\-\+\:\,\&]+$/, '');
  name = name.replace(/^[\s\-\+\:\,\&]+/, '');
  return name.replace(/\s+/g, ' ').trim();
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

// ── parseReleaseName ────────────────────────────────────────────────────────

export function parseReleaseName(rawName: string, extHint?: string, parentDirHint?: string): ParsedRelease {
  let baseName = rawName.split(/[/\\]/).pop() || rawName;
  let ext = '';
  if (extHint !== null && extHint !== undefined) {
    ext = extHint.toLowerCase();
  } else {
    const extMatch = baseName.match(/(\.[a-zA-Z0-9]+)$/);
    const candidate = extMatch ? extMatch[1].toLowerCase() : '';
    if (candidate && candidate.length <= 6 && !candidate.includes('-')) {
      ext = candidate;
    }
  }
  if (ext && baseName.toLowerCase().endsWith(ext)) {
    baseName = baseName.slice(0, -ext.length);
  }
  // Strip multi-part archive suffixes from baseName (.part01, .part1, .r00, etc.)
  baseName = baseName.replace(/\.(?:part\d+|r\d{2})$/i, '');

  const origRawName = rawName;
  // Pre-process: normalize ElAmigos-style spaced versions + strip descriptors + dates & sequence prefixes
  let processed = baseName
    .replace(/\(build\s*[^)]+\)/gi, '')
    .replace(/\bbuild\s*[\d.]+\b/gi, '')
    .replace(/\b\d{2}[._-]\d{2}[._-](?:19|20)\d{2}\b/gi, '')
    .replace(/^\d+\s*[-_.]\s*/, '')
    .replace(/\b[vV](\d+(?: \d+)+)/g, (m) => m.replace(/ /g, '.'))
    .replace(/\b(?:update) (\d+(?: \d+)*)/gi, (m) => m.replace(/ /g, '.'))
    .replace(/\s+incl\s+dlc\b.*?(?=-)/gi, '') // strip "Incl DLC..." before trailing group
    .replace(/\s+password=.*$/i, ''); // strip trailing Password=...

  // Platform detection across formats
  let detectedPlatform: string | undefined;
  const platMatch = processed.match(/\[(?<platform>Multi|PC|PS[1-5]|Switch|NSW|Xbox|Steam|GOG|Android|iOS)\]/i)
    || processed.match(/(?:^|[\s._-])(?<platform>PC|Switch|NSW|PS[1-5]|Xbox|Steam|GOG)(?:[\s._-]|$)/i);
  if (platMatch?.groups?.platform) {
    let p = platMatch.groups.platform.toUpperCase();
    if (p === 'NSW') p = 'Switch';
    detectedPlatform = p;
  }
  const ps5Match = origRawName.match(/PPSA\d{5}/i);
  const ps4Match = origRawName.match(/CUSA\d{5}/i);
  const ps3Match = origRawName.match(/(?:BCUS|BLES|BLUS)\d{5}/i);
  if (ps5Match) detectedPlatform = 'PS5';
  else if (ps4Match) detectedPlatform = 'PS4';
  else if (ps3Match) detectedPlatform = 'PS3';

  let m: RegExpMatchArray | null;

  // Strategy 1: Scene format
  m = processed.match(
    /^(?<title>[A-Za-z0-9._+\-]+?)(?:\.(?:v?(?<version>\d+(?:\.\d+)*)))?[._-]?(?<extra>REPACK|PROPER|UPDATE|MULTI\d*|GOTY|DEF|ENHANCED)?[._-](?<group>(?!exe$|iso$|rar$|zip$|7z$)(?!\d+$)[A-Za-z0-9]{2,10})$/,
  );
  if (m?.groups) {
    const g = m.groups;
    // If scene match absorbed a version-like pattern into title (no version captured), skip
    if (!g.version && /v\d+\.\d+/i.test(g.title)) {
      // bail to fallback
    } else {
      let title = g.title.replace(/[._]/g, ' ').trim();
      const edMatch = title.match(EDITION_RE);
      const edition = edMatch ? edMatch[0].trim() : undefined;
      if (edition) title = title.replace(edition, '').trim();
      const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/);
      let clean = cleanGameTitle(rawName);
      if (!clean && parentDirHint) clean = cleanGameTitle(parentDirHint);
      return {
        title: title.replace(/\s+/g, ' ').trim() || clean, cleanTitle: clean,
        year: yearMatch?.groups?.year, edition, group: g.group || undefined,
        platform: detectedPlatform,
        version: g.version || undefined, rawName, isScene: true,
      };
    }
  }

  // Strategy 2: Elamigos format (handles V61339, V1.0.4, Update X.Y.Z, spaced versions)
  // Group can follow after whitespace OR dash (for "1.0.1-ElAmigos" style)
  m = processed.match(/^(?<title>.+?)\s+(?:(?:update|v)\s+)?(?:v?\s*)?(?<version>(?:\d+(?:\.\d+)+)|\d{3,})(?:\s*-\s*(?:\d+(?:\.\d+)+|\d{3,}))?[\s-]+(?<group>[A-Za-z0-9]+?)(?:\s+password=.*)?$/i);
  if (m?.groups) {
    let title = m.groups.title.trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/);
    let clean = cleanGameTitle(rawName);
    if (!clean && parentDirHint) clean = cleanGameTitle(parentDirHint);
    return {
      title: title.replace(/\s+/g, ' ').trim() || clean, cleanTitle: clean,
      year: yearMatch?.groups?.year, edition, group: m.groups.group || undefined,
      platform: detectedPlatform,
      version: m.groups.version || undefined, rawName, isScene: false,
    };
  }

  // Strategy 3: Generic with year/edition in brackets
  m = processed.match(/^(?<title>.+?)\s*[\[\(](?<year>(?:19|20)\d{2})[\]\)]/);
  if (m?.groups) {
    let title = m.groups.title.replace(/[._]/g, ' ').trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    let clean = cleanGameTitle(rawName);
    if (!clean && parentDirHint) clean = cleanGameTitle(parentDirHint);
    return {
      title: title.replace(/\s+/g, ' ').trim() || clean, cleanTitle: clean,
      year: m.groups.year, edition, platform: detectedPlatform || platMatch?.groups?.platform,
      group: extractGroup(processed) ?? undefined, version: parseVersion(processed)?.toString(),
      rawName, isScene: false,
    };
  }

  // Strategy 4: Fallback
  let title = cleanGameTitle(rawName);
  if (!title && parentDirHint) title = cleanGameTitle(parentDirHint);
  const edMatch = title.match(EDITION_RE);
  const edition = edMatch ? edMatch[0].trim() : undefined;
  if (edition) title = title.replace(new RegExp(edition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();

  // Year: only in brackets or as last word before extension. Range 1980..2026
  // Avoid matching 2077 in Cyberpunk or 1942 in Battlefield.
  const yearBracket = processed.match(/[\[\(](?<year>(?:19[8-9]\d|20[0-2]\d))[\]\)]/);
  const yearEnd = processed.match(/(?:\s|\.)(?<year>(?:19[8-9]\d|20[0-2]\d))(?:\s*\.\w+)?$/);
  const year = yearBracket?.groups?.year || (yearEnd?.groups?.year && !title.endsWith(yearEnd.groups.year) ? yearEnd.groups.year : undefined);

  // Extract version from raw name
  let versionStr: string | undefined;
  const dottedMatch = processed.match(/(?:(?:update|v)\s*)?(\d+(?:\.\d+){2,})/i);
  if (dottedMatch) {
    versionStr = dottedMatch[1];
  } else {
    const v = parseVersion(processed);
    if (v !== null) versionStr = v.toString();
  }

  return {
    title: title.replace(/\s+/g, ' ').trim(), cleanTitle: title, year,
    edition, platform: detectedPlatform || platMatch?.groups?.platform,
    group: extractGroup(processed) ?? undefined,
    version: versionStr,
    rawName, isScene: false,
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

export function sanitizePathSegment(val: string): string {
  if (!val) return '';
  return val
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

