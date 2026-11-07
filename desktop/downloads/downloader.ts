/**
 * Native Downloads Engine — SABnzbd + NZBPlanet integration for Otix Desktop.
 *
 * Provides native (in-app) search, connection testing, queue/history polling,
 * automatic release selection, update tracking, and download post-processing.
 */

import path from 'path';
import { getDb } from '../db';
import type Database from 'better-sqlite3';
import {
  getConfig,
  createDownload,
  updateDownloadStatus,
  updateDownloadIsoPath,
  getDownload,
  deleteDownload,
  recordWishlistSearch,
  type Download,
  type DownloadConfig,
} from './index';
import { autoOrganizeDownload } from './organizer';
import type {
  NZBResult,
  PostProcessResult,
  GameTrackEntry,
  SearchAndDownloadHypervisor,
} from '../preload-api';

let __db: Database.Database | null = null;
const _downloaderStmtCache = new Map<string, Database.Statement>();

function db(): Database.Database {
  if (!__db) {
    __db = getDb();
    _downloaderStmtCache.clear();
  }
  return __db;
}

function getDownloaderStmt(sql: string): Database.Statement {
  let s = _downloaderStmtCache.get(sql);
  if (!s) {
    if (_downloaderStmtCache.size > 100) _downloaderStmtCache.clear();
    s = db().prepare(sql);
    _downloaderStmtCache.set(sql, s);
  }
  return s;
}

const __get = (sql: string, ...params: any[]) => getDownloaderStmt(sql).get(...params) as any;
const __all = (sql: string, ...params: any[]) => getDownloaderStmt(sql).all(...params) as any[];
const __run = (sql: string, ...params: any[]) => getDownloaderStmt(sql).run(...params);

// ── Cache for NZB searches (1 hour TTL, max 100 entries) ─────────────────

interface CacheEntry {
  results: NZBResult[];
  fetchedAt: number;
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_SEARCH_CACHE_SIZE = 100;

function pruneExpiredSearchCache(): void {
  const now = Date.now();
  for (const [key, entry] of searchCache.entries()) {
    if (now - entry.fetchedAt >= CACHE_TTL_MS) {
      searchCache.delete(key);
    }
  }
}

function getCachedSearch(query: string): NZBResult[] | null {
  const key = query.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (entry) {
    if (Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
      // Re-insert to keep LRU recency
      searchCache.delete(key);
      searchCache.set(key, entry);
      return entry.results;
    } else {
      searchCache.delete(key);
    }
  }
  return null;
}

function setCachedSearch(query: string, results: NZBResult[]): void {
  pruneExpiredSearchCache();
  const key = query.toLowerCase().trim();
  if (searchCache.has(key)) {
    searchCache.delete(key);
  } else if (searchCache.size >= MAX_SEARCH_CACHE_SIZE) {
    const oldestKey = searchCache.keys().next().value;
    if (oldestKey !== undefined) {
      searchCache.delete(oldestKey);
    }
  }
  searchCache.set(key, { results, fetchedAt: Date.now() });
}

// ── NZBPlanet API client ──────────────────────────────────────────────────

function parseXmlItems(xml: string): NZBResult[] {
  const results: NZBResult[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match: RegExpExecArray | null;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const tag = (name: string) => {
      const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)<\\/${name}>`, 'i'));
      return m ? m[1].trim() : '';
    };
    const sizeStr = tag('size');
    results.push({
      guid: tag('guid'),
      title: tag('title').replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1'),
      size: parseInt(sizeStr, 10) || 0,
      pubDate: tag('pubDate') || new Date().toISOString(),
      category: tag('category'),
      nzbUrl: tag('link'),
      detailsUrl: tag('link'),
    });
  }
  results.sort((a, b) => b.size - a.size);
  return results;
}

export async function searchNzbPlanet(
  query: string,
  apiKey?: string,
  categoryIds: string = '1000,2000',
  limit: number = 20,
): Promise<NZBResult[]> {
  const key = apiKey || (await getConfig())?.nzbplanetApiKey;
  if (!key) return [];

  const cached = getCachedSearch(query);
  if (cached) return cached;

  const url = `https://api.nzbplanet.net/api?t=search&apikey=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}&cat=${encodeURIComponent(categoryIds)}&o=json&num=${limit}`;

  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Otix/1.0' },
    });

    if (!response.ok) {
      return [];
    }

    const text = await response.text();

    // JSON response
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const data = JSON.parse(text);
      const items = data?.channel?.item;
      if (!items) return [];
      const itemList = Array.isArray(items) ? items : [items];
      const results: NZBResult[] = itemList.map((item: any) => ({
        guid: String(item.guid ?? ''),
        title: String(item.title ?? ''),
        size: parseInt(String(item.size ?? '0'), 10),
        pubDate: item.pubDate ?? new Date().toISOString(),
        category: String(item.category ?? ''),
        nzbUrl: String(item.link ?? ''),
        detailsUrl: String(item.link ?? ''),
      }));
      results.sort((a, b) => b.size - a.size);
      setCachedSearch(query, results);
      return results;
    }

    // Fallback: parse XML/RSS
    if (text.includes('<?xml') || text.includes('<rss') || text.includes('<channel')) {
      const items = parseXmlItems(text);
      setCachedSearch(query, items);
      return items;
    }

    return [];
  } catch (err) {
    console.warn('[downloader] NZBPlanet search error:', err);
    return [];
  }
}

export async function testNzbPlanetConnection(apiKey?: string): Promise<boolean> {
  let key = apiKey;
  if (!key) {
    key = (await getConfig())?.nzbplanetApiKey || undefined;
  }
  if (!key) return false;

  try {
    const url = new URL('https://api.nzbplanet.net/api');
    url.searchParams.set('t', 'search');
    url.searchParams.set('apikey', key);
    url.searchParams.set('q', 'test');
    url.searchParams.set('cat', '1000');
    url.searchParams.set('o', 'json');
    url.searchParams.set('num', '1');

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Otix/1.0' },
    });

    if (!response.ok) return false;
    const text = await response.text();
    return text.includes('item') || text.trim().startsWith('{');
  } catch {
    return false;
  }
}

// ── SABnzbd API client ────────────────────────────────────────────────────

export interface SabQueueItem {
  nzoId: string;
  name: string;
  size: number;
  sizeLeft: number;
  status: string;
  percentage: number;
}

export interface SabHistoryItem {
  nzoId: string;
  name: string;
  size: number;
  status: string;
  storagePath: string;
  completedAt: string;
}

function sabnzbdUrl(
  host: string,
  port: number,
  useSsl: boolean,
  mode: string,
  params: Record<string, string> = {},
): string {
  const proto = useSsl ? 'https' : 'http';
  const cleanHost = host.replace(/^https?:\/\//, '');
  const url = new URL(`${proto}://${cleanHost}:${port}/api`);
  url.searchParams.set('mode', mode);
  url.searchParams.set('output', 'json');
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function testSabnzbdConnection(
  host?: string,
  port?: number,
  apiKey?: string,
  useSsl?: boolean,
): Promise<boolean> {
  let h = host;
  let p = port;
  let k = apiKey;
  let s = useSsl;

  if (!h || !k) {
    const cfg = await getConfig();
    h = h || cfg?.sabnzbdHost || undefined;
    p = p || cfg?.sabnzbdPort || 8080;
    k = k || cfg?.sabnzbdApiKey || undefined;
    s = s ?? cfg?.sabnzbdUseSsl ?? false;
  }

  if (!h || !k) return false;

  try {
    const url = sabnzbdUrl(h, p ?? 8080, s ?? false, 'version', { apikey: k });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = (await response.json()) as any;
    return !!data?.version;
  } catch {
    return false;
  }
}

export async function addNzbToSabnzbd(
  host: string,
  port: number,
  apiKey: string,
  useSsl: boolean,
  nzbUrl: string,
  name: string,
  category: string = 'games',
): Promise<string | null> {
  try {
    const url = sabnzbdUrl(host, port, useSsl, 'addurl', {
      apikey: apiKey,
      name: nzbUrl,
      nzbname: name,
      cat: category,
    });

    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = (await response.json()) as any;
    if (data?.status && data?.nzo_ids?.length > 0) return data.nzo_ids[0] as string;
    if (data?.nzo_ids?.[0]) return data.nzo_ids[0] as string;
    return null;
  } catch (err) {
    console.error('[downloader] Failed to add NZB to SABnzbd:', err);
    return null;
  }
}

export async function getSabnzbdQueue(
  host: string,
  port: number,
  apiKey: string,
  useSsl: boolean,
): Promise<SabQueueItem[]> {
  try {
    const url = sabnzbdUrl(host, port, useSsl, 'queue', { apikey: apiKey });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = (await response.json()) as any;
    const slots = data?.queue?.slots ?? [];
    return slots.map((s: any) => ({
      nzoId: String(s.nzo_id ?? ''),
      name: String(s.filename ?? ''),
      size: parseInt(String(s.size ?? '0'), 10),
      sizeLeft: parseInt(String(s.sizeleft ?? '0'), 10),
      status: String(s.status ?? ''),
      percentage: parseFloat(String(s.percentage ?? '0')),
    }));
  } catch {
    return [];
  }
}

export async function getSabnzbdHistory(
  host: string,
  port: number,
  apiKey: string,
  useSsl: boolean,
  limit: number = 50,
): Promise<SabHistoryItem[]> {
  try {
    const url = sabnzbdUrl(host, port, useSsl, 'history', { apikey: apiKey, limit: String(limit) });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = (await response.json()) as any;
    const slots = data?.history?.slots ?? [];
    return slots.map((s: any) => ({
      nzoId: String(s.nzo_id ?? ''),
      name: String(s.name ?? ''),
      size: parseInt(String(s.size ?? '0'), 10),
      status: String(s.status ?? ''),
      storagePath: String(s.storage ?? ''),
      completedAt: s.completed ? new Date(s.completed * 1000).toISOString() : '',
    }));
  } catch {
    return [];
  }
}

export async function deleteSabnzbdJob(
  host: string,
  port: number,
  apiKey: string,
  useSsl: boolean,
  nzoId: string,
): Promise<boolean> {
  try {
    const url = sabnzbdUrl(host, port, useSsl, 'queue', {
      apikey: apiKey,
      name: 'delete',
      value: nzoId,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = (await response.json()) as any;
    return data?.status === true;
  } catch {
    return false;
  }
}

// ── Quality Filter Helpers ────────────────────────────────────────────────

const DEMO_PATTERNS = ['demo', 'trial', 'beta', 'alpha'];
const SCENE_TAGS = ['iso', 'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl', 'skidrow', 'flt'];
const HYPERVISOR_TAGS = ['hv', 'hypervisor', 'vm', 'vmware', 'virtualbox', 'qemu', 'vmic'];
const CRACK_ONLY_PATTERNS = ['crack by', 'crack-only', 'crack only', 'crackfix', 'standalone crack'];

export function isFullGame(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return !DEMO_PATTERNS.some((p) => title.includes(p));
}

export function hasSceneTags(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  return SCENE_TAGS.some((tag) => title.includes(tag));
}

export function hasPreferredRepacker(r: any, repackers: string[]): boolean {
  if (repackers.length === 0) return false;
  const title = (r.title || '').toLowerCase();
  return repackers.some((rep) => title.includes(rep.toLowerCase()));
}

export function hasHypervisorTags(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  const normalized = title.replace(/[._-]+/g, ' ');
  return HYPERVISOR_TAGS.some((tag) => {
    if (tag === 'hv') {
      return (
        normalized.includes(' hv ') ||
        normalized.startsWith('hv ') ||
        normalized.endsWith(' hv') ||
        normalized === 'hv'
      );
    }
    return title.includes(tag) || normalized.includes(tag);
  });
}

export function isNotCrackOnly(r: any): boolean {
  const title = (r.title || '').toLowerCase();
  const normalized = title.replace(/[._-]+/g, ' ');
  return !CRACK_ONLY_PATTERNS.some((p) => {
    const pNorm = p.replace(/[._-]+/g, ' ');
    return normalized.includes(pNorm) || title.includes(p);
  });
}

export function filterQualityResults(results: any[]): any[] {
  const filtered = results.filter((r) => isFullGame(r) && isNotCrackOnly(r));
  return filtered.length > 0 ? filtered : results;
}

function compareByVersion(a: any, b: any): number {
  const verA = a._parsedVersion != null ? a._parsedVersion : null;
  const verB = b._parsedVersion != null ? b._parsedVersion : null;
  if (verA !== null && verB !== null) return verB - verA;
  if (verA !== null) return -1;
  if (verB !== null) return 1;
  return 0;
}

function repackerRank(r: any, repackers: string[]): number {
  const title = (r.title || '').toLowerCase();
  for (let i = 0; i < repackers.length; i++) {
    if (title.includes(repackers[i].toLowerCase())) return i;
  }
  return 999;
}

export function autoPickBest(
  results: any[],
  _preferredRepackers?: string | null,
  allowHypervisor?: boolean,
): any | null {
  let quality = filterQualityResults(results);
  if (quality.length === 0) return null;

  if (!allowHypervisor) {
    quality = quality.filter((r) => !hasHypervisorTags(r));
    if (quality.length === 0) return null;
  }

  const repackerList = _preferredRepackers
    ? _preferredRepackers.split(',').map((r) => r.trim()).filter(Boolean)
    : [];

  if (repackerList.length > 0) {
    const preferred = quality.filter((r) => hasPreferredRepacker(r, repackerList));
    const others = quality.filter((r) => !hasPreferredRepacker(r, repackerList));
    const prefRanked = preferred.sort((a, b) => {
      const rankDiff = repackerRank(a, repackerList) - repackerRank(b, repackerList);
      if (rankDiff !== 0) return rankDiff;
      const aScene = hasSceneTags(a) ? 0 : 1;
      const bScene = hasSceneTags(b) ? 0 : 1;
      if (aScene !== bScene) return aScene - bScene;
      return compareByVersion(a, b);
    });
    const otherScene = others.filter((r) => hasSceneTags(r)).sort(compareByVersion);
    const otherNonScene = others.filter((r) => !hasSceneTags(r)).sort(compareByVersion);
    const ranked = [...prefRanked, ...otherScene, ...otherNonScene];
    return ranked[0];
  }

  const scene = quality.filter((r) => hasSceneTags(r)).sort(compareByVersion);
  const nonScene = quality.filter((r) => !hasSceneTags(r)).sort(compareByVersion);
  const ranked = [...scene, ...nonScene];
  return ranked[0];
}

// ── Game Update Tracking & Matching ───────────────────────────────────────

const _CORE_SKIP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'by',
  'edition', 'deluxe', 'remastered', 'remake', 'definitive', 'goty', 'vr',
  'pc', 'repack', 'iso', 'multi', 'rip',
]);

function extractUpdateTag(title: string): string {
  const lower = title.toLowerCase();
  const rangeMatch = lower.match(/update\s+(\d{3,})\s*-\s*(\d{3,})/);
  if (rangeMatch) return rangeMatch[1] + '-' + rangeMatch[2];
  const verMatch = lower.match(/(?:update|patch)[.\s]*v?(\d+(?:\.\d+)*)/i);
  if (verMatch) return verMatch[1];
  return title.substring(0, 40);
}

function parseVersion(title: string): number | null {
  const m = title.match(/\bv?(\d+(?:\.\d+)*)\b/i);
  if (!m) return null;
  const parts = m[1].split('.').map((p) => parseInt(p, 10));
  let num = 0;
  for (let i = 0; i < parts.length && i < 4; i++) {
    num += parts[i] * Math.pow(1000, 3 - i);
  }
  return num;
}

export function gameSignature(title: string): string {
  const lower = title
    .toLowerCase()
    .replace(/\s*password=.*$/i, '')
    .replace(/-[a-z0-9_.]+$/, '')
    .replace(/\b(update|patch|hotfix|demo|dlc|addon|repack)\b/gi, '')
    .replace(/\bv?\d+(\.\d+)*\b/gi, '');
  return lower
    .split(/[.\s]+/)
    .filter((w) => w && !_CORE_SKIP_WORDS.has(w))
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('');
}

export function extractGroup(title: string): string | null {
  const lower = title.toLowerCase().trim();
  const pwMatch = lower.match(/password=([a-z0-9_.]+)/);
  const cleaned = lower.replace(/\s*password=.*$/i, '').trim();

  const dashMatch = cleaned.match(/-([a-z0-9_.]+)$/);
  if (dashMatch) return dashMatch[1];

  const words = cleaned.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  if (last && _CORE_SKIP_WORDS.has(last)) return last;
  if (last && /^[a-z]{2,10}$/.test(last) && !/^\d+$/.test(last)) return last;

  if (pwMatch) return pwMatch[1];
  return null;
}

function isUpdateResult(title: string): boolean {
  const lower = title.toLowerCase();
  return (
    lower.includes('update') ||
    lower.includes('patch') ||
    lower.includes('hotfix') ||
    /v\d+(\.\d+)*\s*update/i.test(title)
  );
}

function deduplicateUpdates(updates: NZBResult[]): NZBResult[] {
  const byTag = new Map<string, NZBResult>();
  for (const u of updates) {
    const tag = extractUpdateTag(u.title);
    const existing = byTag.get(tag);
    if (!existing || (u.size || 0) > (existing.size || 0)) {
      byTag.set(tag, u);
    }
  }
  return Array.from(byTag.values());
}

export function findMatchingUpdates(baseTitle: string, allResults: NZBResult[]): NZBResult[] {
  const baseSig = gameSignature(baseTitle);
  const baseGroup = extractGroup(baseTitle);
  const baseVer = parseVersion(baseTitle);

  let matches = allResults.filter((r) => {
    if (r.title.toLowerCase() === baseTitle.toLowerCase()) return false;
    if (!isUpdateResult(r.title)) return false;
    if (gameSignature(r.title) !== baseSig) return false;
    if (baseVer !== null) {
      const updateVer = parseVersion(r.title);
      if (updateVer !== null && updateVer < baseVer) return false;
    }
    return true;
  });

  if (baseGroup && matches.length > 0) {
    const sameGroup = matches.filter((r) => extractGroup(r.title) === baseGroup);
    const otherGroup = matches.filter((r) => extractGroup(r.title) !== baseGroup);
    matches = sameGroup.length > 0 ? [...sameGroup, ...otherGroup] : matches;
  }

  return deduplicateUpdates(matches);
}

export async function ensureGameTracked(mediaItemId: string, title: string): Promise<void> {
  __run(
    'INSERT OR IGNORE INTO game_update_tracking (media_item_id, media_item_title) VALUES (?, ?)',
    mediaItemId,
    title,
  );
}

export async function recordUpdateDownload(
  mediaItemId: string,
  mediaTitle: string,
  updateTitle: string,
): Promise<void> {
  const tag = extractUpdateTag(updateTitle);
  const row = __get('SELECT downloaded_updates FROM game_update_tracking WHERE media_item_id = ?', mediaItemId);
  if (row) {
    const tags: string[] = JSON.parse(row.downloaded_updates || '[]');
    if (!tags.includes(tag)) {
      tags.push(tag);
      __run(
        "UPDATE game_update_tracking SET downloaded_updates = ?, media_item_title = ?, updated_at = datetime('now') WHERE media_item_id = ?",
        JSON.stringify(tags),
        mediaTitle,
        mediaItemId,
      );
    }
  } else {
    __run(
      'INSERT INTO game_update_tracking (media_item_id, media_item_title, downloaded_updates) VALUES (?, ?, ?)',
      mediaItemId,
      mediaTitle,
      JSON.stringify([tag]),
    );
  }
}

export async function getTrackedGames(): Promise<GameTrackEntry[]> {
  const rows = __all('SELECT * FROM game_update_tracking ORDER BY media_item_title');
  return rows.map((r) => ({
    mediaItemId: r.media_item_id,
    mediaItemTitle: r.media_item_title,
    downloadedUpdateTags: JSON.parse(r.downloaded_updates || '[]'),
    lastUpdateCheck: r.last_update_check || null,
  }));
}

export async function checkGameForUpdates(
  mediaItemId: string,
  title: string,
  apiKey: string,
): Promise<{ newUpdates: NZBResult[]; error?: string }> {
  try {
    const results = await searchNzbPlanet(title, apiKey);
    const gameResults = results.filter((r) => {
      const cat = (r.category || '').toLowerCase();
      return !cat || cat.startsWith('games') || cat.startsWith('console');
    });
    const base = autoPickBest(gameResults);
    if (!base) return { newUpdates: [], error: 'No base release to anchor update matching' };
    const allUpdates = findMatchingUpdates(base.title, gameResults);
    const row = __get('SELECT downloaded_updates FROM game_update_tracking WHERE media_item_id = ?', mediaItemId);
    const downloaded: string[] = row ? JSON.parse(row.downloaded_updates || '[]') : [];
    const newUpdates = allUpdates.filter((u) => {
      const tag = extractUpdateTag(u.title);
      return !downloaded.includes(tag);
    });
    __run(
      "UPDATE game_update_tracking SET last_update_check = datetime('now'), updated_at = datetime('now') WHERE media_item_id = ?",
      mediaItemId,
    );
    return { newUpdates };
  } catch (err: any) {
    return { newUpdates: [], error: err.message };
  }
}

export async function scheduledUpdateCheck(): Promise<{ game: string; queued: number }[]> {
  const config = await getConfig();
  if (!config || !config.nzbplanetApiKey || !config.sabnzbdHost || !config.sabnzbdApiKey) {
    return [];
  }
  const games = await getTrackedGames();
  if (games.length === 0) return [];

  const results: { game: string; queued: number }[] = [];
  for (const g of games) {
    try {
      const { newUpdates } = await checkGameForUpdates(g.mediaItemId, g.mediaItemTitle, config.nzbplanetApiKey);
      let queued = 0;
      for (const update of newUpdates) {
        const updateNzoId = await addNzbToSabnzbd(
          config.sabnzbdHost,
          config.sabnzbdPort ?? 8080,
          config.sabnzbdApiKey,
          config.sabnzbdUseSsl,
          update.nzbUrl,
          update.title,
        );
        if (updateNzoId) {
          await createDownload(
            config.userId,
            g.mediaItemId,
            `${g.mediaItemTitle} (Update)`,
            update.title,
            update.size,
            update.nzbUrl,
            updateNzoId,
          );
          await recordUpdateDownload(g.mediaItemId, g.mediaItemTitle, update.title);
          queued++;
        }
      }
      if (queued > 0) {
        results.push({ game: g.mediaItemTitle, queued });
      }
    } catch {
      // non-fatal
    }
  }
  return results;
}

// ── Native Search & Download Orchestration ────────────────────────────────

export async function searchAndDownload(
  userId: string,
  mediaItemId: string | null,
  gameName: string,
  allowHypervisorOverride?: boolean,
): Promise<{ download: Download; nzbResult: NZBResult } | { error: string } | SearchAndDownloadHypervisor> {
  const config = await getConfig(userId);
  if (!config) {
    return {
      error: 'Download configuration not found. Set up SABnzbd and NZBPlanet in Settings → Integrations.',
    };
  }
  if (!config.nzbplanetApiKey || !config.sabnzbdHost || !config.sabnzbdApiKey) {
    return {
      error: 'SABnzbd or NZBPlanet not configured. Check Settings → Integrations.',
    };
  }

  const results = await searchNzbPlanet(gameName, config.nzbplanetApiKey);
  if (results.length === 0) {
    return { error: `No NZBs found for "${gameName}" on NZBPlanet.` };
  }

  // Filter to game-category results only (NZBPlanet can return Audio, XXX, etc.)
  const gameResults = results.filter((r) => {
    const cat = (r.category || '').toLowerCase();
    return !cat || cat.startsWith('games') || cat.startsWith('console');
  });

  const allowHv = allowHypervisorOverride ?? config.allowHypervisor ?? false;
  const pool = gameResults.length > 0 ? gameResults : results;
  const best = autoPickBest(pool, config.preferredRepackers, allowHv);

  if (!best) {
    if (!allowHv) {
      const qualityPool = filterQualityResults(pool);
      const hvResults = qualityPool.filter((r) => hasHypervisorTags(r));
      if (hvResults.length > 0) {
        return {
          hypervisorAvailable: true,
          hypervisorResults: hvResults,
          gameName,
          error: `Only hypervisor-tagged releases found for "${gameName}".`,
        };
      }
    }
    return {
      error: `No quality releases found for "${gameName}". All results excluded (demos/updates).`,
    };
  }

  const nzoId = await addNzbToSabnzbd(
    config.sabnzbdHost,
    config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey,
    config.sabnzbdUseSsl,
    best.nzbUrl,
    best.title,
  );

  if (!nzoId) {
    return { error: 'Failed to add NZB to SABnzbd. Check your SABnzbd configuration.' };
  }

  const download = await createDownload(
    userId,
    mediaItemId,
    gameName,
    best.title,
    best.size,
    best.nzbUrl,
    nzoId,
  );

  if (mediaItemId) {
    await ensureGameTracked(mediaItemId, gameName);
  }

  // Queue matching updates if available
  const updates = findMatchingUpdates(best.title, pool);
  for (const update of updates) {
    try {
      const updateNzoId = await addNzbToSabnzbd(
        config.sabnzbdHost,
        config.sabnzbdPort ?? 8080,
        config.sabnzbdApiKey,
        config.sabnzbdUseSsl,
        update.nzbUrl,
        update.title,
      );
      if (updateNzoId) {
        await createDownload(
          userId,
          mediaItemId,
          `${gameName} (Update)`,
          update.title,
          update.size,
          update.nzbUrl,
          updateNzoId,
        );
        if (mediaItemId) {
          await recordUpdateDownload(mediaItemId, gameName, update.title);
        }
      }
    } catch {
      // non-fatal update addition
    }
  }

  if (mediaItemId) {
    await recordWishlistSearch(userId, mediaItemId, download.id);
  }

  return { download, nzbResult: best };
}

// ── Native Queue Polling ──────────────────────────────────────────────────

export async function pollAndUpdateDownloads(userId?: string): Promise<Download[]> {
  const config = await getConfig(userId);
  if (!config || !config.sabnzbdHost || !config.sabnzbdApiKey) {
    return [];
  }

  const activeDownloads = __all(
    "SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing')",
  );

  if (activeDownloads.length === 0) return [];

  const queueItems = await getSabnzbdQueue(
    config.sabnzbdHost,
    config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey,
    config.sabnzbdUseSsl,
  );

  const historyItems = await getSabnzbdHistory(
    config.sabnzbdHost,
    config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey,
    config.sabnzbdUseSsl,
  );

  const queueMap = new Map(queueItems.map((q) => [q.nzoId, q]));
  const historyMap = new Map(historyItems.map((h) => [h.nzoId, h]));
  const PROCESSING_STATUSES = new Set(['Verifying', 'Unpacking', 'Repairing', 'Moving', 'PP', 'Running']);

  for (const dl of activeDownloads) {
    const nzoId: string | null = dl.sabnzbd_nzo_id;
    if (!nzoId) continue;

    const historyItem = historyMap.get(nzoId);
    const queueItem = queueMap.get(nzoId);

    if (historyItem) {
      if (historyItem.status === 'Completed') {
        await updateDownloadStatus(dl.id, 'completed');
        if (dl.media_item_id && dl.media_item_title) {
          await ensureGameTracked(dl.media_item_id, dl.media_item_title);
        }
        if (historyItem.storagePath) {
          await updateDownloadIsoPath(dl.id, historyItem.storagePath);
        }
        if (config.postProcessEnabled) {
          await postProcessDownload(
            dl.id,
            config.id,
            config.sabnzbdCompletePath ?? undefined,
            config.downloadPath ?? undefined,
          );
        }
      } else if (historyItem.status === 'Failed') {
        await updateDownloadStatus(dl.id, 'failed', `SABnzbd: ${historyItem.status}`);
      }
    } else if (queueItem) {
      const isProcessing = PROCESSING_STATUSES.has(queueItem.status);
      const status = isProcessing ? 'processing' : 'downloading';
      await updateDownloadStatus(dl.id, status, undefined, Math.round(queueItem.percentage));
    }
  }

  return __all("SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing')");
}

// ── Native Post-Processing ────────────────────────────────────────────────

export async function postProcessDownload(
  downloadId: string,
  configId?: string,
  fallbackSource?: string,
  fallbackDest?: string,
): Promise<PostProcessResult> {
  const result: PostProcessResult = { success: false, isosFound: [], isosMoved: [], errors: [] };

  let targetConfigId = configId;
  if (!targetConfigId) {
    const cfg = await getConfig();
    targetConfigId = cfg?.id;
  }
  if (!targetConfigId) {
    result.errors.push('No download configuration found');
    return result;
  }

  try {
    const orgResult = await autoOrganizeDownload(
      downloadId,
      targetConfigId,
      fallbackSource,
      fallbackDest,
    );
    result.success = orgResult.success;
    result.isosMoved = orgResult.organized.map((o) => ({ from: o.from, to: o.to }));
    result.errors = orgResult.errors;
    return result;
  } catch (err: any) {
    result.errors.push(err.message || String(err));
    return result;
  }
}

// ── Native Wishlist Scanning ──────────────────────────────────────────────

export async function scanWishlist(
  userId: string,
  wishlistGames: { id: string; title: string }[],
): Promise<{ mediaItemId: string; success: boolean; downloadId?: string; error?: string }[]> {
  const results: { mediaItemId: string; success: boolean; downloadId?: string; error?: string }[] = [];
  for (const game of wishlistGames) {
    try {
      const result = await searchAndDownload(userId, game.id, game.title);
      if ('download' in result && result.download?.id) {
        results.push({ mediaItemId: game.id, success: true, downloadId: result.download.id });
      } else if ('error' in result && result.error) {
        results.push({ mediaItemId: game.id, success: false, error: result.error });
      } else {
        results.push({ mediaItemId: game.id, success: false, error: 'Release not available' });
      }
    } catch (err: any) {
      results.push({ mediaItemId: game.id, success: false, error: err.message });
    }
  }
  return results;
}

// ── Native Delete with SABnzbd cancellation ───────────────────────────────

export async function deleteDownloadWithJob(id: string): Promise<void> {
  const dl = await getDownload(id);
  if (dl?.sabnzbdNzoId) {
    const config = await getConfig();
    if (config?.sabnzbdHost && config?.sabnzbdApiKey) {
      await deleteSabnzbdJob(
        config.sabnzbdHost,
        config.sabnzbdPort ?? 8080,
        config.sabnzbdApiKey,
        config.sabnzbdUseSsl,
        dl.sabnzbdNzoId,
      ).catch(() => {});
    }
  }
  await deleteDownload(id);
}
