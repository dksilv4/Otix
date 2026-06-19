import { ipcMain, BrowserWindow } from 'electron';
import { PluginManager } from '../plugins/manager';
import { PermissionManager } from '../plugins/permissions';
import { getPluginConfig, setPluginConfig, getPluginRepos, addPluginRepo, removePluginRepo } from '../plugins/db';
import { eventBus } from '../plugins/event-bus';
import type { PermissionResponse } from '../plugins/types';
import { fetchAllRegistries } from '../plugins/marketplace';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';

export function registerPluginIPC(
  pluginManager: PluginManager,
  permissionManager: PermissionManager,
  mainWindow: BrowserWindow
): void {
  // ── Plugin CRUD ──

  ipcMain.handle('plugin:list', () => {
    return pluginManager.getAllPlugins();
  });

  ipcMain.handle('plugin:get', (_event, id: string) => {
    const plugins = pluginManager.getAllPlugins();
    return plugins.find((p) => p.id === id) ?? null;
  });

  ipcMain.handle('plugin:install', async (_event, repoUrl: string, pluginPath?: string) => {
    return await pluginManager.installFromGit(repoUrl, pluginPath);
  });

  ipcMain.handle('plugin:uninstall', async (_event, id: string) => {
    await pluginManager.uninstall(id);
  });

  ipcMain.handle('plugin:enable', async (_event, id: string) => {
    await pluginManager.enable(id);
  });

  ipcMain.handle('plugin:disable', async (_event, id: string) => {
    await pluginManager.disable(id);
  });

  ipcMain.handle('plugin:update', async (_event, id: string) => {
    return await pluginManager.updatePlugin(id);
  });

  ipcMain.handle('plugin:reload', async (_event, id: string) => {
    await pluginManager.disable(id);
    await pluginManager.enable(id);
    return pluginManager.getAllPlugins();
  });

  ipcMain.handle('plugin:discover', async () => {
    return await pluginManager.discoverPlugins();
  });

  // ── Plugin configuration ──

  ipcMain.handle('plugin:get-config', (_event, pluginId: string) => {
    const raw = getPluginConfig(pluginId);
    const parsed: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      try {
        parsed[key] = JSON.parse(value as string);
      } catch {
        parsed[key] = value;
      }
    }
    return parsed;
  });

  ipcMain.handle('plugin:set-config', (_event, pluginId: string, key: string, value: unknown) => {
    setPluginConfig(pluginId, key, JSON.stringify(value));
  });

  // ── Permission management ──

  ipcMain.handle('plugin:respond-permission', (_event, requestId: string, response: PermissionResponse) => {
    permissionManager.respondToRequest(requestId, response);
  });

  // ── Event bus bridge: renderer -> plugins ──

  ipcMain.handle('plugin:emit-event', (_event, eventName: string, payload: unknown) => {
    eventBus.emit(eventName as any, payload);
  });

  // ── Auth / API config ──

  ipcMain.handle('plugin:set-auth-token', (_event, token: string) => {
    pluginManager.setAuthToken(token);
  });

  ipcMain.handle('plugin:get-api-base-url', () => {
    return pluginManager.getApiBaseUrl();
  });

  ipcMain.handle('plugin:set-api-base-url', (_event, url: string) => {
    pluginManager.setApiBaseUrl(url);
  });

  // ── Plugin status ──

  ipcMain.handle('plugin:status', async (_event, pluginId: string) => {
    try {
      return await pluginManager.getPluginStatus(pluginId);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Plugin data API ──

  ipcMain.handle('plugin:call-data', async (_event, pluginId: string, method: string, ...args: unknown[]) => {
    return await pluginManager.callPluginData(pluginId, method, ...args);
  });

  // ── Connection testing ──

  ipcMain.handle('plugin:test-instance', async (_event, url: string, apiKey: string) => {
    try {
      const response = await fetch(`${url.replace(/\/+$/, '')}/api/v3/system/status`, {
        headers: { 'X-Api-Key': apiKey },
      });
      if (response.ok) {
        const data = await response.json();
        return { success: true, message: `Connected (v${data.version || '?'})` };
      }
      if (response.status === 401) {
        return { success: false, message: 'Authentication failed — check API Key.' };
      }
      return { success: false, message: `Connection failed (HTTP ${response.status}).` };
    } catch (err) {
      return { success: false, message: `Could not reach ${url}. Is it running?` };
    }
  });

  ipcMain.handle('plugin:test-config', async (_event, pluginId: string, configDraft: Record<string, unknown>) => {
    try {
      const result = await pluginManager.testPluginConfig(pluginId, configDraft);
      return result;
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  });

  // ── Marketplace ──

  ipcMain.handle('plugin:marketplace', async () => {
    const result = await fetchAllRegistries();
    return { success: true, plugins: result.entries, errors: result.errors.length > 0 ? result.errors : undefined };
  });

  // ── Repo management ──

  ipcMain.handle('plugin:repos', async () => {
    return getPluginRepos();
  });

  ipcMain.handle('plugin:add-repo', async (_event, url: string, label?: string) => {
    addPluginRepo(url, label);
    return getPluginRepos();
  });

  ipcMain.handle('plugin:remove-repo', async (_event, url: string) => {
    removePluginRepo(url);
    return getPluginRepos();
  });
}
