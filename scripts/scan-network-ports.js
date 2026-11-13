import net from 'net';

const host = '192.168.1.28';
const commonPorts = [
  7878, // Radarr
  8989, // Sonarr
  8686, // Lidarr
  8787, // Readarr
  9696, // Prowlarr
  5055, // Overseerr / Jellyseerr
  8080, // SABnzbd
  9090,
  6767, // Bazarr
  8096, // Jellyfin
  32400, // Plex
  8181, // Tautulli
  5000,
  5001,
  80,
  443,
  8000,
  8081,
  8082,
  9000,
  9443,
];

console.log(`Scanning common ports on ${host}...`);

const checkPort = (port) => {
  return new Promise((resolve) => {
    const s = new net.Socket();
    s.setTimeout(800);
    s.on('connect', () => {
      console.log(`>>> Port ${port} is OPEN on ${host}`);
      s.destroy();
      resolve(true);
    });
    s.on('timeout', () => {
      s.destroy();
      resolve(false);
    });
    s.on('error', () => {
      resolve(false);
    });
    s.connect(port, host);
  });
};

async function run() {
  for (const p of commonPorts) {
    await checkPort(p);
  }
  console.log('Scan completed.');
}
run();
