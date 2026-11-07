import { ipcMain } from 'electron';
import type { GameServerProbeParams, GameServerQueryResult } from '../game/server-query';

export function registerGameServersIPC(): void {
  ipcMain.handle(
    'gameserver:query',
    async (_event, params: GameServerProbeParams): Promise<GameServerQueryResult> => {
      try {
        const { probeGameServer } = await import('../game/server-query');
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
