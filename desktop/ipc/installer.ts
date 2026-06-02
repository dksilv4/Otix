import { ipcMain, dialog } from 'electron';
import {
  mountIso,
  dismountIso,
  applyCrack,
  previewOrganization,
  executeOrganization,
  launchSetup,
} from '../installer';
import { findUpdateFilesForIso } from '../scanner';
import { batchOrganizeDirectory, smartOrganizePreview } from '../auto-organizer';

export function registerInstallerIPC(): void {
  // Select ISO dialog
  ipcMain.handle('installer:select-iso', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Game ISO File',
      filters: [{ name: 'Disk Images', extensions: ['iso'] }],
      properties: ['openFile'],
    });
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

  // Execute ISO Folder Reorganization
  ipcMain.handle('installer:execute-organization', async (_, items: { sourcePath: string; targetPath: string }[]) => {
    return await executeOrganization(items);
  });

  // Batch-organize a directory using configured naming template
  ipcMain.handle('installer:batch-organize', async (_, directory: string, namingTemplate?: string) => {
    return await batchOrganizeDirectory(directory, namingTemplate);
  });

  // Smart preview using parseReleaseName + naming template (arr-style)
  ipcMain.handle('installer:smart-preview', async (_, directory: string, namingTemplate: string, separator?: string) => {
    return await smartOrganizePreview(directory, namingTemplate, separator as 'space' | 'dot' | 'underscore' | 'dash');
  });

  ipcMain.handle('installer:launch-setup', async (_, setupPath: string) => {
    try {
      return await launchSetup(setupPath);
    } catch (err) {
      console.error('Failed to launch installer:', setupPath, err);
      throw err;
    }
  });
}
