// Steam plugin for Otix
// Detects free-to-keep promotions via Steam's featured categories API.
// Cross-references ownership against user's linked Steam account via backend.

const https = require('https');

// ── HTTP Helpers ──────────────────────────────────────────────────────

function fetchJson(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (isHttps ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: opts.method || 'GET',
      headers: opts.headers || {},
    };
    const mod = isHttps ? https : require('http');
    const req = mod.request(reqOpts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(opts.timeout || 30000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

// ── HTML fetch helper (for scraping search results) ───────────────────

function fetchHtml(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const reqOpts = {
      hostname: parsed.hostname,
      port: 443,
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'text/html,*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        ...opts.headers,
      },
    };
    const req = https.request(reqOpts, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => { resolve({ status: res.statusCode, data: body }); });
    });
    req.on('error', reject);
    req.setTimeout(opts.timeout || 15000, () => { req.destroy(); reject(new Error('Request timed out')); });
    req.end();
  });
}

// ── Steam Free Promotions ─────────────────────────────────────────────

async function getCountry(ctx) {
  // 1. Plugin config override (user-set)
  try {
    const cfgCountry = await ctx.config.get('country');
    if (cfgCountry && typeof cfgCountry === 'string' && cfgCountry.trim()) {
      return cfgCountry.trim().toLowerCase();
    }
  } catch {}
  // 2. Fetch from Otix user profile
  try {
    const profile = await ctx.api.get('/user/me');
    if (profile?.country) return profile.country.toLowerCase();
  } catch {}
  // 3. Fallback
  return 'us';
}

function inferBaseGameTitle(title) {
  for (const sep of [': ', ' - ', ' – ', ' — ']) {
    if (title.includes(sep)) {
      const base = title.split(sep)[0].trim();
      if (base) return base;
    }
  }
  return null;
}

/**
 * Scrape Steam search results for 100%-off games, DLCs, and packs.
 * Sorts by price ascending, filters to specials only.
 * Checks up to maxPages (default 3) to catch all free-to-keep promotions.
 */
async function fetchFreeToKeepGames(country, ctx, maxPages) {
  maxPages = maxPages || 3;
  const allGames = [];

  for (let page = 1; page <= maxPages; page++) {
    const url = 'https://store.steampowered.com/search/results/' +
      '?query=&dynamic_data=&sort_by=Price_ASC&specials=1' +
      '&cc=' + country + '&l=english&page=' + page;

    let html;
    try {
      const { status, data } = await fetchHtml(url, { timeout: 15000 });
      if (status !== 200) {
        ctx.logger.warn('Steam search page ' + page + ' returned ' + status);
        break;
      }
      html = data;
    } catch (err) {
      ctx.logger.warn('Steam search page ' + page + ' failed: ' + err.message);
      break;
    }

    const rowRegex = /<a\s+[^>]*href="(https:\/\/store\.steampowered\.com\/(app|sub|bundle)\/(\d+)[^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    let foundOnPage = 0;
    let totalRows = 0;

    while ((match = rowRegex.exec(html)) !== null) {
      totalRows++;
      const fullLink = match[0];
      const kind = match[2];
      const itemId = match[3];
      const content = match[4];

      if (!fullLink.includes('data-discount="100"') && !fullLink.includes('-100%')) {
        continue;
      }

      const nameMatch = content.match(/<span class="title">([^<]+)<\/span>/);
      const origMatch = content.match(/discount_original_price">([^<]+)<\/div>/);
      const imgMatch = content.match(/<img[^>]*src="([^"]+)"/);

      if (!nameMatch) continue;

      const name = nameMatch[1].trim();
      const originalPrice = origMatch ? origMatch[1].trim() : null;
      let posterUrl = imgMatch ? imgMatch[1] : null;

      const nameLower = name.toLowerCase();
      const isPackName = nameLower.includes('pack') || nameLower.includes('bundle') || nameLower.includes('collection');
      const isDlcName = [' dlc', 'dlc ', 'expansion', 'add-on', 'addon', 'season pass', 'content pack'].some(w => nameLower.includes(w));

      let itemType = 'game';
      let baseGameTitle = null;
      let baseGameId = null;
      let description = null;

      if (kind === 'bundle') {
        itemType = 'bundle';
      } else if (kind === 'sub') {
        itemType = 'pack';
      } else if (isPackName) {
        itemType = 'pack';
      } else if (isDlcName) {
        itemType = 'dlc';
      }

      // Try fetching app details to confirm DLC / parent game info
      if (kind === 'app') {
        try {
          const detailRes = await fetchJson('https://store.steampowered.com/api/appdetails?appids=' + itemId, { timeout: 5000 });
          const appData = detailRes?.data?.[itemId]?.data;
          if (appData) {
            if (appData.type === 'dlc') {
              itemType = isPackName ? 'pack' : 'dlc';
            }
            if (appData.fullgame) {
              baseGameTitle = appData.fullgame.name;
              baseGameId = String(appData.fullgame.appid);
            }
            if (appData.header_image) {
              posterUrl = appData.header_image;
            }
            if (appData.short_description) {
              description = appData.short_description;
            }
          }
        } catch {}
      }

      if (!baseGameTitle && (itemType === 'dlc' || itemType === 'pack' || itemType === 'bundle')) {
        baseGameTitle = inferBaseGameTitle(name);
      }

      const claimUrl = kind === 'sub'
        ? `https://store.steampowered.com/sub/${itemId}`
        : kind === 'bundle'
          ? `https://store.steampowered.com/bundle/${itemId}`
          : `https://store.steampowered.com/app/${itemId}`;

      const sellerText = baseGameTitle
        ? (itemType === 'pack' ? `Pack for ${baseGameTitle}` : `DLC for ${baseGameTitle}`)
        : null;

      allGames.push({
        id: parseInt(itemId, 10) || itemId,
        title: name,
        posterUrl,
        originalPrice,
        freeEndDate: null,
        urlSlug: String(itemId),
        description,
        seller: sellerText,
        appId: parseInt(itemId, 10) || itemId,
        kind,
        itemType,
        baseGameTitle,
        baseGameId,
        claimUrl,
      });
      foundOnPage++;
    }

    ctx.logger.info('Steam search page ' + page + ': ' + foundOnPage + ' free items found');

    if (totalRows < 25) break;
  }

  return allGames;
}

// ── Ownership Check ───────────────────────────────────────────────────

async function getOwnedAppIds(ctx) {
  try {
    const resp = await ctx.api.get('/integrations/steam/owned-appids');
    const appids = resp?.appids;
    if (Array.isArray(appids)) return new Set(appids);
    return new Set();
  } catch (err) {
    ctx.logger.warn('Failed to fetch owned Steam app IDs: ' + err.message);
    return new Set();
  }
}

// ── Free Games Check ──────────────────────────────────────────────────

let _freeCache = { games: [], fetchedAt: 0 };

async function checkFreeGames(ctx) {
  ctx.logger.info('Checking Steam free games...');

  let country;
  try { country = await getCountry(ctx); } catch { country = 'us'; }

  let freeGames;
  try {
    freeGames = await fetchFreeToKeepGames(country, ctx);
  } catch (err) {
    ctx.logger.error('Steam free check failed: ' + err.message);
    return { success: false, error: err.message, freeGames: [] };
  }
  ctx.logger.info('Steam free games found: ' + freeGames.length);

  // Detect new games (not in last check)
  const lastRaw = await ctx.config.get('_last_free_games');
  let lastGames = [];
  try { if (lastRaw) lastGames = JSON.parse(lastRaw); } catch {}
  const lastIds = new Set(lastGames.map(g => g.id));
  const newGames = freeGames.filter(g => !lastIds.has(g.id));

  // Check ownership via backend
  const ownedIds = await getOwnedAppIds(ctx);
  const unclaimed = freeGames.filter(g => !ownedIds.has(g.appId));
  const alreadyOwned = freeGames.length - unclaimed.length;
  const isAuthenticated = ownedIds.size > 0;

  ctx.logger.info(unclaimed.length + ' unclaimed, ' + alreadyOwned + ' owned');

  // Notify for new free games
  if (newGames.length > 0) {
    const notify = await ctx.config.get('notify');
    if (notify !== false) {
      const names = newGames.map(g => g.title).join(', ');
      ctx.notifications.send({
        title: '🎮 Steam Free Games',
        body: newGames.length + ' new free game' + (newGames.length > 1 ? 's' : '') + ': ' + names,
      });
    }
  }

  _freeCache = { games: freeGames, fetchedAt: Date.now() };
  await ctx.config.set('_last_free_games', JSON.stringify(freeGames));
  await ctx.config.set('_last_free_games_check', Date.now());

  return {
    success: true,
    freeGames,
    newGames,
    isAuthenticated,
    alreadyOwned: isAuthenticated ? alreadyOwned : undefined,
  };
}

// ── Data Methods ──────────────────────────────────────────────────────

const dataMethods = {
  'free.check': async (ctx) => {
    return checkFreeGames(ctx);
  },

  'activity.poll': async (ctx) => {
    const activities = [];
    const now = Date.now();

    // Free games activity
    const lastFreeCheck = await ctx.config.get('_last_free_games_check');
    const freeStale = lastFreeCheck ? (now - lastFreeCheck) > 30 * 60 * 1000 : true;
    const lastFreeRaw = await ctx.config.get('_last_free_games');
    let cachedFree = [];
    try { if (lastFreeRaw) cachedFree = JSON.parse(lastFreeRaw); } catch {}

    if (cachedFree.length > 0 && !freeStale) {
      const names = cachedFree.map(g => g.title).join(', ');
      activities.push({
        id: 'steam-free-games',
        type: 'promotion',
        title: cachedFree.length + ' free Steam game' + (cachedFree.length > 1 ? 's' : ''),
        subtitle: names.length > 80 ? names.slice(0, 77) + '...' : names,
        status: 'completed',
        timestamp: lastFreeCheck || now,
        action: { label: 'Check', method: 'free.check' },
      });
    } else {
      activities.push({
        id: 'steam-free-games',
        type: 'info',
        title: 'Steam Free Games',
        subtitle: cachedFree.length === 0 ? 'No free games right now' : 'Check for free games',
        status: 'pending',
        timestamp: now,
        action: { label: 'Check Now', method: 'free.check' },
      });
    }

    return { activities, label: 'Steam' };
  },

  slotRender: async (ctx, location) => ({
    type: 'free-games',
    platform: 'steam',
    label: 'Steam',
    description: 'Detect free-to-keep Steam promotions',
    mediaTypes: ['games'],
  }),
};

// ── Plugin exports ────────────────────────────────────────────────────

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Steam plugin loaded');

    // Auto-check free games on startup
    ctx.config.get('auto_check').then((autoCheck) => {
      if (autoCheck !== false) {
        ctx.logger.info('Auto-checking Steam free games...');
        checkFreeGames(ctx).catch(err =>
          ctx.logger.error('Steam free games check failed: ' + err.message)
        );
      }
    });

    return () => {
      ctx.logger.info('Steam plugin unloaded');
    };
  },

  data: dataMethods,

  status: async (ctx) => {
    const lastCheck = await ctx.config.get('_last_free_games_check');
    const lastRaw = await ctx.config.get('_last_free_games');
    let cachedCount = 0;
    try { if (lastRaw) cachedCount = JSON.parse(lastRaw).length; } catch {}
    return {
      connected: true,
      last_check: lastCheck || null,
      cached_free_games: cachedCount,
    };
  },

  test: async (ctx) => {
    const country = await getCountry(ctx);
    try {
      const free = await fetchFreeToKeepGames(country, ctx, 1);
      return { passed: true };
    } catch (err) {
      return { passed: false, failures: [err.message] };
    }
  },

  slotRender: async (ctx, location) => ({
    type: 'free-games',
    platform: 'steam',
    label: 'Steam',
    description: 'Detect free-to-keep Steam promotions',
    mediaTypes: ['games'],
  }),
};
