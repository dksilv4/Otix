// extensions/plugins/local-files/main.js
// Production Local Files Scanner Plugin for Otix

const path = require('path');

// ── Pure helpers ──────────────────────────────────────────────────────

function parseAcf(content) {
  const result = {};
  const matches = content.matchAll(/"([^"]+)"\s+"([^"]+)"/g);
  for (const match of matches) result[match[1]] = match[2];
  return result;
}

function generateId(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  return 'pc_' + Math.abs(hash).toString(36);
}

const DOC_BASENAMES = new Set([
  'readme', 'changelog', 'install', 'installation', 'license', 'licence',
  'instructions', 'notes', 'faq', 'manual', 'help', 'history', 'todo',
  'credits', 'authors', 'version', 'info', 'guide'
]);

function isDocFile(filename) {
  const lower = filename.toLowerCase();
  const ext = path.extname(lower);
  if (ext === '.md' || ext === '.txt' || ext === '.nfo' || ext === '.pdf') {
    const base = path.basename(lower, ext);
    if (DOC_BASENAMES.has(base) || base.startsWith('readme') || base.startsWith('install')) {
      return true;
    }
  }
  return false;
}

function cleanGameTitle(filename) {
  let name = filename.replace(/\.(iso|nsp|xci|nsz|xcz|3ds|cia|nds|z64|rvz|gcz|chd|pbp|vpk|sfc|smc|nes|gba|gbc|gb|gen|pkg)$/i, '');
  name = name.replace(/[\._\-]/g, ' ');
  const tags = [
    /\[repack\]/gi, /\brepack\b/gi, /\belamigos\b/gi, /\bfitgirl\b/gi, /\bdodi\b/gi,
    /\bcodex\b/gi, /\bflt\b/gi, /\bplaza\b/gi, /\bskidrow\b/gi, /\brune\b/gi, /\btenoke\b/gi,
    /\bgoldberg\b/gi, /\brazor1911\b/gi, /\bfairlight\b/gi, /\bhoodlum\b/gi,
    /\bmulti\d+\b/gi, /\bvoices\d*\b/gi, /\bv\d+(\.\d+)*\b/gi, /\bbuild\s*\d+\b/gi, /\bupdate\s*\d*\b/gi,
    /\bhbg\b/gi, /\bdlc\b/gi, /\bgog\b/gi, /\bcrack\b/gi, /\bproper\b/gi
  ];
  for (const tag of tags) name = name.replace(tag, '');
  name = name.replace(/\[\s*\]/g, '').replace(/\(\s*\)/g, '').replace(/\{\s*\}/g, '');
  name = name.replace(/[\s\-\+\:\,]+$/, '');
  return name.replace(/\s+/g, ' ').trim();
}

const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps',
  '_commonredist', 'commonredist', 'redist', '_redist', 'directx',
  'vcredist', 'prerequisites', 'mono'
]);

const NOISE_EXE_NAMES = [
  'crash', 'unins', 'setup', 'redist', 'config', 'tool', 'cef',
  'helper', 'register', 'patch', 'dxsetup', 'vcredist', 'dotnet',
  'easyanticheat', 'battleye', 'epic_online_services', 'benchmark',
  'bugreport', 'restarter', 'dowser', 'quicksfv', 'autorun'
];

async function pickBestExe(ctx, exes, installDirName) {
  if (exes.length === 0) return null;
  if (exes.length === 1) return exes[0];

  const cleanInstallDir = installDirName.toLowerCase().replace(/[^a-z0-9]/g, '');
  let bestExe = null;
  let bestScore = -1;

  for (const exe of exes) {
    const exeName = path.basename(exe, '.exe').toLowerCase();
    if (NOISE_EXE_NAMES.some((s) => exeName.includes(s))) continue;

    let score = 0;
    if (exeName.includes('shipping')) score += 80;
    if (exeName.includes('game') || exeName.includes('client')) score += 20;

    const fnLower = installDirName.toLowerCase();
    const folderIdx = exe.toLowerCase().indexOf(fnLower);
    if (folderIdx >= 0 && (exe.toLowerCase().substring(folderIdx + fnLower.length).match(/[\\/]/g) || []).length > 1) {
      score += 30;
    }

    if (exeName === cleanInstallDir || exeName === installDirName.toLowerCase()) {
      score += 100;
    } else if (exeName.includes(cleanInstallDir) || cleanInstallDir.includes(exeName)) {
      score += 50;
    }

    try {
      const s = await ctx.filesystem.stat(exe);
      score += Math.min(30, Math.floor((s.size || 0) / (1024 * 1024)));
    } catch {}

    if (score > bestScore) {
      bestScore = score;
      bestExe = exe;
    }
  }

  return bestExe || exes[0];
}

// ── Filesystem helpers ────────────────────────────────────────────────

async function scanExecutables(ctx, dir, maxDepth) {
  const exes = [];
  async function traverse(currentDir, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = await ctx.filesystem.readdir(currentDir);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          if (entry.name.toLowerCase().endsWith('.exe')) {
            exes.push(fullPath);
          }
        }
      }
    } catch {}
  }
  await traverse(dir, 1);
  return exes;
}

const ROM_EXTENSIONS = new Set([
  '.nsp', '.xci', '.nsz', '.xcz', '.3ds', '.cia', '.cxi', '.nds',
  '.z64', '.n64', '.v64', '.rvz', '.wbfs', '.gcz', '.chd', '.pbp',
  '.vpk', '.sfc', '.smc', '.nes', '.gba', '.gbc', '.gb', '.md',
  '.gen', '.pkg'
]);

const ROM_PLATFORMS = {
  '.nsp': 'switch', '.xci': 'switch', '.nsz': 'switch', '.xcz': 'switch',
  '.3ds': '3ds', '.cia': '3ds', '.cxi': '3ds', '.nds': 'nds',
  '.z64': 'n64', '.n64': 'n64', '.v64': 'n64', '.rvz': 'wii',
  '.wbfs': 'wii', '.gcz': 'gamecube', '.chd': 'ps2', '.pbp': 'psp',
  '.vpk': 'psvita', '.sfc': 'snes', '.smc': 'snes', '.nes': 'nes',
  '.gba': 'gba', '.gbc': 'gbc', '.gb': 'gb', '.md': 'genesis',
  '.gen': 'genesis', '.pkg': 'ps3'
};

async function scanImagesAndRoms(ctx, dir, maxDepth) {
  const found = [];
  async function traverse(currentDir, depth) {
    if (depth > maxDepth) return;
    try {
      const entries = await ctx.filesystem.readdir(currentDir);
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await traverse(fullPath, depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          const nl = entry.name.toLowerCase();
          const ext = path.extname(nl);
          if (ext === '.iso' || ext === '.img') {
            found.push({ path: fullPath, ext, platform: 'iso' });
          } else if (ROM_EXTENSIONS.has(ext)) {
            if (ext === '.md' && isDocFile(entry.name)) {
              continue;
            }
            found.push({ path: fullPath, ext, platform: ROM_PLATFORMS[ext] || 'rom' });
          }
        }
      }
    } catch {}
  }
  await traverse(dir, 1);
  return found;
}

async function findUpdateFilesForGame(ctx, gamePath) {
  const updates = [];
  const visited = new Set();
  const baseDir = path.dirname(gamePath);
  const parentDir = path.dirname(baseDir);

  async function scanFolder(folderPath, depth) {
    if (depth > 2) return;
    try {
      const entries = await ctx.filesystem.readdir(folderPath);
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory) {
          const nl = entry.name.toLowerCase();
          if (nl.startsWith('$') || IGNORED_DIRS.has(nl)) continue;
          await scanFolder(fullPath, depth + 1);
        } else if (entry.isFile || entry.isSymbolicLink) {
          const nl = entry.name.toLowerCase();
          if (nl.endsWith('.exe') && (nl.includes('update') || nl.includes('patch') || nl.includes('hotfix'))) {
            if (NOISE_EXE_NAMES.some((s) => nl.includes(s) && !s.includes('patch'))) continue;
            if (!visited.has(fullPath)) {
              visited.add(fullPath);
              updates.push({ name: entry.name, path: fullPath });
            }
          }
        }
      }
    } catch {}
  }

  const foldersToScan = new Set([baseDir]);
  try {
    const parentEntries = await ctx.filesystem.readdir(parentDir);
    for (const ent of parentEntries) {
      if (ent.isDirectory) {
        const nl = ent.name.toLowerCase();
        if (nl.includes('update') || nl.includes('patch') || nl.includes('dlc')) {
          foldersToScan.add(path.join(parentDir, ent.name));
        }
      }
    }
  } catch {}

  for (const f of foldersToScan) {
    await scanFolder(f, 1);
  }

  updates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return updates;
}

function deduplicate(games) {
  const seen = new Set();
  const deduped = [];
  for (const g of games) {
    const key = (g.exePath || g.id || '').toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(g);
  }
  return deduped;
}

function getGameFolder(exePath, rootDir) {
  let cur = path.dirname(exePath);
  const normRoot = path.resolve(rootDir).toLowerCase();
  while (cur && path.resolve(cur).toLowerCase() !== normRoot) {
    const parent = path.dirname(cur);
    if (path.resolve(parent).toLowerCase() === normRoot) {
      return cur;
    }
    cur = parent;
  }
  return path.dirname(exePath);
}

// ── Plugin implementation ─────────────────────────────────────────────

module.exports = {
  data: {
    scan: async (ctx) => {
      const scanDirs = (ctx.config.get('scanDirectories') || []).filter(Boolean);
      const isoDirs = (ctx.config.get('isoDirectories') || []).filter(Boolean);
      const allGames = [];
      const total = scanDirs.length + isoDirs.length;
      let idx = 0;

      const emit = (dir) => {
        ctx.host.emit('scan:progress', {
          currentDir: dir,
          progress: total > 0 ? Math.round((idx / total) * 100) : 100,
        });
      };

      for (const dir of scanDirs) {
        emit(dir);
        try {
          if (!(await ctx.filesystem.access(dir))) {
            idx++;
            continue;
          }

          const filesInDir = await ctx.filesystem.readdir(dir);
          const hasSA = filesInDir.some((e) => e.name === 'steamapps' && e.isDirectory);
          const isSA = dir.toLowerCase().endsWith('steamapps');
          const saPath = hasSA ? path.join(dir, 'steamapps') : isSA ? dir : null;

          if (saPath) {
            // Steam library scan via appmanifest_*.acf
            try {
              const saEntries = await ctx.filesystem.readdir(saPath);
              for (const file of saEntries) {
                if (!file.name.startsWith('appmanifest_') || !file.name.endsWith('.acf')) continue;
                try {
                  const content = await ctx.filesystem.readFile(path.join(saPath, file.name), 'utf-8');
                  const data = parseAcf(content);
                  const { appid, name, installdir } = data;
                  if (!appid || !name || !installdir) continue;
                  const commonDir = path.join(saPath, 'common', installdir);
                  let localExePath;
                  let localIconUrl;

                  try {
                    const subExes = await scanExecutables(ctx, commonDir, 3);
                    const exe = await pickBestExe(ctx, subExes, installdir);
                    if (exe) localExePath = exe;
                  } catch {}

                  if (localExePath && ctx.app?.getFileIcon) {
                    try {
                      localIconUrl = (await ctx.app.getFileIcon(localExePath)) || undefined;
                    } catch {}
                  }

                  allGames.push({
                    id: appid,
                    title: name,
                    exePath: `steam://rungameid/${appid}`,
                    localExePath,
                    installDir: commonDir,
                    platform: 'steam',
                    localIconUrl,
                  });
                } catch {}
              }
            } catch {}
          } else {
            // Standalone PC game directory
            const selfExes = await scanExecutables(ctx, dir, 2);
            const hasSelf = selfExes.some((exe) => {
              const n = path.basename(exe).toLowerCase();
              if (NOISE_EXE_NAMES.some((s) => n.includes(s))) return false;
              return path.resolve(getGameFolder(exe, dir)).toLowerCase() === path.resolve(dir).toLowerCase();
            });

            if (hasSelf) {
              const best = await pickBestExe(ctx, selfExes, path.basename(dir));
              if (best) {
                let localIconUrl;
                if (ctx.app?.getFileIcon) {
                  try {
                    localIconUrl = (await ctx.app.getFileIcon(best)) || undefined;
                  } catch {}
                }
                allGames.push({
                  id: generateId(best),
                  title: cleanGameTitle(path.basename(dir)),
                  exePath: best,
                  installDir: dir,
                  platform: 'pc',
                  localIconUrl,
                });
              }
            } else {
              for (const entry of filesInDir) {
                if (!entry.isDirectory) continue;
                const n = entry.name.toLowerCase();
                if (n.startsWith('$') || IGNORED_DIRS.has(n)) continue;

                const gf = path.join(dir, entry.name);
                const subExes = await scanExecutables(ctx, gf, 3);
                if (subExes.length > 0) {
                  const best = await pickBestExe(ctx, subExes, entry.name);
                  if (best) {
                    let localIconUrl;
                    if (ctx.app?.getFileIcon) {
                      try {
                        localIconUrl = (await ctx.app.getFileIcon(best)) || undefined;
                      } catch {}
                    }
                    allGames.push({
                      id: generateId(best),
                      title: cleanGameTitle(entry.name),
                      exePath: best,
                      installDir: gf,
                      platform: 'pc',
                      localIconUrl,
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          ctx.logger.error(`Error scanning ${dir}: ${e.message}`);
        }
        idx++;
      }

      // Scan ISO and ROM directories
      for (const dir of isoDirs) {
        emit(dir);
        try {
          if (!(await ctx.filesystem.access(dir))) {
            idx++;
            continue;
          }

          const images = await scanImagesAndRoms(ctx, dir, 3);
          for (const img of images) {
            const fn = path.basename(img.path, img.ext);
            const updates = await findUpdateFilesForGame(ctx, img.path);
            allGames.push({
              id: generateId(img.path),
              title: cleanGameTitle(fn),
              exePath: img.path,
              installDir: path.dirname(img.path),
              platform: img.platform || 'iso',
              updateFiles: updates,
            });
          }
        } catch (e) {
          ctx.logger.error(`Error scanning ISO/ROM path ${dir}: ${e.message}`);
        }
        idx++;
      }

      ctx.host.emit('scan:progress', { currentDir: 'Done', progress: 100 });
      return { games: deduplicate(allGames) };
    },

    'scan.status': async () => ({ phase: 'idle' }),
  },

  status: async (ctx) => {
    const dirs = ctx.config.get('scanDirectories') || [];
    const isoDirs = ctx.config.get('isoDirectories') || [];
    return {
      connected: dirs.length > 0 || isoDirs.length > 0,
      scanDirectories: dirs.length,
      isoDirectories: isoDirs.length,
    };
  },

  test: async (ctx, configDraft) => {
    const rawDirs = configDraft?.scanDirectories ?? ctx.config.get('scanDirectories') ?? [];
    const dirs = Array.isArray(rawDirs) ? rawDirs : [];
    const rawIso = configDraft?.isoDirectories ?? ctx.config.get('isoDirectories') ?? [];
    const isoDirs = Array.isArray(rawIso) ? rawIso : [];
    const errors = [];
    for (const d of [...dirs, ...isoDirs]) {
      if (!(await ctx.filesystem.access(d))) errors.push(`Path not found: ${d}`);
    }
    return {
      success: errors.length === 0,
      message: errors.join('; ') || 'All paths accessible',
    };
  },

  slotRender: async () => ({
    type: 'scan',
    platform: 'pc-directory',
    label: 'Local Files',
    description: 'Scan local directories for PC games, Steam libraries, ISOs, and ROMs',
  }),
};
