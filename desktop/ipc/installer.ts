import { BrowserWindow, dialog, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import type { InstallProgress } from '../installer';

let _installerMod: typeof import('../installer') | null = null;
async function getInstaller() {
  if (!_installerMod) _installerMod = await import('../installer');
  return _installerMod;
}

let _organizerMod: typeof import('../downloads/organizer') | null = null;
async function getOrganizer() {
  if (!_organizerMod) _organizerMod = await import('../downloads/organizer');
  return _organizerMod;
}

let _downloadsMod: typeof import('../downloads') | null = null;
async function getDownloads() {
  if (!_downloadsMod) _downloadsMod = await import('../downloads');
  return _downloadsMod;
}

let _scanUtilsMod: typeof import('../game/scan-utils') | null = null;
async function getScanUtils() {
  if (!_scanUtilsMod) _scanUtilsMod = await import('../game/scan-utils');
  return _scanUtilsMod;
}

let _uncMod: typeof import('../unc-resolver') | null = null;
async function getUnc() {
  if (!_uncMod) _uncMod = await import('../unc-resolver');
  return _uncMod;
}

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
    const inst = await getInstaller();
    return await inst.mountIso(isoPath);
  });

  // Dismount ISO
  ipcMain.handle('installer:dismount-iso', async (_, isoPath: string) => {
    const inst = await getInstaller();
    return await inst.dismountIso(isoPath);
  });

  // Apply Crack
  ipcMain.handle('installer:apply-crack', async (_, crackPath: string, targetDir: string) => {
    const inst = await getInstaller();
    return await inst.applyCrack(crackPath, targetDir);
  });

  // Find updates for ISO
  ipcMain.handle('installer:get-updates', async (_, isoPath: string) => {
    const su = await getScanUtils();
    return await su.findUpdateFilesForIso(isoPath);
  });

  // Preview ISO Folder Reorganization
  ipcMain.handle('installer:preview-organization', async (_, directory: string, regexPattern: string, isoTemplate: string, updateTemplate: string, separator?: string) => {
    const inst = await getInstaller();
    return await inst.previewOrganization(directory, regexPattern, isoTemplate, updateTemplate, separator as 'space' | 'dot' | 'underscore' | 'dash');
  });

  // Execute ISO Folder Reorganization — also updates scanned game paths in DB
  ipcMain.handle('installer:execute-organization', async (event, items: any[], deleteEmptyFolders?: boolean) => {
    const inst = await getInstaller();
    const dl = await getDownloads();
    const results = await inst.executeOrganization(items, deleteEmptyFolders ?? true);
    let updated = false;
    for (const r of results) {
      if (r.success) {
        await dl.updateGamePathInDb(r.sourcePath, r.targetPath);
        updated = true;
      }
    }
    if (updated) event.sender.send('scanner:game-updated');
    return results;
  });

  // Batch-organize a directory — also updates scanned game paths in DB
  ipcMain.handle('installer:batch-organize', async (event, directory: string, namingTemplate?: string) => {
    const org = await getOrganizer();
    const dl = await getDownloads();
    const result = await org.batchOrganizeDirectory(directory, namingTemplate);
    for (const o of result.organized) {
      await dl.updateGamePathInDb(o.from, o.to);
    }
    if (result.organized.length > 0) event.sender.send('scanner:game-updated');
    return result;
  });

  // Smart preview using parseReleaseName + naming template (arr-style)
  ipcMain.handle('installer:smart-preview', async (_, directory: string, namingTemplate: string, separator?: string) => {
    try {
      const org = await getOrganizer();
      return await org.smartOrganizePreview(directory, namingTemplate, separator as 'space' | 'dot' | 'underscore' | 'dash');
    } catch (err: any) {
      if (err?.code === 'ENOENT' || err?.message?.includes('Folder does not exist')) {
        return [];
      }
      if (err?.code === 'UNKNOWN' || err?.errno === -4094) {
        const isNetwork = directory?.startsWith('\\\\') || directory?.startsWith('//');
        throw new Error(
          isNetwork
            ? `Network share is offline or unreachable: ${directory}`
            : `Folder path is inaccessible: ${directory}`,
        );
      }
      throw err;
    }
  });

  // Diagnose Repack Archive
  ipcMain.handle('installer:diagnose-repack', async (_, directory: string) => {
    const unc = await getUnc();
    const org = await getOrganizer();
    return await org.diagnoseArchiveIntegrity(unc.resolveUncPath(directory));
  });

  // Heal Repack Archive
  ipcMain.handle('installer:heal-repack', async (_, directory: string) => {
    const unc = await getUnc();
    const org = await getOrganizer();
    return await org.healRepackArchive(unc.resolveUncPath(directory));
  });

  ipcMain.handle('installer:launch-setup', async (_, setupPath: string) => {
    try {
      const unc = await getUnc();
      const inst = await getInstaller();
      return await inst.launchSetup(unc.resolveUncPath(setupPath));
    } catch (err) {
      console.error('Failed to launch installer:', setupPath, err);
      throw err;
    }
  });

  // Return active installs (for rehydration after renderer refresh)
  ipcMain.handle('installer:get-active-installs', async () => {
    const inst = await getInstaller();
    return inst.getActiveInstalls();
  });

  // Auto install — mount → silent install → crack → dismount
  ipcMain.handle(
    'installer:install-game',
    async (event, isoPath: string, targetDir: string, gameTitle?: string) => {
      const unc = await getUnc();
      const inst = await getInstaller();
      const dl = await getDownloads();
      const resolvedIso = unc.resolveUncPath(isoPath);
      const resolvedTarget = unc.resolveUncPath(targetDir);
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
        const allPaths = await dl.getScanPathsFromDb();
        const isoRoots = allPaths
          .filter((p) => p.type === 'iso')
          .map((p) => unc.resolveUncPath(p.path));

        const result = await inst.installGameIso(installId, resolvedIso, resolvedTarget, gameTitle ?? 'Game', sendProgress, isoRoots);
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
      const unc = await getUnc();
      const inst = await getInstaller();
      const gameExe = await inst.findGameExe(unc.resolveUncPath(installDir));
      return { found: !!gameExe, gameExe: gameExe ?? null };
    } catch {
      return { found: false, gameExe: null };
    }
  });

  // Cancel a running install — accepts isoPath or installId
  ipcMain.handle('installer:cancel-install', async (_event, cancelKey?: string) => {
    const inst = await getInstaller();
    if (!cancelKey) {
      inst.cancelCurrentInstall();
    } else {
      inst.cancelInstallByIsoPath(cancelKey);
      inst.cancelInstall(cancelKey); // also try as installId (no-op if already cancelled)
    }
    return true;
  });
}
