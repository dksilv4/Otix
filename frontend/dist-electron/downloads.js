"use strict";
/**
 * Downloads module — SABnzbd + NZBPlanet integration for Electron.
 *
 * - SQLite (sql.js WASM) for local download/config/wishlist tracking.
 * - HTTP calls to SABnzbd (local network) and NZBPlanet API.
 * - Exported functions are called from main.ts IPC handlers.
 */
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchNzbPlanet = searchNzbPlanet;
exports.testNzbPlanetConnection = testNzbPlanetConnection;
exports.filterQualityResults = filterQualityResults;
exports.autoPickBest = autoPickBest;
exports.testSabnzbdConnection = testSabnzbdConnection;
exports.addNzbToSabnzbd = addNzbToSabnzbd;
exports.getSabnzbdQueue = getSabnzbdQueue;
exports.getSabnzbdHistory = getSabnzbdHistory;
exports.deleteSabnzbdJob = deleteSabnzbdJob;
exports.getConfig = getConfig;
exports.saveConfig = saveConfig;
exports.createDownload = createDownload;
exports.getDownload = getDownload;
exports.getUserDownloads = getUserDownloads;
exports.updateDownloadStatus = updateDownloadStatus;
exports.updateDownloadIsoPath = updateDownloadIsoPath;
exports.deleteDownload = deleteDownload;
exports.getPathMappings = getPathMappings;
exports.addPathMapping = addPathMapping;
exports.removePathMapping = removePathMapping;
exports.recordWishlistSearch = recordWishlistSearch;
exports.getWishlistTracking = getWishlistTracking;
exports.skipWishlistItem = skipWishlistItem;
exports.postProcessDownload = postProcessDownload;
exports.pollAndUpdateDownloads = pollAndUpdateDownloads;
exports.searchAndDownload = searchAndDownload;
exports.getScannedGamesFromDb = getScannedGamesFromDb;
exports.saveScannedGamesToDb = saveScannedGamesToDb;
exports.getScanPathsFromDb = getScanPathsFromDb;
exports.saveScanPathsToDb = saveScanPathsToDb;
exports.getLocalGamesMapFromDb = getLocalGamesMapFromDb;
exports.saveLocalGamesMapEntryToDb = saveLocalGamesMapEntryToDb;
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const electron_1 = require("electron");
// ── SQLite setup (sql.js — WASM, no native deps) ──────────────────────────
let db = null;
let dbPath = '';
async function initDb() {
    if (db)
        return db;
    try {
        const initSqlJs = require('sql.js');
        const SQL = await initSqlJs();
        dbPath = path_1.default.join(electron_1.app.getPath('userData'), 'otix-downloads.db');
        console.log('[DB] Path:', dbPath, 'exists:', fs_1.default.existsSync(dbPath));
        // Load existing DB or create new
        if (fs_1.default.existsSync(dbPath)) {
            const buffer = fs_1.default.readFileSync(dbPath);
            console.log('[DB] Loaded existing, size:', buffer.length, 'bytes');
            db = new SQL.Database(buffer);
        }
        else {
            console.log('[DB] No existing file, creating new');
            db = new SQL.Database();
        }
        _createTables();
        _migrateDb();
        console.log('[DB] Tables ready');
        // Debug: check row counts
        try {
            const dlCount = db.exec("SELECT COUNT(*) as cnt FROM downloads");
            const cfgCount = db.exec("SELECT COUNT(*) as cnt FROM download_configs");
            console.log('[DB] downloads rows:', JSON.stringify(dlCount));
            console.log('[DB] configs rows:', JSON.stringify(cfgCount));
        }
        catch (e) {
            console.log('[DB] count query failed:', e);
        }
        // Auto-save every 30 seconds
        setInterval(_saveDb, 30000);
        return db;
    }
    catch (err) {
        console.error('Failed to open downloads database:', err);
        return null;
    }
}
let _saveSeq = 0;
function _saveDb() {
    if (!db || !dbPath)
        return;
    try {
        const data = db.export();
        const dir = path_1.default.dirname(dbPath);
        if (!fs_1.default.existsSync(dir))
            fs_1.default.mkdirSync(dir, { recursive: true });
        fs_1.default.writeFileSync(dbPath, Buffer.from(data));
        _saveSeq++;
        if (_saveSeq <= 3 || _saveSeq % 20 === 0) {
            console.log('[DB] Saved to', dbPath, 'size:', data.length, 'save #', _saveSeq);
        }
    }
    catch (err) {
        console.error('Failed to save database:', err);
    }
}
// ── sql.js query helpers ─────────────────────────────────────────────────
function _run(sql, params = []) {
    if (!db)
        throw new Error('Database not available');
    db.run(sql, params);
    _saveDb(); // save after every write
}
function _get(sql, params = []) {
    if (!db)
        return null;
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        stmt.free();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        return row;
    }
    stmt.free();
    return null;
}
function _all(sql, params = []) {
    if (!db)
        return [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
        const cols = stmt.getColumnNames();
        const vals = stmt.get();
        const row = {};
        cols.forEach((c, i) => { row[c] = vals[i]; });
        rows.push(row);
    }
    stmt.free();
    return rows;
}
// ── Schema ────────────────────────────────────────────────────────────────
function _createTables() {
    db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      media_item_id TEXT,
      sabnzbd_nzo_id TEXT,
      status TEXT NOT NULL DEFAULT 'queued',
      nzb_name TEXT,
      nzb_size INTEGER,
      nzb_url TEXT,
      iso_path TEXT,
      error_message TEXT,
      percentage INTEGER DEFAULT 0,
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
    // Migration: add percentage column if missing
    try {
        db.run("ALTER TABLE downloads ADD COLUMN percentage INTEGER DEFAULT 0");
    }
    catch (_) { /* column exists */ }
    // Migration: add media_item_title column if missing
    try {
        db.run("ALTER TABLE downloads ADD COLUMN media_item_title TEXT");
    }
    catch (_) { /* column exists */ }
    db.run(`
    CREATE TABLE IF NOT EXISTS download_configs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL UNIQUE,
      sabnzbd_host TEXT,
      sabnzbd_port INTEGER,
      sabnzbd_api_key TEXT,
      sabnzbd_use_ssl INTEGER NOT NULL DEFAULT 0,
      nzbplanet_api_key TEXT,
      sabnzbd_complete_path TEXT,
      download_path TEXT,
      post_process_enabled INTEGER NOT NULL DEFAULT 1,
      auto_search_wishlist INTEGER NOT NULL DEFAULT 0,
      wishlist_interval_hours INTEGER NOT NULL DEFAULT 12,
      preferred_repackers TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS wishlist_download_tracking (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      media_item_id TEXT NOT NULL,
      last_searched_at TEXT,
      last_download_id TEXT,
      attempts INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, media_item_id)
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS download_path_mappings (
      id TEXT PRIMARY KEY,
      config_id TEXT NOT NULL,
      source_path TEXT NOT NULL,
      dest_path TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (config_id) REFERENCES download_configs(id) ON DELETE CASCADE
    )
  `);
    db.run('CREATE INDEX IF NOT EXISTS idx_downloads_user ON downloads(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_downloads_status ON downloads(status)');
    db.run('CREATE INDEX IF NOT EXISTS idx_wishlist_tracking_user ON wishlist_download_tracking(user_id)');
    db.run('CREATE INDEX IF NOT EXISTS idx_path_mappings_config ON download_path_mappings(config_id)');
    db.run(`
    CREATE TABLE IF NOT EXISTS scanned_games (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      exe_path TEXT NOT NULL,
      local_exe_path TEXT,
      install_dir TEXT NOT NULL,
      platform TEXT NOT NULL,
      icon_url TEXT,
      update_files TEXT,
      otix_media_id TEXT,
      otix_media_title TEXT,
      otix_media_slug TEXT,
      otix_confidence REAL,
      otix_match_suggestion TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS game_scan_paths (
      path TEXT PRIMARY KEY,
      type TEXT NOT NULL
    )
  `);
    db.run(`
    CREATE TABLE IF NOT EXISTS local_games_map (
      media_id TEXT PRIMARY KEY,
      game_json TEXT NOT NULL
    )
  `);
}
function _migrateDb() {
    try {
        db.run('ALTER TABLE download_configs ADD COLUMN sabnzbd_complete_path TEXT');
    }
    catch (_) { }
    try {
        db.run('ALTER TABLE download_configs ADD COLUMN post_process_enabled INTEGER NOT NULL DEFAULT 1');
    }
    catch (_) { }
    try {
        db.run('ALTER TABLE download_configs ADD COLUMN preferred_repackers TEXT');
    }
    catch (_) { }
}
function genId() {
    return 'dl_' + Math.random().toString(36).substring(2, 14);
}
// Ensure DB is initialized before any operation
let dbReady = null;
function ensureDb() {
    if (!dbReady)
        dbReady = initDb();
    return dbReady;
}
function parseXmlItems(xml) {
    const results = [];
    // Match <item>...</item> blocks (non-greedy, dotAll)
    const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
    let match;
    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1];
        const tag = (name) => {
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
async function searchNzbPlanet(query, apiKey, categoryIds = '1000,2000', limit = 20) {
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
            if (!items)
                return [];
            const itemList = Array.isArray(items) ? items : [items];
            const results = itemList.map((item) => ({
                guid: item.guid ?? '',
                title: item.title ?? '',
                size: parseInt(item.size ?? '0', 10),
                pubDate: item.pubDate ?? new Date().toISOString(),
                category: item.category ?? '',
                nzbUrl: item.link ?? '',
                detailsUrl: item.link ?? '',
            }));
            results.sort((a, b) => b.size - a.size);
            return results;
        }
        // Fallback: parse XML/RSS
        if (text.includes('<?xml') || text.includes('<rss') || text.includes('<channel')) {
            const items = parseXmlItems(text);
            console.log('[NZBPlanet search] XML parsed, items found:', items.length);
            if (items.length > 0) {
                console.log('[NZBPlanet search] First item:', { title: items[0].title, size: items[0].size, category: items[0].category });
            }
            return items;
        }
        console.error('[NZBPlanet search] Unknown response format:', text.substring(0, 300));
        return [];
    }
    finally {
        clearTimeout(timeout);
    }
}
async function testNzbPlanetConnection(apiKey) {
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
        }
        else if (text.includes('<?xml') || text.includes('<rss') || text.includes('<channel')) {
            console.log('[NZBPlanet test] XML response detected — API key works');
        }
        else {
            console.log('[NZBPlanet test] Unknown response format, first 200 chars:', text.substring(0, 200));
        }
        return true;
    }
    catch (err) {
        console.error('[NZBPlanet test] Exception:', err.message, err.cause || '');
        return false;
    }
}
// ── NZB result ranking ────────────────────────────────────────────────────
const DEMO_PATTERNS = ['demo', 'trial', 'beta', 'alpha'];
const UPDATE_PATTERNS = ['update', 'patch', 'dlc', 'addon', 'add-on', 'hotfix'];
const SCENE_TAGS = ['iso', 'repack', 'codex', 'crack', 'gog', 'elamigos', 'dodi', 'fitgirl', 'skidrow', 'flt'];
function isFullGame(result) {
    const title = result.title.toLowerCase();
    return !DEMO_PATTERNS.some(p => title.includes(p));
}
function isNotUpdate(result) {
    const title = result.title.toLowerCase();
    return !UPDATE_PATTERNS.some(p => title.includes(p));
}
function hasSceneTags(result) {
    const title = result.title.toLowerCase();
    return SCENE_TAGS.some(tag => title.includes(tag));
}
function hasPreferredRepacker(result, repackers) {
    if (repackers.length === 0)
        return false;
    const title = result.title.toLowerCase();
    return repackers.some(r => title.includes(r.toLowerCase()));
}
function filterQualityResults(results) {
    return results.filter(r => isFullGame(r) && isNotUpdate(r));
}
function autoPickBest(results, preferredRepackers) {
    const quality = filterQualityResults(results);
    if (quality.length === 0)
        return null;
    const repackerList = preferredRepackers
        ? preferredRepackers.split(',').map(r => r.trim()).filter(Boolean)
        : [];
    if (repackerList.length > 0) {
        const preferred = quality.filter(r => hasPreferredRepacker(r, repackerList));
        const others = quality.filter(r => !hasPreferredRepacker(r, repackerList));
        // Within preferred: scene first, then non-scene
        const prefScene = preferred.filter(r => hasSceneTags(r));
        const prefNonScene = preferred.filter(r => !hasSceneTags(r));
        const otherScene = others.filter(r => hasSceneTags(r));
        const otherNonScene = others.filter(r => !hasSceneTags(r));
        const ranked = [...prefScene, ...prefNonScene, ...otherScene, ...otherNonScene];
        return ranked[0];
    }
    const scene = quality.filter(r => hasSceneTags(r));
    const nonScene = quality.filter(r => !hasSceneTags(r));
    const ranked = [...scene, ...nonScene];
    return ranked[0];
}
function sabnzbdUrl(host, port, useSsl, mode, extraParams = {}) {
    const scheme = useSsl ? 'https' : 'http';
    const url = new URL(`${scheme}://${host}:${port}/api`);
    url.searchParams.set('output', 'json');
    url.searchParams.set('mode', mode);
    for (const [k, v] of Object.entries(extraParams)) {
        url.searchParams.set(k, v);
    }
    return url.toString();
}
async function testSabnzbdConnection(host, port, apiKey, useSsl) {
    try {
        const url = sabnzbdUrl(host, port, useSsl, 'version', { apikey: apiKey });
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        return !!(data?.version);
    }
    catch {
        return false;
    }
}
async function addNzbToSabnzbd(host, port, apiKey, useSsl, nzbUrl, name, category = 'games') {
    const url = sabnzbdUrl(host, port, useSsl, 'addurl', {
        apikey: apiKey,
        name: nzbUrl,
        nzbname: name,
        cat: category,
    });
    const response = await fetch(url, { signal: AbortSignal.timeout(30000) });
    const data = await response.json();
    if (data?.status && data?.nzo_ids?.length > 0)
        return data.nzo_ids[0];
    if (data?.nzo_ids?.[0])
        return data.nzo_ids[0];
    return null;
}
async function getSabnzbdQueue(host, port, apiKey, useSsl) {
    const url = sabnzbdUrl(host, port, useSsl, 'queue', { apikey: apiKey });
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        const slots = data?.queue?.slots ?? [];
        return slots.map((s) => ({
            nzoId: s.nzo_id ?? '',
            name: s.filename ?? '',
            size: parseInt(s.size ?? '0', 10),
            sizeLeft: parseInt(s.sizeleft ?? '0', 10),
            status: s.status ?? '',
            percentage: parseFloat(s.percentage ?? '0'),
        }));
    }
    catch {
        return [];
    }
}
async function getSabnzbdHistory(host, port, apiKey, useSsl, limit = 50) {
    const url = sabnzbdUrl(host, port, useSsl, 'history', { apikey: apiKey, limit: String(limit) });
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        const slots = data?.history?.slots ?? [];
        return slots.map((s) => ({
            nzoId: s.nzo_id ?? '',
            name: s.name ?? '',
            size: parseInt(s.size ?? '0', 10),
            status: s.status ?? '',
            storagePath: s.storage ?? '',
            completedAt: s.completed ? new Date(s.completed * 1000).toISOString() : '',
        }));
    }
    catch {
        return [];
    }
}
async function deleteSabnzbdJob(host, port, apiKey, useSsl, nzoId) {
    const url = sabnzbdUrl(host, port, useSsl, 'queue', {
        apikey: apiKey,
        name: 'delete',
        value: nzoId,
    });
    try {
        const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
        const data = await response.json();
        return data?.status === true;
    }
    catch {
        return false;
    }
}
function configRowToObj(row) {
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
    };
}
async function getConfig(_userId) {
    await ensureDb();
    // Desktop app: single user, return first config regardless of user_id
    const row = _get('SELECT * FROM download_configs ORDER BY updated_at DESC LIMIT 1', []);
    return row ? configRowToObj(row) : null;
}
async function saveConfig(config) {
    await ensureDb();
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
        preferred_repackers = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `, [
            config.userId,
            config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
            config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
            config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
            config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
            config.preferredRepackers,
            existing.id,
        ]);
        const cfg = await getConfig();
        if (!cfg)
            throw new Error('Failed to retrieve saved config');
        return cfg;
    }
    const id = config.id || genId();
    _run(`
    INSERT INTO download_configs (id, user_id, sabnzbd_host, sabnzbd_port, sabnzbd_api_key,
      sabnzbd_use_ssl, nzbplanet_api_key, sabnzbd_complete_path, download_path,
      post_process_enabled, auto_search_wishlist, wishlist_interval_hours, preferred_repackers)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
        id, config.userId, config.sabnzbdHost, config.sabnzbdPort, config.sabnzbdApiKey,
        config.sabnzbdUseSsl ? 1 : 0, config.nzbplanetApiKey,
        config.sabnzbdCompletePath, config.downloadPath, config.postProcessEnabled ? 1 : 0,
        config.autoSearchWishlist ? 1 : 0, config.wishlistIntervalHours,
        config.preferredRepackers,
    ]);
    const cfg = await getConfig();
    if (!cfg)
        throw new Error('Failed to retrieve saved config');
    return cfg;
}
function downloadRowToObj(row) {
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
async function createDownload(userId, mediaItemId, mediaItemTitle, nzbResult, sabnzbdNzoId) {
    await ensureDb();
    const id = genId();
    _run(`
    INSERT INTO downloads (id, user_id, media_item_id, media_item_title, sabnzbd_nzo_id, status,
      nzb_name, nzb_size, nzb_url)
    VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?)
  `, [id, userId, mediaItemId, mediaItemTitle, sabnzbdNzoId, nzbResult.title, nzbResult.size, nzbResult.nzbUrl]);
    return (await getDownload(id));
}
async function getDownload(id) {
    await ensureDb();
    const row = _get('SELECT * FROM downloads WHERE id = ?', [id]);
    return row ? downloadRowToObj(row) : null;
}
async function getUserDownloads(_userId) {
    await ensureDb();
    const rows = _all('SELECT * FROM downloads ORDER BY created_at DESC', []);
    return rows.map(downloadRowToObj);
}
async function updateDownloadStatus(id, status, errorMessage, percentage) {
    await ensureDb();
    if (status === 'completed') {
        _run('UPDATE downloads SET status = ?, percentage = 100, completed_at = datetime(\'now\'), updated_at = datetime(\'now\') WHERE id = ?', [status, id]);
    }
    else if (errorMessage) {
        _run('UPDATE downloads SET status = ?, error_message = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, errorMessage, percentage ?? 0, id]);
    }
    else {
        _run('UPDATE downloads SET status = ?, percentage = ?, updated_at = datetime(\'now\') WHERE id = ?', [status, percentage ?? 0, id]);
    }
}
async function updateDownloadIsoPath(id, isoPath) {
    await ensureDb();
    _run('UPDATE downloads SET iso_path = ?, updated_at = datetime(\'now\') WHERE id = ?', [isoPath, id]);
}
async function deleteDownload(id) {
    await ensureDb();
    _run('DELETE FROM downloads WHERE id = ?', [id]);
}
async function getPathMappings(configId) {
    await ensureDb();
    const rows = _all('SELECT * FROM download_path_mappings WHERE config_id = ? ORDER BY created_at', [configId]);
    return rows.map((r) => ({
        id: r.id,
        configId: r.config_id,
        sourcePath: r.source_path,
        destPath: r.dest_path,
        createdAt: r.created_at,
    }));
}
async function addPathMapping(configId, sourcePath, destPath) {
    await ensureDb();
    const id = genId();
    _run('INSERT INTO download_path_mappings (id, config_id, source_path, dest_path) VALUES (?, ?, ?, ?)', [id, configId, sourcePath, destPath]);
    const row = _get('SELECT * FROM download_path_mappings WHERE id = ?', [id]);
    if (!row)
        throw new Error('Failed to create path mapping');
    return {
        id: row.id,
        configId: row.config_id,
        sourcePath: row.source_path,
        destPath: row.dest_path,
        createdAt: row.created_at,
    };
}
async function removePathMapping(id) {
    await ensureDb();
    _run('DELETE FROM download_path_mappings WHERE id = ?', [id]);
}
// ── Wishlist tracking ─────────────────────────────────────────────────────
async function recordWishlistSearch(userId, mediaItemId, downloadId) {
    await ensureDb();
    const existing = _get('SELECT id, attempts FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);
    if (existing) {
        _run(`
      UPDATE wishlist_download_tracking SET
        last_searched_at = datetime('now'), last_download_id = ?,
        attempts = ?, updated_at = datetime('now')
      WHERE id = ?
    `, [downloadId, (existing.attempts ?? 0) + 1, existing.id]);
    }
    else {
        _run(`
      INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, last_searched_at, last_download_id, attempts)
      VALUES (?, ?, ?, datetime('now'), ?, 1)
    `, [genId(), userId, mediaItemId, downloadId]);
    }
}
async function getWishlistTracking(userId) {
    await ensureDb();
    const rows = _all('SELECT media_item_id, attempts, last_searched_at FROM wishlist_download_tracking WHERE skipped = 0', []);
    return rows.map((r) => ({
        mediaItemId: r.media_item_id,
        attempts: r.attempts,
        lastSearchedAt: r.last_searched_at,
    }));
}
async function skipWishlistItem(userId, mediaItemId) {
    await ensureDb();
    const existing = _get('SELECT id FROM wishlist_download_tracking WHERE media_item_id = ?', [mediaItemId]);
    if (existing) {
        _run('UPDATE wishlist_download_tracking SET skipped = 1 WHERE id = ?', [existing.id]);
    }
    else {
        _run('INSERT INTO wishlist_download_tracking (id, user_id, media_item_id, skipped) VALUES (?, ?, ?, 1)', [genId(), userId, mediaItemId]);
    }
}
// ── Post-processing ───────────────────────────────────────────────────────
function findIsoFiles(dirPath) {
    const results = [];
    try {
        const entries = fs_1.default.readdirSync(dirPath, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path_1.default.join(dirPath, entry.name);
            if (entry.isDirectory()) {
                results.push(...findIsoFiles(fullPath));
            }
            else if (entry.name.toLowerCase().endsWith('.iso')) {
                results.push(fullPath);
            }
        }
    }
    catch (_) { }
    return results;
}
async function postProcessDownload(downloadId, configId, fallbackSource, fallbackDest) {
    await ensureDb();
    const result = { success: false, isosFound: [], isosMoved: [], errors: [] };
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
    const pairs = mappings.map(m => ({ source: m.sourcePath, dest: m.destPath }));
    if (pairs.length === 0 && fallbackSource && fallbackDest) {
        pairs.push({ source: fallbackSource, dest: fallbackDest });
    }
    console.log('[postProcess] Effective pairs:', pairs);
    if (pairs.length === 0) {
        result.errors.push('No path mappings configured. Add a mapping in SABnzbd settings.');
        console.log('[postProcess] No pairs, aborting');
        return result;
    }
    const nzbName = dl.nzb_name ?? '';
    const baseName = path_1.default.basename(nzbName, path_1.default.extname(nzbName));
    // Path mappings are translation pairs: source=Unraid path prefix, dest=Windows equivalent
    // Translate SABnzbd paths to Windows-accessible paths before searching
    function translatePath(originalPath, pair) {
        // Normalize separators for comparison
        const normPath = originalPath.replace(/\//g, path_1.default.sep);
        const normSource = pair.source.replace(/\//g, path_1.default.sep);
        if (normPath.startsWith(normSource)) {
            return pair.dest + normPath.substring(normSource.length);
        }
        return null;
    }
    // Find ISOs — try each pair's translation
    for (const pair of pairs) {
        // Build candidate paths using the source prefix (Unraid paths)
        const sourceCandidates = [
            path_1.default.join(pair.source, baseName),
            path_1.default.join(pair.source, `_UNPACK_${baseName}`),
            path_1.default.join(pair.source, nzbName),
        ];
        if (dl.iso_path)
            sourceCandidates.unshift(dl.iso_path);
        // Translate source paths to Windows-accessible paths
        for (const candidate of sourceCandidates) {
            const translated = translatePath(candidate, pair);
            if (translated) {
                console.log('[postProcess] Translated:', candidate, '->', translated, 'exists:', fs_1.default.existsSync(translated));
                result.isosFound.push(...findIsoFiles(translated));
            }
            else {
                // No translation match — try directly if accessible
                console.log('[postProcess] Direct check:', candidate, 'exists:', fs_1.default.existsSync(candidate));
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
        const isoName = path_1.default.basename(isoPath);
        // Try the library destination first
        if (libraryDest) {
            try {
                fs_1.default.mkdirSync(libraryDest, { recursive: true });
            }
            catch (_) { }
            const destPath = path_1.default.join(libraryDest, isoName);
            let finalDest = destPath;
            let counter = 1;
            while (fs_1.default.existsSync(finalDest)) {
                const ext = path_1.default.extname(destPath);
                const nameNoExt = path_1.default.basename(destPath, ext);
                finalDest = path_1.default.join(libraryDest, `${nameNoExt}_${counter}${ext}`);
                counter++;
            }
            try {
                fs_1.default.renameSync(isoPath, finalDest);
                result.isosMoved.push({ from: isoPath, to: finalDest });
                movedCount++;
                moved = true;
            }
            catch (err) {
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
async function pollAndUpdateDownloads(userId) {
    await ensureDb();
    const config = await getConfig(userId);
    if (!config || !config.sabnzbdHost || !config.sabnzbdApiKey)
        return [];
    const activeDownloads = _all("SELECT * FROM downloads WHERE status IN ('queued', 'downloading', 'processing')", []);
    if (activeDownloads.length === 0)
        return [];
    const queueItems = await getSabnzbdQueue(config.sabnzbdHost, config.sabnzbdPort ?? 8080, config.sabnzbdApiKey, config.sabnzbdUseSsl);
    const historyItems = await getSabnzbdHistory(config.sabnzbdHost, config.sabnzbdPort ?? 8080, config.sabnzbdApiKey, config.sabnzbdUseSsl);
    const queueMap = new Map(queueItems.map(q => [q.nzoId, q]));
    const historyMap = new Map(historyItems.map(h => [h.nzoId, h]));
    // Post-download queue statuses (unpacking, verifying, etc.)
    const PROCESSING_STATUSES = new Set(['Verifying', 'Unpacking', 'Repairing', 'Moving', 'PP', 'Running']);
    for (const dl of activeDownloads) {
        const nzoId = dl.sabnzbd_nzo_id;
        if (!nzoId)
            continue;
        const historyItem = historyMap.get(nzoId);
        const queueItem = queueMap.get(nzoId);
        if (historyItem) {
            if (historyItem.status === 'Completed') {
                await updateDownloadStatus(dl.id, 'completed');
                if (historyItem.storagePath) {
                    await updateDownloadIsoPath(dl.id, historyItem.storagePath);
                }
                // Auto post-process if enabled
                if (config.postProcessEnabled) {
                    await postProcessDownload(dl.id, config.id, config.sabnzbdCompletePath ?? undefined, config.downloadPath ?? undefined);
                }
            }
            else if (historyItem.status === 'Failed') {
                await updateDownloadStatus(dl.id, 'failed', `SABnzbd: ${historyItem.status}`);
            }
            else {
                // Post-download processing (unpacking, moving, etc.) — not failed
                await updateDownloadStatus(dl.id, 'processing', undefined, 100);
            }
        }
        else if (queueItem) {
            let newStatus;
            if (queueItem.status === 'Downloading') {
                newStatus = 'downloading';
            }
            else if (PROCESSING_STATUSES.has(queueItem.status)) {
                newStatus = 'processing';
            }
            else {
                newStatus = 'queued';
            }
            await updateDownloadStatus(dl.id, newStatus, undefined, queueItem.percentage);
        }
    }
    return getUserDownloads(userId);
}
// ── Full workflow ─────────────────────────────────────────────────────────
async function searchAndDownload(userId, mediaItemId, gameName) {
    await ensureDb();
    const config = await getConfig(userId);
    if (!config)
        return { error: 'Download configuration not found. Set up SABnzbd and NZBPlanet in Settings → Integrations.' };
    if (!config.nzbplanetApiKey || !config.sabnzbdHost || !config.sabnzbdApiKey) {
        return { error: 'SABnzbd or NZBPlanet not configured. Check Settings → Integrations.' };
    }
    const results = await searchNzbPlanet(gameName, config.nzbplanetApiKey);
    if (results.length === 0) {
        return { error: `No NZBs found for "${gameName}" on NZBPlanet.` };
    }
    const best = autoPickBest(results, config.preferredRepackers);
    if (!best) {
        return { error: `No quality releases found for "${gameName}". All results excluded (demos/updates).` };
    }
    const nzoId = await addNzbToSabnzbd(config.sabnzbdHost, config.sabnzbdPort ?? 8080, config.sabnzbdApiKey, config.sabnzbdUseSsl, best.nzbUrl, best.title);
    if (!nzoId) {
        return { error: 'Failed to add NZB to SABnzbd. Check your SABnzbd configuration.' };
    }
    const download = await createDownload(userId, mediaItemId, gameName, best, nzoId);
    if (mediaItemId) {
        await recordWishlistSearch(userId, mediaItemId, download.id);
    }
    return { download, nzbResult: best };
}
// ── Game and ISO scan database handlers ──
async function getScannedGamesFromDb() {
    await ensureDb();
    const rows = _all('SELECT * FROM scanned_games', []);
    return rows.map((r) => ({
        id: r.id,
        title: r.title,
        exePath: r.exe_path,
        localExePath: r.local_exe_path || undefined,
        installDir: r.install_dir,
        platform: r.platform,
        iconUrl: r.icon_url || undefined,
        updateFiles: r.update_files ? JSON.parse(r.update_files) : undefined,
        otixMediaId: r.otix_media_id || undefined,
        otixMediaTitle: r.otix_media_title || undefined,
        otixMediaSlug: r.otix_media_slug || undefined,
        otixConfidence: r.otix_confidence != null ? Number(r.otix_confidence) : undefined,
        otixMatchSuggestion: r.otix_match_suggestion ? JSON.parse(r.otix_match_suggestion) : undefined,
    }));
}
async function saveScannedGamesToDb(games) {
    await ensureDb();
    _run('DELETE FROM scanned_games');
    for (const g of games) {
        _run(`
      INSERT OR REPLACE INTO scanned_games (
        id, title, exe_path, local_exe_path, install_dir, platform, icon_url,
        update_files, otix_media_id, otix_media_title, otix_media_slug,
        otix_confidence, otix_match_suggestion
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            g.id,
            g.title,
            g.exePath,
            g.localExePath || null,
            g.installDir,
            g.platform,
            g.iconUrl || null,
            g.updateFiles ? JSON.stringify(g.updateFiles) : null,
            g.otixMediaId || null,
            g.otixMediaTitle || null,
            g.otixMediaSlug || null,
            g.otixConfidence != null ? g.otixConfidence : null,
            g.otixMatchSuggestion ? JSON.stringify(g.otixMatchSuggestion) : null,
        ]);
    }
}
async function getScanPathsFromDb() {
    await ensureDb();
    const rows = _all('SELECT * FROM game_scan_paths');
    return rows.map((r) => ({
        path: r.path,
        type: r.type,
    }));
}
async function saveScanPathsToDb(paths) {
    await ensureDb();
    _run('DELETE FROM game_scan_paths');
    for (const p of paths) {
        _run('INSERT OR REPLACE INTO game_scan_paths (path, type) VALUES (?, ?)', [p.path, p.type]);
    }
}
async function getLocalGamesMapFromDb() {
    await ensureDb();
    const rows = _all('SELECT * FROM local_games_map');
    const map = {};
    for (const r of rows) {
        try {
            map[r.media_id] = JSON.parse(r.game_json);
        }
        catch (_) { }
    }
    return map;
}
async function saveLocalGamesMapEntryToDb(mediaId, game) {
    await ensureDb();
    if (game) {
        _run('INSERT OR REPLACE INTO local_games_map (media_id, game_json) VALUES (?, ?)', [mediaId, JSON.stringify(game)]);
    }
    else {
        _run('DELETE FROM local_games_map WHERE media_id = ?', [mediaId]);
    }
}
