import * as fs from 'fs';
import * as path from 'path';

function getOtixFiles(dir: string): string[] {
  let results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        results = results.concat(getOtixFiles(full));
      } else if (e.name === '.otix') {
        results.push(full);
      }
    }
  } catch (err) {}
  return results;
}

const root = '\\\\192.168.1.58\\Games';
const files = getOtixFiles(root);
console.log(`Found ${files.length} .otix files on ${root}\n`);

const entries: any[] = [];
for (const file of files) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    const d = JSON.parse(raw);
    const rel = path.relative(root, file);
    const plats = (d.platforms || []).map((p: any) => p.name || p.slug || '').join(', ');
    entries.push({
      rel,
      mediaId: d.mediaId,
      title: d.title,
      platforms: plats,
      overview: d.overview ? d.overview.slice(0, 80) + '...' : '',
    });
  } catch (e) {}
}

for (const it of entries) {
  console.log(`[${it.rel}]`);
  console.log(`  -> Title: "${it.title}" (MediaID: ${it.mediaId})`);
  console.log(`  -> Platforms: [${it.platforms}]`);
  if (it.overview) console.log(`  -> Overview: ${it.overview}`);
}
