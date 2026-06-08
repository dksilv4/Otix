import { ipcMain, shell } from 'electron';
import { spawn } from 'child_process';
import path from 'path';
import { GameDetector } from '../game-detector';
import { LocalGame } from '../scanner';

export function registerGameDetectorIPC(gameDetector: GameDetector | null): void {
  // Launch game — accepts full LocalGame for tracking
  ipcMain.handle('launcher:launch-game', async (_, game: LocalGame) => {
    try {
      if (game.exePath.startsWith('steam://')) {
        await shell.openExternal(game.exePath);
        gameDetector?.startTracking(game); // no PID for Steam, scan will confirm
        return true;
      } else {
        const gameDir = path.dirname(game.exePath);
        const child = spawn(game.exePath, [], {
          cwd: gameDir,
          detached: true,
          stdio: 'ignore',
        });
        gameDetector?.startTracking(game, child.pid);
        child.unref();
        return true;
      }
    } catch (err) {
      console.error('Failed to launch game', game.exePath, err);
      throw err;
    }
  });

  ipcMain.handle('game:get-running', () => {
    return gameDetector?.getRunningGames() ?? [];
  });

  ipcMain.handle('game:get-running-single', () => {
    return gameDetector?.getRunningGame() ?? null;
  });

  ipcMain.handle('game:get-recent-sessions', () => {
    return gameDetector?.getRecentSessions() ?? [];
  });

  ipcMain.handle('game:get-playtime', (_event, gameId: string) => {
    return gameDetector?.getPlaytimeForGame(gameId) ?? { totalMinutes: 0, sessionCount: 0, lastPlayed: null };
  });

  ipcMain.handle('game:set-library', (_, games: LocalGame[]) => {
    gameDetector?.setLibrary(games);
    gameDetector?.startPeriodicScan();
    return true;
  });

  ipcMain.handle('game:stop-tracking', (_, gameId: string) => {
    gameDetector?.stopTracking(gameId);
    return true;
  });

  ipcMain.handle('game:get-running-processes', async () => {
    return gameDetector?.getRunningProcesses() ?? [];
  });

  ipcMain.handle('game:add-mapping', (_, processName: string, gameId: string, gameTitle: string) => {
    gameDetector?.addMapping(processName, gameId, gameTitle);
    return true;
  });

  ipcMain.handle('game:remove-mapping', (_, processName: string) => {
    gameDetector?.removeMapping(processName);
    return true;
  });

  ipcMain.handle('game:get-mappings', () => {
    return gameDetector?.getMappings() ?? [];
  });

  ipcMain.handle('game:get-library', () => {
    return gameDetector?.getLibrary() ?? [];
  });
}
