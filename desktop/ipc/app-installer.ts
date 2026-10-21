import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { exec, execSync, spawn } from 'child_process';

export interface SetupInstallerInfo {
  version: string;
  defaultInstallPath: string;
  isElevated: boolean;
  sourcePath: string;
}

export interface SetupDiskSpace {
  freeBytes: number;
  totalBytes: number;
  drive: string;
}

export interface SetupInstallOptions {
  installPath: string;
  createDesktopShortcut: boolean;
  createStartMenuShortcut: boolean;
  startOnBoot: boolean;
}

export interface SetupProgressPayload {
  percent: number;
  status: string;
  detail?: string;
  currentFile?: string;
}

export interface SetupUninstallOptions {
  removeUserData: boolean;
}

function isElevated(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execSync('fltmc', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function getDriveLetter(targetPath: string): string {
  const match = targetPath.match(/^([a-zA-Z]:)/);
  return match ? `${match[1].toUpperCase()}\\` : 'C:\\';
}

function getDiskSpace(targetPath: string): SetupDiskSpace {
  const drive = getDriveLetter(targetPath);
  try {
    const stat = fs.statfsSync(drive);
    return {
      freeBytes: stat.bsize * stat.bfree,
      totalBytes: stat.bsize * stat.blocks,
      drive,
    };
  } catch {
    return {
      freeBytes: 100 * 1024 * 1024 * 1024,
      totalBytes: 500 * 1024 * 1024 * 1024,
      drive,
    };
  }
}

function getDefaultInstallPath(): string {
  if (process.platform === 'win32') {
    const elevated = isElevated();
    if (elevated) {
      const progFiles = process.env.ProgramFiles || 'C:\\Program Files';
      return path.join(progFiles, 'Otix');
    }
    const localAppData = process.env.LOCALAPPDATA || path.join(app.getPath('home'), 'AppData', 'Local');
    return path.join(localAppData, 'Programs', 'Otix');
  }
  return path.join(app.getPath('home'), 'Otix');
}

function getAllFiles(dir: string, baseDir: string = dir): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
}

function execPowershell(command: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const escaped = command.replace(/"/g, '`"');
    exec(`powershell -NoProfile -NonInteractive -Command "${escaped}"`, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

function createShortcut(shortcutPath: string, targetPath: string, workingDir: string, iconPath?: string): Promise<string> {
  const ps = `
    $ws = New-Object -ComObject WScript.Shell;
    $dir = Split-Path -Path '${shortcutPath.replace(/'/g, "''")}';
    if (!(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null };
    $sc = $ws.CreateShortcut('${shortcutPath.replace(/'/g, "''")}');
    $sc.TargetPath = '${targetPath.replace(/'/g, "''")}';
    $sc.WorkingDirectory = '${workingDir.replace(/'/g, "''")}';
    ${iconPath ? `$sc.IconLocation = '${iconPath.replace(/'/g, "''")},0';` : ''}
    $sc.Save();
  `;
  return execPowershell(ps);
}

let lastInstalledPath = '';

function safeHandle(channel: string, listener: (...args: any[]) => any) {
  try {
    ipcMain.removeHandler(channel);
  } catch {}
  ipcMain.handle(channel, listener);
}

export function registerAppInstallerIPC(installerWindow: BrowserWindow): void {
  // Safe stubs for core renderer bootstrap when in installer mode
  safeHandle('cache:load', async () => null);
  safeHandle('cache:save', async () => {});
  safeHandle('desktop-settings:get', async () => ({}));
  safeHandle('desktop-settings:set', async () => ({}));
  safeHandle('installer:get-active-installs', async () => []);
  safeHandle('ping', async () => 'pong');
  safeHandle('window:is-maximized', async () => false);
  safeHandle('window:get-always-on-top', async () => false);
  safeHandle('updater:get-status', async () => ({ status: 'idle' }));
  safeHandle('updater:get-version', async () => ({ version: '0.1.24' }));
  safeHandle('node-daemon:get-status', async () => ({
    running: false,
    embedded: false,
    port: 8090,
    url: 'http://127.0.0.1:8090',
  }));
  safeHandle('plugin:set-auth-token', async () => {});
  safeHandle('plugin:set-api-base-url', async () => {});
  safeHandle('plugin:get-api-base-url', async () => 'http://127.0.0.1:8000');
  safeHandle('plugin:get-status', async () => ({}));
  safeHandle('plugin:list', async () => []);
  safeHandle('plugin:discover', async () => []);
  safeHandle('game:get-running', async () => null);
  safeHandle('game:get-library', async () => []);
  safeHandle('game:get-mappings', async () => []);
  safeHandle('game:get-playtime', async () => ({}));
  safeHandle('game:get-recent-sessions', async () => []);
  safeHandle('scanner:get-scan-paths', async () => []);
  safeHandle('scanner:get-local-game-map', async () => ({}));
  safeHandle('save:get-cloud-settings', async () => ({}));
  safeHandle('free-games:get-all', async () => []);
  safeHandle('downloads:get-config', async () => ({}));
  safeHandle('downloads:get-user-downloads', async () => []);
  safeHandle('emulators:get-all', async () => []);
  safeHandle('notifications:show', async () => {});
  safeHandle('open-external', async () => {});

  // Window control IPC
  safeHandle('window:minimize', async () => {
    if (!installerWindow.isDestroyed()) installerWindow.minimize();
  });
  safeHandle('window:close', async () => {
    if (!installerWindow.isDestroyed()) installerWindow.close();
  });

  // Get system & version info
  safeHandle('setup:get-info', async (): Promise<SetupInstallerInfo> => {
    const elevated = isElevated();
    const sourceDir = app.isPackaged
      ? path.dirname(process.resourcesPath)
      : path.join(__dirname, '..', 'release', 'win-unpacked');

    return {
      version: app.getVersion(),
      defaultInstallPath: getDefaultInstallPath(),
      isElevated: elevated,
      sourcePath: sourceDir,
    };
  });

  // Calculate disk space
  safeHandle('setup:get-disk-space', async (_, targetPath: string): Promise<SetupDiskSpace> => {
    return getDiskSpace(targetPath || 'C:\\');
  });

  // Browse directory
  safeHandle('setup:browse-directory', async (_, defaultPath?: string): Promise<string | null> => {
    const result = await dialog.showOpenDialog(installerWindow, {
      title: 'Select Otix Installation Folder',
      defaultPath: defaultPath || getDefaultInstallPath(),
      properties: ['openDirectory', 'createDirectory'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  // Start installation
  safeHandle('setup:start-install', async (_, options: SetupInstallOptions) => {
    const {
      installPath,
      createDesktopShortcut,
      createStartMenuShortcut,
      startOnBoot,
    } = options;

    lastInstalledPath = installPath;

    const sendProgress = (payload: SetupProgressPayload) => {
      if (!installerWindow.isDestroyed()) {
        installerWindow.webContents.send('setup:install-progress', payload);
      }
    };

    try {
      // Permission check if target is in Program Files
      if (process.platform === 'win32' && installPath.toLowerCase().includes('program files') && !isElevated()) {
        return {
          success: false,
          error: 'Administrator privileges are required to install to Program Files. Please run setup as administrator or select another directory.',
        };
      }

      // Close any previously running instance of Otix (excluding this installer process)
      if (process.platform === 'win32') {
        try {
          execSync(
            `powershell -NoProfile -NonInteractive -Command "Get-Process -Name 'Otix' -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne ${process.pid} } | Stop-Process -Force"`,
            { stdio: 'ignore' },
          );
        } catch {}
      }

      sendProgress({ percent: 5, status: 'Preparing installation directory...' });
      fs.mkdirSync(installPath, { recursive: true });

      // Identify source files
      let sourceDir = app.isPackaged
        ? path.dirname(process.resourcesPath)
        : path.join(__dirname, '..', 'release', 'win-unpacked');

      if (!fs.existsSync(sourceDir)) {
        sourceDir = path.resolve(__dirname, '..');
      }

      const allFiles = getAllFiles(sourceDir);
      const targetNorm = path.normalize(installPath);
      const sourceNorm = path.normalize(sourceDir);

      // Filter out files that are within the destination or non-app caches
      const filesToCopy = allFiles.filter((f) => {
        const norm = path.normalize(f);
        if (norm.startsWith(targetNorm)) return false;
        if (norm.endsWith('.log') || norm.includes('GPUCache') || norm.includes('Crashpad')) return false;
        return true;
      });

      const totalFiles = filesToCopy.length || 1;
      let copiedFiles = 0;

      for (const file of filesToCopy) {
        const relative = path.relative(sourceNorm, file);
        const destination = path.join(targetNorm, relative);
        const destDir = path.dirname(destination);

        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true });
        }

        try {
          fs.copyFileSync(file, destination);
        } catch (copyErr) {
          console.warn(`[setup] Failed to copy ${file}:`, copyErr);
        }

        copiedFiles++;
        if (copiedFiles % 5 === 0 || copiedFiles === totalFiles) {
          const percent = Math.floor(10 + (copiedFiles / totalFiles) * 65);
          sendProgress({
            percent,
            status: 'Extracting application files...',
            currentFile: relative,
          });
        }
      }

      // Windows shortcuts
      const targetExe = path.join(installPath, 'Otix.exe');
      const iconPath = path.join(installPath, 'resources', 'assets', 'icon.ico');
      const finalIcon = fs.existsSync(iconPath) ? iconPath : targetExe;

      if (process.platform === 'win32') {
        if (createDesktopShortcut) {
          sendProgress({ percent: 78, status: 'Creating desktop shortcut...' });
          try {
            const desktopPath = await execPowershell("[Environment]::GetFolderPath('Desktop')");
            if (desktopPath) {
              const scPath = path.join(desktopPath, 'Otix.lnk');
              await createShortcut(scPath, targetExe, installPath, finalIcon);
            }
          } catch (err) {
            console.warn('[setup] Failed to create desktop shortcut:', err);
          }
        }

        if (createStartMenuShortcut) {
          sendProgress({ percent: 84, status: 'Creating Start Menu shortcut...' });
          try {
            const elevated = isElevated();
            const progFolderCmd = elevated
              ? "[Environment]::GetFolderPath('CommonPrograms')"
              : "[Environment]::GetFolderPath('Programs')";
            const programsPath = await execPowershell(progFolderCmd);
            if (programsPath) {
              const otixFolder = path.join(programsPath, 'Otix');
              const scPath = path.join(otixFolder, 'Otix.lnk');
              await createShortcut(scPath, targetExe, installPath, finalIcon);
            }
          } catch (err) {
            console.warn('[setup] Failed to create start menu shortcut:', err);
          }
        }

        // Registry registration
        sendProgress({ percent: 90, status: 'Registering application and protocols...' });
        try {
          const elevated = isElevated();
          const hive = elevated ? 'HKLM' : 'HKCU';
          const uninstallKey = `${hive}\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Otix`;
          const version = app.getVersion();

          const regCommands = [
            `reg add "${uninstallKey}" /v "DisplayName" /d "Otix" /f`,
            `reg add "${uninstallKey}" /v "DisplayVersion" /d "${version}" /f`,
            `reg add "${uninstallKey}" /v "Publisher" /d "Otix" /f`,
            `reg add "${uninstallKey}" /v "InstallLocation" /d "${installPath}" /f`,
            `reg add "${uninstallKey}" /v "DisplayIcon" /d "${finalIcon}" /f`,
            `reg add "${uninstallKey}" /v "UninstallString" /d "\\"${targetExe}\\" --uninstall" /f`,
            `reg add "${uninstallKey}" /v "QuietUninstallString" /d "\\"${targetExe}\\" --uninstall --silent" /f`,
            `reg add "${uninstallKey}" /v "NoModify" /t REG_DWORD /d 1 /f`,
            `reg add "${uninstallKey}" /v "NoRepair" /t REG_DWORD /d 1 /f`,
            // otix:// protocol handler
            `reg add "${hive}\\Software\\Classes\\otix" /ve /d "URL:Otix Protocol" /f`,
            `reg add "${hive}\\Software\\Classes\\otix" /v "URL Protocol" /d "" /f`,
            `reg add "${hive}\\Software\\Classes\\otix\\shell\\open\\command" /ve /d "\\"${targetExe}\\" \\"%1\\"" /f`,
          ];

          if (startOnBoot) {
            regCommands.push(
              `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Otix" /d "\\"${targetExe}\\" --background" /f`
            );
          }

          for (const cmd of regCommands) {
            try {
              execSync(cmd, { stdio: 'ignore' });
            } catch (regErr) {
              console.warn('[setup] Registry command error:', regErr);
            }
          }
        } catch (regErr) {
          console.warn('[setup] Failed to register registry entries:', regErr);
        }
      }

      sendProgress({ percent: 100, status: 'Installation completed!' });
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown installation error';
      console.error('[setup] Fatal install error:', err);
      return { success: false, error: message };
    }
  });

  // Finish and launch
  safeHandle('setup:finish-and-launch', async () => {
    const installDir = lastInstalledPath || getDefaultInstallPath();
    const targetExe = path.join(installDir, 'Otix.exe');

    if (fs.existsSync(targetExe)) {
      try {
        spawn(targetExe, [], {
          detached: true,
          stdio: 'ignore',
        }).unref();
      } catch (err) {
        console.error('[setup] Failed to launch Otix:', err);
      }
    }

    setTimeout(() => {
      app.quit();
    }, 200);
  });

  // Cancel installation
  safeHandle('setup:cancel', async () => {
    app.quit();
  });

  // Uninstaller handler
  safeHandle('setup:uninstall', async (_, options: SetupUninstallOptions) => {
    const sendProgress = (p: { percent: number; status: string }) => {
      if (!installerWindow.isDestroyed()) {
        installerWindow.webContents.send('setup:uninstall-progress', p);
      }
    };

    try {
      sendProgress({ percent: 15, status: 'Removing shortcuts...' });
      if (process.platform === 'win32') {
        const removeShortcutsPs = `
          $desktop = [Environment]::GetFolderPath('Desktop');
          if (Test-Path "$desktop\\Otix.lnk") { Remove-Item "$desktop\\Otix.lnk" -Force -ErrorAction SilentlyContinue };
          
          $userPrograms = [Environment]::GetFolderPath('Programs');
          if (Test-Path "$userPrograms\\Otix") { Remove-Item "$userPrograms\\Otix" -Recurse -Force -ErrorAction SilentlyContinue };
          
          $commonPrograms = [Environment]::GetFolderPath('CommonPrograms');
          if (Test-Path "$commonPrograms\\Otix") { Remove-Item "$commonPrograms\\Otix" -Recurse -Force -ErrorAction SilentlyContinue };
        `;
        try {
          await execPowershell(removeShortcutsPs);
        } catch {}

        sendProgress({ percent: 45, status: 'Cleaning registry entries...' });
        const regRemovals = [
          'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Otix" /f',
          'reg delete "HKLM\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\Otix" /f',
          'reg delete "HKCU\\Software\\Classes\\otix" /f',
          'reg delete "HKLM\\Software\\Classes\\otix" /f',
          'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "Otix" /f',
        ];

        for (const cmd of regRemovals) {
          try {
            execSync(cmd, { stdio: 'ignore' });
          } catch {}
        }

        if (options.removeUserData) {
          sendProgress({ percent: 75, status: 'Purging user cache and settings...' });
          try {
            const userData = app.getPath('userData');
            if (fs.existsSync(userData)) {
              fs.rmSync(userData, { recursive: true, force: true });
            }
          } catch {}
        }

        sendProgress({ percent: 90, status: 'Scheduling directory cleanup...' });
        const appDir = path.dirname(process.resourcesPath);
        // Delayed folder removal so the running process can exit cleanly
        const cleanupCmd = `cmd.exe /c "timeout /t 2 /nobreak >nul & rd /s /q \\"${appDir}\\""`;
        try {
          spawn('cmd.exe', ['/c', cleanupCmd], {
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          }).unref();
        } catch {}
      }

      sendProgress({ percent: 100, status: 'Otix uninstalled successfully.' });
      return { success: true };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Unknown uninstallation error';
      return { success: false, error: message };
    }
  });

  // Window controls
  safeHandle('setup:window-minimize', () => {
    if (!installerWindow.isDestroyed()) {
      installerWindow.minimize();
    }
  });

  safeHandle('setup:window-close', () => {
    if (!installerWindow.isDestroyed()) {
      installerWindow.close();
    }
  });
}
