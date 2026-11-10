import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const appData = process.env.APPDATA || '';
const dbCandidates = [
  path.join(appData, 'desktop', 'otix.db'),
  path.join(appData, 'otix', 'otix.db'),
  path.join(appData, 'Otix', 'otix.db'),
];

const dbPath = dbCandidates.find((p) => fs.existsSync(p));
if (!dbPath) {
  console.error('Could not find otix.db database!');
  process.exit(1);
}

const cacheDir = path.join(path.dirname(dbPath), 'image-cache');
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

console.log(`Connecting to database at ${dbPath}...`);
console.log(`Cache directory: ${cacheDir}`);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');

const rows = db.prepare('SELECT id, poster_url, otix_poster_url, otix_backdrop_url, otix_textless_poster_url, otix_logo_url, otix_icon_url, local_icon_url, otix_data FROM scanned_games').all();
console.log(`Total scanned_games rows: ${rows.length}`);

let totalImagesExtracted = 0;
let totalBytesSaved = 0;

function saveBase64Image(gameId, kind, dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
    return dataUrl;
  }

  const match = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return null;

  const rawExt = match[1].toLowerCase();
  const ext = rawExt.includes('png') ? 'png' : rawExt.includes('webp') ? 'webp' : 'jpg';
  const buffer = Buffer.from(match[2], 'base64');
  totalBytesSaved += buffer.length;
  totalImagesExtracted++;

  const safeId = String(gameId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const filename = `${safeId}_${kind}.${ext}`;
  const diskPath = path.join(cacheDir, filename);

  try {
    fs.writeFileSync(diskPath, buffer);
    return `media-cache://local/${filename}`;
  } catch (err) {
    console.error(`Failed to write image ${diskPath}:`, err.message);
    return null;
  }
}

const updateStmt = db.prepare(`
  UPDATE scanned_games SET
    poster_url = ?,
    otix_poster_url = ?,
    otix_backdrop_url = ?,
    otix_textless_poster_url = ?,
    otix_logo_url = ?,
    otix_icon_url = ?,
    local_icon_url = ?,
    otix_data = ?
  WHERE id = ?
`);

db.exec('BEGIN TRANSACTION;');
for (const row of rows) {
  let modified = false;

  const poster = saveBase64Image(row.id, 'poster', row.poster_url);
  const otixPoster = saveBase64Image(row.id, 'otix_poster', row.otix_poster_url);
  const backdrop = saveBase64Image(row.id, 'backdrop', row.otix_backdrop_url);
  const textless = saveBase64Image(row.id, 'textless', row.otix_textless_poster_url);
  const logo = saveBase64Image(row.id, 'logo', row.otix_logo_url);
  const otixIcon = saveBase64Image(row.id, 'otix_icon', row.otix_icon_url);
  const localIcon = saveBase64Image(row.id, 'local_icon', row.local_icon_url);

  let otixDataStr = row.otix_data;
  if (otixDataStr && otixDataStr.includes('data:image/')) {
    try {
      const parsed = JSON.parse(otixDataStr);
      for (const k of ['posterUrl', 'poster_url', 'backdropUrl', 'backdrop_url', 'logoUrl', 'logo_url', 'iconUrl', 'icon_url', 'textlessPosterUrl', 'textless_poster_url']) {
        if (parsed[k] && typeof parsed[k] === 'string' && parsed[k].startsWith('data:image/')) {
          parsed[k] = saveBase64Image(row.id, `data_${k}`, parsed[k]);
        }
      }
      otixDataStr = JSON.stringify(parsed);
      modified = true;
    } catch {}
  }

  if (
    poster !== row.poster_url ||
    otixPoster !== row.otix_poster_url ||
    backdrop !== row.otix_backdrop_url ||
    textless !== row.otix_textless_poster_url ||
    logo !== row.otix_logo_url ||
    otixIcon !== row.otix_icon_url ||
    localIcon !== row.local_icon_url ||
    modified
  ) {
    updateStmt.run(
      poster,
      otixPoster,
      backdrop,
      textless,
      logo,
      otixIcon,
      localIcon,
      otixDataStr,
      row.id
    );
  }
}
db.exec('COMMIT;');

console.log(`Migrated ${totalImagesExtracted} images (${(totalBytesSaved / 1024 / 1024).toFixed(2)} MB written to disk as protocol files).`);

console.log('Executing VACUUM to shrink database file...');
db.exec('VACUUM;');
db.close();

const statsAfter = fs.statSync(dbPath);
console.log(`New otix.db size on disk: ${(statsAfter.size / 1024 / 1024).toFixed(2)} MB`);
