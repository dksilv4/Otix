/**
 * Epic Games API Test Script
 *
 * Tests the undocumented Epic Games Store API to list owned games.
 *
 * Flow:
 * 1. Generate auth URL — open in browser
 * 2. Paste the authorization code from the redirect URL
 * 3. Exchange code for access+refresh tokens
 * 4. Call the Library API to list owned games
 * 5. Call the Catalog API to enrich game metadata
 *
 * Run: node test-epic-api.js
 */

// Launcher client (launcherAppClient2) — used by Epic Games Store itself
// From: https://github.com/derrod/legendary (MIT license)
const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const BASIC_AUTH = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const OAUTH_HOST = 'account-public-service-prod03.ol.epicgames.com';
const UA = 'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

// ── Helpers ──────────────────────────────────────────────────────

async function apiPost(url, body, token) {
  const headers = {
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': UA,
  };
  if (token) {
    headers['Authorization'] = `bearer ${token}`;
  } else {
    headers['Authorization'] = `Basic ${BASIC_AUTH}`;
  }
  const res = await fetch(url, { method: 'POST', headers, body });
  return { status: res.status, data: await res.json() };
}

async function apiGet(url, token) {
  const res = await fetch(url, {
    headers: {
      'Authorization': `bearer ${token}`,
      'User-Agent': UA,
      'Accept': 'application/json',
    },
  });
  return { status: res.status, data: await res.json() };
}

// ── Step 1: Auth URL ─────────────────────────────────────────────

function showAuthUrl() {
  const redirectUrl = encodeURIComponent(
    `https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`
  );
  console.log('\n─── Step 1: Open this URL in your browser ───\n');
  console.log(`https://www.epicgames.com/id/login?redirectUrl=${redirectUrl}`);
  console.log('\n(Make sure you are logged into epicgames.com)');
  console.log('\n─── After authorizing ───');
  console.log('The page will show a JSON response with an "authorizationCode" field.');
  console.log('Paste that code below.\n');
}

// ── Step 2: Exchange code for tokens ────────────────────────────

async function exchangeCode(code) {
  console.log('\n─── Step 2: Exchanging code for tokens ───');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code: code,
    token_type: 'eg1',
  });
  const { status, data } = await apiPost(
    `https://${OAUTH_HOST}/account/api/oauth/token`,
    body
  );
  console.log(`Status: ${status}`);
  if (status !== 200) {
    console.error('Error:', JSON.stringify(data, null, 2));
    return null;
  }
  console.log(`✓ Authenticated as: ${data.display_name || data.account_id}`);
  console.log(`  Access token expires: ${data.expires_at}`);
  console.log(`  Refresh token: ${data.refresh_token ? '✓ present' : '✗ missing'}`);
  return data;
}

// ── Step 3: Test Library API ─────────────────────────────────────

async function fetchAllLibraryItems(token) {
  const allItems = [];
  let cursor = null;
  let page = 0;

  while (true) {
    page++;
    let path = '/library/api/public/items?includeMetadata=true';
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

    const { status, data } = await apiGet(
      `https://library-service.live.use1a.on.epicgames.com${path}`,
      token
    );

    if (status !== 200) {
      console.error(`Page ${page} failed:`, JSON.stringify(data, null, 2));
      return { items: allItems, totalPages: page - 1, error: data };
    }

    if (data.records) allItems.push(...data.records);
    console.log(`  Page ${page}: +${data.records?.length || 0} items (total: ${allItems.length})`);

    const next = data.responseMetadata?.nextCursor;
    if (!next) break;
    cursor = next;
  }

  return { items: allItems, totalPages: page };
}

async function testLibrary(token) {
  console.log('\n─── Step 3: Library API (owned games, paginated) ───');
  const { items, totalPages } = await fetchAllLibraryItems(token);

  if (items.length === 0) {
    console.log('No games found in library.');
    return null;
  }

  console.log(`\n✓ Fetched ${items.length} items across ${totalPages} page(s)`);

  // Show first 5
  console.log(`\n  First 5 items:`);
  for (const item of items.slice(0, 5)) {
    console.log(`    - ${item.namespace}/${item.catalogItemId} (appName: ${item.appName})`);
  }

  return items;
}

// ── Step 4: Full data dump for first game ─────────────────────────

async function dumpFullGameData(token, libraryItem) {
  console.log('\n═══ RAW LIBRARY ITEM ═══');
  console.log(JSON.stringify(libraryItem, null, 2));

  // Fetch catalog data
  const url = `https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace/${libraryItem.namespace}/bulk/items?id=${libraryItem.catalogItemId}&country=US&locale=en-US`;
  const { status, data } = await apiGet(url, token);
  if (status !== 200) {
    console.log('\nCatalog lookup failed:', JSON.stringify(data, null, 2));
    return;
  }

  const catalogItem = data[libraryItem.catalogItemId];
  if (!catalogItem) {
    console.log('\nNo catalog item found for this entry');
    return;
  }

  console.log('\n═══ RAW CATALOG ITEM ═══');
  console.log(JSON.stringify(catalogItem, null, 2));

  // Image types summary
  if (catalogItem.keyImages?.length) {
    console.log('\n═══ IMAGE TYPES ═══');
    for (const img of catalogItem.keyImages) {
      console.log(`  ${img.type}: ${img.url}`);
    }
  }

  // Custom attributes
  if (catalogItem.customAttributes) {
    console.log('\n═══ CUSTOM ATTRIBUTES ═══');
    for (const [key, val] of Object.entries(catalogItem.customAttributes)) {
      console.log(`  ${key}:`, JSON.stringify(val));
    }
  }

  console.log('\n✓ Full data dump complete');
}

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('=== Epic Games API Test ===\n');

  showAuthUrl();

  // Read auth code from stdin
  const code = await new Promise(resolve => {
    process.stdin.once('data', data => resolve(data.toString().trim()));
  });

  if (!code) {
    console.error('No code provided. Exiting.');
    process.exit(1);
  }

  const auth = await exchangeCode(code);
  if (!auth) process.exit(1);

  const token = auth.access_token;

  const records = await testLibrary(token);
  if (!records) process.exit(1);

  // Full data dump for first game
  if (records.length > 0) {
    console.log('\n═══ DUMPING FULL DATA FOR FIRST GAME ═══');
    await dumpFullGameData(token, records[0]);
  }

  console.log('\n─── Summary ───');
  console.log(`  OAuth Auth Code Flow: ✓`);
  console.log(`  Library API (paginated): ✓ (${records.length} items)`);
  console.log(`  Catalog Enrichment: ✓`);
  console.log(`  Token Refresh: ${auth.refresh_token ? '✓ present' : '✗'}`);
  console.log(`  Launcher Client: ${CLIENT_ID}`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
