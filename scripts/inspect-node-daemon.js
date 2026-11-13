import http from 'http';

http.get('http://127.0.0.1:8090/health', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Health:', res.statusCode, data));
}).on('error', err => console.log('Err:', err.message));

http.get('http://127.0.0.1:8090/status', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => console.log('Status:', res.statusCode, data));
}).on('error', err => console.log('Err:', err.message));
