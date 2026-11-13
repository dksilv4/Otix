import http from 'http';

const RADARR_KEY = '0ca18af25cc84fefb065996f68a10098';

function radarrGet(path) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '192.168.1.14',
        port: 7878,
        path: `/radarr/main/api/v3${path}`,
        headers: { 'X-Api-Key': RADARR_KEY },
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            reject(new Error(`Parse error: ${data.slice(0, 100)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

async function check(term, tmdbId) {
  console.log(`Checking releases for ${term} (tmdbId=${tmdbId})...`);
  try {
    const results = await radarrGet(`/release?tmdbId=${tmdbId}`);
    if (Array.isArray(results)) {
      console.log(`Found ${results.length} releases!`);
      results.slice(0, 5).forEach((r) => {
        console.log(` - [${r.indexer}] ${r.title} (size: ${(r.size / 1e9).toFixed(2)} GB, protocol: ${r.protocol})`);
      });
    } else {
      console.log('Result:', results);
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

async function main() {
  await check('Night of the Living Dead', 10331);
  await check('Big Buck Bunny', 10378);
  await check('Tears of Steel', 133701);
}

main();
