import http from 'http';

const options = {
  hostname: '192.168.1.14',
  port: 7878,
  path: '/radarr/main/api/v3/movie',
  headers: { 'X-Api-Key': '0ca18af25cc84fefb065996f68a10098' },
  timeout: 10000,
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (c) => (data += c));
  res.on('end', () => {
    try {
      const movies = JSON.parse(data);
      console.log('Total movies in Radarr:', movies.length);
      const downloaded = movies.filter((m) => m.hasFile);
      const missing = movies.filter((m) => !m.hasFile);
      console.log('Downloaded:', downloaded.length, 'Missing:', missing.length);
      if (missing.length > 0) {
        console.log('Sample missing in Radarr:');
        missing.slice(0, 8).forEach((m) => {
          console.log(` - ${m.title} (${m.year}) [id=${m.id}, tmdbId=${m.tmdbId}]`);
        });
      }
    } catch (e) {
      console.error('Parse error:', e.message);
    }
  });
});
req.on('error', (e) => console.log('Error:', e.message));
req.end();
