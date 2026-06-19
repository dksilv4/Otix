import { randomUUID } from 'crypto';
import { WebContents } from 'electron';
import { PluginPermission, PermissionRequest, PermissionResponse } from './types';
import {
  getGrantedPermissions,
  grantPermission,
  revokePermission,
  revokeAllPermissions,
} from './plugin-db';

interface PendingRequest {
  pluginId: string;
  permission: PluginPermission;
  resolve: (value: PermissionResponse) => void;
  reject: (reason: Error) => void;
  timeout: NodeJS.Timeout;
}

export class PermissionManager {
  private webContents: WebContents | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();

  setWebContents(wc: WebContents): void {
    this.webContents = wc;
  }

  isGranted(pluginId: string, permission: PluginPermission): boolean {
    const grants = getGrantedPermissions(pluginId);
    return grants.some(g => g.permission === permission);
  }

  getGranted(pluginId: string): PluginPermission[] {
    return getGrantedPermissions(pluginId).map(g => g.permission);
  }

  grant(pluginId: string, permission: PluginPermission): void {
    grantPermission(pluginId, permission);
  }

  revoke(pluginId: string, permission: PluginPermission): void {
    revokePermission(pluginId, permission);
  }

  revokeAll(pluginId: string): void {
    revokeAllPermissions(pluginId);
  }

  async requestPermission(
    pluginId: string,
    pluginName: string,
    permission: PluginPermission,
    reason: string
  ): Promise<PermissionResponse> {
    if (this.isGranted(pluginId, permission)) {
      return { granted: true, duration: 'always' };
    }

    if (!this.webContents) {
      throw new Error(
        'PermissionManager: no webContents available to request permission'
      );
    }

    const requestId = randomUUID();

    return new Promise<PermissionResponse>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(
          new Error(`Permission request timed out for ${permission}`)
        );
      }, 60000);

      this.pendingRequests.set(requestId, {
        pluginId,
        permission,
        resolve,
        reject,
        timeout,
      });

      const request: PermissionRequest = {
        requestId,
        pluginId,
        pluginName,
        permission,
        reason,
      };

      try {
        this.webContents!.send('plugin:permission-request', request);
      } catch (err) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(
          new Error(
            `Failed to send permission request: ${err instanceof Error ? err.message : String(err)}`
          )
        );
      }
    });
  }

  respondToRequest(requestId: string, response: PermissionResponse): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (response.granted && response.duration === 'always') {
      grantPermission(pending.pluginId, pending.permission);
    }

    if (response.granted) {
      pending.resolve(response);
    } else {
      pending.reject(new Error(`Permission denied: ${pending.permission}`));
    }
  }
}
