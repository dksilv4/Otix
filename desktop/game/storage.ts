import fs from 'fs';
import path from 'path';
import { access as fsAccess } from 'fs/promises';
import type { BrowserWindow } from 'electron';
import type Database from 'better-sqlite3';
import { getDb } from '../db';
import type { LocalGame } from '../preload-api';
import { isUpdateFile, isDlcFile } from './local-scanner';
import { resolveUncPath } from '../unc-resolver';

let __db: Database.Database | null = null;
function db(): Database.Database {
  if (!__db) __db = getDb();
  return __db;
}

type DbRow = Record<string, any>;
const __get = (sql: string, ...params: any[]) => db().prepare(sql).get(...params) as any;
const __all = (sql: string, ...params: any[]) => db().prepare(sql).all(...params) as any[];

// ── Constants & Utilities ──────────────────────────────────────────────

/**
 * SQLite has a default limit of 999 bound variables per statement (SQLITE_LIMIT_VARIABLE_NUMBER).
 * We enforce a conservative threshold of 400 items per batch to guarantee queries never overflow,
 * even when combined with compound conditions.
 */
export const SQLITE_PARAM_LIMIT = 400;

/**
 * Splits an array into chunks of at most `size` elements.
 */
export function chunkArray<T>(items: T[], size: number = SQLITE_PARAM_LIMIT): T[][] {
  if (!items || items.length === 0) return [];
  const chunkSize = size > 0 ? size : SQLITE_PARAM_LIMIT;
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

/**
 * Runs the given function inside an atomic SQLite transaction via better-sqlite3's
 * `db().transaction(...)()`. If the underlying database instance does not provide
 * `.transaction()` (such as in lightweight mock environments used by unit tests),
 * it seamlessly executes the function directly.
 */
export function withTransaction<T>(fn: () => T): T {
  const database = db();
  if (typeof (database as any)?.transaction === 'function') {
    return (database as any).transaction(fn)();
  }
  return fn();
}

/**
 * Ensures secondary indexes on scanned_games exist for runtime/standalone scripts.
 */
export function ensureScannedGamesIndexes(): void {
  db().exec(`
    CREATE INDEX IF NOT EXISTS idx_scanned_games_platform ON scanned_games(platform);
    CREATE INDEX IF NOT EXISTS idx_scanned_games_otix_media_id ON scanned_games(otix_media_id);
    CREATE INDEX IF NOT EXISTS idx_scanned_games_install_dir ON scanned_games(install_dir);
    CREATE INDEX IF NOT EXISTS idx_scanned_games_exe_path ON scanned_games(exe_path);
  `);
}

// ── Types ──────────────────────────────────────────────────────────────

export type GamePlatform = LocalGame['platform'];

export interface GameRow {
  id: string;
  title: string;
  exePath: string;
  localExePath?: string;
  installDir: string;
  platform: GamePlatform;
  localIconUrl?: string;
  iconUrl?: string;
  posterUrl?: string;
  backdropUrl?: string;
  logoUrl?: string;
  overview?: string;
  sources?: (string | Record<string, unknown>)[];
  isDlc?: boolean;
  dlcOf?: string;
  isBeta?: boolean;
  betaOf?: string;
  isApp?: boolean;
  gameType?: string;
  version?: string | null;
  data?: { id: string; title: string; platform: string; version?: string | null; iconUrl?: string; posterUrl?: string; backdropUrl?: string; logoUrl?: string; textlessPosterUrl?: string; sizeBytes?: number; modifiedAt?: string };
  matchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; _candidates?: any[] };
  otixMatchSuggestion?: { id: string; title: string; platform: string; iconUrl?: string; posterUrl?: string; _candidates?: any[] };
  updateFiles?: { name: string; path: string }[];
  lastPlayedAt?: string;
  otixMediaId?: string;
  otixMediaTitle?: string;
  otixMediaSlug?: string;
  otixConfidence?: number;
  otixPosterUrl?: string;
  otixBackdropUrl?: string;
  otixTextlessPosterUrl?: string;
  otixLogoUrl?: string;
  otixIconUrl?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface GameFilter {
  platform?: string[];
  matched?: boolean;
  hasSuggestion?: boolean;
  search?: string;
  installed?: boolean;
  limit?: number;
  offset?: number;
  sortBy?: 'title' | 'platform' | 'updated_at' | 'last_played_at';
  sortDir?: 'asc' | 'desc';
}

// ── Row → GameRow ─────────────────────────────────────────────────────

/** Cache for parsed otix_data to avoid re-parsing the same JSON blob in rowToGame */
let _otixDataCache: Map<string, any> | null = null;

function getOtixDataParsed(raw: string | undefined | null): any | undefined {
  if (!raw) return undefined;
  // Use a small LRU-style cache to avoid re-parsing identical JSON during batch operations
  if (!_otixDataCache) _otixDataCache = new Map();
  const cached = _otixDataCache.get(raw);
  if (cached !== undefined) return cached;
  try {
    const parsed = JSON.parse(raw);
    // Keep cache bounded to prevent memory leaks during large scans
    if (_otixDataCache.size > 5000) _otixDataCache.clear();
    _otixDataCache.set(raw, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

/** In-memory cache for directory sizes to avoid repeated expensive recursive disk walks */
const _dirSizeCache = new Map<string, { size: number; mtimeMs: number }>();

/**
 * Recursively calculates the total size in bytes of all files within a directory.
 * Caches the result by directory mtimeMs to ensure sub-millisecond retrieval on repeat calls.
 */
export function calculateDirectorySize(dirPath: string, maxDepth = 4): number {
  if (!dirPath || typeof dirPath !== 'string') return 0;
  try {
    if (!fs.existsSync(dirPath)) return 0;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return stat.size;

    const cached = _dirSizeCache.get(dirPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.size;
    }

    let total = 0;
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        if (entry.isFile()) {
          total += fs.statSync(fullPath).size;
        } else if (entry.isDirectory() && maxDepth > 0) {
          if (entry.name === '.git' || entry.name === '$RECYCLE.BIN' || entry.name === 'node_modules') continue;
          total += calculateDirectorySize(fullPath, maxDepth - 1);
        }
      } catch {
        // Skip inaccessible entries
      }
    }

    if (_dirSizeCache.size > 2000) _dirSizeCache.clear();
    _dirSizeCache.set(dirPath, { size: total, mtimeMs: stat.mtimeMs });
    return total;
  } catch {
    return 0;
  }
}

/** In-memory cache for PE executable versions */
const _peVersionCache = new Map<string, { version: string; mtimeMs: number }>();

/**
 * Scans a directory for the most likely game executable if exePath is only a folder.
 */
export function findMainExecutableInFolder(dirPath: string): string | null {
  if (!dirPath || typeof dirPath !== 'string') return null;
  try {
    if (!fs.existsSync(dirPath)) return null;
    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) return null;

    const candidates: string[] = [];
    const checkDir = (sub: string, depth = 0) => {
      if (depth > 2) return;
      try {
        const entries = fs.readdirSync(sub, { withFileTypes: true });
        for (const e of entries) {
          const full = path.join(sub, e.name);
          if (e.isFile() && e.name.toLowerCase().endsWith('.exe')) {
            const lower = e.name.toLowerCase();
            if (
              !lower.startsWith('unins') &&
              !lower.startsWith('setup') &&
              !lower.includes('crash') &&
              !lower.includes('redist') &&
              !lower.includes('dxsetup') &&
              !lower.includes('vcredist') &&
              !lower.includes('dotnet')
            ) {
              candidates.push(full);
            }
          } else if (e.isDirectory() && depth < 2) {
            const nl = e.name.toLowerCase();
            if (['bin', 'bin64', 'binaries', 'win64', 'x64', 'game'].includes(nl)) {
              checkDir(full, depth + 1);
            }
          }
        }
      } catch {}
    };

    checkDir(dirPath);
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];

    let best = candidates[0];
    let bestSize = 0;
    for (const c of candidates) {
      try {
        const s = fs.statSync(c).size;
        if (s > bestSize) {
          bestSize = s;
          best = c;
        }
      } catch {}
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * Extracts product or file version from a Windows PE executable's resource table (.rsrc)
 * or binary VS_FIXEDFILEINFO. Caches by file mtimeMs for instantaneous sub-millisecond lookups.
 */
export function getPeVersion(filePath: string): string | null {
  if (!filePath || typeof filePath !== 'string') return null;
  let fd: number | null = null;
  try {
    if (!fs.existsSync(filePath)) return null;
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || stat.size < 1024) return null;

    const cached = _peVersionCache.get(filePath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.version;
    }

    fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(1024);
    fs.readSync(fd, header, 0, 1024, 0);

    // Verify DOS MZ header
    if (header.readUInt16LE(0) !== 0x5a4d) {
      fs.closeSync(fd);
      return null;
    }

    const peOffset = header.readUInt32LE(0x3c);
    if (peOffset > stat.size - 256) {
      fs.closeSync(fd);
      return null;
    }

    const peHeader = Buffer.alloc(24);
    fs.readSync(fd, peHeader, 0, 24, peOffset);
    if (peHeader.toString('utf8', 0, 4) !== 'PE\0\0') {
      fs.closeSync(fd);
      return null;
    }

    const numSections = peHeader.readUInt16LE(6);
    const optHeaderSize = peHeader.readUInt16LE(20);
    const sectionHeadersOffset = peOffset + 24 + optHeaderSize;

    const sectionsBuf = Buffer.alloc(numSections * 40);
    fs.readSync(fd, sectionsBuf, 0, numSections * 40, sectionHeadersOffset);

    let rsrcOffset = 0;
    let rsrcSize = 0;
    for (let i = 0; i < numSections; i++) {
      const secName = sectionsBuf.toString('utf8', i * 40, i * 40 + 8).replace(/\0/g, '');
      if (secName.startsWith('.rsrc')) {
        rsrcOffset = sectionsBuf.readUInt32LE(i * 40 + 20);
        rsrcSize = sectionsBuf.readUInt32LE(i * 40 + 16);
        break;
      }
    }

    let searchBuf: Buffer;
    if (rsrcOffset > 0 && rsrcSize > 0) {
      const readLen = Math.min(rsrcSize, 4 * 1024 * 1024);
      searchBuf = Buffer.alloc(readLen);
      fs.readSync(fd, searchBuf, 0, readLen, rsrcOffset);
    } else {
      const scanLen = Math.min(stat.size, 4 * 1024 * 1024);
      searchBuf = Buffer.alloc(scanLen);
      fs.readSync(fd, searchBuf, 0, scanLen, 0);
    }
    fs.closeSync(fd);
    fd = null;

    const pvNeedle = Buffer.from('ProductVersion\0', 'utf16le');
    const fvNeedle = Buffer.from('FileVersion\0', 'utf16le');

    for (const needle of [pvNeedle, fvNeedle]) {
      let idx = searchBuf.indexOf(needle);
      if (idx !== -1) {
        idx += needle.length;
        while (idx < searchBuf.length && searchBuf.readUInt16LE(idx) === 0) idx += 2;
        const strStart = idx;
        while (idx < searchBuf.length && searchBuf.readUInt16LE(idx) !== 0) idx += 2;
        const ver = searchBuf.toString('utf16le', strStart, idx).trim();
        if (ver && /^\d+/.test(ver)) {
          const cleaned = ver.replace(/,\s*/g, '.').replace(/(\.0+)+$/, '');
          const finalVer = cleaned || ver;
          if (_peVersionCache.size > 2000) _peVersionCache.clear();
          _peVersionCache.set(filePath, { version: finalVer, mtimeMs: stat.mtimeMs });
          return finalVer;
        }
      }
    }

    // Binary VS_FIXEDFILEINFO fallback (signature 0xfeef04bd)
    const sigNeedle = Buffer.from([0xbd, 0x04, 0xef, 0xfe]);
    const sigIdx = searchBuf.indexOf(sigNeedle);
    if (sigIdx !== -1 && sigIdx + 24 <= searchBuf.length) {
      const fileMajor = searchBuf.readUInt16LE(sigIdx + 10);
      const fileMinor = searchBuf.readUInt16LE(sigIdx + 8);
      const fileBuild = searchBuf.readUInt16LE(sigIdx + 14);
      const fileRev = searchBuf.readUInt16LE(sigIdx + 12);

      const prodMajor = searchBuf.readUInt16LE(sigIdx + 18);
      const prodMinor = searchBuf.readUInt16LE(sigIdx + 16);
      const prodBuild = searchBuf.readUInt16LE(sigIdx + 22);
      const prodRev = searchBuf.readUInt16LE(sigIdx + 20);

      const vMajor = prodMajor || fileMajor;
      const vMinor = prodMinor || fileMinor;
      const vBuild = prodBuild || fileBuild;
      const vRev = prodRev || fileRev;

      if (vMajor > 0 || vMinor > 0) {
        let binVer = `${vMajor}.${vMinor}`;
        if (vBuild > 0 || vRev > 0) binVer += `.${vBuild}`;
        if (vRev > 0) binVer += `.${vRev}`;
        if (_peVersionCache.size > 2000) _peVersionCache.clear();
        _peVersionCache.set(filePath, { version: binVer, mtimeMs: stat.mtimeMs });
        return binVer;
      }
    }
  } catch {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
    return null;
  }
  return null;
}

/** Clears the internal otix_data parse cache. Call after bulk mutations. */
export function clearRowCache(): void {
  _otixDataCache?.clear();
  _otixDataCache = null;
  _dirSizeCache.clear();
  _peVersionCache.clear();
}

function rowToGame(row: DbRow): GameRow {
  const matchSuggestion = row.otix_match_suggestion
    ? (() => { try { return JSON.parse(row.otix_match_suggestion as string); } catch { return undefined; } })()
    : undefined;

  let sources: any[] | undefined = undefined;
  let isDlc = false;
  let dlcOf: string | undefined = undefined;
  let isBeta = false;
  let betaOf: string | undefined = undefined;
  let isApp = false;
  let gameType: string | undefined = undefined;

  if (row.sources) {
    try {
      sources = JSON.parse(row.sources as string);
      if (Array.isArray(sources)) {
        for (const s of sources) {
          if (typeof s === 'object' && s !== null) {
            if (s.isDlc) isDlc = true;
            if (s.dlcOf) dlcOf = String(s.dlcOf);
            if (s.isBeta) isBeta = true;
            if (s.betaOf) betaOf = String(s.betaOf);
            if (s.isApp) isApp = true;
            if (s.gameType) gameType = String(s.gameType);
          }
        }
      }
    } catch {}
  }

  // Parse otix_data once and reuse for both overview and data fields
  const otixDataParsed = getOtixDataParsed(row.otix_data as string | undefined);

  let sizeBytes: number | undefined =
    (otixDataParsed?.sizeBytes != null ? Number(otixDataParsed.sizeBytes) : undefined) ||
    (otixDataParsed?.filesize != null ? Number(otixDataParsed.filesize) : undefined) ||
    (otixDataParsed?.size != null ? Number(otixDataParsed.size) : undefined) ||
    (row.size_bytes != null ? Number(row.size_bytes) : undefined) ||
    (row.filesize != null ? Number(row.filesize) : undefined);

  let modifiedAt: string | undefined =
    (otixDataParsed?.modifiedAt as string | undefined) ||
    (otixDataParsed?.modified_at as string | undefined) ||
    (row.modified_at as string | undefined) ||
    undefined;

  let version: string | undefined =
    (otixDataParsed?.version as string | undefined) ||
    (otixDataParsed?.gameVersion as string | undefined) ||
    (otixDataParsed?.game_version as string | undefined) ||
    (row.version as string | undefined) ||
    undefined;

  let localExePath = (row.local_exe_path as string) || undefined;
  let resolvedExePath = (row.exe_path as string) || undefined;

  // On-demand disk stat fallback for existing or unmatched scanned games
  if ((sizeBytes == null || sizeBytes <= 0 || !modifiedAt || !version || !localExePath) && (row.exe_path || row.install_dir || row.local_exe_path)) {
    try {
      const dirTarget =
        (row.install_dir as string) && fs.existsSync(row.install_dir as string)
          ? (row.install_dir as string)
          : null;
      let fileTarget =
        (row.local_exe_path as string) && fs.existsSync(row.local_exe_path as string)
          ? (row.local_exe_path as string)
          : (row.exe_path as string) && !String(row.exe_path).startsWith('steam://') && fs.existsSync(row.exe_path as string)
            ? (row.exe_path as string)
            : null;

      // If fileTarget points to a directory or is missing, try locating the game's actual executable
      if ((!fileTarget || (fileTarget && fs.statSync(fileTarget).isDirectory())) && dirTarget) {
        const foundExe = findMainExecutableInFolder(dirTarget);
        if (foundExe) {
          fileTarget = foundExe;
          if (!localExePath) localExePath = foundExe;
        }
      }

      if (!modifiedAt) {
        const probe = fileTarget || dirTarget;
        if (probe) {
          try {
            const st = fs.statSync(probe);
            if (st.mtime) modifiedAt = st.mtime.toISOString();
          } catch {}
        }
      }

      if (sizeBytes == null || sizeBytes <= 0) {
        if (dirTarget) {
          const dirSize = calculateDirectorySize(dirTarget);
          if (dirSize > 0) sizeBytes = dirSize;
        }
        if ((sizeBytes == null || sizeBytes <= 0) && fileTarget) {
          try {
            const st = fs.statSync(fileTarget);
            if (st.size > 0) sizeBytes = st.size;
          } catch {}
        }
      }

      if (!version && fileTarget && fileTarget.toLowerCase().endsWith('.exe')) {
        const peVer = getPeVersion(fileTarget);
        if (peVer) version = peVer;
      }
    } catch {
      // non-fatal
    }
  }

  if (!modifiedAt) {
    modifiedAt = (row.updated_at as string) || (row.created_at as string) || undefined;
  }

  return {
    id: row.id as string,
    title: row.title as string,
    exePath: resolvedExePath || '',
    localExePath,
    installDir: row.install_dir as string,
    platform: row.platform as GamePlatform,
    version,
    sizeBytes,
    modifiedAt,
    createdAt: (row.created_at as string) || undefined,
    updatedAt: (row.updated_at as string) || undefined,
    localIconUrl: (row.local_icon_url as string) || undefined,
    iconUrl: (row.icon_url as string) || undefined,
    posterUrl: (row.otix_poster_url as string) || (row.poster_url as string) || undefined,
    backdropUrl: (row.otix_backdrop_url as string) || (row.backdrop_url as string) || undefined,
    logoUrl: (row.otix_logo_url as string) || undefined,
    overview: otixDataParsed?.overview,
    sources,
    isDlc: isDlc || Boolean(row.is_dlc) || isUpdateFile((row.title as string) || '', (row.exe_path as string) || (row.install_dir as string)) || isDlcFile((row.title as string) || '', (row.exe_path as string) || (row.install_dir as string)),
    dlcOf,
    isBeta,
    betaOf,
    isApp,
    gameType,
    updateFiles: row.update_files ? (() => { try { return JSON.parse(row.update_files as string); } catch { return undefined; } })() : undefined,
    lastPlayedAt: (row.last_played_at as string) || undefined,
    data: (() => {
      const base = {
        id: (row.otix_media_id as string) || (row.id as string),
        title: (row.otix_media_title as string) || (row.title as string),
        platform: row.platform as GamePlatform,
        version,
        iconUrl: (row.otix_icon_url as string) || (row.icon_url as string) || undefined,
        posterUrl: (row.otix_poster_url as string) || (row.poster_url as string) || undefined,
        backdropUrl: (row.otix_backdrop_url as string) || (row.backdrop_url as string) || undefined,
        logoUrl: (row.otix_logo_url as string) || undefined,
        textlessPosterUrl: (row.otix_textless_poster_url as string) || undefined,
        sizeBytes,
        modifiedAt,
      };
      if (otixDataParsed) {
        return {
          ...base,
          ...otixDataParsed,
          platform: row.platform as GamePlatform,
          posterUrl: base.posterUrl || otixDataParsed.posterUrl || otixDataParsed.poster_url,
          backdropUrl: base.backdropUrl || otixDataParsed.backdropUrl || otixDataParsed.backdrop_url,
          releaseDate: otixDataParsed.releaseDate || otixDataParsed.release_date || otixDataParsed.year,
          version: version ?? otixDataParsed.version ?? otixDataParsed.gameVersion,
          sizeBytes: sizeBytes ?? otixDataParsed.sizeBytes,
          modifiedAt: modifiedAt || otixDataParsed.modifiedAt,
        };
      }
      return base;
    })(),
    matchSuggestion,
    otixMatchSuggestion: matchSuggestion,  // alias for backward compat
    otixMediaId: (row.otix_media_id as string) || undefined,
    otixMediaTitle: (row.otix_media_title as string) || undefined,
    otixMediaSlug: (row.otix_media_slug as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixTextlessPosterUrl: (row.otix_textless_poster_url as string) || undefined,
    otixLogoUrl: (row.otix_logo_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
  };
}

// ── Queries ────────────────────────────────────────────────────────────

export function getAltGameId(id: string): string {
  const parts = id.split('_');
  if (parts.length > 1 && ['pc', 'iso', 'rom', 'steam', 'epic', 'gog'].includes(parts[0])) {
    return parts.slice(1).join('_');
  }
  return `pc_${id}`;
}

export function getCandidateGameIds(id: string): string[] {
  if (!id) return [];
  const set = new Set<string>();
  set.add(id);
  const alt = getAltGameId(id);
  if (alt) set.add(alt);
  const prefixes = ['pc_', 'steam_', 'iso_', 'rom_', 'ps1_', 'ps2_', 'ps3_', 'ps4_', 'ps5_', 'psp_', 'psvita_', 'xbox_', 'xbox360_', 'switch_', 'wii_', 'wiiu_'];
  for (const p of prefixes) {
    if (id.startsWith(p)) {
      set.add(id.slice(p.length));
    } else {
      set.add(p + id);
    }
  }
  return Array.from(set);
}

export function getAllGames(filter: GameFilter = {}): GameRow[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.platform && filter.platform.length > 0) {
    const placeholders = filter.platform.map(() => '?').join(',');
    conditions.push(`platform IN (${placeholders})`);
    params.push(...filter.platform);
  }
  if (filter.matched === true) {
    conditions.push('otix_media_id IS NOT NULL');
  } else if (filter.matched === false) {
    conditions.push('otix_media_id IS NULL AND otix_match_suggestion IS NULL');
  }
  if (filter.hasSuggestion === true) {
    conditions.push('otix_match_suggestion IS NOT NULL');
  } else if (filter.hasSuggestion === false) {
    conditions.push('otix_match_suggestion IS NULL');
  }
  if (filter.search) {
    conditions.push('(title LIKE ? OR install_dir LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  if (filter.installed === true) {
    conditions.push("platform != 'iso' AND exe_path != ''");
  }

  // Exclude applications from library queries (matching getGameCount behavior)
  conditions.push("(sources IS NULL OR sources NOT LIKE '%\"isApp\":true%')");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sortBy = filter.sortBy || 'title';
  const sortDir = filter.sortDir || 'asc';

  let orderClause: string;
  if (sortBy === 'last_played_at' && sortDir === 'desc') {
    orderClause = `ORDER BY CASE WHEN last_played_at IS NULL THEN 1 ELSE 0 END, last_played_at DESC`;
  } else if (sortBy === 'last_played_at' && sortDir === 'asc') {
    orderClause = `ORDER BY last_played_at ASC`;
  } else {
    orderClause = `ORDER BY ${sortBy} ${sortDir}`;
  }
  const limit = filter.limit ? `LIMIT ${filter.limit}` : '';
  const offset = filter.offset ? `OFFSET ${filter.offset}` : '';

  const sql = `SELECT * FROM scanned_games ${where} ${orderClause} ${limit} ${offset}`;
  // Applications (non-game software) are stored but hidden from the library UI for now
  return __all(sql, ...params).map(rowToGame).filter((g) => !g.isApp);
}

export function getGameById(id: string): GameRow | null {
  const candidateIds = getCandidateGameIds(id);
  const placeholders = candidateIds.map(() => '?').join(',');
  const row = __get(
    `SELECT * FROM scanned_games WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ? LIMIT 1`,
    ...candidateIds, id, id
  );
  return row ? rowToGame(row) : null;
}

// ── Mutations ──────────────────────────────────────────────────────────

export function upsertGames(games: GameRow[], scopePaths?: string[]): void {
  withTransaction(() => {
    const existingMap = new Map<string, DbRow>();
    const existingRows = __all(
      'SELECT id, seeded, otix_media_id, otix_media_title, otix_match_suggestion, otix_data, otix_poster_url, otix_backdrop_url, otix_icon_url, otix_confidence, poster_url FROM scanned_games'
    );
    for (const r of existingRows) {
      if (r && r.id != null) {
        existingMap.set(r.id as string, r);
      }
    }

    const newIds = [...new Set(games.map((g) => g.id))];
    const newIdSet = new Set(newIds);
    const platforms = [...new Set(games.map((g) => g.platform))];
    const platformSet = new Set(platforms);

    if (scopePaths && scopePaths.length > 0) {
      const deleteScopedStmt = db().prepare('DELETE FROM scanned_games WHERE id = ?');
      for (const sp of scopePaths) {
        const cleanPath = sp.replace(/\\/g, '/').replace(/\/$/, '');
        const winPath = sp.replace(/\//g, '\\').replace(/\\$/, '');
        const allInScope = __all(
          "SELECT id, platform, install_dir, exe_path FROM scanned_games WHERE install_dir LIKE ? OR install_dir LIKE ? OR exe_path LIKE ? OR exe_path LIKE ?",
          `${cleanPath}%`, `${winPath}%`, `${cleanPath}%`, `${winPath}%`
        );
        for (const row of allInScope) {
          if (!newIdSet.has(row.id as string) && platformSet.has(row.platform as GamePlatform)) {
            deleteScopedStmt.run(row.id);
          }
        }
      }
    } else if (newIds.length > 0 && platforms.length > 0) {
      // Safe parameter chunking:
      // Avoid DELETE ... WHERE id NOT IN (...) with thousands of parameters.
      const platPlaceholders = platforms.map(() => '?').join(',');
      const existingPlatformRows = __all(
        `SELECT id FROM scanned_games WHERE platform IN (${platPlaceholders})`,
        ...platforms
      );
      const staleIds = existingPlatformRows
        .map((r) => r.id as string)
        .filter((id) => !newIdSet.has(id));

      if (staleIds.length > 0) {
        const idChunks = chunkArray(staleIds, SQLITE_PARAM_LIMIT);
        for (const chunk of idChunks) {
          const placeholders = chunk.map(() => '?').join(',');
          db().prepare(
            `DELETE FROM scanned_games WHERE id IN (${placeholders})`
          ).run(...chunk);
        }
      }
    } else if (newIds.length === 0 && platforms.length > 0) {
      const platPlaceholders = platforms.map(() => '?').join(',');
      db().prepare(
        `DELETE FROM scanned_games WHERE platform IN (${platPlaceholders})`
      ).run(...platforms);
    }

    const insertGame = db().prepare(
      `INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform,
        local_icon_url, icon_url, poster_url, sources, update_files,
        otix_media_id, otix_media_title, otix_match_suggestion,
        otix_data, otix_poster_url, otix_backdrop_url, otix_icon_url, otix_confidence, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const g of games) {
      const existing = existingMap.get(g.id);
      const seeded = (existing?.seeded as number) ?? 0;
      // Preserve existing match data if the incoming row doesn't have it
      const otixMediaId = g.data?.id || g.otixMediaId || (existing as any)?.otix_media_id || null;
      const otixMediaTitle = g.data?.title || g.otixMediaTitle || (existing as any)?.otix_media_title || null;
      const matchSuggestion = g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : (existing as any)?.otix_match_suggestion || null;
      const posterUrl = g.posterUrl || (g as any).otixPosterUrl || (existing as any)?.otix_poster_url || (existing as any)?.poster_url || null;
      const otixPosterUrl = (g as any).otixPosterUrl || (existing as any)?.otix_poster_url || (otixMediaId ? posterUrl : null);
      const backdropUrl = (g as any).backdropUrl || (g as any).otixBackdropUrl || (existing as any)?.otix_backdrop_url || null;
      const iconUrl = g.iconUrl || (g as any).otixIconUrl || (existing as any)?.otix_icon_url || null;
      const confidence = g.otixConfidence ?? (existing as any)?.otix_confidence ?? null;
      let resolvedSizeBytes = g.sizeBytes ?? (g.data as any)?.sizeBytes;
      let resolvedModifiedAt = g.modifiedAt ?? (g.data as any)?.modifiedAt;
      let resolvedVersion = g.version ?? (g.data as any)?.version ?? (g.data as any)?.gameVersion;
      let resolvedLocalExePath = g.localExePath;

      if ((resolvedSizeBytes == null || resolvedSizeBytes <= 0 || !resolvedModifiedAt || !resolvedVersion || !resolvedLocalExePath) && (g.installDir || g.exePath || g.localExePath)) {
        try {
          const dirTarget = g.installDir && fs.existsSync(g.installDir) ? g.installDir : null;
          let fileTarget = g.localExePath && fs.existsSync(g.localExePath)
            ? g.localExePath
            : g.exePath && !String(g.exePath).startsWith('steam://') && fs.existsSync(g.exePath)
              ? g.exePath
              : null;

          if ((!fileTarget || (fileTarget && fs.statSync(fileTarget).isDirectory())) && dirTarget) {
            const foundExe = findMainExecutableInFolder(dirTarget);
            if (foundExe) {
              fileTarget = foundExe;
              if (!resolvedLocalExePath) resolvedLocalExePath = foundExe;
            }
          }

          if (!resolvedModifiedAt) {
            const probe = fileTarget || dirTarget;
            if (probe) {
              try {
                const st = fs.statSync(probe);
                if (st.mtime) resolvedModifiedAt = st.mtime.toISOString();
              } catch {}
            }
          }

          if (resolvedSizeBytes == null || resolvedSizeBytes <= 0) {
            if (dirTarget) {
              const dirSize = calculateDirectorySize(dirTarget);
              if (dirSize > 0) resolvedSizeBytes = dirSize;
            }
            if ((resolvedSizeBytes == null || resolvedSizeBytes <= 0) && fileTarget) {
              try {
                const st = fs.statSync(fileTarget);
                if (st.size > 0) resolvedSizeBytes = st.size;
              } catch {}
            }
          }

          if (!resolvedVersion && fileTarget && fileTarget.toLowerCase().endsWith('.exe')) {
            const peVer = getPeVersion(fileTarget);
            if (peVer) resolvedVersion = peVer;
          }
        } catch {}
      }

      const otixData = g.data
        ? JSON.stringify({
            ...g.data,
            sizeBytes: resolvedSizeBytes ?? g.data.sizeBytes,
            modifiedAt: resolvedModifiedAt ?? g.data.modifiedAt,
            version: resolvedVersion ?? g.data.version,
          })
        : (resolvedSizeBytes != null || resolvedModifiedAt != null || resolvedVersion != null)
          ? JSON.stringify({
              id: g.id,
              title: g.title,
              platform: g.platform,
              sizeBytes: resolvedSizeBytes,
              modifiedAt: resolvedModifiedAt,
              version: resolvedVersion,
            })
          : (existing as any)?.otix_data || null;

      let sourcesPayload: string;
      if (g.sources && g.sources.length > 0) {
        sourcesPayload = JSON.stringify(g.sources.map((s: any) => {
          if (s && s.isDlc === undefined && s.isBeta === undefined && s.isApp === undefined &&
              (g.isDlc !== undefined || g.isBeta !== undefined || g.isApp !== undefined)) {
            return { ...s, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null };
          }
          return s;
        }));
      } else {
        sourcesPayload = JSON.stringify([{ source: g.platform, id: g.id, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null }]);
      }

      const finalExePath = (g.exePath && path.extname(g.exePath) ? g.exePath : (resolvedLocalExePath || g.exePath));
      const finalLocalExePath = resolvedLocalExePath || g.localExePath || null;

      insertGame.run(
        g.id,
        g.title,
        finalExePath,
        finalLocalExePath,
        g.installDir,
        g.platform,
        g.localIconUrl || null,
        iconUrl,
        posterUrl,
        sourcesPayload,
        g.updateFiles ? JSON.stringify(g.updateFiles) : null,
        otixMediaId,
        otixMediaTitle,
        matchSuggestion,
        otixData,
        otixPosterUrl,
        backdropUrl,
        iconUrl,
        confidence,
        seeded,
      );

      existingMap.set(g.id, {
        seeded,
        otix_media_id: otixMediaId,
        otix_media_title: otixMediaTitle,
        otix_match_suggestion: matchSuggestion,
        otix_data: otixData,
        otix_poster_url: otixPosterUrl,
        otix_backdrop_url: backdropUrl,
        otix_icon_url: iconUrl,
        otix_confidence: confidence,
        poster_url: posterUrl,
      });
    }
  });
  clearRowCache();
}

export function upsertGamesForPlatform(games: GameRow[], platform: string): void {
  withTransaction(() => {
    const existingSeeded = new Map<string, number>();
    const existingRows = __all('SELECT id, seeded FROM scanned_games WHERE platform = ?', platform);
    for (const r of existingRows) {
      existingSeeded.set(r.id as string, r.seeded as number);
    }

    // Delete stale entries only for THIS platform (don't wipe other platforms)
    const newIds = [...new Set(games.map((g) => g.id))];
    const newIdSet = new Set(newIds);

    if (newIds.length > 0) {
      const staleIds = existingRows
        .map((r) => r.id as string)
        .filter((id) => !newIdSet.has(id));

      if (staleIds.length > 0) {
        const idChunks = chunkArray(staleIds, SQLITE_PARAM_LIMIT);
        for (const chunk of idChunks) {
          const placeholders = chunk.map(() => '?').join(',');
          db().prepare(
            `DELETE FROM scanned_games WHERE id IN (${placeholders})`
          ).run(...chunk);
        }
      }
    } else {
      db().prepare('DELETE FROM scanned_games WHERE platform = ?').run(platform);
    }

    const insertGame = db().prepare(
      `INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform,
        local_icon_url, icon_url, poster_url, sources, update_files,
        otix_media_id, otix_media_title, otix_match_suggestion, seeded
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const g of games) {
      const seeded = existingSeeded.get(g.id) ?? 0;
      const sourcesPayload = g.sources
        ? JSON.stringify(g.sources)
        : JSON.stringify([{ source: g.platform, id: g.id, isDlc: !!g.isDlc, dlcOf: g.dlcOf || null, isBeta: !!g.isBeta, betaOf: g.betaOf || null, isApp: !!g.isApp, gameType: g.gameType || null }]);

      insertGame.run(
        g.id,
        g.title,
        g.exePath,
        g.localExePath || null,
        g.installDir,
        g.platform,
        g.localIconUrl || null,
        g.iconUrl || null,
        g.posterUrl || null,
        sourcesPayload,
        g.updateFiles ? JSON.stringify(g.updateFiles) : null,
        g.data?.id || null,
        g.data?.title || null,
        g.matchSuggestion ? JSON.stringify(g.matchSuggestion) : null,
        seeded,
      );
    }
  });
  clearRowCache();
}

/**
 * Deletes multiple games by their IDs, chunking parameter arrays to guarantee
 * queries never exceed SQLITE_PARAM_LIMIT.
 */
export function deleteGamesByIds(ids: string[]): void {
  if (!ids || ids.length === 0) return;
  withTransaction(() => {
    const chunks = chunkArray(ids, SQLITE_PARAM_LIMIT);
    for (const chunk of chunks) {
      const placeholders = chunk.map(() => '?').join(',');
      db().prepare(`DELETE FROM scanned_games WHERE id IN (${placeholders})`).run(...chunk);
    }
  });
  clearRowCache();
  notifyGamesChanged();
}

export const deleteGames = deleteGamesByIds;

export function saveMatchSuggestion(
  gameId: string,
  suggestion: Record<string, unknown>,
): void {
  const candidateIds = getCandidateGameIds(gameId);
  const placeholders = candidateIds.map(() => '?').join(',');
  db().prepare(
    `UPDATE scanned_games SET
      otix_match_suggestion = ?,
      updated_at = datetime('now')
    WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ?`
  ).run(JSON.stringify(suggestion), ...candidateIds, gameId, gameId);
}

export function hydrateGame(
  id: string,
  title: string,
  iconUrl: string | null,
  posterUrl: string | null,
  fullData: Record<string, unknown> | null,
  confidence?: number | null,
  mediaId?: string | null,
  backdropUrl?: string | null,
  textlessPosterUrl?: string | null,
  logoUrl?: string | null,
): void {
  const backdrop = backdropUrl || (fullData?.backdropUrl as string) || (fullData?.backdrop_url as string) || (fullData?.otixBackdropUrl as string) || null
  const textless = textlessPosterUrl || (fullData?.textlessPosterUrl as string) || (fullData?.textless_poster_url as string) || (fullData?.otixTextlessPosterUrl as string) || null
  const logo = logoUrl || (fullData?.logoUrl as string) || (fullData?.logo_url as string) || (fullData?.otixLogoUrl as string) || null
  const icon = iconUrl || (fullData?.iconUrl as string) || (fullData?.icon_url as string) || (fullData?.otixIconUrl as string) || null
  const poster = posterUrl || (fullData?.posterUrl as string) || (fullData?.poster_url as string) || (fullData?.otixPosterUrl as string) || null
  db().prepare(
    `UPDATE scanned_games SET
      otix_media_id = COALESCE(?, otix_media_id),
      otix_media_title = ?,
      otix_icon_url = COALESCE(?, otix_icon_url),
      otix_poster_url = COALESCE(?, otix_poster_url),
      otix_backdrop_url = COALESCE(?, otix_backdrop_url),
      otix_textless_poster_url = COALESCE(?, otix_textless_poster_url),
      otix_logo_url = COALESCE(?, otix_logo_url),
      otix_data = ?,
      otix_confidence = ?,
      updated_at = datetime('now')
    WHERE id = ? OR id = ?`
  ).run(
    mediaId ?? null,
    title,
    icon,
    poster,
    backdrop,
    textless,
    logo,
    fullData ? JSON.stringify(fullData) : null,
    confidence ?? null,
    id,
    id,
  );
  clearRowCache();
  notifyGamesChanged();
}

export function getMatchedGames(): { id: string; otix_media_id: string; title: string }[] {
  return db().prepare(
    'SELECT id, otix_media_id, title FROM scanned_games WHERE otix_media_id IS NOT NULL'
  ).all() as { id: string; otix_media_id: string; title: string }[];
}

export function updateGamePath(id: string, exePath: string, installDir?: string): void {
  db().prepare(
    "UPDATE scanned_games SET exe_path = ?, install_dir = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(exePath, installDir || exePath.replace(/\/[^/]*$/, ''), id);
  notifyGamesChanged();
}

export function updateGamePlatform(id: string, platform: string): void {
  db().prepare(
    "UPDATE scanned_games SET platform = ?, updated_at = datetime('now') WHERE id = ?"
  ).run(platform, id);
  notifyGamesChanged();
}

export function updateLastPlayedAt(id: string, playedAt: string): void {
  db().prepare(
    "UPDATE scanned_games SET last_played_at = ? WHERE id = ?"
  ).run(playedAt, id);
  notifyGamesChanged();
}

// ── Suggestions ────────────────────────────────────────────────────────

interface SuggestionData {
  id: string
  title: string
  platform?: string
  slug?: string
  posterUrl?: string | null
  backdropUrl?: string | null
  textlessPosterUrl?: string | null
  logoUrl?: string | null
  iconUrl?: string | null
  overview?: string | null
  releaseDate?: string | null
  releaseYear?: string | number | null
}

export function unmatchGame(gameId: string): void {
  const candidateIds = getCandidateGameIds(gameId);
  const placeholders = candidateIds.map(() => '?').join(',');
  const row = __get(
    `SELECT id, platform FROM scanned_games WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ? LIMIT 1`,
    ...candidateIds, gameId, gameId
  ) as { id: string; platform: string } | undefined;

  db().prepare(`
    UPDATE scanned_games SET
      otix_media_id = NULL, otix_media_title = NULL, otix_media_slug = NULL,
      otix_poster_url = NULL, otix_backdrop_url = NULL,
      otix_textless_poster_url = NULL, otix_logo_url = NULL, otix_icon_url = NULL,
      otix_match_suggestion = NULL, otix_confidence = NULL,
      updated_at = datetime('now')
    WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ?
  `).run(...candidateIds, gameId, gameId);

  if (row) {
    const sId = row.id.startsWith(`${row.platform}_`) ? row.id.slice(row.platform.length + 1) : row.id;
    db().prepare(`
      DELETE FROM game_matches WHERE (source = ? AND source_game_id = ?) OR (source = ? AND source_game_id = ?)
    `).run(row.platform, sId, row.platform, row.id);
  }

  clearRowCache();
  notifyGamesChanged();
}

export function acceptSuggestion(
  gameId: string,
  suggestion?: SuggestionData,
): void {
  if (!suggestion) return;
  const candidateIds = getCandidateGameIds(gameId);
  const placeholders = candidateIds.map(() => '?').join(',');
  const existing = __get(
    `SELECT otix_data FROM scanned_games WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ? LIMIT 1`,
    ...candidateIds, gameId, gameId
  ) as { otix_data?: string } | undefined;

  let otixDataObj: Record<string, any> = {};
  if (existing?.otix_data) {
    try {
      otixDataObj = JSON.parse(existing.otix_data);
    } catch {
      otixDataObj = {};
    }
  }
  if (suggestion.overview) otixDataObj.overview = suggestion.overview;
  if (suggestion.releaseDate) otixDataObj.releaseDate = suggestion.releaseDate;
  if (suggestion.releaseYear) otixDataObj.year = suggestion.releaseYear;
  const otixDataStr = Object.keys(otixDataObj).length > 0 ? JSON.stringify(otixDataObj) : existing?.otix_data ?? null;

  const poster = suggestion.posterUrl ?? null;
  const backdrop = suggestion.backdropUrl ?? null;

  db().prepare(
    `UPDATE scanned_games SET
      otix_media_id = ?, otix_media_title = ?, otix_media_slug = ?,
      otix_poster_url = COALESCE(?, otix_poster_url),
      poster_url = COALESCE(?, poster_url, otix_poster_url),
      otix_backdrop_url = COALESCE(?, otix_backdrop_url),
      otix_textless_poster_url = ?, otix_logo_url = ?, otix_icon_url = ?,
      otix_confidence = 1.0,
      otix_data = ?,
      otix_match_suggestion = NULL,
      updated_at = datetime('now')
    WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ?`
  ).run(
    suggestion.id, suggestion.title, suggestion.slug ?? null,
    poster,
    poster,
    backdrop,
    suggestion.textlessPosterUrl ?? null, suggestion.logoUrl ?? null, suggestion.iconUrl ?? null,
    otixDataStr,
    ...candidateIds,
    gameId,
    gameId,
  );
  // Clear any previous rejection for this suggestion
  const game = __get(
    `SELECT id, title, platform FROM scanned_games WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ? LIMIT 1`,
    ...candidateIds, gameId, gameId
  ) as any;

  if (game) {
    db().prepare(
      'DELETE FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?'
    ).run(game.title, game.platform, suggestion.id);
  }

  const platform = game?.platform || 'pc';
  const rowId = game?.id || gameId;
  const sourceGameId = rowId.startsWith(`${platform}_`) ? rowId.slice(platform.length + 1) : rowId;
  upsertGameMatches([{
    id: rowId,
    source: platform,
    sourceGameId,
    otixMediaId: suggestion.id,
    otixTitle: suggestion.title,
    otixConfidence: 1.0,
    otixPosterUrl: poster || undefined,
    otixBackdropUrl: backdrop || undefined,
    otixIconUrl: suggestion.iconUrl || undefined,
    matchType: 'manual',
    status: 'approved',
  }]);

  clearRowCache();
  notifyGamesChanged();
}

export function rejectSuggestion(gameId: string, suggestionMediaId: string): void {
  const candidateIds = getCandidateGameIds(gameId);
  const placeholders = candidateIds.map(() => '?').join(',');
  const game = __get(
    `SELECT title, platform FROM scanned_games WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ? LIMIT 1`,
    ...candidateIds, gameId, gameId
  ) as any;
  if (!game) return;
  // Store rejection so it never reappears
  db().prepare(
    `INSERT OR IGNORE INTO game_rejected_suggestions (id, game_title, game_platform, suggestion_media_id)
     VALUES (?, ?, ?, ?)`
  ).run(`rej_${gameId}_${suggestionMediaId}`, game.title, game.platform, suggestionMediaId);
  // Clear suggestion from the game row
  db().prepare(
    `UPDATE scanned_games SET otix_match_suggestion = NULL, updated_at = datetime('now') WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ?`
  ).run(...candidateIds, gameId, gameId);
  clearRowCache();
  notifyGamesChanged();
}

export function isSuggestionRejected(
  gameTitle: string,
  gamePlatform: string,
  suggestionMediaId: string,
): boolean {
  const row = db().prepare(
    'SELECT id FROM game_rejected_suggestions WHERE game_title = ? AND game_platform = ? AND suggestion_media_id = ?'
  ).get(gameTitle, gamePlatform, suggestionMediaId);
  return !!row;
}

// ── Count ──────────────────────────────────────────────────────────────

export function getGameCount(filter: Omit<GameFilter, 'limit' | 'offset'> = {}): number {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (filter.platform && filter.platform.length > 0) {
    const placeholders = filter.platform.map(() => '?').join(',');
    conditions.push(`platform IN (${placeholders})`);
    params.push(...filter.platform);
  }
  if (filter.matched === true) {
    conditions.push('otix_media_id IS NOT NULL');
  } else if (filter.matched === false) {
    conditions.push('otix_media_id IS NULL AND otix_match_suggestion IS NULL');
  }
  if (filter.hasSuggestion === true) {
    conditions.push('otix_match_suggestion IS NOT NULL');
  } else if (filter.hasSuggestion === false) {
    conditions.push('otix_match_suggestion IS NULL');
  }
  if (filter.search) {
    conditions.push('(title LIKE ? OR install_dir LIKE ?)');
    params.push(`%${filter.search}%`, `%${filter.search}%`);
  }
  if (filter.installed === true) {
    conditions.push("platform != 'iso' AND exe_path != ''");
  }

  // Exclude applications from count (matching getAllGames behavior)
  conditions.push("(sources IS NULL OR sources NOT LIKE '%\"isApp\":true%')");

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT COUNT(*) AS cnt FROM scanned_games ${where}`;
  const row = __get(sql, ...params);
  return (row?.cnt as number) ?? 0;
}

// ── Scan paths ─────────────────────────────────────────────────────────

export function getScanPaths(): { path: string; type: 'game' | 'iso' }[] {
  const rows = __all('SELECT * FROM game_scan_paths');
  return rows.map((r) => ({
    path: r.path as string,
    type: r.type as 'game' | 'iso',
  }));
}

export function deleteGamesByPlatforms(platforms: string[]): void {
  if (!platforms.length) return;
  withTransaction(() => {
    const placeholders = platforms.map(() => '?').join(',');
    db().prepare(`DELETE FROM scanned_games WHERE platform IN (${placeholders})`).run(...platforms);
    db().prepare(`DELETE FROM game_matches WHERE source IN (${placeholders})`).run(...platforms);
  });
  clearRowCache();
}

export function deleteGamesByDirectory(dirPrefix: string): void {
  if (!dirPrefix) return;
  const normPrefix = dirPrefix.replace(/\\/g, '/').replace(/\/$/, '');
  const winPrefix = dirPrefix.replace(/\//g, '\\').replace(/\\$/, '');
  withTransaction(() => {
    db().prepare(`
      DELETE FROM scanned_games 
      WHERE install_dir LIKE ? 
         OR install_dir LIKE ?
         OR exe_path LIKE ?
         OR exe_path LIKE ?
    `).run(`${normPrefix}%`, `${winPrefix}%`, `${normPrefix}%`, `${winPrefix}%`);
    db().prepare(`
      DELETE FROM game_scan_paths
      WHERE path = ? OR path = ?
    `).run(dirPrefix, normPrefix);
  });
  clearRowCache();
  notifyGamesChanged();
}

export function pruneMissingGames(): number {
  // Synchronous fallback — prefer pruneMissingGamesAsync() to avoid blocking the main thread.
  const rows = __all('SELECT id, install_dir, exe_path, platform, seeded FROM scanned_games WHERE seeded IS NULL OR seeded = 0');
  let deleted = 0;
  withTransaction(() => {
    const deleteStmt = db().prepare('DELETE FROM scanned_games WHERE id = ?');
    for (const r of rows) {
      const installDir = (r.install_dir as string) || '';
      const exePath = (r.exe_path as string) || '';
      const plat = (r.platform as string) || '';
      if (['steam', 'epic', 'gog'].includes(plat)) continue;

      const resolvedExe = resolveUncPath(exePath);
      const resolvedInstall = resolveUncPath(installDir);

      let exists = false;
      if (resolvedExe) {
        try { exists = fs.existsSync(resolvedExe); } catch { exists = false; }
      }
      if (!exists && resolvedInstall) {
        try { exists = fs.existsSync(resolvedInstall); } catch { exists = false; }
      }
      if (!exists) {
        const isUnc = resolvedExe.startsWith('\\\\') || resolvedInstall.startsWith('\\\\');
        if (isUnc) {
          const target = resolvedExe || resolvedInstall;
          const shareMatch = /^(\\\\[^\\]+\\[^\\]+)/.exec(target);
          if (shareMatch) {
            try {
              if (fs.existsSync(shareMatch[1])) {
                deleteStmt.run(r.id);
                deleted++;
              }
            } catch {}
          }
        } else {
          deleteStmt.run(r.id);
          deleted++;
        }
      }
    }
  });
  if (deleted > 0) {
    notifyGamesChanged();
  }
  return deleted;
}

/**
 * Async version of pruneMissingGames that avoids blocking the main Electron thread.
 * Uses fs/promises.access() for non-blocking file existence checks.
 */
export async function pruneMissingGamesAsync(): Promise<number> {
  const rows = __all('SELECT id, install_dir, exe_path, platform, seeded FROM scanned_games WHERE seeded IS NULL OR seeded = 0');
  const toDelete: string[] = [];

  // Check file existence in batches of 50 to avoid overwhelming the event loop
  const CONCURRENCY = 50;
  for (let i = 0; i < rows.length; i += CONCURRENCY) {
    const batch = rows.slice(i, i + CONCURRENCY);
    const checks = batch.map(async (r) => {
      const installDir = (r.install_dir as string) || '';
      const exePath = (r.exe_path as string) || '';
      const plat = (r.platform as string) || '';
      if (['steam', 'epic', 'gog'].includes(plat)) return;

      const resolvedExe = resolveUncPath(exePath);
      const resolvedInstall = resolveUncPath(installDir);

      let exists = false;
      if (resolvedExe) {
        try { await fsAccess(resolvedExe); exists = true; } catch { exists = false; }
      }
      if (!exists && resolvedInstall) {
        try { await fsAccess(resolvedInstall); exists = true; } catch { exists = false; }
      }
      if (!exists) {
        const isUnc = resolvedExe.startsWith('\\\\') || resolvedInstall.startsWith('\\\\');
        if (isUnc) {
          const target = resolvedExe || resolvedInstall;
          const shareMatch = /^(\\\\[^\\]+\\[^\\]+)/.exec(target);
          if (shareMatch) {
            try {
              await fsAccess(shareMatch[1]);
              // Root share is accessible, file is genuinely gone -> prune
              toDelete.push(r.id as string);
            } catch {
              // Root share is inaccessible/offline -> preserve games
            }
          }
        } else {
          toDelete.push(r.id as string);
        }
      }
    });
    await Promise.all(checks);
  }

  if (toDelete.length > 0) {
    deleteGamesByIds(toDelete);
  }
  return toDelete.length;
}

export function resetGameData(): void {
  withTransaction(() => {
    db().prepare('DELETE FROM scanned_games').run();
    db().prepare('DELETE FROM game_matches').run();
  });
  clearRowCache();
  notifyGamesChanged();
}

export function saveScanPaths(paths: { path: string; type: 'game' | 'iso' }[]): void {
  withTransaction(() => {
    db().prepare('DELETE FROM game_scan_paths').run();
    const insertStmt = db().prepare('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)');
    for (const p of paths) {
      insertStmt.run(p.path, p.type);
    }
  });
  pruneMissingGames();
}

// ── Change notification (broadcasts to renderer via IPC) ─────────────────

let _notifyTarget: BrowserWindow | null = null;
let _targetCleanup: (() => void) | null = null;
let _disposeHooks: (() => void)[] = [];
let _gamesChangedListeners: Array<() => void> = [];
let _notifyDebounceTimer: NodeJS.Timeout | null = null;
export const NOTIFY_DEBOUNCE_MS = 1_000;

export function onGamesChanged(cb: () => void): () => void {
  _gamesChangedListeners.push(cb);
  return () => {
    _gamesChangedListeners = _gamesChangedListeners.filter((fn) => fn !== cb);
  };
}

/**
 * Sets the BrowserWindow instance that receives `games-db:changed` IPC messages.
 * Automatically cleans up window references and listeners when the window is closed
 * or destroyed, preventing memory leaks and dangling timers.
 */
export function setNotifyTarget(win: BrowserWindow | null): void {
  if (_targetCleanup) {
    _targetCleanup();
    _targetCleanup = null;
  }

  _notifyTarget = win;

  if (win) {
    if (win.isDestroyed()) {
      _notifyTarget = null;
      cancelPendingNotifyGamesChanged();
      return;
    }

    const onClosed = () => {
      if (_notifyTarget === win) {
        _notifyTarget = null;
      }
      cancelPendingNotifyGamesChanged();
      if (_targetCleanup) {
        _targetCleanup = null;
      }
    };

    if (typeof (win as any).once === 'function') {
      (win as any).once('closed', onClosed);
      _targetCleanup = () => {
        if (typeof (win as any).removeListener === 'function') {
          (win as any).removeListener('closed', onClosed);
        }
      };
    }
  } else {
    cancelPendingNotifyGamesChanged();
  }
}

/**
 * Dispatches change notifications immediately to renderer IPC and all registered in-process listeners.
 */
function emitGamesChangedNow(): void {
  if (_notifyDebounceTimer !== null) {
    clearTimeout(_notifyDebounceTimer);
    _notifyDebounceTimer = null;
  }

  if (_notifyTarget && !_notifyTarget.isDestroyed()) {
    try {
      const webContents = _notifyTarget.webContents;
      if (webContents && !webContents.isDestroyed()) {
        webContents.send('games-db:changed');
      }
    } catch (err) {
      console.warn('[game-storage] Failed to dispatch games-db:changed to target window:', err);
    }
  }

  for (const cb of _gamesChangedListeners) {
    try {
      cb();
    } catch (err) {
      console.error('[game-storage] Error in gamesChangedListener callback:', err);
    }
  }
}

/**
 * Schedules a coalesced, debounced broadcast of `games-db:changed`.
 * Delays emission by 1,000ms after the last write. Sequential writes reset the
 * timer so that only a single notification is dispatched after activity subsides.
 */
export function notifyGamesChanged(options?: { immediate?: boolean }): void {
  if (options?.immediate) {
    emitGamesChangedNow();
    return;
  }

  if (_notifyDebounceTimer !== null) {
    clearTimeout(_notifyDebounceTimer);
  }

  _notifyDebounceTimer = setTimeout(() => {
    _notifyDebounceTimer = null;
    emitGamesChangedNow();
  }, NOTIFY_DEBOUNCE_MS);

  _notifyDebounceTimer.unref?.();
}

/**
 * Flushes any pending debounced `games-db:changed` notification immediately.
 * If a notification is queued, it is dispatched immediately and the timer cancelled.
 * If `options.force` is true, dispatches even if no notification is pending.
 */
export function flushNotifyGamesChanged(options?: { force?: boolean }): void {
  if (_notifyDebounceTimer !== null || options?.force) {
    emitGamesChangedNow();
  }
}

/**
 * Cancels any pending debounced notification without emitting.
 * Useful when aborting scans or cleaning up state.
 */
export function cancelPendingNotifyGamesChanged(): void {
  if (_notifyDebounceTimer !== null) {
    clearTimeout(_notifyDebounceTimer);
    _notifyDebounceTimer = null;
  }
}

export function registerDisposeHook(hook: () => void): void {
  _disposeHooks.push(hook);
}

export function disposeService(): void {
  cancelPendingNotifyGamesChanged();
  if (_targetCleanup) {
    _targetCleanup();
    _targetCleanup = null;
  }
  _notifyTarget = null;
  _gamesChangedListeners = [];
  for (const hook of _disposeHooks) {
    try {
      hook();
    } catch (err) {
      console.error('[game-storage] Error in dispose hook:', err);
    }
  }
  _disposeHooks = [];
}

// ── Game Matches (persistent, never cleaned on rescan) ──────────────

export interface GameMatch {
  source: string
  sourceGameId: string
  otixMediaId: string
  otixTitle?: string
  otixPosterUrl?: string
  otixBackdropUrl?: string
  otixIconUrl?: string
  otixConfidence?: number
  matchType: 'auto' | 'manual'
  status?: 'pending' | 'approved' | 'rejected'
  matchedAt?: string
}

export function ensureGameMatchesTable(): void {
  db().exec(`
    CREATE TABLE IF NOT EXISTS game_matches (
      source TEXT NOT NULL,
      source_game_id TEXT NOT NULL,
      otix_media_id TEXT NOT NULL,
      otix_title TEXT,
      otix_poster_url TEXT,
      otix_backdrop_url TEXT,
      otix_icon_url TEXT,
      otix_confidence REAL,
      match_type TEXT NOT NULL DEFAULT 'auto',
      status TEXT NOT NULL DEFAULT 'approved',
      matched_at DATETIME NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (source, source_game_id)
    )
  `);
  // Migrate: add status column if table existed before this column was added
  try { db().exec(`ALTER TABLE game_matches ADD COLUMN status TEXT NOT NULL DEFAULT 'approved'`); } catch { /* already exists */ }
}

export function upsertGameMatch(match: GameMatch): void {
  withTransaction(() => {
    db().prepare(`
      INSERT OR REPLACE INTO game_matches
        (source, source_game_id, otix_media_id, otix_title, otix_poster_url,
         otix_backdrop_url, otix_icon_url, otix_confidence, match_type, status, matched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).run(
      match.source, match.sourceGameId, match.otixMediaId,
      match.otixTitle || null, match.otixPosterUrl || null,
      match.otixBackdropUrl || null, match.otixIconUrl || null,
      match.otixConfidence ?? null, match.matchType,
      match.status || 'pending',
    );
  });
}

/**
 * Atomically upserts multiple game match records.
 * Supports updating `scanned_games` (by `id`) and/or `game_matches` (by `source` and `sourceGameId`).
 */
export function upsertGameMatches(
  matches: Array<{
    id?: string;
    otixMediaId: string | null;
    otixMediaTitle?: string | null;
    otixConfidence?: number | null;
    source?: string;
    sourceGameId?: string;
    otixTitle?: string;
    otixPosterUrl?: string;
    otixBackdropUrl?: string;
    otixIconUrl?: string;
    matchType?: 'auto' | 'manual';
    status?: 'pending' | 'approved' | 'rejected';
  }>,
): void {
  if (!matches || matches.length === 0) return;
  withTransaction(() => {
    let updateGameStmt: any = null;
    let insertMatchStmt: any = null;

    for (const m of matches) {
      if (m.id) {
        const candidateIds = getCandidateGameIds(m.id);
        const placeholders = candidateIds.map(() => '?').join(',');
        const updateGameStmt = db().prepare(`
          UPDATE scanned_games SET
            otix_media_id = ?,
            otix_media_title = COALESCE(?, otix_media_title),
            otix_confidence = COALESCE(?, otix_confidence),
            otix_poster_url = COALESCE(?, otix_poster_url),
            poster_url = COALESCE(?, poster_url, otix_poster_url),
            otix_backdrop_url = COALESCE(?, otix_backdrop_url),
            otix_icon_url = COALESCE(?, otix_icon_url),
            updated_at = datetime('now')
          WHERE id IN (${placeholders}) OR install_dir = ? OR exe_path = ?
        `);
        const title = m.otixMediaTitle ?? m.otixTitle ?? null;
        const confidence = m.otixConfidence ?? null;
        const poster = m.otixPosterUrl ?? null;
        const backdrop = m.otixBackdropUrl ?? null;
        const icon = m.otixIconUrl ?? null;
        updateGameStmt.run(m.otixMediaId ?? null, title, confidence, poster, poster, backdrop, icon, ...candidateIds, m.id, m.id);
      }

      if (m.source && m.sourceGameId && m.otixMediaId) {
        if (!insertMatchStmt) {
          insertMatchStmt = db().prepare(`
            INSERT OR REPLACE INTO game_matches
              (source, source_game_id, otix_media_id, otix_title, otix_poster_url,
               otix_backdrop_url, otix_icon_url, otix_confidence, match_type, status, matched_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
          `);
        }
        insertMatchStmt.run(
          m.source,
          m.sourceGameId,
          m.otixMediaId,
          m.otixTitle || m.otixMediaTitle || null,
          m.otixPosterUrl || null,
          m.otixBackdropUrl || null,
          m.otixIconUrl || null,
          m.otixConfidence ?? null,
          m.matchType || 'auto',
          m.status || 'approved',
        );
      }
    }
  });
}

function rowToGameMatch(row: Record<string, unknown>): GameMatch {
  return {
    source: row.source as string,
    sourceGameId: row.source_game_id as string,
    otixMediaId: row.otix_media_id as string,
    otixTitle: (row.otix_title as string) || undefined,
    otixPosterUrl: (row.otix_poster_url as string) || undefined,
    otixBackdropUrl: (row.otix_backdrop_url as string) || undefined,
    otixIconUrl: (row.otix_icon_url as string) || undefined,
    otixConfidence: row.otix_confidence != null ? Number(row.otix_confidence) : undefined,
    matchType: row.match_type as 'auto' | 'manual',
    status: ((row.status as string) || 'approved') as GameMatch['status'],
    matchedAt: row.matched_at as string,
  };
}

export function getGameMatch(source: string, sourceGameId: string): GameMatch | null {
  const row = db().prepare(
    'SELECT * FROM game_matches WHERE source = ? AND source_game_id = ?'
  ).get(source, sourceGameId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return rowToGameMatch(row);
}

export function getAllGameMatches(): GameMatch[] {
  const rows = db().prepare('SELECT * FROM game_matches ORDER BY matched_at DESC').all() as Record<string, unknown>[];
  return rows.map(rowToGameMatch);
}

export function deleteGameMatch(source: string, sourceGameId: string): void {
  withTransaction(() => {
    db().prepare('DELETE FROM game_matches WHERE source = ? AND source_game_id = ?').run(source, sourceGameId);
  });
}
