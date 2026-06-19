/**
 * Epic Games Scanner Plugin
 *
 * Syncs your Epic Games Store library into Otix using Epic's undocumented
 * internal API (same endpoints the official launcher uses).
 *
 * Capabilities:
 *   • OAuth login via browser (launcherAppClient2 credentials)
 *   • Paginated library scan — all owned games
 *   • Catalog enrichment — titles, covers, developer info
 *   • Local manifest scan — detect installed games
 *   • Token auto-refresh + persistent storage
 *
 * Credentials from: https://github.com/derrod/legendary (MIT license)
 */

const CREDENTIALS = {
  clientId: '34a02cf8f4414e29b15921876da36f9a',
  clientSecret: 'daafbccc737745039dffe53d94fc76cf',
};

const OAUTH_HOST = 'account-public-service-prod03.ol.epicgames.com';
const LIBRARY_HOST = 'library-service.live.use1a.on.epicgames.com';
const CATALOG_HOST = 'catalog-public-service-prod06.ol.epicgames.com';
const UA = 'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';
const EPIC_MANIFESTS_DIR = 'C:\\ProgramData\\Epic\\EpicGamesLauncher\\Data\\Manifests';

let _currentToken = null;

// ── HTTP helpers ─────────────────────────────────────────────────────

const basicAuth = () => Buffer.from(`${CREDENTIALS.clientId}:${CREDENTIALS.clientSecret}`).toString('base64');

async function epicPost(path, body, token) {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA };
  headers['Authorization'] = token ? `bearer ${token}` : `Basic ${basicAuth()}`;
  const res = await fetch(`https://${OAUTH_HOST}${path}`, { method: 'POST', headers, body });
  return { status: res.status, data: await res.json() };
}

async function epicGet(host, path, token) {
  const res = await fetch(`https://${host}${path}`, {
    headers: { Authorization: `bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' },
  });
  return { status: res.status, data: await res.json() };
}

// ── OAuth ────────────────────────────────────────────────────────────

function getAuthUrl() {
  const redirect = encodeURIComponent(
    `https://www.epicgames.com/id/api/redirect?clientId=${CREDENTIALS.clientId}&responseType=code`
  );
  return `https://www.epicgames.com/id/login?redirectUrl=${redirect}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, token_type: 'eg1' });
  return epicPost('/account/api/oauth/token', body);
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken, token_type: 'eg1' });
  return epicPost('/account/api/oauth/token', body);
}

async function verifyToken(token) {
  return epicGet(OAUTH_HOST, '/account/api/oauth/verify', token);
}

// ── Token management (ctx-based, callable from data methods) ─────────

function _getRt(ctx) { return ctx.config.get('refresh_token'); }
function _storeAuth(ctx, displayName, accountId, refreshToken) {
  ctx.config.set('display_name', displayName || '');
  ctx.config.set('account_id', accountId || '');
  ctx.config.set('refresh_token', refreshToken || '');
}
function _clearAuth(ctx) {
  ctx.config.set('refresh_token', '');
  ctx.config.set('account_id', '');
  ctx.config.set('display_name', '');
  _currentToken = null;
}

async function _ensureToken(ctx) {
  if (_currentToken) {
    const v = await verifyToken(_currentToken);
    if (v.status === 200) return _currentToken;
  }

  const rt = _getRt(ctx);
  if (!rt) return null;

  const r = await refreshAccessToken(rt);
  if (r.status !== 200) { _clearAuth(ctx); return null; }

  _currentToken = r.data.access_token;
  _storeAuth(ctx, r.data.display_name, r.data.account_id, r.data.refresh_token || rt);
  return _currentToken;
}

// ── Library Scan (paginated) ────────────────────────────────────────

async function fetchAllLibraryItems(token) {
  const items = [];
  let cursor = null;

  while (true) {
    let path = '/library/api/public/items?includeMetadata=true';
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

    const { status, data } = await epicGet(LIBRARY_HOST, path, token);
    if (status !== 200) return { success: false, error: data, partialItems: items };
    if (data.records) items.push(...data.records);

    const next = data.responseMetadata?.nextCursor;
    if (!next) break;
    cursor = next;
  }

  return { success: true, items };
}

// ── Catalog Enrichment ──────────────────────────────────────────────

async function enrichItem(token, ns, catalogId) {
  const { status, data } = await epicGet(
    CATALOG_HOST,
    `/catalog/api/shared/namespace/${ns}/bulk/items?id=${catalogId}&country=US&locale=en-US`,
    token
  );
  if (status !== 200) return null;
  const item = data[catalogId];
  if (!item) return null;

  const logo = item.keyImages?.find(i => i.type === 'DieselGameBoxLogo');
  const cover = item.keyImages?.find(i => i.type === 'DieselGameBoxTall');
  const thumb = item.keyImages?.find(i => i.type === 'Thumbnail');
  const bg = item.keyImages?.find(i => i.type === 'DieselStoreFrontWide');

  const cloudSaveFolder = item.customAttributes?.CloudSaveFolder?.value || null;
  const folderName = item.customAttributes?.FolderName?.value || null;
  const canRunOffline = item.customAttributes?.CanRunOffline?.value === 'true';
  const mainProcess = item.customAttributes?.MainWindowProcessName?.value || null;
  const thirdPartyApp = item.customAttributes?.ThirdPartyManagedApp?.value || null;

  const platforms = (item.releaseInfo || []).map(r => r.platform).filter(Boolean);

  // Classify content type from categories
  // Check non-game categories first — engine, editor, tool, etc should not be games
  let contentType = 'unknown';
  const catPaths = (item.categories || []).map(c => (c.path || ''));
  if (catPaths.some(p => p.startsWith('software/') || p === 'software' || p.startsWith('applications/') || p.startsWith('utilities/'))) contentType = 'software';
  else if (catPaths.some(p => p.startsWith('engines/') || p.startsWith('editor/') || p.startsWith('tools/'))) contentType = 'tool';
  else if (catPaths.some(p => p.startsWith('addons/') || p.startsWith('dlc/') || p.startsWith('mods/'))) contentType = 'addon';
  else if (catPaths.some(p => p.startsWith('games/') || p === 'games')) contentType = 'game';

  return {
    title: item.title, description: item.description || '',
    shortDescription: item.shortDescription || '',
    developer: item.developer || '', developerId: item.developerId || '',
    contentType,
    posterUrl: cover?.url || thumb?.url || null,
    logoUrl: logo?.url || null, bgUrl: bg?.url || null,
    keyImages: item.keyImages || [],
    categories: item.categories?.map(c => c.path) || [],
    platforms, releaseInfo: item.releaseInfo || [],
    cloudSaveFolder, folderName, canRunOffline,
    mainProcessName: mainProcess,
    thirdPartyManagedApp: thirdPartyApp,
    customAttributes: item.customAttributes || {},
    creationDate: item.creationDate || null,
    releaseDate: item.releaseDate || null,
  };
}

async function enrichBatch(token, libraryItems, maxConcurrency = 5) {
  const results = [];
  const queue = [...libraryItems];

  async function worker() {
    while (queue.length > 0) {
      const item = queue.shift();
      const meta = await enrichItem(token, item.namespace, item.catalogItemId);
      results.push({ library: item, catalog: meta });
    }
  }

  await Promise.all(Array.from({ length: Math.min(maxConcurrency, queue.length) }, () => worker()));
  return results;
}

// ── Local Manifest Scan ─────────────────────────────────────────────

function scanLocalManifests() {
  const fs = require('fs');
  const path = require('path');
  const games = [];

  try {
    if (!fs.existsSync(EPIC_MANIFESTS_DIR)) return games;
    const entries = fs.readdirSync(EPIC_MANIFESTS_DIR, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.item')) continue;
      try {
        const content = fs.readFileSync(path.join(EPIC_MANIFESTS_DIR, entry.name), 'utf-8');
        const m = JSON.parse(content);
        if (!m.DisplayName || !m.InstallLocation) continue;

        let exe = m.LaunchExecutable || '';
        if (exe && !path.isAbsolute(exe)) exe = path.join(m.InstallLocation, exe);
        if (exe && !fs.existsSync(exe)) {
          const dirFiles = fs.readdirSync(m.InstallLocation, { withFileTypes: true });
          const found = dirFiles.find(f =>
            f.isFile() && f.name.toLowerCase().endsWith('.exe') &&
            !f.name.toLowerCase().match(/unins|epic|eos/)
          );
          exe = found ? path.join(m.InstallLocation, found.name) : '';
        }

        games.push({
          appName: m.AppName || entry.name.replace('.item', ''),
          title: m.DisplayName,
          exePath: exe || m.InstallLocation,
          installDir: m.InstallLocation,
        });
      } catch { /* skip corrupt manifest */ }
    }
  } catch { /* epic launcher not installed */ }

  return games;
}

// ── Full Scan ────────────────────────────────────────────────────────

async function performScan(token, opts = {}) {
  const enrich = opts.enrich !== false;
  const includeLocal = opts.includeLocal !== false;

  // Phase 1: Library API (paginated)
  const lib = await fetchAllLibraryItems(token);
  if (!lib.success) return { success: false, error: 'Library API failed', games: [], total: 0 };

  // Phase 2: Catalog enrichment
  let enriched;
  if (enrich && lib.items.length > 0) {
    const batch = await enrichBatch(token, lib.items);
    enriched = batch.map(e => ({
      namespace: e.library.namespace,
      catalogItemId: e.library.catalogItemId,
      appName: e.library.appName,
      acquisitionDate: e.library.acquisitionDate,
      title: e.catalog?.title || e.library.appName || 'Unknown',
      developer: e.catalog?.developer || '',
      developerId: e.catalog?.developerId || '',
      description: e.catalog?.description || '',
      shortDescription: e.catalog?.shortDescription || '',
      contentType: e.catalog?.contentType || 'unknown',
      posterUrl: e.catalog?.posterUrl || null,
      logoUrl: e.catalog?.logoUrl || null,
      bgUrl: e.catalog?.bgUrl || null,
      categories: e.catalog?.categories || [],
      platforms: e.catalog?.platforms || [],
      releaseInfo: e.catalog?.releaseInfo || [],
      cloudSaveFolder: e.catalog?.cloudSaveFolder || null,
      folderName: e.catalog?.folderName || null,
      canRunOffline: e.catalog?.canRunOffline || false,
      mainProcessName: e.catalog?.mainProcessName || null,
      thirdPartyManagedApp: e.catalog?.thirdPartyManagedApp || null,
      keyImages: e.catalog?.keyImages || [],
      customAttributes: e.catalog?.customAttributes || {},
      releaseDate: e.catalog?.releaseDate || null,
    }));
  } else {
    enriched = lib.items.map(item => ({
      namespace: item.namespace, catalogItemId: item.catalogItemId,
      appName: item.appName, acquisitionDate: item.acquisitionDate,
      title: item.appName || 'Unknown', developer: '', developerId: '',
      description: '', shortDescription: '', contentType: 'unknown',
      posterUrl: null, logoUrl: null, bgUrl: null,
      categories: [], platforms: [], releaseInfo: [],
      cloudSaveFolder: null, folderName: null, canRunOffline: false,
      mainProcessName: null, thirdPartyManagedApp: null,
      keyImages: [], customAttributes: {}, releaseDate: null,
    }));
  }

  // Phase 2.5: Deduplicate � Epic API sometimes returns duplicate items
  const seenIds = new Set();
  enriched = enriched.filter(game => {
    const key = `${game.namespace}_${game.catalogItemId}`;
    if (seenIds.has(key)) return false;
    seenIds.add(key);
    return true;
  });

  // Phase 3: Local manifests (installed)
  const local = includeLocal ? scanLocalManifests() : [];
  const localByApp = {};
  for (const g of local) localByApp[g.appName] = g;
  for (const g of local) localByApp[g.title] = g;

  // Phase 4: Merge
  for (const game of enriched) {
    const l = localByApp[game.appName] || localByApp[game.title];
    if (l) {
      game.installed = true;
      game.exePath = l.exePath;
      game.installDir = l.installDir;
    } else {
      game.installed = false;
      game.exePath = null;
      game.installDir = null;
    }
    game.platform = 'epic';
    game.id = `epic_${game.namespace}_${game.catalogItemId}`;
  }

  return {
    success: true,
    games: enriched,
    total: enriched.length,
    installed: enriched.filter(g => g.installed).length,
    localOnly: local.filter(g => !enriched.find(e => e.appName === g.appName)).length,
  };
}

// ── Plugin Entry ────────────────────────────────────────────────────

module.exports = function epicGamesPlugin(ctx) {
  ctx.logger.info('Epic Games Scanner loaded');

  // Restore session from stored refresh token
  _ensureToken(ctx).then(token => {
    if (token) ctx.logger.info('Epic session restored from stored token');
  });

  // Auto-sync on Otix login
  const unsubEvents = ctx.events.on('otix:user:login', async () => {
    ctx.logger.info('User logged in — checking Epic auth');
    const token = await _ensureToken(ctx);
    if (token && ctx.config.get('auto_sync')) {
      ctx.logger.info('Auto-sync triggered');
      const result = await performScan(token);
      if (result.success) {
        ctx.notifications.send('Epic Sync Complete', `Found ${result.total} Epic games`);
      }
    }
  });

  return () => {
    unsubEvents();
    ctx.logger.info('Epic Games Scanner unloaded');
  };
};

// Module-level status export (shown in PluginConfigPanel)
module.exports.status = async (ctx) => {
  const rt = _getRt(ctx);
  const displayName = ctx.config.get('display_name');
  const accountId = ctx.config.get('account_id');

  if (!rt) {
    return { connected: false, message: 'Not connected to Epic Games' };
  }

  const token = await _ensureToken(ctx);
  if (!token) {
    return { connected: false, message: 'Session expired' };
  }

  const v = await verifyToken(token);
  if (v.status !== 200) {
    return { connected: false, message: 'Token invalid' };
  }

  return {
    connected: true,
    displayName: displayName || v.data.display_name || 'Unknown',
    accountId: accountId || v.data.account_id,
    expiresAt: v.data.expires_at,
  };
};

// Module-level test export (checked by loadPluginTest)
module.exports.test = async (ctx, config) => {
  try {
    const body = new URLSearchParams({ grant_type: 'client_credentials' });
    const { status } = await epicPost('/account/api/oauth/token', body);
    return { success: true, message: status === 200 ? 'Epic API reachable' : `Epic API responded (${status})` };
  } catch (err) {
    return { success: false, message: `Cannot reach Epic API: ${err.message}` };
  }
};

// ── Data Methods ────────────────────────────────────────────────────

module.exports.data = {

  'auth.login': async (ctx) => {
    let { BrowserWindow } = require('electron');

    const authUrl = getAuthUrl();
    ctx.logger.info('Opening Epic login window');

    return new Promise((resolve) => {
      const win = new BrowserWindow({
        width: 800,
        height: 700,
        title: 'Epic Games Login',
        autoHideMenuBar: true,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
        },
      });

      const redirectPath = 'id/api/redirect';

      const handleNav = (event, url) => {
        if (url.includes(redirectPath) && url.includes('authorizationCode')) {
          event.preventDefault();
          // Extract code from URL query or page content
          try {
            const u = new URL(url);
            const code = u.searchParams.get('authorizationCode');
            if (code) {
              ctx.logger.info('Auth code obtained from redirect URL');
              win.close();
              resolve({ success: true, code });
              return;
            }
          } catch {}
          // If not in URL, wait for page to load and extract from JSON body
        }
      };

      const handlePage = async () => {
        const currentUrl = win.webContents.getURL();
        if (currentUrl.includes(redirectPath)) {
          try {
            const content = await win.webContents.executeJavaScript('document.body.innerText');
            const data = JSON.parse(content);
            if (data.authorizationCode) {
              ctx.logger.info('Auth code obtained from page content');
              win.close();
              resolve({ success: true, code: data.authorizationCode });
              return;
            }
          } catch {}
        }
      };

      win.webContents.on('will-redirect', handleNav);
      win.webContents.on('will-navigate', handleNav);
      win.webContents.on('did-navigate', handlePage);
      win.webContents.on('did-navigate-in-page', handlePage);

      win.on('closed', () => {
        resolve({ success: false, error: 'Login window closed' });
      });

      win.loadURL(authUrl);
    });
  },

  'auth.handleCallback': async (ctx, code) => {
    if (!code) return { success: false, error: 'Missing authorization code' };

    const r = await exchangeCode(code.trim());
    if (r.status !== 200) {
      ctx.logger.error('Auth code exchange failed', r.data);
      return { success: false, error: r.data.errorMessage || 'Auth failed' };
    }

    _currentToken = r.data.access_token;
    _storeAuth(ctx, r.data.display_name, r.data.account_id, r.data.refresh_token);
    ctx.logger.info(`Authenticated as ${r.data.display_name}`);

    // Auto-sync
    let scanResult = null;
    if (ctx.config.get('auto_sync')) {
      scanResult = await performScan(_currentToken);
      if (scanResult.success) {
        ctx.notifications.send('Epic Sync Complete', `Found ${scanResult.total} games`);
      }
    }

    return {
      success: true,
      displayName: r.data.display_name,
      accountId: r.data.account_id,
      expiresAt: r.data.expires_at,
      scanResult,
    };
  },

  'auth.logout': async (ctx) => {
    _clearAuth(ctx);
    return { success: true };
  },

  'auth.status': async (ctx) => {
    const rt = _getRt(ctx);
    if (!rt) return { authenticated: false };

    const token = await _ensureToken(ctx);
    if (!token) return { authenticated: false, message: 'Session expired' };

    const v = await verifyToken(token);
    if (v.status !== 200) return { authenticated: false, message: 'Token invalid' };

    return {
      authenticated: true,
      displayName: ctx.config.get('display_name') || v.data.display_name,
      accountId: ctx.config.get('account_id') || v.data.account_id,
      expiresAt: v.data.expires_at,
    };
  },

  scan: async (ctx) => {
    const token = await _ensureToken(ctx);
    if (!token) return { success: false, error: 'Not authenticated', games: [] };
    ctx.logger.info('Starting full library scan');
    const result = await performScan(token);
    if (result.success) ctx.logger.info(`Scan complete: ${result.total} games`);
    return result;
  },

  'scan.installed': async (ctx) => {
    const games = scanLocalManifests();
    return {
      success: true,
      games: games.map(g => ({ ...g, platform: 'epic', id: `epic_local_${g.appName}` })),
      total: games.length,
    };
  },

  'slot.render': async (ctx, slotName) => {
    // For library:scan slot — return status + actions
    const rt = ctx.config.get('refresh_token');
    const displayName = ctx.config.get('display_name');
    const token = await _ensureToken(ctx);

    if (slotName === 'library:scan') {
      return {
        type: 'scan',
        label: 'Epic Games',
        status: {
          connected: !!token && !!rt,
          displayName: displayName || 'Connected',
        },
        actions: {
          scan: 'scan',
          login: 'auth.login',
          logout: 'auth.logout',
          status: 'auth.status',
        },
      };
    }
    if (slotName === 'matching:epic-library') {
      return { type: 'library', label: 'Epic Library' };
    }
    return null;
  },

  test: async (ctx, config) => {
    try {
      const body = new URLSearchParams({ grant_type: 'client_credentials' });
      const { status } = await epicPost('/account/api/oauth/token', body);
      return { success: true, message: status === 200 ? 'Epic API reachable' : `Epic API responded (${status})` };
    } catch (err) {
      return { success: false, message: `Cannot reach Epic API: ${err.message}` };
    }
  },
};
