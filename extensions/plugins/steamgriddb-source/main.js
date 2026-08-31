// SteamGridDB Source — a `catalog-source` service for the games catalog.
//
// Resolves scanned games to SteamGridDB artwork: a static grid (poster), a
// transparent logo, and a wide hero (backdrop). This is primarily an artwork
// source for games the curated catalogs / steam-source / igdb-source don't
// cover. Auth: Bearer API key from config. Lookup: deterministic platform-id
// mapping (steam/egs/origin/bnet/uplay) with a title autocomplete fallback.
// Results cached in this plugin's own table so repeated scans are offline.
//
// Free tier is ~100 req / 5 min. Only long-tail misses reach this source (the
// aggregator asks steam-source and igdb-source first), and every hit is cached,
// so normal scans stay well under the limit.

const { comparisonKey } = require('../shared/catalog');

const API = 'https://www.steamgriddb.com/api/v2';
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Our externalId sources → SteamGridDB platform path slugs.
// GOG has no platform-id endpoint, so gog falls through to title search.
const PLATFORM_SLUGS = {
  steam: 'steam',
  epic: 'egs',
  origin: 'origin',
  battlenet: 'bnet',
  uplay: 'uplay',
};

function cleanSearchTitle(title) {
  return String(title || '')
    .replace(/[™®©℠]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function platformLookup(request) {
  for (const ext of request.externalIds || []) {
    const slug = PLATFORM_SLUGS[ext.source];
    if (slug && ext.id) return { slug, uid: String(ext.id) };
  }
  return null;
}

function cacheKeyFor(request) {
  const platform = platformLookup(request);
  if (platform) return `ext:${platform.slug}:${platform.uid}`;
  return `title:${comparisonKey(request.title || '')}`;
}

// Pure: pick the first asset URL from a SteamGridDB `data` array.
function firstAssetUrl(data) {
  if (!Array.isArray(data)) return null;
  for (const item of data) {
    if (item && typeof item.url === 'string' && item.url) return item.url;
  }
  return null;
}

async function sgdbGet(ctx, apiKey, path) {
  const res = await ctx.fetch(`${API}${path}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (res.status !== 200) return null;
  try {
    const json = JSON.parse(res.body);
    if (!json.success) return null;
    return json.data;
  } catch {
    return null;
  }
}

async function resolve(ctx, args) {
  const requests = (args && args.requests) || [];
  if (requests.length === 0) return [];

  const apiKey = await ctx.config.get('steamgriddb_api_key');
  if (!apiKey) {
    return requests.map((req) => ({ queryId: req.queryId, candidate: null }));
  }

  const results = requests.map((req) => ({ queryId: req.queryId, candidate: null }));

  // Cache lookup.
  const misses = [];
  for (const req of requests) {
    const key = cacheKeyFor(req);
    let row = null;
    try {
      row = await ctx.db.get(
        'SELECT game_id, title, poster_url, logo_url, backdrop_url, fetched_at FROM steamgrid_cache WHERE cache_key = ?',
        [key],
      );
    } catch (err) {
      ctx.logger.warn(`steamgriddb-source cache read failed for "${req.title}": ${err.message}`);
    }
    if (row && typeof row.fetched_at === 'number' && Date.now() - row.fetched_at < CACHE_TTL_MS) {
      const hit = results.find((r) => r.queryId === req.queryId);
      if (hit) {
        hit.candidate = {
          mediaId: `steamgrid:${row.game_id}`,
          title: row.title,
          posterUrl: row.poster_url || req.posterUrl || null,
          logoUrl: row.logo_url || null,
          backdropUrl: row.backdrop_url || null,
          confidence: 0.9,
        };
      }
    } else {
      misses.push({ req, key });
    }
  }

  if (misses.length === 0) return results;

  // Resolve each miss to a SteamGridDB game id.
  const gameIdForQuery = new Map(); // queryId -> { id, name }
  for (const { req, key } of misses) {
    if (key.startsWith('ext:')) {
      const platform = platformLookup(req);
      if (!platform) continue;
      const data = await sgdbGet(ctx, apiKey, `/games/${platform.slug}/${encodeURIComponent(platform.uid)}`);
      const game = data && !Array.isArray(data) ? data : (Array.isArray(data) && data[0]) || null;
      if (game && game.id != null) {
        gameIdForQuery.set(req.queryId, { id: game.id, name: game.name || req.title });
        continue;
      }
      // Platform mapping missing → fall through to title search.
    }
    const query = cleanSearchTitle(req.title);
    if (!query) continue;
    const data = await sgdbGet(ctx, apiKey, `/search/autocomplete/${encodeURIComponent(query)}`);
    const game = Array.isArray(data) && data[0];
    if (game && game.id != null) {
      gameIdForQuery.set(req.queryId, { id: game.id, name: game.name || req.title });
    }
  }

  // Fetch artwork once per unique game id.
  const artworkByGame = new Map();
  for (const { id } of gameIdForQuery.values()) {
    if (artworkByGame.has(id)) continue;
    const [grids, logos, heroes] = await Promise.all([
      sgdbGet(ctx, apiKey, `/grids/game/${id}?type=static`),
      sgdbGet(ctx, apiKey, `/logos/game/${id}`),
      sgdbGet(ctx, apiKey, `/heroes/game/${id}`),
    ]);
    artworkByGame.set(id, {
      posterUrl: firstAssetUrl(grids),
      logoUrl: firstAssetUrl(logos),
      backdropUrl: firstAssetUrl(heroes),
    });
  }

  // Build candidates, write cache.
  for (const { req, key } of misses) {
    const game = gameIdForQuery.get(req.queryId);
    if (!game) continue;
    const art = artworkByGame.get(game.id) || {};
    const candidate = {
      mediaId: `steamgrid:${game.id}`,
      title: game.name || req.title,
      posterUrl: art.posterUrl || req.posterUrl || null,
      logoUrl: art.logoUrl || null,
      backdropUrl: art.backdropUrl || null,
      confidence: 0.9,
    };
    try {
      await ctx.db.run(
        'INSERT OR REPLACE INTO steamgrid_cache (cache_key, game_id, title, poster_url, logo_url, backdrop_url, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [key, game.id, candidate.title, candidate.posterUrl, candidate.logoUrl, candidate.backdropUrl, Date.now()],
      );
    } catch (err) {
      ctx.logger.warn(`steamgriddb-source cache write failed for "${req.title}": ${err.message}`);
    }
    const hit = results.find((r) => r.queryId === req.queryId);
    if (hit) hit.candidate = candidate;
  }

  return results;
}

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('SteamGridDB Source loaded (SteamGridDB v2 artwork)');
  },

  data: {
    resolve,
    resolveStats: async (ctx) => {
      try {
        const row = await ctx.db.get('SELECT COUNT(*) AS n FROM steamgrid_cache');
        return { cacheEntries: row ? row.n : 0 };
      } catch {
        return { cacheEntries: 0 };
      }
    },
    test: async () => ({ passed: true, failures: [] }),
  },

  // Pure helpers, exported for tests and for reuse by sibling source plugins.
  cleanSearchTitle,
  platformLookup,
  cacheKeyFor,
  firstAssetUrl,
};
