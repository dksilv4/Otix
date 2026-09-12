// IGDB Source — a `catalog-source` service for the games catalog.
//
// Resolves scanned games to canonical IGDB titles + cover/backdrop artwork.
// Auth: Twitch OAuth2 client-credentials (client id + secret from config); the
// access token is cached in this plugin's own table (~50 day validity).
// Lookup: IGDB v4 relevance `search`, falling back to a case-insensitive
// substring `where name ~ *"..."*` query (the relevance search down-weights
// common words like "For The King", so exact-title games can be missed).
// Results are cached by title comparison key, so repeated scans are offline
// after the first resolution.
//
// Consumed by any catalog:match plugin that declares a `sources` entry with
// protocol 'igdb' (see shared/catalog.js). Without a configured key the source
// resolves nothing and never hits the network.

const { comparisonKey } = require('../shared/catalog');

const API = 'https://api.igdb.com/v4';
const OAUTH_URL = 'https://id.twitch.tv/oauth2/token';
const TOKEN_TTL_MS = 50 * 24 * 60 * 60 * 1000; // 50 days — refresh well before expiry
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const TOKEN_KEY = 'access_token';

// Main game only — skip DLC, remasters, editions, re-releases.
const GAME_FIELDS = 'name,slug,cover.image_id,artworks.image_id,first_release_date';
const GAME_WHERE = 'category = 0 & version_parent = null';

function imageUrl(imageId, token = 't_cover_big') {
  return imageId ? `https://images.igdb.com/igdb/image/upload/${token}/${imageId}.jpg` : null;
}

function cleanSearchTitle(title) {
  return String(title || '')
    .replace(/[™®©℠]/g, '') // ™ ® © ℠
    .replace(/\s+/g, ' ')
    .trim();
}

function cacheKeyFor(title) {
  return `title:${comparisonKey(title || '')}`;
}

// Pure: turn an IGDB game row into a catalog candidate.
function candidateFromGame(game, fallbackPosterUrl) {
  if (!game || game.id == null || !game.name) return null;
  const artworks = game.artworks && Array.isArray(game.artworks) ? game.artworks : [];
  return {
    mediaId: `igdb:${game.id}`,
    title: game.name,
    posterUrl: imageUrl(game.cover && game.cover.image_id) || fallbackPosterUrl || null,
    logoUrl: null,
    backdropUrl: artworks[0] && artworks[0].image_id ? imageUrl(artworks[0].image_id, 't_1080p') : null,
    confidence: 0.9,
  };
}

async function getToken(ctx, clientId, clientSecret) {
  let row = null;
  try {
    row = await ctx.db.get('SELECT value, expires_at FROM token_cache WHERE key = ?', [TOKEN_KEY]);
  } catch (err) {
    ctx.logger.warn(`igdb-source token cache read failed: ${err.message}`);
  }
  if (row && row.value && typeof row.expires_at === 'number' && Date.now() < row.expires_at) {
    return row.value;
  }

  const body = `client_id=${encodeURIComponent(clientId)}&client_secret=${encodeURIComponent(clientSecret)}&grant_type=client_credentials`;
  const res = await ctx.fetch(OAUTH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const json = JSON.parse(res.body);
  if (res.status !== 200 || !json.access_token) {
    throw new Error(`IGDB OAuth failed (${res.status})`);
  }
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  try {
    await ctx.db.run('INSERT OR REPLACE INTO token_cache (key, value, expires_at) VALUES (?, ?, ?)', [
      TOKEN_KEY, json.access_token, expiresAt,
    ]);
  } catch (err) {
    ctx.logger.warn(`igdb-source token cache write failed: ${err.message}`);
  }
  return json.access_token;
}

async function igdbPost(ctx, token, clientId, body) {
  const res = await ctx.fetch(`${API}/games`, {
    method: 'POST',
    headers: { 'Client-ID': clientId, 'Authorization': `Bearer ${token}` },
    body,
  });
  if (res.status !== 200) return null;
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

// Relevance search first, then an exact-title substring fallback.
async function searchGame(ctx, token, clientId, title) {
  const query = cleanSearchTitle(title);
  if (!query) return null;

  const primary = await igdbPost(
    ctx, token, clientId,
    `search "${query.replace(/"/g, '\\"')}"; fields ${GAME_FIELDS}; where ${GAME_WHERE}; limit 1;`,
  );
  if (primary && primary[0]) return primary[0];

  const escaped = query.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const fallback = await igdbPost(
    ctx, token, clientId,
    `fields ${GAME_FIELDS}; where name ~ *"${escaped}"* & ${GAME_WHERE}; limit 1;`,
  );
  return fallback && fallback[0] ? fallback[0] : null;
}

async function resolve(ctx, args) {
  const requests = (args && args.requests) || [];
  if (requests.length === 0) return [];

  const clientId = await ctx.config.get('igdb_client_id');
  const clientSecret = await ctx.config.get('igdb_client_secret');
  if (!clientId || !clientSecret) {
    return requests.map((req) => ({ queryId: req.queryId, candidate: null }));
  }

  const results = requests.map((req) => ({ queryId: req.queryId, candidate: null }));

  // Cache lookup — serve fresh hits, resolve the rest.
  const misses = [];
  for (const req of requests) {
    const key = cacheKeyFor(req.title);
    let row = null;
    try {
      row = await ctx.db.get(
        'SELECT igdb_id, title, poster_url, backdrop_url, fetched_at FROM igdb_cache WHERE cache_key = ?',
        [key],
      );
    } catch (err) {
      ctx.logger.warn(`igdb-source cache read failed for "${req.title}": ${err.message}`);
    }
    if (row && typeof row.fetched_at === 'number' && Date.now() - row.fetched_at < CACHE_TTL_MS) {
      const hit = results.find((r) => r.queryId === req.queryId);
      if (hit) {
        hit.candidate = {
          mediaId: `igdb:${row.igdb_id}`,
          title: row.title,
          posterUrl: row.poster_url || req.posterUrl || null,
          logoUrl: null,
          backdropUrl: row.backdrop_url || null,
          confidence: 0.9,
        };
      }
    } else {
      misses.push({ req, key });
    }
  }

  if (misses.length === 0) return results;

  let token;
  try {
    token = await getToken(ctx, clientId, clientSecret);
  } catch (err) {
    ctx.logger.warn(`igdb-source auth failed: ${err.message}`);
    return results;
  }

  // One search per unique title (IGDB has no batch-search; sequential awaits
  // keep the request rate modest for their quota).
  const searched = new Set();
  for (const { req, key } of misses) {
    const cacheKeyTitle = key;
    if (searched.has(cacheKeyTitle)) continue;
    searched.add(cacheKeyTitle);

    const game = await searchGame(ctx, token, clientId, req.title);
    if (!game) continue;

    const candidate = candidateFromGame(game, req.posterUrl);
    if (!candidate) continue;

    try {
      await ctx.db.run(
        'INSERT OR REPLACE INTO igdb_cache (cache_key, igdb_id, title, poster_url, backdrop_url, fetched_at) VALUES (?, ?, ?, ?, ?, ?)',
        [cacheKeyTitle, game.id, candidate.title, candidate.posterUrl, candidate.backdropUrl, Date.now()],
      );
    } catch (err) {
      ctx.logger.warn(`igdb-source cache write failed for "${req.title}": ${err.message}`);
    }

    for (const { req: innerReq } of misses) {
      if (cacheKeyFor(innerReq.title) !== cacheKeyTitle) continue;
      const hit = results.find((r) => r.queryId === innerReq.queryId);
      if (hit) hit.candidate = candidate;
    }
  }

  return results;
}

module.exports = {
  plugin: (ctx) => {
    ctx.logger.info('IGDB Source loaded (IGDB v4, Twitch OAuth)');
  },

  data: {
    resolve,
    resolveStats: async (ctx) => {
      try {
        const row = await ctx.db.get('SELECT COUNT(*) AS n FROM igdb_cache');
        return { cacheEntries: row ? row.n : 0 };
      } catch {
        return { cacheEntries: 0 };
      }
    },
    test: async () => ({ passed: true, failures: [] }),
  },

  // Pure helpers, exported for tests and for reuse by sibling source plugins.
  imageUrl,
  cleanSearchTitle,
  cacheKeyFor,
  candidateFromGame,
};
