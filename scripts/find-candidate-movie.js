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
        timeout: 15000,
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

// Let's test a few movie terms that have releases available
const candidates = [
  'Big Buck Bunny',
  'Tears of Steel',
  'Sita Sings the Blues',
  'Night of the Living Dead',
  'The Substance',
  'Terrifier 3',
  'Alien: Romulus',
  'Twisters',
  'Deadpool & Wolverine',
  'Beetlejuice Beetlejuice',
];

async function main() {
  for (const term of candidates) {
    try {
      const results = await radarrGet(`/movie/lookup?term=${encodeURIComponent(term)}`);
      const match = results[0];
      if (match) {
        console.log(`Candidate: "${match.title}" (${match.year}) tmdbId=${match.tmdbId} inLibrary=${Boolean(match.id)} hasFile=${Boolean(match.hasFile)}`);
      }
    } catch (e) {
      console.error('Error for', term, e.message);
    }
  }
}

main();
