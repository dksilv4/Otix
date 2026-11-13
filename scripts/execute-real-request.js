import http from 'http';

const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwidHlwZSI6ImFjY2VzcyIsImlhdCI6MTc5NDUyNDE1MywiZXhwIjoxNzk0NTI1MDUzfQ.4z7QcTyNdHPvitTRgPqH_0JS5ZSnbosl1Jqv22HzwgE';

const payload = JSON.stringify({
  title: 'Night of the Living Dead',
  tmdb_id: 10331,
  year: 1968,
  quality_profile_id: 5,
  root_folder_path: '/Media/Movies',
  monitored: true,
  search_for_movie: true,
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: 5173,
    path: '/api/v1/library/nodes/115/radarr/movies',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      Authorization: `Bearer ${token}`,
    },
    timeout: 30000,
  },
  (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      console.log('Status:', res.statusCode);
      console.log('Response:', data.slice(0, 500));
    });
  },
);

req.on('error', (e) => console.error('Error:', e.message));
req.write(payload);
req.end();
