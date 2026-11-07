import * as path from 'path';
import * as fs from 'fs';

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (moduleName: string) {
  if (moduleName === 'electron') {
    return {
      app: {
        getPath: (_name: string) => path.join(process.env.APPDATA || '', 'desktop'),
      },
      BrowserWindow: class {
        static fromWebContents() { return null; }
        static getFocusedWindow() { return null; }
      },
      ipcMain: {
        handle: () => {},
        on: () => {},
      },
    };
  }
  return originalRequire.apply(this, arguments);
};

async function main() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(process.env.APPDATA || '', 'desktop', 'otix.db');
  const db = new Database(dbPath);

  const rows = db.prepare('SELECT id, title, platform, exe_path, otix_media_id, otix_media_title, otix_confidence, otix_data FROM scanned_games ORDER BY platform, title').all();

  console.log(`Analyzing ${rows.length} scanned games...\n`);

  const issues: any[] = [];

  for (const r of rows) {
    let parsed: any = null;
    if (r.otix_data) {
      try {
        parsed = JSON.parse(r.otix_data);
      } catch (e) {
        // ignore
      }
    }

    const otixPlatforms: string[] = (parsed?.platforms || []).map((p: any) => p.name || p.slug || '');
    const otixTitle = r.otix_media_title || parsed?.title || '';
    const scanTitle = r.title;
    const scanPlatform = r.platform.toLowerCase();

    // Check platform mismatch:
    let platformMatch = true;
    if (otixPlatforms.length > 0) {
      if (scanPlatform === 'pc' || scanPlatform === 'steam') {
        const hasPc = otixPlatforms.some(p => /pc|windows|mac|linux|dos/i.test(p));
        if (!hasPc) {
          platformMatch = false;
        }
      } else if (scanPlatform === 'ps5') {
        const hasPs5 = otixPlatforms.some(p => /playstation 5|ps5/i.test(p));
        if (!hasPs5) {
          platformMatch = false;
        }
      } else if (scanPlatform === 'switch') {
        const hasSwitch = otixPlatforms.some(p => /nintendo switch|switch/i.test(p));
        if (!hasSwitch) {
          platformMatch = false;
        }
      }
    }

    console.log(`[${r.platform.toUpperCase().padEnd(6)}] "${scanTitle}" -> Matched: "${otixTitle}" (ID: ${r.otix_media_id || 'NONE'})`);
    if (otixPlatforms.length > 0) {
      console.log(`         Platforms: [${otixPlatforms.join(', ')}]`);
    }

    const itemIssues: string[] = [];
    if (!r.otix_media_id) {
      itemIssues.push('UNMATCHED: No media ID');
    }
    if (!platformMatch) {
      itemIssues.push(`PLATFORM MISMATCH: Scanned as ${scanPlatform.toUpperCase()}, but matched metadata platforms are: ${otixPlatforms.join(', ')}`);
    }

    // Title mismatch heuristics
    const normScan = scanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normMatch = otixTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normMatch && !normScan.includes(normMatch) && !normMatch.includes(normScan)) {
      itemIssues.push(`TITLE DIVERGENCE: "${scanTitle}" vs "${otixTitle}"`);
    }

    if (itemIssues.length > 0) {
      issues.push({
        id: r.id,
        title: scanTitle,
        platform: r.platform,
        exePath: r.exe_path,
        mediaId: r.otix_media_id,
        matchedTitle: otixTitle,
        otixPlatforms,
        issues: itemIssues,
      });
      for (const iss of itemIssues) {
        console.log(`         >>> ${iss}`);
      }
    }
  }

  console.log(`\n========================================`);
  console.log(`TOTAL DETECTED ISSUES: ${issues.length}`);
  console.log(`========================================\n`);

  for (const iss of issues) {
    console.log(`- [${iss.platform.toUpperCase()}] "${iss.title}" (exe: ${iss.exePath})`);
    console.log(`  Matched: "${iss.matchedTitle}" (ID: ${iss.mediaId})`);
    console.log(`  Issues: ${iss.issues.join(' | ')}`);
  }
}

main().catch(console.error);
