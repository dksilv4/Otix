// Steam Source — a `catalog-source` service for the games catalog.
//
// Resolves scanned Steam games to a canonical title + artwork using the keyless
// Steam Store API (appdetails), batched by numeric Steam appid from the game's
// externalIds. Results are cached in this plugin's own namespaced table, so
// repeated scans resolve offline after the first successful fetch.
//
// Any catalog:match plugin can consume this by declaring `sources` (see
// shared/catalog.js) — it is discovered via ctx.discover('catalog-source') and
// called via ctx.call(pluginId, 'resolve', { requests }).

const STEAM_SOURCE = 'steam';

// Cache entries older than this are refetched on the next scan.
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function extractSteamAppId(request) {
  for (const ext of request.externalIds || []) {
    if (ext.source === STEAM_SOURCE && /^\d+$/.test(String(ext.id))) return String(ext.id);
  }
  return null;
}

function cdnArtwork(appid) {
  return {
    posterUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`,
    logoUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/logo.png`,
    backdropUrl: `https://cdn.akamai.steamstatic.com/steam/apps/${appid}/library_hero.jpg`,
  };
}

// Pure: turn a raw appdetails payload for one appid into a catalog candidate.
// Payload shape: { [appid]: { success: true, data: { name, type, ... } } }.
function parseAppDetails(appid, payload) {
  const entry = payload && payload[appid];
  if (!entry || entry.success !== true || !entry.data || !entry.data.name) return null;
  return {
    mediaId: `steam:${appid}`,
    title: entry.data.name,
    ...cdnArtwork(appid),
    confidence: 0.9,
  };
}

// The keyless Steam Store endpoint. filters=basic keeps the payload small.
function appdetailsUrl(appids) {
  return `https://store.steampowered.com/api/appdetails?appids=${appids.join(',')}&filters=basic`;
}

function makeResolve() {
  return async (ctx, args) => {
    const requests = (args && args.requests) || [];
    if (requests.length === 0) return [];

    const keyed = requests.map((req) => ({ req, appid: extractSteamAppId(req) }));
    const unique = [...new Set(keyed.map((k) => k.appid).filter(Boolean))];
    if (unique.length === 0) {
      return keyed.map(({ req }) => ({ queryId: req.queryId, candidate: null }));
    }

    // Cache lookup (best-effort — a broken cache must not break resolution).
    const hits = new Map();
    const missing = [];
    for (const appid of unique) {
      let row = null;
      try {
        row = await ctx.db.get(
          'SELECT title, poster_url, logo_url, backdrop_url, fetched_at FROM steam_cache WHERE appid = ?',
          [appid],
        );
      } catch (err) {
        ctx.logger.warn(`steam-source cache read failed for ${appid}: ${err.message}`);
      }
      if (row && typeof row.fetched_at === 'number' && Date.now() - row.fetched_at < CACHE_TTL_MS) {
        hits.set(appid, row);
      } else {
        missing.push(appid);
      }
    }

    // Fetch the missing batch in one request.
    const fresh = new Map();
    if (missing.length > 0) {
      try {
        const res = await ctx.fetch(appdetailsUrl(missing));
        if (res && res.status === 200) {
          const payload = JSON.parse(res.body);
          const now = Date.now();
          for (const appid of missing) {
            const candidate = parseAppDetails(appid, payload);
            if (!candidate) continue;
            fresh.set(appid, candidate);
            try {
              await ctx.db.run(
                'INSERT OR REPLACE INTO steam_cache (appid, title, type, poster_url, logo_url, backdrop_url, fetched_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [appid, candidate.title, (payload[appid] && payload[appid].data && payload[appid].data.type) || null,
                 candidate.posterUrl, candidate.logoUrl, candidate.backdropUrl, now],
              );
            } catch (err) {
              ctx.logger.warn(`steam-source cache write failed for ${appid}: ${err.message}`);
            }
          }
        }
      } catch (err) {
        ctx.logger.warn(`steam-source fetch failed: ${err.message}`);
      }
    }

    return keyed.map(({ req, appid }) => {
      if (!appid) return { queryId: req.queryId, candidate: null };
      const row = hits.get(appid);
      if (row) {
        return {
          queryId: req.queryId,
          candidate: {
            mediaId: `steam:${appid}`,
            title: row.title,
            posterUrl: row.poster_url ?? req.posterUrl ?? null,
            logoUrl: row.logo_url ?? req.logoUrl ?? null,
            backdropUrl: row.backdrop_url ?? null,
            confidence: 0.9,
          },
        };
      }
      const candidate = fresh.get(appid);
      return { queryId: req.queryId, candidate: candidate || null };
    });
  };
}

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('Steam Source loaded (keyless Steam Store appdetails)');
  },

  data: {
    resolve: makeResolve(),
    resolveStats: async (ctx) => {
      try {
        const row = await ctx.db.get('SELECT COUNT(*) AS n FROM steam_cache');
        return { cacheEntries: row ? row.n : 0 };
      } catch {
        return { cacheEntries: 0 };
      }
    },
    test: async () => ({ passed: true, failures: [] }),
  },

  // Pure helpers, exported for tests and for reuse by sibling source plugins.
  extractSteamAppId,
  cdnArtwork,
  parseAppDetails,
  appdetailsUrl,
};
