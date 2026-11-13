import { spawn } from 'child_process';
import path from 'path';

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const userDataDir = path.resolve('scratch', 'chrome-debug-profile');

const args = [
  '--remote-debugging-port=9222',
  `--user-data-dir=${userDataDir}`,
  '--no-first-run',
  '--no-default-browser-check',
  'http://127.0.0.1:5174/media/movie/1166',
];

console.log('Launching Chrome with debugging port 9222...');
const child = spawn(chromePath, args, {
  detached: true,
  stdio: 'ignore',
});
child.unref();

setTimeout(async () => {
  try {
    const res = await fetch('http://127.0.0.1:9222/json/version');
    const data = await res.json();
    console.log('Chrome Debugger Ready:', data.Browser);
    process.exit(0);
  } catch (e) {
    console.error('Failed to connect to Chrome:', e.message);
    process.exit(1);
  }
}, 2000);
