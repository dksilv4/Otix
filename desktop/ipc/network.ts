import { ipcMain } from 'electron';
import type {
  CurrentNetworkInfo,
  HomeNetworkProfile,
  HomeVerificationResult,
} from '../network-detector';

export function registerNetworkIPC(): void {
  ipcMain.handle(
    'network:detect-current',
    async (): Promise<CurrentNetworkInfo> => {
      const { detectCurrentNetwork } = await import('../network-detector');
      return detectCurrentNetwork();
    }
  );

  const probeHandler = async (_event: any, url: string, timeoutMs?: number): Promise<boolean> => {
    const { probeLocalNode } = await import('../network-detector');
    return await probeLocalNode(url, timeoutMs);
  };

  ipcMain.handle('network:probe-node', probeHandler);
  ipcMain.handle('network:probe-server', probeHandler);

  ipcMain.handle(
    'network:verify-home',
    async (
      _event,
      profile: HomeNetworkProfile
    ): Promise<HomeVerificationResult> => {
      const { verifyHomeNetwork } = await import('../network-detector');
      return await verifyHomeNetwork(profile);
    }
  );
}
