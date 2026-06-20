/**
 * Dump raw Epic Games data for one game.
 * Run: node dump-epic-data.js <authorizationCode>
 */

const CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const BASIC = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64');
const UA = 'UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit';

async function post(path, body, token) {
  const h = { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA };
  h['Authorization'] = token ? `bearer ${token}` : `Basic ${BASIC}`;
  const r = await fetch(`https://account-public-service-prod03.ol.epicgames.com${path}`, { method: 'POST', headers: h, body });
  return r.json();
}

async function get(host, path, token) {
  const r = await fetch(`https://${host}${path}`, {
    headers: { Authorization: `bearer ${token}`, 'User-Agent': UA, Accept: 'application/json' },
  });
  return { status: r.status, data: await r.json() };
}

async function main() {
  const code = process.argv[2];
  if (!code) {
    console.log('Usage: node dump-epic-data.js <authorizationCode>');
    console.log('Get code from:');
    console.log(`https://www.epicgames.com/id/api/redirect?clientId=${CLIENT_ID}&responseType=code`);
    process.exit(1);
  }

  // Exchange code for token
  const tok = await post('/account/api/oauth/token', new URLSearchParams({ grant_type: 'authorization_code', code, token_type: 'eg1' }));
  if (!tok.access_token) { console.log('Auth failed:', JSON.stringify(tok, null, 2)); process.exit(1); }
  console.log('Authenticated as:', tok.display_name || tok.account_id);

  const token = tok.access_token;

  // Fetch one library item
  const lib = await get('library-service.live.use1a.on.epicgames.com',
    '/library/api/public/items?includeMetadata=true', token);

  if (!lib.data.records || lib.data.records.length === 0) {
    console.log('No items in library');
    process.exit(1);
  }

  const first = lib.data.records[0];
  console.log('\n═══ RAW LIBRARY ITEM ═══');
  console.log(JSON.stringify(first, null, 2));

  // Fetch catalog data for it
  const cat = await get('catalog-public-service-prod06.ol.epicgames.com',
    `/catalog/api/shared/namespace/${first.namespace}/bulk/items?id=${first.catalogItemId}&country=US&locale=en-US`, token);

  if (cat.status === 200 && cat.data[first.catalogItemId]) {
    console.log('\n═══ RAW CATALOG ITEM ═══');
    console.log(JSON.stringify(cat.data[first.catalogItemId], null, 2));
  } else {
    console.log('\nCatalog lookup failed:', JSON.stringify(cat.data, null, 2));
  }

  // Also list available image types
  const item = cat.data[first.catalogItemId];
  if (item?.keyImages) {
    console.log('\n═══ IMAGE TYPES ═══');
    for (const img of item.keyImages) {
      console.log(`  ${img.type}: ${img.url?.slice(0, 80)}`);
    }
  }

  // Show custom attributes
  if (item?.customAttributes) {
    console.log('\n═══ CUSTOM ATTRIBUTES ═══');
    for (const [key, val] of Object.entries(item.customAttributes)) {
      console.log(`  ${key}: ${JSON.stringify(val)}`);
    }
  }
}

main().catch(console.error);
