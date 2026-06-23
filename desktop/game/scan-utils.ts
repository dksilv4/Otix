// desktop/game/scan-utils.ts
// Utility functions extracted from scanner.ts for backward-compatible consumers
// (installer.ts). New code should use the local-files plugin instead.

import * as fs from 'fs/promises';
import * as path from 'path';

const IGNORED_DIRS = new Set([
  'node_modules', 'bower_components', '.git', '.github', '.svn', '.hg',
  'system32', 'syswow64', 'windows', 'microsoft.net', 'appdata',
  'obj', 'bin', '__pycache__', '.venv', 'venv', 'env', 'windowsapps'
]);

// Find all update files for a given ISO in its parent/sibling/child folders
export async function findUpdateFilesForIso(isoPath: string): Promise<{ name: string; path: string }[]> {
  const updates: { name: string; path: string }[] = [];
  const visited = new Set<string>();

  async function scanFolder(folderPath: string, depth: number) {
    if (depth > 2) return;
    try {
      const entries = await fs.readdir(folderPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        if (entry.isDirectory()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.startsWith('$') || IGNORED_DIRS.has(nameLower)) continue;
          await scanFolder(fullPath, depth + 1);
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          const nameLower = entry.name.toLowerCase();
          if (nameLower.endsWith('.exe') && (nameLower.includes('update') || nameLower.includes('patch'))) {
            if (nameLower.includes('setup') || nameLower.includes('uninst') || nameLower.includes('crash') || nameLower.includes('helper')) continue;
            if (!visited.has(fullPath)) {
              visited.add(fullPath);
              updates.push({ name: entry.name, path: fullPath });
            }
          }
        }
      }
    } catch {}
  }

  const isoDir = path.dirname(isoPath);
  const isoParentDir = path.dirname(isoDir);
  const foldersToScan = new Set<string>();

  // Check sibling update/patch folders
  try {
    const parentEntries = await fs.readdir(isoParentDir, { withFileTypes: true });
    for (const ent of parentEntries) {
      if (ent.isDirectory()) {
        const nl = ent.name.toLowerCase();
        if (nl.includes('update') || nl.includes('patch')) foldersToScan.add(path.join(isoParentDir, ent.name));
      }
    }
  } catch {}

  // Grandparent sibling folders
  const grandParentDir = path.dirname(isoParentDir);
  try {
    const grandParentEntries = await fs.readdir(grandParentDir, { withFileTypes: true });
    for (const ent of grandParentEntries) {
      if (ent.isDirectory()) {
        const nl = ent.name.toLowerCase();
        if (nl.includes('update') || nl.includes('patch')) foldersToScan.add(path.join(grandParentDir, ent.name));
      }
    }
  } catch {}

  // ISO dir itself + subdirectories
  foldersToScan.add(isoDir);
  try {
    const subEntries = await fs.readdir(isoDir, { withFileTypes: true });
    for (const ent of subEntries) {
      if (ent.isDirectory()) {
        const nl = ent.name.toLowerCase();
        if (nl.includes('update') || nl.includes('patch')) foldersToScan.add(path.join(isoDir, ent.name));
      }
    }
  } catch {}

  for (const folder of foldersToScan) {
    await scanFolder(folder, 1);
  }

  updates.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  return updates;
}
