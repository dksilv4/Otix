/**
 * Downloads module — SABnzbd + NZBPlanet integration for Electron.
 *
 * - SQLite (sql.js WASM) for local download/config/wishlist tracking.
 * - HTTP calls to SABnzbd (local network) and NZBPlanet API.
 * - Exported functions are called from main.ts IPC handlers.
 */

import path from 'path';
import fs from 'fs';
import { _run, _get, _all, ensureDb, DbRow } from './db';
import { autoOrganizeDownload } from './auto-organizer';

function genId(): string {
  return 'dl_' + Math.random().toString(36).substring(2, 14);
}

// ── NZB search result cache (1 hour TTL) ─────────────────────────────────

interface CacheEntry {
  results: NZBResult[];
  fetchedAt: number;
}
const searchCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function getCachedSearch(query: string): NZBResult[] | null {
  const key = query.toLowerCase().trim();
  const entry = searchCache.get(key);
  if (entry && Date.now() - entry.fetchedAt < CACHE_TTL_MS) {
    console.log('[NZBPlanet cache] Hit for:', query);
    return entry.results;
  }
  return null;
}

function setCachedSearch(query: string, results: NZBResult[]): void {
  const key = query.toLowerCase().trim();
  searchCache.set(key, { results, fetchedAt: Date.now() });
  console.log('[NZBPlanet cache] Cached', results.length, 'results for:', query);
}

// ── NZBPlanet API client ──────────────────────────────────────────────────

export interface NZBResult {
  guid: string;
  title: string;
  size: number;
  pubDate: string;
  category: string;
  nzbUrl: string;
  detailsUrl: string;
}

function parseXmlItems(xml: string): NZBResult[] {
  const results: NZBResult[] = [];
  // Match <item>...</item> blocks (non-greedy, dotAll)
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let match;
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
  apiKey: string,
  categoryIds: string = '1000,2000',
  limit: number = 20,
): Promise<NZBResult[]> {
  // Check cache first
  const cached = getCachedSearch(query);
  if (cached) return cached;

  const url = `https://api.nzbplanet.net/api?t=search&apikey=${encodeURIComponent(apiKey)}&q=${encodeURIComponent(query)}&cat=${encodeURIComponent(categoryIds)}&o=json&num=${limit}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Otix/1.0' },
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`NZBPlanet returned ${response.status}: ${body.substring(0, 300)}`);
    }

    const text = await response.text();
    console.log('[NZBPlanet search] Response length:', text.length, 'preview:', text.substring(0, 400));

    // Try JSON first
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const data = JSON.parse(text);
      const items = data?.channel?.item;
      if (!items) return [];
      const itemList = Array.isArray(items) ? items : [items];
      const results: NZBResult[] = itemList.map((item: any) => ({
        guid: item.guid ?? '',
        title: item.title ?? '',
        size: parseInt(item.size ?? '0', 10),
        pubDate: item.pubDate ?? new Date().toISOString(),
        category: item.category ?? '',
        nzbUrl: item.link ?? '',
        detailsUrl: item.link ?? '',
      }));
      results.sort((a, b) => b.size - a.size);
      setCachedSearch(query, results);
      return results;
    }

    // Fallback: parse XML/RSS
    if (text.includes('<?xml') || text.includes('<rss') || text.includes('<channel')) {
      const items = parseXmlItems(text);
      console.log('[NZBPlanet search] XML parsed, items found:', items.length);
      if (items.length > 0) {
        console.log('[NZBPlanet search] First item:', { title: items[0].title, size: items[0].size, category: items[0].category });
      }
      setCachedSearch(query, items);
      return items;
    }

    console.error('[NZBPlanet search] Unknown response format:', text.substring(0, 300));
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

export async function testNzbPlanetConnection(apiKey: string): Promise<boolean> {
  try {
    const url = new URL('https://api.nzbplanet.net/api');
    url.searchParams.set('t', 'search');
    url.searchParams.set('apikey', apiKey);
    url.searchParams.set('q', 'test');
    url.searchParams.set('cat', '1000');
    url.searchParams.set('o', 'json');
    url.searchParams.set('num', '1');

    console.log('[NZBPlanet test] Requesting:', url.toString().replace(apiKey, '***'));

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'Otix/1.0' },
    });

    console.log('[NZBPlanet test] Status:', response.status);

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error('[NZBPlanet test] Error body:', body.substring(0, 500));
      return false;
    }

    const text = await response.text();
    console.log('[NZBPlanet test] Response preview:', text.substring(0, 200));

    // Try JSON first, fall back to XML — both prove the API key works
    if (text.trim().startsWith('{') || text.trim().startsWith('[')) {
      const data = JSON.parse(text);
      console.log('[NZBPlanet test] JSON parsed. Has channel:', !!data?.channel, 'items:', data?.channel?.item?.length ?? 0);
    } else if (text.includes('<?xml') || text.includes('<rss') || text.includes('<channel')) {
      console.log('[NZBPlanet test] XML response detected — API key works');
    } else {
      console.log('[NZBPlanet test] Unknown response format, first 200 chars:', text.substring(0, 200));
    }

    return true;
  } catch (err: any) {
    console.error('[NZBPlanet test] Exception:', err.message, err.cause || '');
    return false;
  }
}

// ── NZB result ranking ────────────────────────────────────────────────────

const DEMO_PATTERNS = ['demo', 'trial', 'beta', 'alpha'];
const UPDATE_PATTERNS = ['update', 'patch', 'dlc', 'addon', 'add-on', 'hotfix'];
const CRACK_ONLY_PATTERNS = ['crack by', 'crack-only', 'crack only', 'crackfix', 'standalone crack'];
const SCENE_TAGS = ['iso', 'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl', 'skidrow', 'flt'];
const HYPERVISOR_TAGS = ['hv', 'hypervisor', 'vm', 'vmware', 'virtualbox', 'qemu', 'vmic'];

function isFullGame(result: NZBResult): boolean {
  const title = result.title.toLowerCase();
  return !DEMO_PATTERNS.some(p => title.includes(p));
}

function isNotUpdate(result: NZBResult): boolean {
  const title = result.title.toLowerCase();
  return !UPDATE_PATTERNS.some(p => title.includes(p));
}

function hasSceneTags(result: NZBResult): boolean {
  const title = result.title.toLowerCase();
  return SCENE_TAGS.some(tag => title.includes(tag));
}

function hasPreferredRepacker(result: NZBResult, repackers: string[]): boolean {
  if (repackers.length === 0) return false;
  const title = result.title.toLowerCase();
  return repackers.some(r => title.includes(r.toLowerCase()));
}

function hasHypervisorTags(result: NZBResult): boolean {
  const title = result.title.toLowerCase();
  // Check for standalone hv (word boundary) to avoid false match on "have"
  return HYPERVISOR_TAGS.some(tag => {
    if (tag === 'hv') {
      return title.includes(' hv ') || title.startsWith('hv ') || title.endsWith(' hv') || title === 'hv';
    }
    return title.includes(tag);
  });
}

function isNotCrackOnly(result: NZBResult): boolean {
  const title = result.title.toLowerCase();
  return !CRACK_ONLY_PATTERNS.some(p => title.includes(p));
}

// ── Update matching ───────────────────────────────────────────────────────

/** Words stripped from scene release titles when extracting core game name. */
const _CORE_SKIP_WORDS = new Set([
  'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl',
  'skidrow', 'flt', 'update', 'patch', 'hotfix', 'dlc', 'addon', 'iso',
  'program', 'game', 'install', 'setup', 'files', 'data', 'content',
]);

/** Does this result title look like a crack update/patch (not DLC)? */
function isUpdateResult(title: string): boolean {
  const t = title.toLowerCase();
  return ['update', 'patch', 'hotfix'].some(p => t.includes(p));
}

/**
 * Strip noise from a release title to get a comparable game signature.
 * (Exported for use by auto-organizer)
 *
 * Handles both scene format (Game.Name.REPACK-GROUP) and Elamigos
 * format (Game Name V##### Group Password=404).
 *
 * "Clair Obscur Expedition 33 V61339 ElAmigos"        → "clairobscurexpedition"
 * "Clair Obscur Expedition 33 Update 62964-63936 ..." → "clairobscurexpedition"
 * "Stellar.Blade.REPACK-DELUSION"                     → "stellarblade"
 * "Stellar.Blade.Update.v1.01-Voices38"              → "stellarblade"
 */
export function gameSignature(title: string): string {
  const lower = title.toLowerCase()
    .replace(/\s*password=.*$/i, '')            // strip Password=... suffix
    .replace(/-[a-z0-9_.]+$/, '')               // strip scene group (Game-GROUP)
    .replace(/\b(update|patch|hotfix|demo|dlc|addon|repack)\b/gi, '')  // strip keywords
    .replace(/\bv?\d+(\.\d+)*\b/gi, '');        // strip version numbers
  return lower.split(/[.\s]+/)
    .filter(w => w && !_CORE_SKIP_WORDS.has(w))
    .map(w => w.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .join('');
}

/** Extract release group from title.
 *
 *  Handles both dash-separated (scene) and space-separated (Elamigos) groups:
 *    "Clair.Obscur.Expedition.33-Elamigos"  →  "elamigos"
 *    "Clair Obscur Expedition 33 V61339 ElAmigos"  →  "elamigos"
 *    "Password=NibNit999" also checked as fallback group marker.
 *  (Exported for auto-organizer)
 */
export function extractGroup(title: string): string | null {
  const lower = title.toLowerCase().trim();
  // Cache Password= value in case it encodes the group
  const pwMatch = lower.match(/password=([a-z0-9_.]+)/);
  const cleaned = lower.replace(/\s*password=.*$/i, '').trim();

  // Dash-group: Game-GROUP
  const dashMatch = cleaned.match(/-([a-z0-9_.]+)$/);
  if (dashMatch) return dashMatch[1];

  // Space-group: last word is a known group tag
  const words = cleaned.split(/\s+/).filter(Boolean);
  const last = words[words.length - 1];
  if (last && _CORE_SKIP_WORDS.has(last)) return last;
  // Last word looks like a scene group (2-10 alpha chars, not purely digits)
  if (last && /^[a-z]{2,10}$/.test(last) && !/^\d+$/.test(last)) return last;

  // Fallback: password value can encode the release group
  if (pwMatch) {
    const pv = pwMatch[1];
    if (pv.length >= 2 && pv.length <= 15) return pv;
  }
  return null;
}

/** Parse version from Elamigos-style title: "V61339" → 61339, "Update 56180" → 56180
 *  (Exported for auto-organizer) */
export function parseVersion(title: string): number | null {
  const lower = title.toLowerCase();
  // Base: "Game Name V61339 Group"
  const baseMatch = lower.match(/\bv(\d{3,})\b/);
  if (baseMatch) return parseInt(baseMatch[1], 10);
  // Update: "Update 56180 - 56442" → start version
  const updateMatch = lower.match(/\bupdate\s+(\d{3,})/);
  if (updateMatch) return parseInt(updateMatch[1], 10);
  return null;
}

/** Parse TO version from an update range: "Update 61339 - 62964" → 62964 */
function parseToVersion(title: string): number | null {
  const match = title.toLowerCase().match(/\bupdate\s+\d+\s*-\s*(\d{3,})/);
  return match ? parseInt(match[1], 10) : null;
}

/** Deduplicate update NZBs: keep only the fattest update per FROM version.
 *
 *  "61339-61582"  +  "61339-61711"  +  "61339-62964"  →  "61339-62964" (fattest)
 */
function deduplicateUpdates(updates: NZBResult[]): NZBResult[] {
  const best = new Map<number, NZBResult>();
  for (const u of updates) {
    const from = parseVersion(u.title);
    if (from === null) {
      // Keep updates without parseable version too
      if (!best.has(-1)) best.set(-1, u);
    } else {
      const existing = best.get(from);
      if (!existing) { best.set(from, u); continue; }
      const existingTo = parseToVersion(existing.title) ?? 0;
      const newTo = parseToVersion(u.title) ?? 0;
      if (newTo > existingTo) best.set(from, u);
    }
  }
  return Array.from(best.values());
}

/** Find update/patch results that belong to the same game as baseTitle.
 *
 *  Uses normalized game signature for cross-format matching (scene & Elamigos).
 *  Prefers same release group (e.g. -Elamigos) to avoid incompatible updates.
 *  When both base and update have parseable versions, only matches if the
 *  update's start version is >= the base version (avoids legacy updates).
 *  Deduplicates overlapping update ranges, keeping only the fattest per FROM.
 */
export function findMatchingUpdates(baseTitle: string, allResults: NZBResult[]): NZBResult[] {
  const baseSig = gameSignature(baseTitle);
  const baseGroup = extractGroup(baseTitle);
  const baseVer = parseVersion(baseTitle);

  // All results that are updates for the same game
  let matches = allResults.filter(r => {
    if (r.title.toLowerCase() === baseTitle.toLowerCase()) return false;
    if (!isUpdateResult(r.title)) return false;
    if (gameSignature(r.title) !== baseSig) return false;
    // When we know base version, skip updates for older base releases
    if (baseVer !== null) {
      const updateVer = parseVersion(r.title);
      if (updateVer !== null && updateVer < baseVer) return false;
    }
    return true;
  });

  // Prioritize same release group but keep cross-group updates too
  if (baseGroup && matches.length > 0) {
    const sameGroup = matches.filter(r => extractGroup(r.title) === baseGroup);
    const otherGroup = matches.filter(r => extractGroup(r.title) !== baseGroup);
    // Same-group first, then cross-group/unlabeled
    matches = sameGroup.length > 0 ? [...sameGroup, ...otherGroup] : matches;
  }

  // Deduplicate: keep only fattest update per FROM version
  return deduplicateUpdates(matches);
}

export function filterQualityResults(results: NZBResult[]): NZBResult[] {
  // Try hard filter: exclude demos, updates, crack-only
  const filtered = results.filter(r => isFullGame(r) && isNotUpdate(r) && isNotCrackOnly(r));
  // Fallback: if hard filter kills everything, return all results so user
  // still gets a release. Filter may be too broad or NZBPlanet may not
  // return the valid release in the top N results.
  return filtered.length > 0 ? filtered : results;
}

/** Compare NZB results by version descending. Versioned entries rank above non-versioned. */
function compareByVersion(a: NZBResult, b: NZBResult): number {
  const verA = parseVersion(a.title);
  const verB = parseVersion(b.title);
  if (verA !== null && verB !== null) return verB - verA;  // higher wins
  if (verA !== null) return -1;  // only A versioned → A first
  if (verB !== null) return 1;   // only B versioned → B first
  return 0;                      // neither versioned → preserve order
}

export function autoPickBest(results: NZBResult[], preferredRepackers?: string | null, allowHypervisor?: boolean): NZBResult | null {
  let quality = filterQualityResults(results);
  if (quality.length === 0) return null;

  // Filter out hypervisor-tagged results unless explicitly allowed
  if (!allowHypervisor) {
    quality = quality.filter(r => !hasHypervisorTags(r));
    if (quality.length === 0) return null;
  }

  const repackerList = preferredRepackers
    ? preferredRepackers.split(',').map(r => r.trim()).filter(Boolean)
    : [];

  if (repackerList.length > 0) {
    const preferred = quality.filter(r => hasPreferredRepacker(r, repackerList));
    const others = quality.filter(r => !hasPreferredRepacker(r, repackerList));
    // Within preferred: scene first, then non-scene
    // Within each tier: prefer upgraded version
    const prefScene = preferred.filter(r => hasSceneTags(r)).sort(compareByVersion);
    const prefNonScene = preferred.filter(r => !hasSceneTags(r)).sort(compareByVersion);
    const otherScene = others.filter(r => hasSceneTags(r)).sort(compareByVersion);
    const otherNonScene = others.filter(r => !hasSceneTags(r)).sort(compareByVersion);
    const ranked = [...prefScene, ...prefNonScene, ...otherScene, ...otherNonScene];
    return ranked[0];
  }

  const scene = quality.filter(r => hasSceneTags(r)).sort(compareByVersion);
  const nonScene = quality.filter(r => !hasSceneTags(r)).sort(compareByVersion);
  const ranked = [...scene, ...nonScene];
  return ranked[0];
}

// ── Game update tracking ──────────────────────────────────────────────────

export interface GameTrackEntry {
  mediaItemId: string;
  mediaItemTitle: string;
  downloadedUpdateTags: string[];
  lastUpdateCheck: string | null;
}

function ensureTrackingTable(): void {
  _run(`
    CREATE TABLE IF NOT EXISTS game_update_tracking (
      media_item_id TEXT NOT NULL,
      media_item_title TEXT NOT NULL DEFAULT '',
      downloaded_updates TEXT NOT NULL DEFAULT '[]',
      last_update_check TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(media_item_id)
    )
  `);
}

function trackRowToObj(row: DbRow): GameTrackEntry {
  return {
    mediaItemId: row.media_item_id,
    mediaItemTitle: row.media_item_title,
    downloadedUpdateTags: JSON.parse(row.downloaded_updates || '[]'),
    lastUpdateCheck: row.last_update_check || null,
  };
}

export async function ensureGameTracked(mediaItemId: string, title: string): Promise<void> {
  await ensureDb();
  ensureTrackingTable();
  _run('INSERT OR IGNORE INTO game_update_tracking (media_item_id, media_item_title) VALUES (?, ?)',
    [mediaItemId, title]);
}

function extractUpdateTag(title: string): string {
  const lower = title.toLowerCase();
  const rangeMatch = lower.match(/update\s+(\d{3,})\s*-\s*(\d{3,})/);
  if (rangeMatch) return rangeMatch[1] + '-' + rangeMatch[2];
  const verMatch = lower.match(/(?:update|patch)[.\s]*v?(\d+(?:\.\d+)*)/i);
  if (verMatch) return verMatch[1];
  return title.substring(0, 40);
}

export async function recordUpdateDownload(
  mediaItemId: string, mediaTitle: string, updateTitle: string,
): Promise<void> {
  await ensureDb();
  ensureTrackingTable();
  const tag = extractUpdateTag(updateTitle);
  const row = _get(
    'SELECT downloaded_updates FROM game_update_tracking WHERE media_item_id = ?', [mediaItemId],
  );
  if (row) {
    const tags: string[] = JSON.parse(row.downloaded_updates || '[]');
    if (!tags.includes(tag)) {
      tags.push(tag);
      _run(
        "UPDATE game_update_tracking SET downloaded_updates = ?, media_item_title = ?, updated_at = datetime('now') WHERE media_item_id = ?",
        [JSON.stringify(tags), mediaTitle, mediaItemId],
      );
    }
  } else {
    _run(
      'INSERT INTO game_update_tracking (media_item_id, media_item_title, downloaded_updates) VALUES (?, ?, ?)',
      [mediaItemId, mediaTitle, JSON.stringify([tag])],
    );
  }
}

export async function getTrackedGames(): Promise<GameTrackEntry[]> {
  await ensureDb();
  ensureTrackingTable();
  return _all('SELECT * FROM game_update_tracking ORDER BY media_item_title').map(trackRowToObj);
}

export async function checkGameForUpdates(
  mediaItemId: string, title: string, apiKey: string,
): Promise<{ newUpdates: NZBResult[]; error?: string }> {
  await ensureDb();
  try {
    const results = await searchNzbPlanet(title, apiKey);
    const gameResults = results.filter(r => {
      const cat = r.category.toLowerCase();
      return !cat || cat.startsWith('games') || cat.startsWith('console');
    });
    const base = autoPickBest(gameResults);
    if (!base) return { newUpdates: [], error: 'No base release to anchor update matching' };
    const allUpdates = findMatchingUpdates(base.title, gameResults);
    const row = _get(
      'SELECT downloaded_updates FROM game_update_tracking WHERE media_item_id = ?', [mediaItemId],
    );
    const downloaded: string[] = row ? JSON.parse(row.downloaded_updates || '[]') : [];
    const newUpdates = allUpdates.filter(u => {
      const tag = extractUpdateTag(u.title);
      return !downloaded.includes(tag);
    });
    _run(
      "UPDATE game_update_tracking SET last_update_check = datetime('now'), updated_at = datetime('now') WHERE media_item_id = ?",
      [mediaItemId],
    );
    return { newUpdates };
  } catch (err: any) {
    return { newUpdates: [], error: err.message };
  }
}

export async function scheduledUpdateCheck(): Promise<{ game: string; queued: number }[]> {
  await ensureDb();
  const config = await getConfig();
  if (!config || !config.nzbplanetApiKey || !config.sabnzbdHost || !config.sabnzbdApiKey) {
    console.log('[update-check] Skipping - SABnzbd or NZBPlanet not configured');
    return [];
  }
  const games = await getTrackedGames();
  if (games.length === 0) {
    console.log('[update-check] No tracked games');
    return [];
  }
  console.log('[update-check] Checking', games.length, 'tracked games for updates');
  const results: { game: string; queued: number }[] = [];
  for (const game of games) {
    try {
      const { newUpdates, error } = await checkGameForUpdates(
        game.mediaItemId, game.mediaItemTitle, config.nzbplanetApiKey,
      );
      if (error) { console.log('[update-check]', game.mediaItemTitle, 'error:', error); continue; }
      if (newUpdates.length === 0) { console.log('[update-check]', game.mediaItemTitle, '- no new updates'); continue; }
      let queued = 0;
      for (const update of newUpdates) {
        const nzoId = await addNzbToSabnzbd(
          config.sabnzbdHost, config.sabnzbdPort ?? 8080,
          config.sabnzbdApiKey, config.sabnzbdUseSsl,
          update.nzbUrl, update.title,
        );
        if (nzoId) {
          await createDownload(config.userId || 'desktop', game.mediaItemId,
            game.mediaItemTitle + ' (Update)', update, nzoId);
          await recordUpdateDownload(game.mediaItemId, game.mediaItemTitle, update.title);
          queued++;
        }
      }
      results.push({ game: game.mediaItemTitle, queued });
    } catch (err: any) {
      console.error('[update-check] Error checking', game.mediaItemTitle, ':', err.message);
    }
  }
  console.log('[update-check] Done -', results.reduce((s, r) => s + r.queued, 0), 'updates queued');
  return results;
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

function sabnzbdUrl(host: string, port: number, useSsl: boolean, mode: string, extraParams: Record<string, string> = {}): string {
  const scheme = useSsl ? 'https' : 'http';
  const url = new URL(`${scheme}://${host}:${port}/api`);
  url.searchParams.set('output', 'json');
  url.searchParams.set('mode', mode);
  for (const [k, v] of Object.entries(extraParams)) {
    url.searchParams.set(k, v);
  }
  return url.toString();
}

export async function testSabnzbdConnection(
  host: string, port: number, apiKey: string, useSsl: boolean,
): Promise<boolean> {
  try {
    const url = sabnzbdUrl(host, port, useSsl, 'version', { apikey: apiKey });
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as any;
    return !!(data?.version);
  } catch {
    return false;
  }
}

export async function addNzbToSabnzbd(
  host: string, port: number, apiKey: string, useSsl: boolean,
  nzbUrl: string, name: string, category: string = 'games',
): Promise<string | null> {
  const url = sabnzbdUrl(host, port, useSsl, 'addurl', {
    apikey: apiKey,
    name: nzbUrl,
    nzbname: name,
    cat: category,
  });

  const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const data = await response.json() as any;

  if (data?.status && data?.nzo_ids?.length > 0) return data.nzo_ids[0] as string;
  if (data?.nzo_ids?.[0]) return data.nzo_ids[0] as string;
  return null;
}

export async function getSabnzbdQueue(
  host: string, port: number, apiKey: string, useSsl: boolean,
): Promise<SabQueueItem[]> {
  const url = sabnzbdUrl(host, port, useSsl, 'queue', { apikey: apiKey });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as any;
    const slots = data?.queue?.slots ?? [];
    return slots.map((s: any) => ({
      nzoId: s.nzo_id ?? '',
      name: s.filename ?? '',
      size: parseInt(s.size ?? '0', 10),
      sizeLeft: parseInt(s.sizeleft ?? '0', 10),
      status: s.status ?? '',
      percentage: parseFloat(s.percentage ?? '0'),
    }));
  } catch {
    return [];
  }
}

export async function getSabnzbdHistory(
  host: string, port: number, apiKey: string, useSsl: boolean,
  limit: number = 50,
): Promise<SabHistoryItem[]> {
  const url = sabnzbdUrl(host, port, useSsl, 'history', { apikey: apiKey, limit: String(limit) });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as any;
    const slots = data?.history?.slots ?? [];
    return slots.map((s: any) => ({
      nzoId: s.nzo_id ?? '',
      name: s.name ?? '',
      size: parseInt(s.size ?? '0', 10),
      status: s.status ?? '',
      storagePath: s.storage ?? '',
      completedAt: s.completed ? new Date(s.completed * 1000).toISOString() : '',
    }));
  } catch {
    return [];
  }
}

export async function deleteSabnzbdJob(
  host: string, port: number, apiKey: string, useSsl: boolean,
  nzoId: string,
): Promise<boolean> {
  const url = sabnzbdUrl(host, port, useSsl, 'queue', {
    apikey: apiKey,
    name: 'delete',
    value: nzoId,
  });
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    const data = await response.json() as any;
    return data?.status === true;
  } catch {
    return false;
  }
}

// ── Download config CRUD ──────────────────────────────────────────────────

export interface DownloadConfig {
  id: string;
  userId: string;
  sabnzbdHost: string | null;
  sabnzbdPort: number | null;
  sabnzbdApiKey: string | null;
  sabnzbdUseSsl: boolean;
  nzbplanetApiKey: string | null;
  sabnzbdCompletePath: string | null;
  downloadPath: string | null;
  postProcessEnabled: boolean;
  autoSearchWishlist: boolean;
  wishlistIntervalHours: number;
  preferredRepackers: string | null;
  allowHypervisor?: boolean;
  autoOrganizeEnabled?: boolean;
  namingTemplate?: string | null;
}

function configRowToObj(row: DbRow): DownloadConfig {
  return {
    id: row.id,
    userId: row.user_id,
    sabnzbdHost: row.sabnzbd_host,
    sabnzbdPort: row.sabnzbd_port,
    sabnzbdApiKey: row.sabnzbd_api_key,
    sabnzbdUseSsl: row.sabnzbd_use_ssl === 1,
    nzbplanetApiKey: row.nzbplanet_api_key,
    sabnzbdCompletePath: row.sabnzbd_complete_path,
    downloadPath: row.download_path,
    postProcessEnabled: row.post_process_enabled === 1,
    autoSearchWishlist: row.auto_search_wishlist === 1,
    wishlistIntervalHours: row.wishlist_interval_hours,
    preferredRepackers: row.preferred_repackers ?? null,
    allowHypervisor: row.allow_hypervisor === 1,
    autoOrganizeEnabled: row.auto_organize_enabled === 1,
    namingTemplate: row.naming_template ?? null,
  };
}

export async function getConfig(_userId?: string): Promise<DownloadConfig | null> {
  await ensureDb();
  // Desktop app: single user, return first config regardless of user_id
  const row = _get('SELECT * FROM download_configs ORDER BY updated_at DESC LIMIT 1', []);
  return row ? configRowToObj(row) : null;
}

export async function saveConfig(config: Omit<DownloadConfig, 'id'> & { id?: string }): Promise<DownloadConfig> {
  const dbReady = await ensureDb();
  if (!dbReady) throw new Error('Database failed to initialize — check console for details');
  // Desktop app: single config. Check for any existing row regardless of user_id
  const existing = _get('SELECT id, user_id FROM download_configs LIMIT 1', []);

  if (existing) {
    _run(`
      UPDATE download_configs SET
        user_id = ?,
        sabnzbd_host = ?, sabnzbd_port = ?, sabnzbd_api_key = ?,
        sabnzbd_use_ssl = ?, nzbplanet_api_key = ?,
        sabnzbd_complete_path = ?, download_path = ?, post_process_enabled = ?,
        auto_search_wishlist = ?, wishlist_interval_hours = ?,
        preferred_repackers = ?, allow_hypervisor = ?,
        auto_organize_enabled = ?, naming_template = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
      config.userId,
      config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
      config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
      config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
      config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
      config.preferredRepackers, config.allowHypervisor ? 1 : 0,
      config.autoOrganizeEnabled ? 1 : 0, config.namingTemplate ?? null,
      existing.id,
    ]);
    const cfg = await getConfig();
    if (!cfg) throw new Error('Failed to retrieve saved config');
    return cfg;
  }

  const id = config.id || genId();
  _run(`
    INSERT INTO download_configs (id, user_id, sabnzbd_host, sabnzbd_port, sabnzbd_api_key,
      sabnzbd_use_ssl, nzbplanet_api_key, sabnzbd_complete_path, download_path,
      post_process_enabled, auto_search_wishlist, wishlist_interval_hours, preferred_repackers, allow_hypervisor,
      auto_organize_enabled, naming_template)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    id, config.userId, config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
    config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
    config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
    config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
    config.preferredRepackers, config.allowHypervisor ? 1 : 0,
    config.autoOrganizeEnabled ? 1 : 0, config.namingTemplate ?? null,
  ]);

  const cfg = await getConfig();
  if (!cfg) throw new Error('Failed to retrieve saved config');
  return cfg;
}


export interface Download {
  id: string;
  userId: string;
  mediaItemId: string | null;
  mediaItemTitle: string | null;
  sabnzbdNzoId: string | null;
  status: string;
  nzbName: string | null;
  nzbSize: number | null;
  nzbUrl: string | null;
  isoPath: string | null;
  errorMessage: string | null;
  percentage: number | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function downloadRowToObj(row: DbRow): Download {
  return {
    id: row.id,
    userId: row.user_id,
    mediaItemId: row.media_item_id,
    mediaItemTitle: row.media_item_title ?? null,
    sabnzbdNzoId: row.sabnzbd_nzo_id,
    status: row.status,
    nzbName: row.nzb_name,
    nzbSize: row.nzb_size,
    nzbUrl: row.nzb_url,
    isoPath: row.iso_path,
    errorMessage: row.error_message,
    percentage: row.percentage != null ? Number(row.percentage) : null,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createDownload(
  userId: string,
  mediaItemId: string | null,
  mediaItemTitle: string | null,
  nzbResult: NZBResult,
  sabnzbdNzoId: string | null,
): Promise<Download> {
  await ensureDb();
  const id = genId();
  _run(`
    INSERT INTO downloads (id, user_id, media_item_id, media_item_title, sabnzbd_nzo_id, status,
      nzb_name, nzb_size, nzb_url)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
  `, [id, userId, mediaItemId, mediaItemTitle, sabnzbdNzoId, nzbResult.title, nzbResult.size, nzbResult.nzbUrl]);

  return (await getDownload(id))!;
}

export async function getDownload(id: string): Promise<Download | null> {
  await ensureDb();
  const row = _get('SELECT * FROM downloads WHERE id = ?', [id]);
  return row ? downloadRowToObj(row) : null;
}

export async function getUserDownloads(_userId?: string): Promise<Download[]> {
  await ensureDb();
  const rows = _all('SELECT * FROM downloads ORDER BY created_at DESC', []);
  return rows.map(downloadRowToObj);
}

export async function updateDownloadStatus(id: string, status: string, errorMessage?: string, percentage?: number): Promise<void> {
  await ensureDb();
  if (status === 'completed') {
    _run('UPDATE downloads SET status = ?, percentage = 100, completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
  } else if (errorMessage) {
    _run('UPDATE downloads SET status = ?, error_message = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, errorMessage, percentage ?? 0, id]);
  } else {
    _run('UPDATE downloads SET status = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, percentage ?? 0, id]);
  }
}

export async function updateDownloadIsoPath(id: string, isoPath: string): Promise<void> {
  await ensureDb();
  _run('UPDATE downloads SET iso_path = ?, updated_at = datetime(\'now\') WHERE id = ?', [isoPath, id]);
}

export async function deleteDownload(id: string): Promise<void> {
  await ensureDb();
  const dl = await getDownload(id);
  if (!dl) return;

  // Delete ISO files from disk
  if (dl.isoPath) {
    const paths = dl.isoPath.split(';');
    for (const p of paths) {
      const trimmed = p.trim();
      if (trimmed) {
        try {
          if (fs.existsSync(trimmed)) {
            fs.unlinkSync(trimmed);
            console.log('[deleteDownload] Deleted ISO:', trimmed);
          }
        } catch (err: any) {
          console.error('[deleteDownload] Failed to delete ISO:', trimmed, err.message);
        }
      }
    }
  }

  // Soft-delete: mark as deleted so it shows in Deleted tab
  _run("UPDATE downloads SET status = 'deleted', iso_path = NULL, updated_at = datetime('now') WHERE id = ?", [id]);
}

export async function purgeOldDeletedDownloads(): Promise<number> {
  await ensureDb();
  const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const rows = _all("SELECT id FROM downloads WHERE status = 'deleted' AND updated_at < ?", [cutoff]);
  for (const row of rows) {
    _run('DELETE FROM downloads WHERE id = ?', [row.id]);
  }
  if (rows.length > 0) {
    console.log(`[purge] Purged ${rows.length} deleted downloads older than 30 days`);
  }
  return rows.length;
}

// ── ISO Match Cache ──────────────────────────────────────────────────────

export interface MatchCacheEntry {
  isoPath: string;
  queryTitle: string;
  mediaId: string;
  mediaTitle: string;
  mediaSlug?: string;
  confidence?: number;
  posterUrl?: string;
  logolessPosterUrl?: string;
  logoUrl?: string;
}

export function batchCheckMatchCache(isoPaths: string[]): Record<string, MatchCacheEntry | null> {
  const result: Record<string, MatchCacheEntry | null> = {};
  for (const p of isoPaths) {
    const row = _get('SELECT * FROM iso_match_cache WHERE iso_path = ?', [p]);
    if (row) {
      result[p] = {
        isoPath: row.iso_path,
        queryTitle: row.query_title,
        mediaId: row.media_id,
        mediaTitle: row.media_title,
        mediaSlug: row.media_slug,
        confidence: row.confidence,
        posterUrl: row.poster_url,
        logolessPosterUrl: row.logoless_poster_url,
        logoUrl: row.logo_url,
      };
    } else {
      result[p] = null;
    }
  }
  return result;
}

export function saveMatchCache(entries: MatchCacheEntry[]): void {
  const now = new Date().toISOString();
  for (const e of entries) {
    _run(`
      INSERT INTO iso_match_cache (iso_path, query_title, media_id, media_title, media_slug, confidence, poster_url, logoless_poster_url, logo_url, checked_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(iso_path) DO UPDATE SET
        query_title = excluded.query_title,
        media_id = excluded.media_id,
        media_title = excluded.media_title,
        media_slug = excluded.media_slug,
        confidence = excluded.confidence,
        poster_url = excluded.poster_url,
        logoless_poster_url = excluded.logoless_poster_url,
        logo_url = excluded.logo_url,
        checked_at = excluded.checked_at
    `, [
      e.isoPath, e.queryTitle, e.mediaId, e.mediaTitle, e.mediaSlug ?? null,
      e.confidence ?? null, e.posterUrl ?? null, e.logolessPosterUrl ?? null,
      e.logoUrl ?? null, now,
    ]);
  }
}

// ── Path mappings CRUD ───────────────────────────────────────────────────

export interface PathMapping {
  id: string;
  configId: string;
  sourcePath: string;
  destPath: string;
  createdAt: string;
}

export async function getPathMappings(configId: string): Promise<PathMapping[]> {
  await ensureDb();
  const rows = _all('SELECT * FROM download_path_mappings WHERE config_id = ? ORDER BY created_at', [configId]);
  return rows.map((r: DbRow) => ({
    id: r.id,
    configId: r.config_id,
    sourcePath: r.source_path,
    destPath: r.dest_path,
    createdAt: r.created_at,
  }));
}

export async function addPathMapping(configId: string, sourcePath: string, destPath: string): Promise<PathMapping> {
  await ensureDb();
  const id = genId();
  _run('INSERT INTO download_path_mappings (id, config_id, source_path, dest_path) VALUES (?, ?, ?, ?)',
    [id, configId, sourcePath, destPath]);
  const row = _get('SELECT * FROM download_path_mappings WHERE id = ?', [id]);
  if (!row) throw new Error('Failed to create path mapping');
  return {
    id: row.id,
    configId: row.config_id,
    sourcePath: row.source_path,
    destPath: row.dest_path,
    createdAt: row.created_at,
  };
}

export async function removePathMapping(id: string): Promise<void> {
  await ensureDb();
  _run('DELETE FROM download_path_mappings WHERE id = ?', [id]);
}

// ── Wishlist tracking ─────────────────────────────────────────────────────

export async function recordWishlistSearch(userId: string, mediaItemId: string, downloadId: string | null): Promise<void> {
  await ensureDb();
  const existing = _get('SELECT id, attempts FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);

  if (existing) {
    _run(`
      UPDATE wishlist_download_tracking SET
        last_searched_at = datetime('now'), last_download_id = ?,
        attempts = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [downloadId, (existing.attempts ?? 0) + 1, existing.id]);
  } else {
    _run(`
      INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, last_searched_at, last_download_id, attempts)
      VALUES (?, ?, ?, datetime('now'), ?, 1)
    `, [genId(), userId, mediaItemId, downloadId]);
  }
}

export async function getWishlistTracking(userId: string): Promise<{ mediaItemId: string; attempts: number; lastSearchedAt: string | null }[]> {
  await ensureDb();
  const rows = _all('SELECT media_item_id, attempts, last_searched_at FROM wishlist_download_tracking WHERE skipped = 0', []);
  return rows.map((r: DbRow) => ({
    mediaItemId: r.media_item_id,
    attempts: r.attempts,
    lastSearchedAt: r.last_searched_at,
  }));
}

export async function skipWishlistItem(userId: string, mediaItemId: string): Promise<void> {
  await ensureDb();
  const existing = _get('SELECT id FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);
  if (existing) {
    _run('UPDATE wishlist_download_tracking SET skipped = 1 WHERE id = ?', [existing.id]);
  } else {
    _run('INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, skipped) VALUES (?, ?, ?, 1)', [genId(), userId, mediaItemId]);
  }
}

// ── Post-processing ───────────────────────────────────────────────────────

function findIsoFiles(dirPath: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push(...findIsoFiles(fullPath));
      } else if (entry.name.toLowerCase().endsWith('.iso')) {
        results.push(fullPath);
      }
    }
  } catch (_) {}
  return results;
}

export interface PostProcessResult {
  success: boolean;
  isosFound: string[];
  isosMoved: { from: string; to: string }[];
  errors: string[];
}

export async function postProcessDownload(
  downloadId: string,
  configId: string,
  fallbackSource?: string,
  fallbackDest?: string,
): Promise<PostProcessResult> {
  await ensureDb();
  const result: PostProcessResult = { success: false, isosFound: [], isosMoved: [], errors: [] };

  // Check if auto-organizer is enabled — delegate if so
  const cfg = _get('SELECT auto_organize_enabled, naming_template FROM download_configs WHERE id = ?', [configId]);
  if (cfg && cfg.auto_organize_enabled === 1) {
    const orgResult = await autoOrganizeDownload(downloadId, configId, fallbackSource, fallbackDest);
    result.success = orgResult.success;
    result.isosMoved = orgResult.organized.map(o => ({ from: o.from, to: o.to }));
    result.errors = orgResult.errors;
    return result;
  }

  const dl = _get('SELECT * FROM downloads WHERE id = ? AND status = ?', [downloadId, 'completed']);
  if (!dl) {
    result.errors.push('Download not found or not completed');
    return result;
  }

  // Get all path mappings
  const mappings = await getPathMappings(configId);
  console.log('[postProcess] Path mappings from DB:', mappings.length, mappings.map(m => `${m.sourcePath} -> ${m.destPath}`));
  console.log('[postProcess] Fallbacks:', { fallbackSource, fallbackDest });

  // Fall back to legacy single-path config
  const pairs: { source: string; dest: string }[] = mappings.map(m => ({ source: m.sourcePath, dest: m.destPath }));
  if (pairs.length === 0 && fallbackSource && fallbackDest) {
    pairs.push({ source: fallbackSource, dest: fallbackDest });
  }

  console.log('[postProcess] Effective pairs:', pairs);

  if (pairs.length === 0) {
    result.errors.push('No path mappings configured. Add a mapping in SABnzbd settings.');
    console.log('[postProcess] No pairs, aborting');
    return result;
  }

  const nzbName: string = dl.nzb_name ?? '';
  const baseName = path.basename(nzbName, path.extname(nzbName));

  function translatePath(originalPath: string, pair: { source: string; dest: string }): string | null {
    const normPath = originalPath.replace(/[/\\]/g, path.sep);
    const normSource = pair.source.replace(/[/\\]/g, path.sep);
    const normDest = pair.dest.replace(/[/\\]/g, path.sep);

    if (normPath.startsWith(normSource)) {
      return normDest + normPath.substring(normSource.length);
    }
    return null;
  }

  // Find ISOs — try each pair's translation
  for (const pair of pairs) {
    // Build candidate paths using the source prefix (Unraid paths)
    const sourceCandidates = [
      path.join(pair.source, baseName),
      path.join(pair.source, `_UNPACK_${baseName}`),
      path.join(pair.source, nzbName),
    ];
    if (dl.iso_path) sourceCandidates.unshift(dl.iso_path);

    // Translate source paths to Windows-accessible paths
    for (const candidate of sourceCandidates) {
      const translated = translatePath(candidate, pair);
      if (translated) {
        console.log('[postProcess] Translated:', candidate, '->', translated, 'exists:', fs.existsSync(translated));
        result.isosFound.push(...findIsoFiles(translated));
      } else {
        // No translation match — try directly if accessible
        console.log('[postProcess] Direct check:', candidate, 'exists:', fs.existsSync(candidate));
        result.isosFound.push(...findIsoFiles(candidate));
      }
    }
  }

  console.log('[postProcess] ISOs found:', result.isosFound);

  if (result.isosFound.length === 0) {
    result.errors.push('No ISO files found in any configured source path. Check path mappings and network share access.');
    console.log('[postProcess] No ISOs found, aborting');
    return result;
  }

  // Move ISOs to library path (use fallbackDest as the final library destination)
  const libraryDest = fallbackDest || pairs[0]?.dest;
  let movedCount = 0;

  for (const isoPath of result.isosFound) {
    let moved = false;
    const isoName = path.basename(isoPath);

    // Try the library destination first
    if (libraryDest) {
      try { fs.mkdirSync(libraryDest, { recursive: true }); } catch (_) {}
      const destPath = path.join(libraryDest, isoName);
      let finalDest = destPath;
      let counter = 1;
      while (fs.existsSync(finalDest)) {
        const ext = path.extname(destPath);
        const nameNoExt = path.basename(destPath, ext);
        finalDest = path.join(libraryDest, `${nameNoExt}_${counter}${ext}`);
        counter++;
      }

      try {
        fs.renameSync(isoPath, finalDest);
        result.isosMoved.push({ from: isoPath, to: finalDest });
        movedCount++;
        moved = true;
      } catch (err: any) {
        result.errors.push(`Failed to move ${isoName} → ${libraryDest}: ${err.message}`);
      }
    }
    if (!moved) {
      result.errors.push(`No matching mapping for: ${isoPath}`);
    }
  }

  if (movedCount > 0) {
    const movedPaths = result.isosMoved.map(m => m.to).join(';');
    _run('UPDATE downloads SET iso_path = ?, updated_at = datetime(\'now\') WHERE id = ?', [movedPaths, downloadId]);
  }

  result.success = result.isosMoved.length > 0 && result.errors.length === 0;
  return result;
}

// ── Poll queue ────────────────────────────────────────────────────────────

export async function pollAndUpdateDownloads(userId: string): Promise<Download[]> {
  await ensureDb();
  const config = await getConfig(userId);
  if (!config || !config.sabnzbdHost || !config.sabnzbdApiKey) return [];

  const activeDownloads = _all(
    "SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing')",
    [],
  );

  if (activeDownloads.length === 0) return [];

  const queueItems = await getSabnzbdQueue(
    config.sabnzbdHost, config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey, config.sabnzbdUseSsl,
  );

  const historyItems = await getSabnzbdHistory(
    config.sabnzbdHost, config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey, config.sabnzbdUseSsl,
  );

  const queueMap = new Map(queueItems.map(q => [q.nzoId, q]));
  const historyMap = new Map(historyItems.map(h => [h.nzoId, h]));

  // Post-download queue statuses (unpacking, verifying, etc.)
  const PROCESSING_STATUSES = new Set(['Verifying', 'Unpacking', 'Repairing', 'Moving', 'PP', 'Running']);

  for (const dl of activeDownloads) {
    const nzoId: string | null = dl.sabnzbd_nzo_id;
    if (!nzoId) continue;

    const historyItem = historyMap.get(nzoId);
    const queueItem = queueMap.get(nzoId);

    if (historyItem) {
      if (historyItem.status === 'Completed') {
        await updateDownloadStatus(dl.id, 'completed');
        // Track the completed game for future update checks
        if (dl.mediaItemId && dl.mediaItemTitle) {
          await ensureGameTracked(dl.mediaItemId, dl.mediaItemTitle);
        }
        if (historyItem.storagePath) {
          await updateDownloadIsoPath(dl.id, historyItem.storagePath);
        }
        // Auto post-process if enabled
        if (config.postProcessEnabled) {
          await postProcessDownload(dl.id, config.id, config.sabnzbdCompletePath ?? undefined, config.downloadPath ?? undefined);
        }
      } else if (historyItem.status === 'Failed') {
        await updateDownloadStatus(dl.id, 'failed', `SABnzbd: ${historyItem.status}`);
      } else {
        // Post-download processing (unpacking, moving, etc.) — not failed
        await updateDownloadStatus(dl.id, 'processing', undefined, 100);
      }
    } else if (queueItem) {
      let newStatus: string;
      if (queueItem.status === 'Downloading') {
        newStatus = 'downloading';
      } else if (PROCESSING_STATUSES.has(queueItem.status)) {
        newStatus = 'processing';
      } else {
        newStatus = 'queued';
      }
      await updateDownloadStatus(dl.id, newStatus, undefined, queueItem.percentage);
    }
  }

  return getUserDownloads(userId);
}

// ── Full workflow ─────────────────────────────────────────────────────────

export async function searchAndDownload(
  userId: string,
  mediaItemId: string | null,
  gameName: string,
  allowHypervisorOverride?: boolean,
): Promise<{ download: Download; nzbResult: NZBResult } | { error: string } | { hypervisorAvailable: true; hypervisorResults: NZBResult[]; gameName: string; error: string }> {
  await ensureDb();
  const config = await getConfig(userId);
  if (!config) return { error: 'Download configuration not found. Set up SABnzbd and NZBPlanet in Settings → Integrations.' };
  if (!config.nzbplanetApiKey || !config.sabnzbdHost || !config.sabnzbdApiKey) {
    return { error: 'SABnzbd or NZBPlanet not configured. Check Settings → Integrations.' };
  }

  const results = await searchNzbPlanet(gameName, config.nzbplanetApiKey);
  if (results.length === 0) {
    return { error: `No NZBs found for "${gameName}" on NZBPlanet.` };
  }

  // Filter to game-category results only (NZBPlanet can return Audio, XXX, etc.)
  const gameResults = results.filter(r => {
    const cat = r.category.toLowerCase();
    return !cat || cat.startsWith('games') || cat.startsWith('console');
  });

  const allowHv = allowHypervisorOverride ?? config.allowHypervisor ?? false;
  const best = autoPickBest(gameResults.length > 0 ? gameResults : results, config.preferredRepackers, allowHv);
  if (!best) {
    // Check if hypervisor-tagged quality results exist but were filtered out
    if (!allowHv) {
      const pool = gameResults.length > 0 ? gameResults : results;
      const qualityPool = filterQualityResults(pool);
      const hvResults = qualityPool.filter(r => hasHypervisorTags(r));
      if (hvResults.length > 0) {
        return {
          hypervisorAvailable: true,
          hypervisorResults: hvResults,
          gameName,
          error: `Only hypervisor-tagged releases found for "${gameName}".`,
        };
      }
    }
    return { error: `No quality releases found for "${gameName}". All results excluded (demos/updates).` };
  }

  const nzoId = await addNzbToSabnzbd(
    config.sabnzbdHost, config.sabnzbdPort ?? 8080,
    config.sabnzbdApiKey, config.sabnzbdUseSsl,
    best.nzbUrl, best.title,
  );

  if (!nzoId) {
    return { error: 'Failed to add NZB to SABnzbd. Check your SABnzbd configuration.' };
  }

  const download = await createDownload(userId, mediaItemId, gameName, best, nzoId);

  // Track the base game for future update checks
  if (mediaItemId) {
    await ensureGameTracked(mediaItemId, gameName);
  }

  // ── Queue matching updates (update/patch/hotfix for the same game) ──
  const updates = findMatchingUpdates(best.title, gameResults);
  for (const update of updates) {
    const updateNzoId = await addNzbToSabnzbd(
      config.sabnzbdHost, config.sabnzbdPort ?? 8080,
      config.sabnzbdApiKey, config.sabnzbdUseSsl,
      update.nzbUrl, update.title,
    );
    if (updateNzoId) {
      await createDownload(userId, mediaItemId, `${gameName} (Update)`, update, updateNzoId);
      if (mediaItemId) {
        await recordUpdateDownload(mediaItemId, gameName, update.title);
      }
    }
  }

  if (mediaItemId) {
    await recordWishlistSearch(userId, mediaItemId, download.id);
  }

  return { download, nzbResult: best };
}

// ── Game and ISO scan database handlers ──

export async function getScannedGamesFromDb(): Promise<any[]> {
  await ensureDb();
  const rows = _all('SELECT * FROM scanned_games', []);
  return rows.map((r: DbRow) => ({
    id: r.id,
    title: r.title,
    exePath: r.exe_path,
    localExePath: r.local_exe_path || undefined,
    installDir: r.install_dir,
    platform: r.platform,
    iconUrl: r.icon_url || undefined,
    posterUrl: r.poster_url || undefined,
    updateFiles: r.update_files ? JSON.parse(r.update_files) : undefined,
    otixMediaId: r.otix_media_id || undefined,
    otixMediaTitle: r.otix_media_title || undefined,
    otixMediaSlug: r.otix_media_slug || undefined,
    otixConfidence: r.otix_confidence != null ? Number(r.otix_confidence) : undefined,
    otixMatchSuggestion: r.otix_match_suggestion ? JSON.parse(r.otix_match_suggestion) : undefined,
  }));
}

export async function saveScannedGamesToDb(games: any[]): Promise<void> {
  await ensureDb();
  _run('DELETE FROM scanned_games');
  for (const g of games) {
    _run(`
      INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform, icon_url, poster_url,
        update_files, otix_media_id, otix_media_title, otix_media_slug,
        otix_confidence, otix_match_suggestion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      g.id,
      g.title,
      g.exePath,
      g.localExePath || null,
      g.installDir,
      g.platform,
      g.iconUrl || null,
      g.posterUrl || null,
      g.updateFiles ? JSON.stringify(g.updateFiles) : null,
      g.otixMediaId || null,
      g.otixMediaTitle || null,
      g.otixMediaSlug || null,
      g.otixConfidence != null ? g.otixConfidence : null,
      g.otixMatchSuggestion ? JSON.stringify(g.otixMatchSuggestion) : null,
    ]);
  }
}

export async function getScanPathsFromDb(): Promise<{ path: string; type: 'game' | 'iso' }[]> {
  await ensureDb();
  const rows = _all('SELECT * FROM game_scan_paths');
  return rows.map((r: DbRow) => ({
    path: r.path,
    type: r.type,
  }));
}

export async function saveScanPathsToDb(paths: { path: string; type: 'game' | 'iso' }[]): Promise<void> {
  await ensureDb();
  _run('DELETE FROM game_scan_paths');
  for (const p of paths) {
    _run('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)', [p.path, p.type]);
  }
}

export async function getLocalGamesMapFromDb(): Promise<Record<string, any>> {
  await ensureDb();
  const rows = _all('SELECT * FROM local_games_map');
  const map: Record<string, any> = {};
  for (const r of rows) {
    try {
      map[r.media_id] = JSON.parse(r.game_json);
    } catch (_) {}
  }
  return map;
}

export async function saveLocalGamesMapEntryToDb(mediaId: string, game: any | null): Promise<void> {
  await ensureDb();
  if (game) {
    _run('INSERT OR REPLACE INTO local_games_map (media_id, game_json) VALUES (?, ?)', [mediaId, JSON.stringify(game)]);
  } else {
    _run('DELETE FROM local_games_map WHERE media_id = ?', [mediaId]);
  }
}
