import fs from 'fs';
import path from 'path';

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const full = path.join(dir, file);
    const stat = fs.statSync(full);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(full));
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      results.push(full);
    }
  });
  return results;
}

const files = walk('frontend/src');
let count = 0;
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf8');
  const lines = content.split('\n');
  lines.forEach((line, i) => {
    if (line.includes('/library/servers') || line.includes('/servers/')) {
      // Ignore gameservers feature since that is dedicated game server router
      if (!f.includes('gameservers')) {
        console.log(`${f}:${i + 1}: ${line.trim()}`);
        count++;
      }
    }
  });
});
console.log(`\nTotal matches: ${count}`);
