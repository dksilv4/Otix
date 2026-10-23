import { ipcMain } from 'electron';
import { probeGameServer, type GameServerProbeParams, type GameServerQueryResult } from '../game/server-query';

export function registerGameServersIPC(): void {
  ipcMain.handle(
    'gameserver:query',
    async (_event, params: GameServerProbeParams): Promise<GameServerQueryResult> => {
      try {
        return await probeGameServer(params);
      } catch (err: unknown) {
        return {
          status: 'offline',
          pingMs: null,
          error: (err as Error)?.message || 'Failed to probe server',
        };
      }
    },
  );
}
