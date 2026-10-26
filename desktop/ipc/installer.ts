import { BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import {
  mountIso,
  dismountIso,
  applyCrack,
  previewOrganization,
  executeOrganization,
  launchSetup,
  installGameIso,
  cancelCurrentInstall,
  cancelInstall,
  cancelInstallByIsoPath,
  getActiveInstalls,
  findGameExe,
  type InstallProgress,
} from '../installer';
import { findUpdateFilesForIso } from '../game/scan-utils';
import {
  batchOrganizeDirectory,
  smartOrganizePreview,
  diagnoseArchiveIntegrity,
  healRepackArchive,
} from '../downloads/organizer';
import { updateGamePathInDb, getScanPathsFromDb } from '../downloads';

export function registerInstallerIPC(): void {
  // Select ISO dialog
  ipcMain.handle('installer:select-iso', async (event) => {
    const win = (event?.sender ? BrowserWindow.fromWebContents(event.sender) : null) || BrowserWindow.getFocusedWindow();
    const opts = {
      title: 'Select Game ISO File',
      filters: [{ name: 'Disk Images', extensions: ['iso'] }],
      properties: ['openFile' as const],
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled) return null;
    return result.filePaths[0];
  });

  // Mount ISO
  ipcMain.handle('installer:mount-iso', async (_, isoPath: string) => {
    return await mountIso(isoPath);
  });

  // Dismount ISO
  ipcMain.handle('installer:dismount-iso', async (_, isoPath: string) => {
    return await dismountIso(isoPath);
  });

  // Apply Crack
  ipcMain.handle('installer:apply-crack', async (_, crackPath: string, targetDir: string) => {
    return await applyCrack(crackPath, targetDir);
  });

  // Find updates for ISO
  ipcMain.handle('installer:get-updates', async (_, isoPath: string) => {
    return await findUpdateFilesForIso(isoPath);
  });

  // Preview ISO Folder Reorganization
  ipcMain.handle('installer:preview-organization', async (_, directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string, separator?: string) => {
    return await previewOrganization(directory, regexPattern, isoTemplate, updateTemplate, separator as 'space' | 'dot' | 'underscore' | 'dash');
  });

  // Execute ISO Folder Reorganization — also updates scanned game paths in DB
  ipcMain.handle('installer:execute-organization', async (event, items: any[], deleteEmptyFolders?: boolean) => {
    const results = await executeOrganization(items, deleteEmptyFolders ?? true);
    let updated = false;
    for (const r of results) {
      if (r.success) {
        await updateGamePathInDb(r.sourcePath, r.targetPath);
        updated = true;
      }
    }
    if (updated) event.sender.send('scanner:game-updated');
    return results;
  });

  // Batch-organize a directory — also updates scanned game paths in DB
  ipcMain.handle('installer:batch-organize', async (event, directory: string, namingTemplate?: string) => {
    const result = await batchOrganizeDirectory(directory, namingTemplate);
    for (const o of result.organized) {
      await updateGamePathInDb(o.from, o.to);
    }
    if (result.organized.length > 0) event.sender.send('scanner:game-updated');
    return result;
  });

  // Smart preview using parseReleaseName + naming template (arr-style)
  ipcMain.handle('installer:smart-preview', async (_, directory: string, namingTemplate: string, separator?: string) => {
    try {
      return await smartOrganizePreview(directory, namingTemplate, separator as 'space' | 'dot' | 'underscore' | 'dash');
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.message?.includes('Folder does not exist')) {
        return [];
      }
      throw err;
    }
  });

  // Diagnose Repack Archive
  ipcMain.handle('installer:diagnose-repack', async (_, directory: string) => {
    return await diagnoseArchiveIntegrity(directory);
  });

  // Heal Repack Archive
  ipcMain.handle('installer:heal-repack', async (_, directory: string) => {
    return await healRepackArchive(directory);
  });

  ipcMain.handle('installer:launch-setup', async (_, setupPath: string) => {
    try {
      return await launchSetup(setupPath);
    } catch (err) {
      console.error('Failed to launch installer:', setupPath, err);
      throw err;
    }
  });

  // Return active installs (for rehydration after renderer refresh)
  ipcMain.handle('installer:get-active-installs', () => {
    return getActiveInstalls();
  });

  // Auto install — mount → silent install → crack → dismount
  ipcMain.handle(
    'installer:install-game',
    async (event, isoPath: string, targetDir: string, gameTitle?: string) => {
      const installId = randomUUID();

      const sendProgress = (p: InstallProgress) => {
        try {
          event.sender.send('installer:install-progress', { ...p, installId, isoPath });
        } catch {
          // window may have closed
        }
      };

      try {
        // Get ISO scan directories to use as search roots for path resolution
        const allPaths = await getScanPathsFromDb();
        const isoRoots = allPaths
          .filter((p) => p.type === 'iso')
          .map((p) => p.path);

        const result = await installGameIso(installId, isoPath, targetDir, gameTitle ?? 'Game', sendProgress, isoRoots);
        return result;
      } catch (err: any) {
        console.error('[installer:install-game] Fatal:', err);
        return {
          success: false,
          installDir: targetDir,
          error: err.message || 'Unknown error',
        };
      }
    },
  );

  // Check if install directory has a game executable
  ipcMain.handle('installer:check-install-dir', async (_, installDir: string) => {
    try {
      const gameExe = await findGameExe(installDir)
      return { found: !!gameExe, gameExe: gameExe ?? null }
    } catch {
      return { found: false, gameExe: null }
    }
  })

  // Cancel a running install — accepts isoPath or installId
  ipcMain.handle('installer:cancel-install', (_event, cancelKey?: string) => {
    if (!cancelKey) {
      cancelCurrentInstall();
    } else {
      cancelInstallByIsoPath(cancelKey);
      cancelInstall(cancelKey); // also try as installId (no-op if already cancelled)
    }
    return true;
  });
}
