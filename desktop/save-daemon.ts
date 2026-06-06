/* ── SaveDaemon — game save discovery, backup, restore, and snapshot engine ──
 *
 * Uses SaveService for all database operations — no direct DB calls.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import * as os from 'os';
import * as SaveService from './save-service';

let _knownLocationsCache: KnownSaveLocation[] | null = null;

/* ── Types ── */

export interface KnownSaveLocation {
  id: string;
  titlePatterns: string[];
  windows: string[];
  mac: string[];
  linux: string[];
}

export interface SaveProfile {
  id: string;
  gameId: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export interface VaultSaveFile {
  id: string;
  gameId: string;
  profileId: string;
  fileName: string;
  fileSize: number;
  fileHash: string;
  vaultPath: string;
  originPath: string;
  updatedAt: string;
}

export interface SaveSnapshot {
  id: string;
  profileId: string;
  name: string | null;
  snapshotDir: string;
  fileCount: number;
  totalSize: number;
  createdAt: string;
}

export interface GameSaveOverride {
  gameId: string;
  userPath: string;
  updatedAt: string;
}

export interface SaveDiscoveryResult {
  gameId: string;
  gameTitle: string;
  detectedPaths: string[];
  filesFound: number;
  vaultProfileId: string | null;
}

export interface BackupProgress {
  gameId: string;
  currentFile: string;
  totalFiles: number;
  completedFiles: number;
}

export interface RestoreOptions {
  snapshotId?: string;
  profileId: string;
  overwrite: boolean;
}

export interface VaultStatus {
  vaultPath: string;
  totalGames: number;
  totalSaves: number;
  totalSize: number;
  lastSyncAt: string | null;
}

/* ── Helpers ── */

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  const buffer = Buffer.alloc(65536);
  const fd = await fs.open(filePath, 'r');
  try {
    let bytesRead: number;
    while ((bytesRead = (await fd.read(buffer, 0, 65536)).bytesRead) > 0) {
      hash.update(buffer.subarray(0, bytesRead));
    }
  } finally {
    await fd.close();
  }
  return hash.digest('hex');
}

async function fileExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function expandEnvVars(p: string): string {
  return p
    .replace(/%USERPROFILE%/g, os.homedir())
    .replace(/%APPDATA%/g, process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    .replace(/%LOCALAPPDATA%/g, process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    .replace(/%PROGRAMDATA%/g, process.env.PROGRAMDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    .replace(/^~\//, os.homedir() + '/');
}

/* ── Normalize title for matching (mirrors frontend normalizeTitle) ── */

export function normalizeSaveTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[™®©]/g, '')
    .replace(/[-.\s](goty|game of the year|definitive|enhanced|remastered|ultimate|complete|deluxe|collectors?|special|legendary|anniversary|vr|directors? cut)\s*edition/gi, '')
    .replace(/\b(ii|iii|iv|v|vi|vii|viii|ix)\b/g, (m) =>
      ({ ii: '2', iii: '3', iv: '4', v: '5', vi: '6', vii: '7', viii: '8', ix: '9' })[m] || m,
    )
    .replace(/\bx\b/g, '10')
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

/* ── SaveDaemon class ── */

export class SaveDaemon {
  private vaultRoot: string;

  constructor(vaultRoot: string) {
    this.vaultRoot = vaultRoot;
  }

  getVaultRoot(): string {
    return this.vaultRoot;
  }

  async setVaultRoot(newRoot: string): Promise<void> {
    this.vaultRoot = newRoot;
    await ensureDir(newRoot);
  }

  // ── Known locations ──

  async loadKnownLocations(): Promise<KnownSaveLocation[]> {
    if (_knownLocationsCache) return _knownLocationsCache;

    const rows = SaveService.getAllKnownLocations();
    if (rows.length > 0) {
      _knownLocationsCache = rows.map((r) => ({
        id: r.id,
        titlePatterns: JSON.parse(r.title_pattern),
        windows: r.os_windows ? JSON.parse(r.os_windows) : [],
        mac: r.os_mac ? JSON.parse(r.os_mac) : [],
        linux: r.os_linux ? JSON.parse(r.os_linux) : [],
      }));
      return _knownLocationsCache;
    }
    return [];
  }

  async populateKnownLocations(locations: Array<{
    id: string;
    titlePatterns: string[];
    windows: string[];
    mac?: string[];
    linux?: string[];
  }>): Promise<void> {
    for (const loc of locations) {
      SaveService.upsertKnownLocation(
        loc.id,
        JSON.stringify(loc.titlePatterns),
        JSON.stringify(loc.windows),
        JSON.stringify(loc.mac ?? []),
        JSON.stringify(loc.linux ?? []),
      );
    }
    _knownLocationsCache = null; // invalidate cache
  }

  // ── Discover saves for a game ──

  async discoverForGame(gameId: string, title: string): Promise<SaveDiscoveryResult> {
    const locations = await this.loadKnownLocations();
    const normalized = normalizeSaveTitle(title);

    const match = locations.find((loc) =>
      loc.titlePatterns.some((p) => normalized === normalizeSaveTitle(p)),
    );

    const platform = process.platform;
    let candidatePaths: string[] = [];

    if (match) {
      const osPaths = platform === 'win32'
        ? match.windows
        : platform === 'darwin'
          ? match.mac
          : match.linux;
      candidatePaths = osPaths.map(expandEnvVars);
    }

    const override = await this.getOverride(gameId);
    if (override) {
      candidatePaths.push(override.userPath);
    }

    const detectedPaths: string[] = [];
    let filesFound = 0;
    const seen = new Set<string>();

    for (const p of candidatePaths) {
      const resolved = path.resolve(p);
      if (seen.has(resolved)) continue;
      seen.add(resolved);
      if (await fileExists(resolved)) {
        detectedPaths.push(resolved);
        try {
          const entries = await fs.readdir(resolved);
          filesFound += entries.filter((e) => !e.startsWith('.')).length;
        } catch {
          // skip unreadable dirs
        }
      }
    }

    const activeProfile = SaveService.getActiveProfile(gameId);
    const vaultProfileId = activeProfile?.id || null;

    return { gameId, gameTitle: title, detectedPaths, filesFound, vaultProfileId };
  }

  // ── Profile management ──

  async getProfiles(gameId: string): Promise<SaveProfile[]> {
    const rows = SaveService.getProfilesByGameId(gameId);
    return rows.map((r) => ({
      id: r.id,
      gameId: r.game_id,
      name: r.name,
      isActive: !!r.is_active,
      createdAt: r.created_at,
    }));
  }

  async createProfile(gameId: string, name: string): Promise<SaveProfile> {
    const id = generateId();
    SaveService.createProfile(id, gameId, name, 0);
    return { id, gameId, name, isActive: false, createdAt: new Date().toISOString() };
  }

  async deleteProfile(profileId: string): Promise<void> {
    const files = SaveService.getSavesByProfile(profileId);
    for (const f of files) {
      try { await fs.unlink(f.vault_path); } catch { /* file already gone */ }
    }
    SaveService.deleteVaultSavesByProfile(profileId);
    SaveService.deleteSnapshotsByProfile(profileId);
    SaveService.deleteProfile(profileId);
  }

  async setActiveProfile(profileId: string): Promise<void> {
    const profile = SaveService.getProfileById(profileId);
    if (!profile) return;
    SaveService.deactivateAllProfiles(profile.game_id);
    SaveService.activateProfile(profileId);
  }

  // ── Backup to vault ──

  async backupToVault(gameId: string, originPaths: string[]): Promise<BackupProgress> {
    // Get or create default active profile
    let profile = SaveService.getActiveProfile(gameId);
    if (!profile) {
      const id = generateId();
      SaveService.createProfile(id, gameId, 'default', 1);
      profile = { id, game_id: gameId, name: 'default', is_active: 1, created_at: new Date().toISOString() };
    }

    const profileId = profile.id;
    const gameDir = path.join(this.vaultRoot, gameId, 'profiles', profileId);
    await ensureDir(gameDir);

    const allFiles: { originPath: string; relativePath: string }[] = [];
    for (const dirPath of originPaths) {
      if (!(await fileExists(dirPath))) continue;
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith('.')) {
          allFiles.push({
            originPath: path.join(dirPath, entry.name),
            relativePath: entry.name,
          });
        }
      }
    }

    const totalFiles = allFiles.length;
    let completedFiles = 0;

    for (const file of allFiles) {
      const vaultFilePath = path.join(gameDir, file.relativePath);
      try {
        await fs.copyFile(file.originPath, vaultFilePath);
        const stats = await fs.stat(vaultFilePath);
        const fileHash = await hashFile(vaultFilePath);
        const saveId = generateId();
        SaveService.upsertVaultSave(saveId, gameId, profileId, file.relativePath, stats.size, fileHash, vaultFilePath, file.originPath);
      } catch (err) {
        console.error(`[SaveDaemon] Failed to back up ${file.originPath}:`, err);
      }
      completedFiles++;
    }

    return { gameId, currentFile: '', totalFiles, completedFiles };
  }

  // ── Restore from vault ──

  async restoreFromVault(gameId: string, options: RestoreOptions): Promise<number> {
    const { profileId, snapshotId, overwrite } = options;
    let sourceDir: string;

    if (snapshotId) {
      const snap = SaveService.getSnapshotById(snapshotId);
      if (!snap) throw new Error(`Snapshot ${snapshotId} not found`);
      sourceDir = snap.snapshot_dir;
    } else {
      sourceDir = path.join(this.vaultRoot, gameId, 'profiles', profileId);
      if (!(await fileExists(sourceDir))) throw new Error(`Profile ${profileId} has no backed up files`);
    }

    const files = SaveService.getSavesByProfile(profileId);
    let restoredCount = 0;

    for (const file of files) {
      const originDir = path.dirname(file.origin_path);
      const vaultFilePath = path.join(sourceDir, file.file_name);

      if (!(await fileExists(vaultFilePath))) continue;
      if (!overwrite && (await fileExists(file.origin_path))) continue;

      try {
        await ensureDir(originDir);
        await fs.copyFile(vaultFilePath, file.origin_path);
        restoredCount++;
      } catch (err) {
        console.error(`[SaveDaemon] Failed to restore ${file.file_name}:`, err);
      }
    }

    return restoredCount;
  }

  // ── Snapshots ──

  async createSnapshot(profileId: string, name?: string): Promise<SaveSnapshot> {
    const profile = SaveService.getProfileById(profileId);
    if (!profile) throw new Error(`Profile ${profileId} not found`);

    const gameId = profile.game_id;
    const profileDir = path.join(this.vaultRoot, gameId, 'profiles', profileId);

    const snapshotId = generateId();
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapName = name || timestamp;
    const snapDir = path.join(this.vaultRoot, gameId, 'snapshots', snapName);
    await ensureDir(snapDir);

    let fileCount = 0;
    let totalSize = 0;

    if (await fileExists(profileDir)) {
      const entries = await fs.readdir(profileDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith('.')) {
          const srcPath = path.join(profileDir, entry.name);
          const destPath = path.join(snapDir, entry.name);
          try {
            await fs.copyFile(srcPath, destPath);
            const stats = await fs.stat(destPath);
            fileCount++;
            totalSize += stats.size;
          } catch (err) {
            console.error(`[SaveDaemon] Snapshot copy failed for ${entry.name}:`, err);
          }
        }
      }
    }

    const snapshot: SaveSnapshot = {
      id: snapshotId,
      profileId,
      name: name || null,
      snapshotDir: snapDir,
      fileCount,
      totalSize,
      createdAt: new Date().toISOString(),
    };

    SaveService.createSnapshot(snapshotId, profileId, snapshot.name, snapDir, fileCount, totalSize);
    return snapshot;
  }

  async getSnapshots(profileId: string): Promise<SaveSnapshot[]> {
    const rows = SaveService.getSnapshotsByProfile(profileId);
    return rows.map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      name: r.name || null,
      snapshotDir: r.snapshot_dir,
      fileCount: r.file_count,
      totalSize: r.total_size,
      createdAt: r.created_at,
    }));
  }

  async deleteSnapshot(snapshotId: string): Promise<void> {
    const snap = SaveService.getSnapshotById(snapshotId);
    if (snap) {
      try { await fs.rm(snap.snapshot_dir, { recursive: true, force: true }); } catch { /* already gone */ }
    }
    SaveService.deleteSnapshot(snapshotId);
  }

  // ── Overrides ──

  async getOverride(gameId: string): Promise<GameSaveOverride | null> {
    const row = SaveService.getOverride(gameId);
    if (!row) return null;
    return { gameId: row.game_id, userPath: row.user_path, updatedAt: row.updated_at };
  }

  async setOverride(gameId: string, userPath: string): Promise<void> {
    SaveService.upsertOverride(gameId, userPath);
  }

  async clearOverride(gameId: string): Promise<void> {
    SaveService.deleteOverride(gameId);
  }

  // ── Vault status ──

  async getVaultStatus(): Promise<VaultStatus> {
    return {
      vaultPath: this.vaultRoot,
      totalGames: SaveService.getDistinctGameCount(),
      totalSaves: SaveService.getSaveCount(),
      totalSize: SaveService.getTotalSaveSize(),
      lastSyncAt: SaveService.getLatestSnapshotDate(),
    };
  }

  // ── Export / Import ──

  async exportProfile(profileId: string, targetDir: string): Promise<string> {
    const profile = SaveService.getProfileById(profileId);
    if (!profile) throw new Error('Profile not found');

    const profileDir = path.join(this.vaultRoot, profile.game_id, 'profiles', profileId);
    if (!(await fileExists(profileDir))) throw new Error('No save files for this profile');

    await ensureDir(targetDir);
    const exportName = `${profile.game_id}-${profile.name}-${Date.now()}.otixsave`;
    const exportDir = path.join(targetDir, exportName.replace('.otixsave', ''));
    await ensureDir(exportDir);

    const files = SaveService.getSavesByProfile(profileId);
    for (const file of files) {
      const srcPath = path.join(profileDir, file.file_name);
      if (await fileExists(srcPath)) {
        await fs.copyFile(srcPath, path.join(exportDir, file.file_name));
      }
    }

    await fs.writeFile(
      path.join(exportDir, 'metadata.json'),
      JSON.stringify({
        format: 'otixsave',
        version: 1,
        gameId: profile.game_id,
        profileName: profile.name,
        exportedAt: new Date().toISOString(),
        files: files.map((f) => ({ name: f.file_name, originPath: f.origin_path })),
      }, null, 2),
    );

    return exportDir;
  }

  async importSaves(gameId: string, sourceDir: string): Promise<string> {
    const metaPath = path.join(sourceDir, 'metadata.json');
    let meta: any = {};
    try {
      meta = JSON.parse(await fs.readFile(metaPath, 'utf-8'));
    } catch {
      throw new Error('Invalid save import: metadata.json not found or unreadable');
    }

    const profileName = meta.profileName || `import-${Date.now()}`;
    const profile = await this.createProfile(gameId, profileName);
    const profileDir = path.join(this.vaultRoot, gameId, 'profiles', profile.id);
    await ensureDir(profileDir);

    let fileCount = 0;
    const entries = await fs.readdir(sourceDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isFile() && entry.name !== 'metadata.json') {
        const srcPath = path.join(sourceDir, entry.name);
        const destPath = path.join(profileDir, entry.name);
        await fs.copyFile(srcPath, destPath);
        const stats = await fs.stat(destPath);
        const fileHash = await hashFile(destPath);
        const saveId = generateId();
        SaveService.upsertVaultSave(saveId, gameId, profile.id, entry.name, stats.size, fileHash, destPath, '');
        fileCount++;
      }
    }

    return profile.id;
  }
}
