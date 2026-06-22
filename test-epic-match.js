/**
 * Epic Match Tester — tests matching strategies against the Otix backend
 * using REAL Epic Games library data (with catalog enrichment).
 *
 * Run: node test-epic-match.js <authorizationCode>
 *
 * 1. Fetches library items from Epic API
 * 2. Enriches with catalog data (real titles, developers, publishers)
 * 3. Sends to Otix /media/match/batch with different matching strategies
 * 4. Prints match quality report
 */

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const BASIC = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const OAUTH_HOST = 'account-public-service-prod03.ol.epicgames.com';
const LIBRARY_HOST = 'library-service.live.use1a.on.epicgames.com';
const CATALOG_HOST = 'catalog-public-service-prod06.ol.epicgames.com';
const UA = 'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';
const OTIX_BASE = process.env.OTIX_API || 'http://127.0.0.1:8000/api';
const OTIX_TOKEN = process.env.OTIX_TOKEN || '';

// ── HTTP helpers ──────────────────────────────────────────────────────

async function apiPost(host, path, body, token) {
  const h = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA };
  h['Authorization'] = token ? `bearer ${token}` : `Basic ${BASIC}`;
  const res = await fetch(`https://${host}${path}`, { method: 'POST', headers: h, body });
  const data = await res.json();
  return { status: res.status, data };
}

async function apiGet(host, path, token) {
  const res = await fetch(`https://${host}${path}`, {
    headers: { Authorization: `bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' },
  });
  const data = await res.json();
  return { status: res.status, data };
}

async function otixPost(path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (OTIX_TOKEN) headers['Authorization'] = `Bearer ${OTIX_TOKEN}`;
  const res = await fetch(`${OTIX_BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const data = await res.json();
  return { status: res.status, data };
}

// ── Epic API ──────────────────────────────────────────────────────────

async function getToken(code) {
  const body = new URLSearchParams({ grant_type: 'authorization_code', code, token_type: 'eg1' }).toString();
  const { status, data } = await apiPost(OAUTH_HOST, '/account/api/oauth/token', body);
  if (status !== 200 || !data.access_token) throw new Error('Auth failed: ' + JSON.stringify(data).slice(0, 300));
  return data;
}

async function fetchLibrary(token) {
  const all = [];
  let cursor = null;
  while (true) {
    let path = '/library/api/public/items?includeMetadata=true';
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;
    const { status, data } = await apiGet(LIBRARY_HOST, path, token);
    if (status !== 200) throw new Error('Library failed: ' + JSON.stringify(data).slice(0, 500));
    if (data.records) all.push(...data.records);
    const next = data.responseMetadata?.nextCursor;
    if (!next) break;
    cursor = next;
  }
  return all;
}

async function enrichCatalog(token, items) {
  const enriched = {};
  const byNs = {};
  for (const item of items) {
    const ns = item.namespace || 'fn';
    if (!byNs[ns]) byNs[ns] = new Set();
    byNs[ns].add(item.catalogItemId || item.offerId);
  }

  const fetchNs = async (ns, ids) => {
    const arr = [...ids].filter(Boolean);
    for (let i = 0; i < arr.length; i += 50) {
      const batch = arr.slice(i, i + 50);
      try {
        const { status, data } = await apiGet(CATALOG_HOST,
          `/catalog/api/shared/namespace/${ns}/bulk/items?id=${batch.join('&id=')}&country=US&locale=en-US`, token);
        if (status === 200 && data) {
          for (const [id, item] of Object.entries(data)) {
            enriched[id] = {
              title: item.title || null,
              developer: item.developerDisplayName || (item.seller && item.seller.name) || null,
              publisher: item.publisherDisplayName || (item.seller && item.seller.name) || null,
              categories: (item.categories || []).map(c => c.path || c).join(', '),
            };
          }
        }
      } catch (err) {
        console.warn('  Catalog batch failed for', ns, err.message);
      }
    }
  };

  console.log(`  Enriching ${Object.keys(byNs).length} namespace(s)...`);
  await Promise.race([
    Promise.all(Object.entries(byNs).map(([ns, ids]) => fetchNs(ns, ids))),
    new Promise(r => setTimeout(r, 30000)),
  ]);
  console.log(`  Enriched ${Object.keys(enriched).length} items`);
  return enriched;
}

// ── Main ──────────────────────────────────────────────────────────────

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.log('Usage: node test-epic-match.js <authorizationCode>');
    console.log('Get code from:');
    console.log(`https://www.epicgames.com/id/login?redirectUrl=${encodeURIComponent(
      `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`
    )}`);
    process.exit(1);
  }

  console.log('=== Epic Match Tester ===\n');

  // Step 1: Auth
  console.log('1. Authenticating...');
  const auth = await getToken(code);
  const token = auth.access_token;
  console.log(`   Account: ${auth.display_name || auth.account_id}\n`);

  // Step 2: Fetch library
  console.log('2. Fetching library...');
  const items = await fetchLibrary(token);
  console.log(`   ${items.length} items\n`);

  // Step 3: Enrich catalog
  console.log('3. Enriching catalog...');
  const enriched = await enrichCatalog(token, items);
  console.log('');

  // Step 4: Build enriched game list
  const SKIP = ['UE_', 'QuixelBridge_', 'MetaHumanSample_', 'Lyra_', 'FabPlugin_'];
  const games = [];
  for (const item of items) {
    const appName = item.appName || item.sandboxId || item.id;
    if (SKIP.some(p => appName.startsWith(p))) continue;

    const cat = enriched[item.catalogItemId || item.offerId] || {};
    const title = cat.title || item.sandboxName || item.appTitle || appName;

    games.push({
      appName,
      catalogItemId: item.catalogItemId || null,
      namespace: item.namespace || null,
      title: title || appName,
      developer: cat.developer || null,
      publisher: cat.publisher || null,
      categories: cat.categories || null,
    });
  }
  console.log(`4. Built ${games.length} games (skipped ${items.length - games.length})\n`);

  // Show a few examples
  console.log('   Sample enriched games:');
  for (const g of games.slice(0, 5)) {
    console.log(`   - "${g.title}" | dev: ${g.developer || '?'} | pub: ${g.publisher || '?'}`);
  }
  console.log('');

  // Step 5: Test matching with different strategies
  console.log('5. Testing matching strategies...\n');

  const strategies = [
    {
      name: 'title-only',
      build: (g) => ({ title: g.title, external_ids: [{ source: 'epic', id: g.appName }], media_type: 'game' }),
    },
    {
      name: 'title+developer',
      build: (g) => ({ title: g.title, developer: g.developer || undefined, external_ids: [{ source: 'epic', id: g.appName }], media_type: 'game' }),
    },
    {
      name: 'title+dev+pub',
      build: (g) => ({ title: g.title, developer: g.developer || g.publisher || undefined, publisher: g.publisher || g.developer || undefined, external_ids: [{ source: 'epic', id: g.appName }], media_type: 'game' }),
    },
    {
      name: 'title+dev+pub+cat',
      build: (g) => ({
        title: g.title,
        developer: g.developer || g.publisher || undefined,
        publisher: g.publisher || g.developer || undefined,
        external_ids: [{ source: 'epic', id: g.appName }, { source: 'epic_catalog', id: g.catalogItemId }].filter(e => e.id),
        media_type: 'game',
        metadata: g.categories ? { categories: g.categories } : undefined,
      }),
    },
  ];

  // Test with a sample of 20 games
  const SAMPLE = Math.min(20, games.length);
  const sample = games.slice(0, SAMPLE);

  for (const strat of strategies) {
    const batch = sample.map(strat.build);
    try {
      const { status, data } = await otixPost('/media/match/batch', { games: batch });
      if (status === 200 && data.matches) {
        const matched = data.matches.filter(m => m && m.confidence > 0).length;
        const highConf = data.matches.filter(m => m && m.confidence >= 0.8).length;
        console.log(`   ${strat.name.padEnd(22)} matched: ${String(matched).padStart(2)}/${SAMPLE}  high-conf(≥0.8): ${highConf}`);

        // Show first few matches
        if (matched > 0) {
          for (let i = 0; i < Math.min(3, data.matches.length); i++) {
            const m = data.matches[i];
            if (m && m.confidence > 0) {
              console.log(`     "${sample[i].title}" → "${m.title}" (${Math.round(m.confidence * 100)}%, ${m.match_type})`);
            }
          }
        }
      } else {
        console.log(`   ${strat.name.padEnd(22)} error: ${status}`);
      }
    } catch (err) {
      console.log(`   ${strat.name.padEnd(22)} failed: ${err.message}`);
    }
  }

  console.log('\n=== Done ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
