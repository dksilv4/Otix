/* ── SaveDaemon — game save discovery, backup, restore, and snapshot engine ──
 *
 * Uses SaveService for all database operations — no direct DB calls.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { createHash } from 'crypto';
import * as os from 'os';
import * as SaveService from './service';
import { getGameById } from '../game/storage';
import { isRomGame, getAllEmulatorDefinitions } from '../game/emulators';
import { getSettings } from '../desktop-settings';
import type { ServiceRegistry } from '../plugin-runtime/service-registry';

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

async function hashFile(filePath: string, algorithm: 'sha256' | 'md5' = 'sha256'): Promise<string> {
  const hash = createHash(algorithm);
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

async function hashFileMd5(filePath: string): Promise<string> {
  return hashFile(filePath, 'md5');
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

function normalizePathToPattern(absolutePath: string): string {
  let p = absolutePath.replace(/\\/g, '/');
  const home = os.homedir().replace(/\\/g, '/');
  const localAppdata = (process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local')).replace(/\\/g, '/');
  const appdata = (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')).replace(/\\/g, '/');
  const programdata = (process.env.PROGRAMDATA || 'C:/ProgramData').replace(/\\/g, '/');

  if (p.toLowerCase().startsWith(localAppdata.toLowerCase())) {
    p = '%LOCALAPPDATA%' + p.substring(localAppdata.length);
  } else if (p.toLowerCase().startsWith(appdata.toLowerCase())) {
    p = '%APPDATA%' + p.substring(appdata.length);
  } else if (p.toLowerCase().startsWith(programdata.toLowerCase())) {
    p = '%PROGRAMDATA%' + p.substring(programdata.length);
  } else if (p.toLowerCase().startsWith(home.toLowerCase())) {
    if (process.platform === 'win32') {
      p = '%USERPROFILE%' + p.substring(home.length);
    } else {
      p = '~' + p.substring(home.length);
    }
  }

  if (process.platform === 'win32') {
    p = p.replace(/\//g, '\\');
  }
  return p;
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

export const KNOWN_SAVE_EXTENSIONS = new Set([
  '.sav', '.srm', '.state', '.savestate', '.mcd', '.ps2', '.p2s',
  '.gci', '.raw', '.dsv', '.mln', '.fls', '.eep', '.sra', '.mpk',
  '.dat', '.nvram', '.st0', '.st1', '.st2', '.st3', '.st4', '.st5',
  '.st6', '.st7', '.st8', '.st9',
]);

export function isEmulatorSaveFile(fileName: string, romBaseName?: string): boolean {
  const ext = path.extname(fileName).toLowerCase();
  const base = path.parse(fileName).name.toLowerCase();

  const isSaveExt =
    KNOWN_SAVE_EXTENSIONS.has(ext) ||
    /^\.state\d*$/i.test(ext) ||
    /^\.ss\d*$/i.test(ext) ||
    /^\.st\d*$/i.test(ext);

  if (!isSaveExt) return false;

  // Shared console memory cards (PS1, PS2, GameCube)
  if (['.ps2', '.mcd', '.raw'].includes(ext)) {
    return true;
  }

  if (romBaseName) {
    return base === romBaseName || base.startsWith(`${romBaseName}.`);
  }

  return true;
}

/** Recursively walk a directory and collect all files with relative paths. */
async function walkDir(
  dir: string,
  baseDir: string,
  files: { originPath: string; relativePath: string }[] = [],
  filter?: (fileName: string, fullPath: string) => boolean,
): Promise<{ originPath: string; relativePath: string }[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, baseDir, files, filter);
    } else if (entry.isFile()) {
      if (filter && !filter(entry.name, fullPath)) continue;
      files.push({
        originPath: fullPath,
        relativePath: path.relative(baseDir, fullPath),
      });
    }
  }
  return files;
}

/* ── SaveDaemon class ── */

export class SaveDaemon {
  private vaultRoot: string;
  private serviceRegistry?: ServiceRegistry;

  constructor(vaultRoot: string, serviceRegistry?: ServiceRegistry) {
    this.vaultRoot = vaultRoot;
    this.serviceRegistry = serviceRegistry;
  }

  setServiceRegistry(serviceRegistry: ServiceRegistry): void {
    this.serviceRegistry = serviceRegistry;
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
    } else {
      // Fallback: use confirmed path from cloud settings
      const settings = await this.getCloudSettings(gameId);
      if (settings.isPathConfirmed && settings.confirmedPath) {
        candidatePaths.push(settings.confirmedPath);
      }
    }

    // Check if game is a console / emulator ROM
    let romBaseName: string | undefined;
    let isRom = false;
    try {
      const localGame = getGameById(gameId);
      if (localGame) {
        isRom = isRomGame({
          id: localGame.id,
          title: localGame.title,
          exePath: localGame.exePath,
          installDir: localGame.installDir,
          platform: localGame.platform,
        });

        if (isRom) {
          if (localGame.exePath) {
            romBaseName = path.parse(localGame.exePath).name.toLowerCase();
          }
          const emus = getAllEmulatorDefinitions(this.serviceRegistry);
          const settings = getSettings();
          const defaultEmuId = settings.defaultPlatformEmulators?.[localGame.platform];

          const relevantEmus = defaultEmuId
            ? emus.filter((e) => e.id === defaultEmuId)
            : emus.filter((e) => e.platforms.includes(localGame.platform));

          for (const emu of relevantEmus) {
            if (emu.saveLocations) {
              for (const loc of emu.saveLocations) {
                candidatePaths.push(expandEnvVars(loc));
              }
            }
          }

          if (localGame.exePath) {
            const romDir = path.dirname(localGame.exePath);
            candidatePaths.push(romDir);
            candidatePaths.push(path.join(romDir, 'saves'));
            candidatePaths.push(path.join(romDir, 'states'));
          }
        }
      }
    } catch {
      /* ignore lookup errors */
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
          if (isRom) {
            filesFound += entries.filter((e) => !e.startsWith('.') && isEmulatorSaveFile(e, romBaseName)).length;
          } else {
            filesFound += entries.filter((e) => !e.startsWith('.')).length;
          }
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

    let romBaseName: string | undefined;
    let isRom = false;
    try {
      const localGame = getGameById(gameId);
      if (localGame && isRomGame(localGame)) {
        isRom = true;
        if (localGame.exePath) {
          romBaseName = path.parse(localGame.exePath).name.toLowerCase();
        }
      }
    } catch {
      /* ignore */
    }

    const fileFilter = isRom
      ? (fileName: string) => isEmulatorSaveFile(fileName, romBaseName)
      : undefined;

    const allFiles: { originPath: string; relativePath: string }[] = [];
    for (const dirPath of originPaths) {
      if (!(await fileExists(dirPath))) continue;
      // Recursively collect all files under the save directory
      await walkDir(dirPath, dirPath, allFiles, fileFilter);
    }

    console.log('[backupToVault] Found', allFiles.length, 'files to back up');
    const totalFiles = allFiles.length;
    let completedFiles = 0;

    for (const file of allFiles) {
      const vaultFilePath = path.join(gameDir, file.relativePath);
      try {
        await ensureDir(path.dirname(vaultFilePath));
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
    SaveService.confirmPath(gameId, 0, null);
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

  // ── Cloud Settings ──

  async getCloudSettings(gameId: string): Promise<{ gameId: string; autoSync: boolean; lastSyncAt: string | null; isPathConfirmed: boolean; confirmedPath: string | null }> {
    const row = SaveService.getCloudSettings(gameId);
    if (!row) {
      return { gameId, autoSync: false, lastSyncAt: null, isPathConfirmed: false, confirmedPath: null };
    }
    return {
      gameId: row.game_id,
      autoSync: row.auto_sync === 1,
      lastSyncAt: row.last_sync_at,
      isPathConfirmed: row.is_path_confirmed === 1,
      confirmedPath: row.confirmed_path,
    };
  }

  async setCloudSettings(gameId: string, autoSync: boolean): Promise<void> {
    const current = await this.getCloudSettings(gameId);
    SaveService.upsertCloudSettings(gameId, autoSync ? 1 : 0, current.lastSyncAt);
  }

  async confirmSavePath(gameId: string, absolutePath: string, apiBaseUrl: string, authToken: string): Promise<void> {
    SaveService.confirmPath(gameId, 1, absolutePath);

    const mediaId = SaveService.getOtixMediaId(gameId);
    if (mediaId && apiBaseUrl && authToken) {
      try {
        const pattern = normalizePathToPattern(absolutePath);
        const platform = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux';
        const url = `${apiBaseUrl}/saves/locations/${mediaId}/suggest`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': authToken,
          },
          body: JSON.stringify({
            platform,
            path_pattern: pattern,
          }),
        });
        if (!response.ok) {
          console.error(`[SaveDaemon] Failed to submit path suggestion to server: ${response.statusText}`);
        } else {
          console.log(`[SaveDaemon] Submitted save path suggestion: ${pattern} for game ${gameId}`);
        }
      } catch (err) {
        console.error('[SaveDaemon] Error submitting path suggestion:', err);
      }
    }
  }

  async resolvePathPatterns(patterns: string[]): Promise<string[]> {
    const resolved: string[] = [];
    const seen = new Set<string>();
    for (const pat of patterns) {
      try {
        const expanded = expandEnvVars(pat);
        const resolvedPath = path.resolve(expanded);
        if (seen.has(resolvedPath)) continue;
        seen.add(resolvedPath);
        if (await fileExists(resolvedPath)) {
          resolved.push(resolvedPath);
        }
      } catch (err) {
        // ignore resolution errors
      }
    }
    return resolved;
  }

  // ── Cloud Sync Engine ──

  async syncCloud(
    gameId: string,
    gameTitle: string,
    profileId: string,
    apiBaseUrl: string,
    authToken: string
  ): Promise<{ success: boolean; message: string }> {
    logger.info('[SaveDaemon] Starting cloud sync', { gameId, gameTitle, profileId });

    // 1. Discover local saves and run a local backup to update the vault
    const discovery = await this.discoverForGame(gameId, gameTitle);
    if (discovery.detectedPaths.length > 0) {
      await this.backupToVault(gameId, discovery.detectedPaths);
    }

    // 2. Resolve active profile and vault path
    let profile = SaveService.getActiveProfile(gameId);
    if (!profile) {
      // If still no profile, backupToVault should have created one. If not, create now.
      const pId = generateId();
      SaveService.createProfile(pId, gameId, 'default', 1);
      profile = { id: pId, game_id: gameId, name: 'default', is_active: 1, created_at: new Date().toISOString() };
    }
    const effectiveProfileId = profile.id;
    const profileDir = path.join(this.vaultRoot, gameId, 'profiles', effectiveProfileId);
    await ensureDir(profileDir);

    // 3. Retrieve list of remote files in Google Drive from the backend
    const getFilesUrl = new URL(`${apiBaseUrl}/saves/${gameId}/files`);
    getFilesUrl.searchParams.set('profile_id', effectiveProfileId);

    const getFilesResp = await fetch(getFilesUrl.toString(), {
      headers: { 'Authorization': authToken }
    });
    if (!getFilesResp.ok) {
      const errText = await getFilesResp.text();
      throw new Error(`Failed to list Google Drive files: ${errText || getFilesResp.statusText}`);
    }
    const remoteFilesList = (await getFilesResp.json()) as Array<{
      id: string;
      name: string;
      md5Checksum: string;
      modifiedTime: string;
      size: number;
    }>;

    const remoteFiles = new Map(remoteFilesList.map((f) => [f.name, f]));

    // 4. Read local files in the vault profile directory (recursive)
    const vaultFiles = await walkDir(profileDir, profileDir);
    const localFiles = new Map<string, { path: string; md5: string; mtime: number; size: number; localRel: string }>();
    for (const vf of vaultFiles) {
      const stats = await fs.stat(vf.originPath);
      const md5 = await hashFileMd5(vf.originPath);
      localFiles.set(vf.relativePath.replace(/\\/g, '/'), { path: vf.originPath, md5, mtime: stats.mtimeMs, size: stats.size, localRel: vf.relativePath });
    }
    console.log('[syncCloud] Vault has', vaultFiles.length, 'files');

    // 5. Compare lists to determine uploads and downloads
    const uploads: string[] = [];
    const downloads: { filename: string; fileId: string; localPath: string }[] = [];

    // Check what needs to be uploaded or resolved
    for (const [filename, localFile] of localFiles.entries()) {
      const remoteFile = remoteFiles.get(filename);
      if (!remoteFile) {
        // Missing on cloud - upload
        uploads.push(filename);
      } else if (localFile.md5 !== remoteFile.md5Checksum) {
        // Diff hashes, compare modification times
        const remoteTime = new Date(remoteFile.modifiedTime).getTime();
        if (localFile.mtime > remoteTime) {
          uploads.push(filename);
        } else {
          downloads.push({ filename, fileId: remoteFile.id, localPath: localFile.path });
        }
      }
    }

    // Check what needs to be downloaded (missing locally)
    for (const [filename, remoteFile] of remoteFiles.entries()) {
      if (!localFiles.has(filename)) {
        const localPath = path.join(profileDir, filename);
        downloads.push({ filename, fileId: remoteFile.id, localPath });
      }
    }

    logger.info('[SaveDaemon] Cloud comparison complete', {
      uploadsCount: uploads.length,
      downloadsCount: downloads.length,
    });

    // 6. Execute uploads
    for (const filename of uploads) {
      const localFile = localFiles.get(filename)!;
      const remoteFile = remoteFiles.get(filename);
      const fileContent = await fs.readFile(localFile.path);

      const formData = new FormData();
      const blob = new Blob([fileContent], { type: 'application/octet-stream' });
      formData.append('file', blob, filename);

      const uploadUrl = new URL(`${apiBaseUrl}/saves/${gameId}/upload`);
      uploadUrl.searchParams.set('filename', filename);
      uploadUrl.searchParams.set('profile_id', effectiveProfileId);
      if (remoteFile) {
        uploadUrl.searchParams.set('file_id', remoteFile.id);
      }

      const uploadResp = await fetch(uploadUrl.toString(), {
        method: 'POST',
        headers: { 'Authorization': authToken },
        body: formData,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text();
        throw new Error(`Failed to upload ${filename}: ${errText || uploadResp.statusText}`);
      }
    }

    // 7. Execute downloads
    for (const dl of downloads) {
      const downloadUrl = `${apiBaseUrl}/saves/${gameId}/download/${dl.fileId}`;
      const downloadResp = await fetch(downloadUrl, {
        headers: { 'Authorization': authToken },
      });

      if (!downloadResp.ok) {
        throw new Error(`Failed to download ${dl.filename}: ${downloadResp.statusText}`);
      }

      const arrayBuffer = await downloadResp.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      await ensureDir(path.dirname(dl.localPath));
      await fs.writeFile(dl.localPath, buffer);

      // Upsert vault save record in SQLite
      const stats = await fs.stat(dl.localPath);
      const fileHash = await hashFile(dl.localPath);
      const saveId = generateId();

      const existingSaves = SaveService.getSavesByProfile(effectiveProfileId);
      const matchedSave = existingSaves.find((s) => s.file_name === dl.filename);
      const originPath = matchedSave
        ? matchedSave.origin_path
        : path.join(discovery.detectedPaths[0] || '', dl.filename);

      SaveService.upsertVaultSave(
        saveId,
        gameId,
        effectiveProfileId,
        dl.filename,
        stats.size,
        fileHash,
        dl.localPath,
        originPath
      );
    }

    // 8. Restore newly downloaded files from vault to the game's actual directory
    if (downloads.length > 0) {
      await this.restoreFromVault(gameId, { profileId: effectiveProfileId, overwrite: true });
    }

    // 9. Update last sync date
    const currentSettings = await this.getCloudSettings(gameId);
    const syncTime = new Date().toISOString();
    SaveService.upsertCloudSettings(gameId, currentSettings.autoSync ? 1 : 0, syncTime);

    logger.info('[SaveDaemon] Cloud sync completed successfully', { gameId });
    return { success: true, message: `Sync complete. Uploaded ${uploads.length} files, downloaded ${downloads.length} files.` };
  }
}

// logger stub helper in case structlog doesn't output logger (but it does in ts files)
const logger = {
  info: (msg: string, meta?: any) => console.log(`[INFO] ${msg}`, meta || ''),
  warn: (msg: string, meta?: any) => console.warn(`[WARN] ${msg}`, meta || ''),
  error: (msg: string, meta?: any) => console.error(`[ERROR] ${msg}`, meta || ''),
};

