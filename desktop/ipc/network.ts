import { ipcMain } from 'electron';
import {
  detectCurrentNetwork,
  probeLocalServer,
  verifyHomeNetwork,
  type CurrentNetworkInfo,
  type HomeNetworkProfile,
  type HomeVerificationResult,
} from '../network-detector';

export function registerNetworkIPC(): void {
  ipcMain.handle(
    'network:detect-current',
    async (): Promise<CurrentNetworkInfo> => {
      return detectCurrentNetwork();
    }
  );

  ipcMain.handle(
    'network:probe-server',
    async (_event, url: string, timeoutMs?: number): Promise<boolean> => {
      return await probeLocalServer(url, timeoutMs);
    }
  );

  ipcMain.handle(
    'network:verify-home',
    async (
      _event,
      profile: HomeNetworkProfile
    ): Promise<HomeVerificationResult> => {
      return await verifyHomeNetwork(profile);
    }
  );
}
