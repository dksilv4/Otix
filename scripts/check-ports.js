import net from 'net';

const ports = [7878, 8989, 8080, 32400, 7777];
const host = '192.168.1.28';
for (const port of ports) {
  const sock = new net.Socket();
  sock.setTimeout(1000);
  sock.on('connect', () => {
    console.log(`Port ${port} on ${host} is OPEN`);
    sock.destroy();
  });
  sock.on('timeout', () => {
    console.log(`Port ${port} on ${host} TIMEOUT`);
    sock.destroy();
  });
  sock.on('error', (err) => {
    console.log(`Port ${port} on ${host} CLOSED (${err.message})`);
  });
  sock.connect(port, host);
}
