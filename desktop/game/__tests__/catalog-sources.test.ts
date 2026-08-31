import { describe, it, expect, vi } from 'vitest';

const PLUGINS_DIR = '../../../extensions/plugins';
const gameMatching = require(`${PLUGINS_DIR}/game-matching-pipeline/main.js`);
const steamSource = require(`${PLUGINS_DIR}/steam-source/main.js`);

// ── Fakes ────────────────────────────────────────────────────────────────

type FetchResult = { status: number; body: string };
type CacheRow = Record<string, any>;
type Request = {
  queryId: string;
  title: string;
  externalIds?: Array<{ source: string; id: string }>;
  posterUrl?: string | null;
};
type Candidate = { mediaId: string; title: string; posterUrl?: string | null; confidence?: number } | null;

function makeSourceCtx({ fetchImpl, initialCache = new Map() }: {
  fetchImpl?: (url: string) => FetchResult;
  initialCache?: Map<string, CacheRow>;
}) {
  const cache = initialCache;
  const calls = { fetch: 0, run: 0, get: 0 };
  return {
    calls,
    ctx: {
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      async fetch(url: string): Promise<FetchResult> {
        calls.fetch++;
        return fetchImpl ? fetchImpl(url) : { status: 200, body: '{}' };
      },
      db: {
        async get(sql: string, params: any[]) {
          calls.get++;
          return cache.get(params[0]) || null;
        },
        async run(sql: string, params: any[]) {
          calls.run++;
          cache.set(params[0], {
            title: params[1], type: params[2], poster_url: params[3],
            logo_url: params[4], backdrop_url: params[5], fetched_at: params[6],
          });
          return {};
        },
      },
    },
  };
}

// ── Matching pipeline (auto-discovery of catalog sources) ───────────────

const SOURCE_SERVICES = [
  { pluginId: 'steam-source', type: 'catalog-source', protocol: 'steam' },
  { pluginId: 'igdb-source', type: 'catalog-source', protocol: 'igdb' },
  { pluginId: 'steamgriddb-source', type: 'catalog-source', protocol: 'steamgrid' },
];

function makePipelineCtx(resolvers: Record<string, (r: Request) => Candidate>) {
  const counts: Record<string, number> = Object.fromEntries(SOURCE_SERVICES.map((s) => [s.pluginId, 0]));
  const ctx = {
    async discover() { return SOURCE_SERVICES; },
    async call(targetId: string, _method: string, args: any) {
      counts[targetId] = (counts[targetId] || 0) + 1;
      const key = targetId === 'steam-source' ? 'steam'
        : targetId === 'igdb-source' ? 'igdb'
        : targetId === 'steamgriddb-source' ? 'steamgrid'
        : targetId;
      const fn = resolvers[key] || (() => null);
      return ((args && args.requests) || []).map((r: Request) => ({
        queryId: r.queryId,
        candidate: fn(r),
      }));
    },
  };
  return { ctx, counts };
}

const steamResolver = (r: Request): Candidate => {
  const ext = (r.externalIds || []).find((e) => e.source === 'steam' && /^\d+$/.test(e.id));
  return ext ? { mediaId: `steam:${ext.id}`, title: r.title, confidence: 0.9 } : null;
};
const igdbResolver = (): Candidate => ({ mediaId: 'igdb:620', title: 'something', confidence: 0.9 });
const steamgridResolver = (): Candidate => ({ mediaId: 'steamgrid:7', title: 'something', confidence: 0.9 });

describe('matching pipeline source discovery', () => {
  it('resolves a Steam game through the deterministic keyed source, first-wins', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'Helldivers 2', externalIds: [{ source: 'steam', id: '553850' }] },
    ]);
    expect(results[0].candidate).toMatchObject({ mediaId: 'steam:553850' });
    expect(counts).toEqual({ 'steam-source': 1, 'igdb-source': 0, 'steamgriddb-source': 0 });
  });

  it('skips steam-source entirely for a non-Steam game', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'The First Descendant', externalIds: [{ source: 'epic', id: 'Jaguar' }] },
    ]);
    expect(results[0].candidate?.mediaId).toBe('igdb:620');
    expect(counts).toEqual({ 'steam-source': 0, 'igdb-source': 1, 'steamgriddb-source': 0 });
  });

  it('falls through to fuzzy title-search when the keyed source has nothing', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'a', title: 'The First Descendant', externalIds: [{ source: 'steam', id: 'not-a-number' }] },
    ]);
    expect(results[0].candidate?.mediaId).toBe('igdb:620');
    expect(counts).toEqual({ 'steam-source': 1, 'igdb-source': 1, 'steamgriddb-source': 0 });
  });

  it('reaches every discovered source when none can answer', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: () => null, igdb: () => null, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [{ queryId: 'a', title: 'Some Obscure Game' }]);
    expect(results[0].candidate?.mediaId).toBe('steamgrid:7');
    expect(counts).toEqual({ 'steam-source': 1, 'igdb-source': 1, 'steamgriddb-source': 1 });
  });

  it('collapses cross-store copies to the deterministic keyed identity', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: steamResolver, igdb: igdbResolver, steamgrid: steamgridResolver });
    const results = await gameMatching.data.catalogMatch(ctx, [
      { queryId: 'epic:Jaguar', title: 'Rocket League', externalIds: [{ source: 'epic', id: 'Jaguar' }] },
      { queryId: 'steam:252950', title: 'Rocket League', externalIds: [{ source: 'steam', id: '252950' }] },
    ]);
    // igdb answers the Epic copy, but the deterministic steam identity wins for both.
    expect(results[0].candidate?.mediaId).toBe('steam:252950');
    expect(results[1].candidate?.mediaId).toBe('steam:252950');
    expect(counts).toEqual({ 'steam-source': 1, 'igdb-source': 1, 'steamgriddb-source': 0 });
  });

  it('self-matches when no source answers', async () => {
    const { ctx, counts } = makePipelineCtx({ steam: () => null, igdb: () => null, steamgrid: () => null });
    const results = await gameMatching.data.catalogMatch(ctx, [{ queryId: 'a:1', title: 'Some Obscure Game' }]);
    expect(results[0].candidate?.mediaId).toBe('a:1');
    expect(counts).toEqual({ 'steam-source': 1, 'igdb-source': 1, 'steamgriddb-source': 1 });
  });

  it('a throwing source is skipped without breaking the aggregate', async () => {
    const ctx = {
      async discover() { return [{ pluginId: 'bad', type: 'catalog-source', protocol: 'steam' }]; },
      async call() { throw new Error('network down'); },
    };
    const results = await gameMatching.data.catalogMatch(ctx, [{ queryId: 'a:1', title: 'Some Game' }]);
    expect(results[0].candidate?.mediaId).toBe('a:1');
  });

  it('never crashes when the ctx lacks discover/call (test or degraded ctx)', async () => {
    const results = await gameMatching.data.catalogMatch({}, [{ queryId: 'a:1', title: 'Some Game' }]);
    expect(results[0].candidate?.mediaId).toBe('a:1');
  });
});

// ── steam-source ─────────────────────────────────────────────────────────

const STEAM_PAYLOAD = {
  '620': { success: true, data: { type: 'game', name: 'Portal 2', steam_appid: 620 } },
  '570': { success: true, data: { type: 'game', name: 'Dota 2', steam_appid: 570 } },
};

describe('steam-source', () => {
  it('extracts a numeric Steam appid from externalIds', () => {
    expect(steamSource.extractSteamAppId({ externalIds: [{ source: 'steam', id: '620' }] })).toBe('620');
    expect(steamSource.extractSteamAppId({ externalIds: [{ source: 'epic', id: 'Jaguar' }] })).toBeNull();
    expect(steamSource.extractSteamAppId({ externalIds: [{ source: 'steam', id: 'not-a-number' }] })).toBeNull();
    expect(steamSource.extractSteamAppId({ externalIds: [] })).toBeNull();
  });

  it('parses an appdetails payload into a candidate with CDN artwork', () => {
    const candidate = steamSource.parseAppDetails('620', STEAM_PAYLOAD);
    expect(candidate).toMatchObject({
      mediaId: 'steam:620',
      title: 'Portal 2',
      confidence: 0.9,
    });
    expect(candidate?.posterUrl).toBe('https://cdn.akamai.steamstatic.com/steam/apps/620/header.jpg');
    expect(candidate?.logoUrl).toBe('https://cdn.akamai.steamstatic.com/steam/apps/620/logo.png');
    expect(candidate?.backdropUrl).toBe('https://cdn.akamai.steamstatic.com/steam/apps/620/library_hero.jpg');
  });

  it('returns null for a failed or nameless appdetails entry', () => {
    expect(steamSource.parseAppDetails('1', { '1': { success: false, data: {} } })).toBeNull();
    expect(steamSource.parseAppDetails('2', { '2': { success: true, data: {} } })).toBeNull();
    expect(steamSource.parseAppDetails('999', { '620': { success: true, data: {} } })).toBeNull();
  });

  it('builds a batched, keyless appdetails URL', () => {
    expect(steamSource.appdetailsUrl(['620', '570'])).toBe(
      'https://store.steampowered.com/api/appdetails?appids=620,570&filters=basic',
    );
  });

  it('fetches once for a batch, caches, and serves the second resolve from cache', async () => {
    const { ctx, calls } = makeSourceCtx({
      fetchImpl: () => ({ status: 200, body: JSON.stringify(STEAM_PAYLOAD) }),
    });
    const reqs = [
      { queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] },
      { queryId: 'b', title: 'Dota 2', externalIds: [{ source: 'steam', id: '570' }] },
    ];

    const first = await steamSource.data.resolve(ctx, { requests: reqs });
    expect(first[0].candidate).toMatchObject({ mediaId: 'steam:620', title: 'Portal 2' });
    expect(first[1].candidate).toMatchObject({ mediaId: 'steam:570', title: 'Dota 2' });
    expect(calls.fetch).toBe(1); // one batched request, not two

    const second = await steamSource.data.resolve(ctx, { requests: reqs });
    expect(second[0].candidate?.title).toBe('Portal 2');
    expect(second[1].candidate?.title).toBe('Dota 2');
    expect(calls.fetch).toBe(1); // cache hit — no refetch
    expect(calls.run).toBe(2); // one cache write per appid
  });

  it('returns null candidates for requests without a Steam appid', async () => {
    const { ctx, calls } = makeSourceCtx({});
    const results = await steamSource.data.resolve(ctx, {
      requests: [{ queryId: 'x', title: 'Something', externalIds: [] }],
    });
    expect(results[0].candidate).toBeNull();
    expect(calls.fetch).toBe(0);
  });

  it('serves cached hits and nulls the rest when the network fetch fails', async () => {
    const cache = new Map([
      ['620', { title: 'Portal 2', type: 'game', poster_url: 'p.jpg', logo_url: 'l.png', backdrop_url: 'b.jpg', fetched_at: Date.now() }],
    ]);
    const { ctx, calls } = makeSourceCtx({
      initialCache: cache,
      fetchImpl: () => { throw new Error('offline'); },
    });
    const results = await steamSource.data.resolve(ctx, {
      requests: [
        { queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] },
        { queryId: 'b', title: 'Dota 2', externalIds: [{ source: 'steam', id: '570' }] },
      ],
    });
    expect(results[0].candidate).toMatchObject({ mediaId: 'steam:620', title: 'Portal 2' });
    expect(results[1].candidate).toBeNull();
    expect(calls.fetch).toBe(1);
  });

  it('serves cached hits and nulls the rest on a non-200 response', async () => {
    const cache = new Map([
      ['570', { title: 'Dota 2', type: 'game', poster_url: 'p.jpg', logo_url: 'l.png', backdrop_url: 'b.jpg', fetched_at: Date.now() }],
    ]);
    const { ctx, calls } = makeSourceCtx({
      initialCache: cache,
      fetchImpl: () => ({ status: 500, body: 'err' }),
    });
    const results = await steamSource.data.resolve(ctx, {
      requests: [
        { queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] },
        { queryId: 'b', title: 'Dota 2', externalIds: [{ source: 'steam', id: '570' }] },
      ],
    });
    expect(results[0].candidate).toBeNull();
    expect(results[1].candidate).toMatchObject({ mediaId: 'steam:570', title: 'Dota 2' });
    expect(calls.fetch).toBe(1);
  });

  it('refetches a stale cache entry', async () => {
    const stale = new Map([
      ['620', { title: 'Old Name', type: 'game', poster_url: 'p.jpg', logo_url: 'l.png', backdrop_url: 'b.jpg', fetched_at: 0 }],
    ]);
    const { ctx } = makeSourceCtx({
      initialCache: stale,
      fetchImpl: () => ({ status: 200, body: JSON.stringify(STEAM_PAYLOAD) }),
    });
    const results = await steamSource.data.resolve(ctx, {
      requests: [{ queryId: 'a', title: 'Portal 2', externalIds: [{ source: 'steam', id: '620' }] }],
    });
    expect(results[0].candidate).toMatchObject({ mediaId: 'steam:620', title: 'Portal 2' });
  });

  it('every data method exports a passing test', async () => {
    const result = await steamSource.data.test();
    expect(result.passed).toBe(true);
  });
});
