import { describe, it, expect } from 'vitest';

const PLUGINS_DIR = '../../../extensions/plugins';
const gameMatching = require(`${PLUGINS_DIR}/game-matching-pipeline/main.js`);
const igdbSource = require(`${PLUGINS_DIR}/igdb-source/main.js`);
const steamgriddbSource = require(`${PLUGINS_DIR}/steamgriddb-source/main.js`);

type Candidate = { mediaId: string; title: string; posterUrl?: string | null; logoUrl?: string | null; backdropUrl?: string | null } | null;
type Request = { queryId: string; title: string; externalIds?: Array<{ source: string; id: string }>; posterUrl?: string | null };

// ── Pipeline precedence (auto-discovered sources) ───────────────────────

const SOURCE_SERVICES = [
  { pluginId: 'steam-source', type: 'catalog-source', protocol: 'steam' },
  { pluginId: 'igdb-source', type: 'catalog-source', protocol: 'igdb' },
  { pluginId: 'steamgriddb-source', type: 'catalog-source', protocol: 'steamgrid' },
];

function steamId(request: Request): string | null {
  for (const ext of request.externalIds || []) {
    if (ext.source === 'steam' && /^\d+$/.test(ext.id)) return ext.id;
  }
  return null;
}

function makeAggregatorCtx(resolvers: { steam: (r: Request) => Candidate; igdb: (r: Request) => Candidate; steamgrid: (r: Request) => Candidate }) {
  const counts = { steam: 0, igdb: 0, steamgrid: 0 };
  const ctx = {
    async discover() { return SOURCE_SERVICES; },
    async call(targetId: string, _method: string, args: any) {
      const reqs: Request[] = (args && args.requests) || [];
      const fn = targetId === 'steam-source' ? (counts.steam++, resolvers.steam)
        : targetId === 'igdb-source' ? (counts.igdb++, resolvers.igdb)
        : (counts.steamgrid++, resolvers.steamgrid);
      return reqs.map((r) => ({ queryId: r.queryId, candidate: fn(r) }));
    },
  };
  return { ctx, counts };
}

const steamResolver = (r: Request) => {
  const id = steamId(r);
  return id ? { mediaId: `steam:${id}`, title: r.title, confidence: 0.9 } as Candidate : null;
};
const igdbResolver = () => ({ mediaId: 'igdb:42', title: 'something', confidence: 0.9 } as Candidate);
const steamgridResolver = () => ({ mediaId: 'steamgrid:7', title: 'something', confidence: 0.9 } as Candidate);

describe('game-matching-pipeline source precedence (auto-discovery)', () => {
  it('lets a deterministic steam-source win for a Steam game with a numeric appid', async () => {
    const { ctx, counts } = makeAggregatorCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'Helldivers 2', externalIds: [{ source: 'steam', id: '553850' }] },
    ]);
    expect(results[0].candidate).toMatchObject({ mediaId: 'steam:553850' });
    expect(counts).toEqual({ steam: 1, igdb: 0, steamgrid: 0 });
  });

  it('skips steam-source for a non-Steam game and lets igdb win', async () => {
    const { ctx, counts } = makeAggregatorCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'The First Descendant', externalIds: [{ source: 'epic', id: 'Jaguar' }] },
    ]);
    expect(results[0].candidate?.mediaId).toBe('igdb:42');
    expect(counts).toEqual({ steam: 0, igdb: 1, steamgrid: 0 });
  });

  it('falls through to igdb when steam-source has nothing (non-numeric appid)', async () => {
    const { ctx, counts } = makeAggregatorCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'The First Descendant', externalIds: [{ source: 'steam', id: 'not-a-number' }] },
    ]);
    expect(results[0].candidate?.mediaId).toBe('igdb:42');
    expect(counts).toEqual({ steam: 1, igdb: 1, steamgrid: 0 });
  });

  it('reaches steamgrid only when both steam and igdb miss', async () => {
    const { ctx, counts } = makeAggregatorCtx({ steam: () => null, igdb: () => null, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'Some Obscure Game' },
    ]);
    expect(results[0].candidate?.mediaId).toBe('steamgrid:7');
    expect(counts).toEqual({ steam: 1, igdb: 1, steamgrid: 1 });
  });

  it('collapses cross-store copies to the deterministic keyed identity', async () => {
    const { ctx, counts } = makeAggregatorCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'epic:Jaguar', title: 'Rocket League', externalIds: [{ source: 'epic', id: 'Jaguar' }] },
      { queryId: 'steam:252950', title: 'Rocket League', externalIds: [{ source: 'steam', id: '252950' }] },
    ]);
    // igdb answers the Epic copy, but the deterministic steam identity wins for both.
    expect(results[0].candidate?.mediaId).toBe('steam:252950');
    expect(results[1].candidate?.mediaId).toBe('steam:252950');
    expect(counts).toEqual({ steam: 1, igdb: 1, steamgrid: 0 });
  });
});

// ── igdb-source ──────────────────────────────────────────────────────────

function igdbCtx({ search = [], substring = [], initialCache = new Map() }: {
  search?: any[];
  substring?: any[];
  initialCache?: Map<string, any>;
}) {
  const cache = new Map(initialCache);
  const calls = { token: 0, search: 0, substring: 0, run: 0 };
  const config = new Map([['igdb_client_id', 'test-id'], ['igdb_client_secret', 'test-secret']]);
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    config: { get: async (k: string) => config.get(k) },
    async fetch(url: string, init: any) {
      if (url.includes('id.twitch.tv')) { calls.token++; return { status: 200, body: JSON.stringify({ access_token: 'tok-123' }) }; }
      const body: string = init.body;
      if (body.startsWith('search ')) { calls.search++; return { status: 200, body: JSON.stringify(search) }; }
      if (body.startsWith('fields ')) { calls.substring++; return { status: 200, body: JSON.stringify(substring) }; }
      return { status: 200, body: '[]' };
    },
    db: {
      async get(sql: string, p: any[]) { return cache.get(p[0]) || null; },
      async run(sql: string, p: any[]) {
        calls.run++;
        cache.set(p[0], { igdb_id: p[1], title: p[2], poster_url: p[3], backdrop_url: p[4], fetched_at: p[5] });
        return {};
      },
    },
  };
  return { ctx, calls, cache };
}

const IGDB_GAME = { id: 620, name: 'Portal 2', slug: 'portal-2', cover: { image_id: 'co1abc' }, artworks: [{ image_id: 'a1xyz' }] };

describe('igdb-source', () => {
  it('resolves nothing and never hits the network without a configured key', async () => {
    let fetched = 0;
    const ctx = {
      logger: {},
      config: { get: async () => undefined },
      db: {},
      fetch: async () => { fetched++; return { status: 200, body: '{}' }; },
    };
    const results = await igdbSource.data.resolve(ctx as any, { requests: [{ queryId: 'a', title: 'Portal 2' }] });
    expect(results[0].candidate).toBeNull();
    expect(fetched).toBe(0);
  });

  it('caches the OAuth token and resolves via IGDB search', async () => {
    const { ctx, calls, cache } = igdbCtx({ search: [IGDB_GAME] });
    const reqs = [
      { queryId: 'a', title: 'Portal 2' },
      { queryId: 'b', title: 'Portal 2' }, // same title → one search
    ];
    const out = await igdbSource.data.resolve(ctx, { requests: reqs });
    expect(out[0].candidate).toMatchObject({
      mediaId: 'igdb:620',
      title: 'Portal 2',
      posterUrl: 'https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg',
      backdropUrl: 'https://images.igdb.com/igdb/image/upload/t_1080p/a1xyz.jpg',
    });
    expect(out[1].candidate?.mediaId).toBe('igdb:620');
    expect(calls.token).toBe(1);
    expect(calls.search).toBe(1); // deduped by title
    expect(cache.get('title:portal n2')).toBeDefined();
  });

  it('falls back to a case-insensitive substring query when search is empty', async () => {
    const { ctx, calls } = igdbCtx({ search: [], substring: [IGDB_GAME] });
    const out = await igdbSource.data.resolve(ctx, { requests: [{ queryId: 'a', title: 'For The King' }] });
    expect(out[0].candidate).toMatchObject({ mediaId: 'igdb:620', title: 'Portal 2' });
    expect(calls.search).toBe(1);
    expect(calls.substring).toBe(1);
  });

  it('serves subsequent resolves entirely from cache', async () => {
    const { ctx, calls } = igdbCtx({ search: [IGDB_GAME] });
    const reqs = [{ queryId: 'a', title: 'Portal 2' }];
    await igdbSource.data.resolve(ctx, { requests: reqs });
    const before = { ...calls };
    const out = await igdbSource.data.resolve(ctx, { requests: reqs });
    expect(out[0].candidate?.mediaId).toBe('igdb:620');
    expect(calls.token).toBe(before.token);
    expect(calls.search).toBe(before.search);
  });

  it('returns a null candidate when neither query finds a game', async () => {
    const { ctx } = igdbCtx({ search: [], substring: [] });
    const out = await igdbSource.data.resolve(ctx, { requests: [{ queryId: 'a', title: 'Unknown Obscure Game' }] });
    expect(out[0].candidate).toBeNull();
  });

  it('exports pure helpers', () => {
    expect(igdbSource.imageUrl('co1abc')).toBe('https://images.igdb.com/igdb/image/upload/t_cover_big/co1abc.jpg');
    expect(igdbSource.imageUrl('a1', 't_1080p')).toBe('https://images.igdb.com/igdb/image/upload/t_1080p/a1.jpg');
    expect(igdbSource.cleanSearchTitle('  Rocket League™ ')).toBe('Rocket League');
    expect(igdbSource.cacheKeyFor('The Witcher 3: Wild Hunt')).toBe('title:the witcher n3 wild hunt');
    const candidate = igdbSource.candidateFromGame(IGDB_GAME, null);
    expect(candidate?.mediaId).toBe('igdb:620');
    expect(igdbSource.candidateFromGame({ id: 1 }, null)).toBeNull();
  });
});

// ── steamgriddb-source ───────────────────────────────────────────────────

function sgdbCtx({ gameOverrides = {}, searchResults = {}, initialCache = new Map() }: {
  gameOverrides?: Record<string, any>;
  searchResults?: Record<string, any[]>;
  initialCache?: Map<string, any>;
}) {
  const cache = new Map(initialCache);
  const calls = { games: 0, search: 0, grids: 0, logos: 0, heroes: 0 };
  const ctx = {
    logger: { info: () => {}, warn: () => {}, error: () => {} },
    config: { get: async (k: string) => (k === 'steamgriddb_api_key' ? 'sgdb-key' : undefined) },
    async fetch(url: string) {
      const path = url.replace('https://www.steamgriddb.com/api/v2', '').split('?')[0];
      if (path.startsWith('/games/steam/')) {
        calls.games++;
        const game = gameOverrides[path.split('/').pop()!];
        return game ? jsonResp({ success: true, data: game }) : jsonResp(null);
      }
      if (path.startsWith('/search/autocomplete/')) {
        calls.search++;
        const q = decodeURIComponent(path.split('/').pop()!);
        return jsonResp({ success: true, data: searchResults[q] || [] });
      }
      if (path.startsWith('/grids/game/')) { calls.grids++; return jsonResp({ success: true, data: [{ url: `https://grid.steamgriddb.com/${path.split('/').pop()}.png` }] }); }
      if (path.startsWith('/logos/game/')) { calls.logos++; return jsonResp({ success: true, data: [{ url: `https://logo.steamgriddb.com/${path.split('/').pop()}.png` }] }); }
      if (path.startsWith('/heroes/game/')) { calls.heroes++; return jsonResp({ success: true, data: [{ url: `https://hero.steamgriddb.com/${path.split('/').pop()}.jpg` }] }); }
      return jsonResp({ success: false, data: [] });
    },
    db: {
      async get(sql: string, p: any[]) { return cache.get(p[0]) || null; },
      async run(sql: string, p: any[]) {
        cache.set(p[0], { game_id: p[1], title: p[2], poster_url: p[3], logo_url: p[4], backdrop_url: p[5], fetched_at: p[6] });
        return {};
      },
    },
  };
  return { ctx, calls, cache };
}

function jsonResp(body: unknown) {
  return { status: body === null ? 404 : 200, body: JSON.stringify(body ?? {}) };
}

describe('steamgriddb-source', () => {
  it('resolves nothing without a configured key', async () => {
    let fetched = 0;
    const ctx = {
      logger: {},
      config: { get: async () => undefined },
      fetch: async () => { fetched++; return { status: 200, body: '{}' }; },
    };
    const out = await steamgriddbSource.data.resolve(ctx as any, { requests: [{ queryId: 'a', title: 'Portal 2' }] });
    expect(out[0].candidate).toBeNull();
    expect(fetched).toBe(0);
  });

  it('resolves a Steam game via platform-id lookup + grid/logo/hero artwork', async () => {
    const { ctx, calls } = sgdbCtx({ gameOverrides: { '620': { id: 1001, name: 'Portal 2' } } });
    const out = await steamgriddbSource.data.resolve(ctx, {
      requests: [{ queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] }],
    });
    expect(out[0].candidate).toMatchObject({
      mediaId: 'steamgrid:1001',
      title: 'Portal 2',
      posterUrl: 'https://grid.steamgriddb.com/1001.png',
      logoUrl: 'https://logo.steamgriddb.com/1001.png',
      backdropUrl: 'https://hero.steamgriddb.com/1001.jpg',
    });
    expect(calls.games).toBe(1);
    expect(calls.search).toBe(0);
    expect(calls.grids).toBe(1);
    expect(calls.logos).toBe(1);
    expect(calls.heroes).toBe(1);
  });

  it('falls back to title autocomplete when the platform mapping is missing', async () => {
    const { ctx, calls } = sgdbCtx({ searchResults: { 'Celeste': [{ id: 2002, name: 'Celeste' }] } });
    const out = await steamgriddbSource.data.resolve(ctx, {
      requests: [{ queryId: 'a', title: 'Celeste', externalIds: [{ source: 'steam', id: '620' }] }],
    });
    expect(out[0].candidate).toMatchObject({ mediaId: 'steamgrid:2002', title: 'Celeste' });
    expect(calls.games).toBe(1);
    expect(calls.search).toBe(1);
  });

  it('returns a null candidate for an unknown title', async () => {
    const { ctx } = sgdbCtx({});
    const out = await steamgriddbSource.data.resolve(ctx, { requests: [{ queryId: 'a', title: 'Unknown Obscure Game' }] });
    expect(out[0].candidate).toBeNull();
  });

  it('serves subsequent resolves entirely from cache', async () => {
    const { ctx, calls } = sgdbCtx({ gameOverrides: { '620': { id: 1001, name: 'Portal 2' } } });
    const reqs = [{ queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] }];
    await steamgriddbSource.data.resolve(ctx, { requests: reqs });
    const before = { ...calls };
    const out = await steamgriddbSource.data.resolve(ctx, { requests: reqs });
    expect(out[0].candidate?.mediaId).toBe('steamgrid:1001');
    expect(calls.games).toBe(before.games);
    expect(calls.grids).toBe(before.grids);
  });

  it('exports pure helpers', () => {
    expect(steamgriddbSource.platformLookup({ externalIds: [{ source: 'epic', id: 'Jaguar' }] })).toEqual({ slug: 'egs', uid: 'Jaguar' });
    expect(steamgriddbSource.platformLookup({ externalIds: [{ source: 'gog', id: '1' }] })).toBeNull();
    expect(steamgriddbSource.cacheKeyFor({ title: 'X', externalIds: [{ source: 'steam', id: '620' }] })).toBe('ext:steam:620');
    expect(steamgriddbSource.cacheKeyFor({ title: 'The Witcher 3: Wild Hunt', externalIds: [] })).toBe('title:the witcher n3 wild hunt');
    expect(steamgriddbSource.firstAssetUrl([{ url: 'u.png' }, { url: 'v.png' }])).toBe('u.png');
    expect(steamgriddbSource.firstAssetUrl([])).toBeNull();
    expect(steamgriddbSource.cleanSearchTitle('  Valorant™ ')).toBe('Valorant');
  });

  it('every data method exports a passing test', async () => {
    expect((await igdbSource.data.test()).passed).toBe(true);
    expect((await steamgriddbSource.data.test()).passed).toBe(true);
  });
});
