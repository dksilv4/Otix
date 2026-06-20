/* ── Save Management IPC Handlers ── */

import { ipcMain, dialog } from 'electron';
import type { SaveDaemon } from '../saves';
import { exportProfile, importSaves } from '../saves/export';
import * as path from 'path';
import { app } from 'electron';

export function registerSaveIPC(daemon: SaveDaemon): void {
  // ── Known locations ──

  ipcMain.handle('save:get-known-locations', async () => {
    return daemon.loadKnownLocations();
  });

  // ── Discovery ──

  ipcMain.handle('save:discover-for-game', async (_event, gameId: string, gameTitle: string) => {
    return daemon.discoverForGame(gameId, gameTitle);
  });

  // ── Backup ──

  ipcMain.handle('save:backup-to-vault', async (_event, gameId: string, originPaths: string[]) => {
    return daemon.backupToVault(gameId, originPaths);
  });

  // ── Restore ──

  ipcMain.handle('save:restore-from-vault', async (_event, gameId: string, options: any) => {
    return daemon.restoreFromVault(gameId, options);
  });

  // ── Profiles ──

  ipcMain.handle('save:get-profiles', async (_event, gameId: string) => {
    return daemon.getProfiles(gameId);
  });

  ipcMain.handle('save:create-profile', async (_event, gameId: string, name: string) => {
    return daemon.createProfile(gameId, name);
  });

  ipcMain.handle('save:delete-profile', async (_event, profileId: string) => {
    return daemon.deleteProfile(profileId);
  });

  ipcMain.handle('save:set-active-profile', async (_event, profileId: string) => {
    return daemon.setActiveProfile(profileId);
  });

  // ── Snapshots ──

  ipcMain.handle('save:get-snapshots', async (_event, profileId: string) => {
    return daemon.getSnapshots(profileId);
  });

  ipcMain.handle('save:create-snapshot', async (_event, profileId: string, name?: string) => {
    return daemon.createSnapshot(profileId, name);
  });

  ipcMain.handle('save:delete-snapshot', async (_event, snapshotId: string) => {
    return daemon.deleteSnapshot(snapshotId);
  });

  // ── Overrides ──

  ipcMain.handle('save:get-override', async (_event, gameId: string) => {
    return daemon.getOverride(gameId);
  });

  ipcMain.handle('save:set-override', async (_event, gameId: string, userPath: string) => {
    return daemon.setOverride(gameId, userPath);
  });

  ipcMain.handle('save:clear-override', async (_event, gameId: string) => {
    return daemon.clearOverride(gameId);
  });

  // ── Cloud sync ──

  ipcMain.handle('save:get-cloud-settings', async (_event, gameId: string) => {
    return daemon.getCloudSettings(gameId);
  });

  ipcMain.handle('save:set-cloud-settings', async (_event, gameId: string, autoSync: boolean) => {
    return daemon.setCloudSettings(gameId, autoSync);
  });

  ipcMain.handle('save:sync-cloud', async (_event, gameId: string, gameTitle: string, profileId: string, apiBaseUrl: string, authToken: string) => {
    return daemon.syncCloud(gameId, gameTitle, profileId, apiBaseUrl, authToken);
  });

  ipcMain.handle('save:confirm-path', async (_event, gameId: string, absolutePath: string, apiBaseUrl: string, authToken: string) => {
    return daemon.confirmSavePath(gameId, absolutePath, apiBaseUrl, authToken);
  });

  ipcMain.handle('save:resolve-path-patterns', async (_event, patterns: string[]) => {
    return daemon.resolvePathPatterns(patterns);
  });

  // ── Vault status ──

  ipcMain.handle('save:get-vault-status', async () => {
    return daemon.getVaultStatus();
  });

  // ── Vault path ──

  ipcMain.handle('save:get-vault-path', async () => {
    return daemon.getVaultRoot();
  });

  ipcMain.handle('save:set-vault-path', async (_event, newPath: string) => {
    await daemon.setVaultRoot(newPath);
  });

  // ── Export / Import ──

  ipcMain.handle('save:export-saves', async (_event, gameId: string, targetDir: string) => {
    // Export the active profile
    const profiles = await daemon.getProfiles(gameId);
    const active = profiles.find((p) => p.isActive) || profiles[0];
    if (!active) throw new Error('No save profiles to export');
    return exportProfile(daemon, active.id, targetDir);
  });

  ipcMain.handle('save:import-saves', async (_event, gameId: string, sourceDir: string) => {
    return importSaves(daemon, gameId, sourceDir);
  });

  // ── Dialog: select export directory ──

  ipcMain.handle('save:select-export-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Export Directory',
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ── Dialog: select import directory ──

  ipcMain.handle('save:select-import-dir', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Save Import Directory',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // ── Dialog: select override path ──

  ipcMain.handle('save:select-override-path', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game Save Directory',
      properties: ['openDirectory'],
    });
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  console.log('[Saves IPC] Registered all save management handlers');
}
