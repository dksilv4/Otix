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
  // Strip version patterns BEFORE converting dots (_ is \w in JS, breaks \b)
  name = name.replace(/(^|[^a-zA-Z0-9])v\d+(?:\.\d+)+(?:[a-zA-Z]\d*)?(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/(^|[^a-zA-Z0-9])update\s*\d+(?:\.\d+)*(?![a-zA-Z0-9])/gi, '$1');
  name = name.replace(/\.iso$/i, '').replace(/\.exe$/i, '');
  name = name.replace(/[\._\-]/g, ' ');
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bunleashed\b/gi, /\bh\d+\b/gi, /\bhbg\b/gi, /\bdlc\b/gi, /\bincl\b/gi, /\bgog\b/gi, /\bcrack\b/gi, /\brune\b/gi, /\bflt\b/gi, /\bplaza\b/gi,
    /\bexe\b/gi,
  ];
  for (const tag of tags) {
    name = name.replace(tag, '');
  }
  name = name.replace(/\[\s*\]/g, '');
  name = name.replace(/\(\s*\)/g, '');
  name = name.replace(/\{\s*\}/g, '');
  name = name.replace(/\s+(exe|iso)\s*$/gi, '');
  name = name.replace(/[\s\-\+\:\,]+$/, '');
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

export function parseReleaseName(rawName: string): ParsedRelease {
  const origRawName = rawName;
  // Pre-process: normalize ElAmigos-style spaced versions + strip descriptors
  rawName = rawName
    .replace(/\b[vV](\d+(?: \d+)+)/g, (m) => m.replace(/ /g, '.'))
    .replace(/\b(?:update) (\d+(?: \d+)*)/gi, (m) => m.replace(/ /g, '.'))
    .replace(/\s+incl\s+dlc\b.*?(?=-)/gi, '') // strip "Incl DLC..." before trailing group
    .replace(/\s+password=.*$/i, ''); // strip trailing Password=...
  let m: RegExpMatchArray | null;

  // Strategy 1: Scene format
  m = rawName.match(
    /^(?<title>[A-Za-z0-9._+\-]+?)(?:\.(?:v?(?<version>\d+(?:\.\d+)*)))?[._-]?(?<extra>REPACK|PROPER|UPDATE|MULTI\d*|GOTY|DEF|ENHANCED)?[._-](?<group>(?!exe$|iso$|rar$|zip$|7z$)[A-Za-z0-9]{2,10})$/,
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
      return {
        title: title.replace(/\s+/g, ' ').trim(), cleanTitle: cleanGameTitle(rawName),
        year: yearMatch?.groups?.year, edition, group: g.group || undefined,
        version: g.version || undefined, rawName, isScene: true,
      };
    }
  }

  // Strategy 2: Elamigos format (handles V61339, V1.0.4, Update X.Y.Z, spaced versions)
  // Group can follow after whitespace OR dash (for "1.0.1-ElAmigos" style)
  m = rawName.match(/^(?<title>.+?)\s+(?:(?:update|v)\s+)?(?:v?\s*)?(?<version>(?:\d+(?:\.\d+)+)|\d{3,})(?:\s*-\s*(?:\d+(?:\.\d+)+|\d{3,}))?[\s-]+(?<group>[A-Za-z0-9]+?)(?:\s+password=.*)?$/i);
  if (m?.groups) {
    let title = m.groups.title.trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    const yearMatch = title.match(/\b(?<year>(?:19|20)\d{2})\b/);
    return {
      title: title.replace(/\s+/g, ' ').trim(), cleanTitle: cleanGameTitle(rawName),
      year: yearMatch?.groups?.year, edition, group: m.groups.group || undefined,
      version: m.groups.version || undefined, rawName, isScene: false,
    };
  }

  // Strategy 3: Generic with year/edition in brackets
  m = rawName.match(/^(?<title>.+?)\s*[\[\(](?<year>(?:19|20)\d{2})[\]\)]/);
  if (m?.groups) {
    let title = m.groups.title.replace(/[._]/g, ' ').trim();
    const edMatch = title.match(EDITION_RE);
    const edition = edMatch ? edMatch[0].trim() : undefined;
    if (edition) title = title.replace(edition, '').trim();
    const platMatch = rawName.match(/\[(?<platform>Multi|PC|PS\d|Xbox|Switch|Steam|GOG|Android|iOS)\]/i);
    return {
      title: title.replace(/\s+/g, ' ').trim(), cleanTitle: cleanGameTitle(rawName),
      year: m.groups.year, edition, platform: platMatch?.groups?.platform,
      group: extractGroup(rawName) ?? undefined, version: parseVersion(rawName)?.toString(),
      rawName, isScene: false,
    };
  }

  // Strategy 4: Fallback
  let title = cleanGameTitle(rawName);
  const edMatch = title.match(EDITION_RE);
  const edition = edMatch ? edMatch[0].trim() : undefined;
  if (edition) title = title.replace(new RegExp(edition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim();

  // Year: only in brackets or as last word before extension. Range 1980..2026
  const yearBracket = rawName.match(/[\[\(](?<year>(?:19[8-9]\d|20[0-2]\d))[\]\)]/);
  const yearEnd = rawName.match(/(?:\s|\.)(?<year>(?:19[8-9]\d|20[0-2]\d))(?:\s*\.\w+)?$/);
  const year = yearBracket?.groups?.year || yearEnd?.groups?.year;
  const platMatch = rawName.match(/\[(?<platform>Multi|PC|PS\d|Xbox|Switch|Steam|GOG|Android|iOS)\]/i);

  // Extract version from raw name (handles v1.0.4, update 1.0.1, V61339 formats)
  // Extract version from raw name
  let versionStr: string | undefined;
  // Dotted version preceded by v/update or standalone (4.1.1.4763283)
  const dottedMatch = rawName.match(/(?:(?:update|v)\s*)?(\d+(?:\.\d+){2,})/i);
  if (dottedMatch) {
    versionStr = dottedMatch[1];
  } else {
    // Fallback to ElAmigos-style numeric version
    const v = parseVersion(rawName);
    if (v !== null) versionStr = v.toString();
  }

  return {
    title: title.replace(/\s+/g, ' ').trim(), cleanTitle: title, year,
    edition, platform: platMatch?.groups?.platform,
    group: extractGroup(rawName) ?? undefined,
    version: versionStr,
    rawName, isScene: false,
  };
}

// ── applyNamingTemplate ─────────────────────────────────────────────────────

const VALID_TOKENS = new Set([
  'Title', 'CleanTitle', 'Year', 'Edition', 'Platform',
  'ReleaseGroup', 'Version', 'OriginalName', 'MediaType', 'ext',
]);

export function applyNamingTemplate(
  release: ParsedRelease,
  template: string,
  fileInfo: FileInfo,
  baseDir?: string,
): string {
  const tokens: Record<string, string> = {
    Title: release.title,
    CleanTitle: release.cleanTitle,
    Year: release.year ?? '',
    Edition: release.edition ?? '',
    Platform: release.platform ?? 'PC',
    ReleaseGroup: release.group ?? '',
    Version: release.version ?? '',
    OriginalName: release.rawName,
    MediaType: fileInfo.type === 'iso' ? 'ISO' : fileInfo.type === 'pc_game' ? 'PC' : 'Update',
    ext: fileInfo.ext,
  };

  let result = template;
  for (const [key, value] of Object.entries(tokens)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value || '');
  }

  // Clean up empty bracket pairs + slashes + double spaces + trailing dot
  result = result.replace(/\(\s*\)/g, '').replace(/\[\s*\]/g, '').replace(/\{\s*\}/g, '');
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

// ── validateNamingTemplate ──────────────────────────────────────────────────

export function validateNamingTemplate(template: string): { valid: boolean; error?: string } {
  const foundTokens = template.match(/\{(\w+)\}/g) || [];
  for (const tok of foundTokens) {
    const name = tok.slice(1, -1);
    if (!VALID_TOKENS.has(name)) {
      return { valid: false, error: `Unknown token: {${name}}` };
    }
  }
  if (!template.includes('{Title}') && !template.includes('{CleanTitle}')) {
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
