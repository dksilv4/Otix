import { ApiProxy } from './types';
import { PermissionManager } from './permissions';

async function apiRequest<T>(
  method: string, path: string, data: unknown | undefined,
  pluginId: string, pluginName: string,
  permissionManager: PermissionManager,
  getAuthToken: () => string | null,
  getApiBaseUrl: () => string
): Promise<T> {
  const result = await permissionManager.requestPermission(
    pluginId, pluginName, 'api:proxy', `Call Otix API: ${method} ${path}`
  );
  if (!result.granted) throw new Error('Permission denied: api:proxy');

  const url = `${getApiBaseUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getAuthToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const options: RequestInit = { method, headers };
  if (data !== undefined && method !== 'GET' && method !== 'HEAD') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export function createApiProxy(
  pluginId: string, pluginName: string,
  permissionManager: PermissionManager,
  getAuthToken: () => string | null,
  getApiBaseUrl: () => string
): ApiProxy {
  const req = (method: string) => <T>(path: string, data?: unknown) =>
    apiRequest<T>(method, path, data, pluginId, pluginName, permissionManager, getAuthToken, getApiBaseUrl);
  return {
    get: req('GET'),
    post: req('POST'),
    put: req('PUT'),
    delete: req('DELETE'),
  };
}
