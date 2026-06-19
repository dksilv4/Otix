import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { Notification, WebContents, app } from 'electron';
import Database from 'better-sqlite3';
import { eventBus } from './event-bus';
import { PluginsRepository } from '../db';
import { PermissionManager } from './permissions';
import { loadPluginMain, loadPluginTest, loadPluginStatus, loadPluginData } from './loader';
import { createApiProxy } from './api-proxy';
import {
  PluginInfo,
  PluginManifest,
  PluginContext,
  PluginConfigStore,
  PluginDatabase,
  PluginFetch,
  PluginLogger,
  PluginNotifications,
  EventSubscriber,
} from './types';

interface PluginRuntime {
  info: PluginInfo;
  cleanup?: () => void;
}

export class PluginManager {
  private plugins: Map<string, PluginRuntime> = new Map();
  private subscriptions: Map<string, (() => void)[]> = new Map();
  private destroyCallbacks: Map<string, (() => void)[]> = new Map();
  private slotsRegistry: Map<string, {pluginId: string; label: string}[]> = new Map();
  private authToken: string | null = null;
  private apiBaseUrl = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000/api';

  constructor(
    private extensionsDir: string,
    private permissionManager: PermissionManager,
    private userDataPath: string,
    private pluginsRepo: PluginsRepository,
  ) {
  }

  setWebContents(wc: WebContents): void {
    this.permissionManager.setWebContents(wc);
  }

  setAuthToken(token: string | null): void {
    const wasAuthenticated = !!this.authToken;
    this.authToken = token;
    const isAuthenticated = !!token;
    if (!wasAuthenticated && isAuthenticated) {
      setImmediate(() => eventBus.emit('otix:user:login', { userId: 'current' }));
    } else if (wasAuthenticated && !isAuthenticated) {
      setImmediate(() => eventBus.emit('otix:user:logout', { userId: 'current' }));
    }
  }

  setApiBaseUrl(url: string): void { this.apiBaseUrl = url; }
  getApiBaseUrl(): string { return this.apiBaseUrl; }

  // ── Install / Uninstall ────────────────────────────────────────────

  async installFromGit(repoUrl: string, pluginPath?: string): Promise<PluginInfo> {

    const repoName = repoUrl.replace(/\.git$/, '').split('/').pop();
    if (!repoName) {
      throw new Error(`Invalid repo URL: ${repoUrl}`);
    }

    // Determine plugin ID and final target directory
    const pluginId = pluginPath ? path.basename(pluginPath) : repoName;
    const targetDir = path.join(this.extensionsDir, pluginId);

    if (fs.existsSync(targetDir)) {
      throw new Error(`Plugin directory already exists: ${pluginId}`);
    }

    // Determine where to clone — temp dir for monorepo, extensions dir for single-repo
    const cloneDir = pluginPath
      ? path.join(os.tmpdir(), `otix-plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      : targetDir;

    // Clone the repo
    try {
      execSync(`git clone "${repoUrl}" "${cloneDir}"`, {
        stdio: 'pipe',
        timeout: 120000,
      });
    } catch (err) {
      if (fs.existsSync(cloneDir)) {
        fs.rmSync(cloneDir, { recursive: true, force: true });
      }
      throw new Error(
        `Git clone failed for ${repoUrl}: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    // Read manifest from the appropriate subdirectory
    const manifestDir = pluginPath ? path.join(cloneDir, pluginPath) : cloneDir;
    const manifestPath = path.join(manifestDir, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      throw new Error(
        pluginPath
          ? `Plugin at path "${pluginPath}" is missing manifest.json`
          : `Plugin ${repoName} is missing manifest.json`
      );
    }

    let manifest: PluginManifest;
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8');
      manifest = JSON.parse(raw);
    } catch (err) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      throw new Error(
        `Plugin ${repoName} has invalid manifest.json: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (!manifest.name || !manifest.version || !manifest.entry?.main) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      throw new Error(
        'Plugin has incomplete manifest.json (name, version, and entry.main are required)'
      );
    }

    // Check compatibility with current app version
    const compat = checkPluginCompatibility(manifest.version);
    if (!compat.ok) {
      fs.rmSync(cloneDir, { recursive: true, force: true });
      throw new Error(
        `Plugin requires Otix v${compat.required} or higher (current: ${app.getVersion()})`
      );
    }

    // For monorepo: copy the plugin subdirectory to the extensions dir, then remove temp clone
    if (pluginPath) {
      try {
        fs.cpSync(manifestDir, targetDir, { recursive: true });
      } catch (err) {
        fs.rmSync(cloneDir, { recursive: true, force: true });
        throw new Error(
          `Failed to copy plugin: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      fs.rmSync(cloneDir, { recursive: true, force: true });
    }

    const now = new Date().toISOString();
    const pluginInfo: PluginInfo = {
      id: pluginId,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      author: manifest.author || '',
      repository: repoUrl,
      sourcePath: pluginPath || undefined,
      status: 'installed',
      manifest,
      installedAt: now,
    };

    this.pluginsRepo.insert({
      id: pluginInfo.id,
      name: pluginInfo.name,
      version: pluginInfo.version,
      description: pluginInfo.description,
      author: pluginInfo.author,
      repository: pluginInfo.repository,
      source_path: pluginInfo.sourcePath || null,
      status: pluginInfo.status,
      manifest_json: JSON.stringify(pluginInfo.manifest),
      enabled_at: pluginInfo.enabledAt || null,
    });
    return pluginInfo;
  }

  async uninstall(pluginId: string): Promise<void> {

    await this.disable(pluginId);

    const pluginDir = path.join(this.extensionsDir, pluginId);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    this.pluginsRepo.deleteAllPermissions(pluginId);
    this.pluginsRepo.deleteAllConfig(pluginId);
    this.pluginsRepo.delete(pluginId);
  }

  // ── Update ──────────────────────────────────────────────────────────

  async updatePlugin(pluginId: string): Promise<PluginInfo> {
    const row = this.pluginsRepo.getById(pluginId);
    if (!row) throw new Error(`Plugin not found: ${pluginId}`);
    const info = pluginRowToInfo(row);

    const wasEnabled = info.status === 'enabled';

    // Disable first if enabled
    if (wasEnabled) {
      await this.disable(pluginId);
    }

    try {
      // Clone fresh copy to temp dir
      const tempDir = path.join(os.tmpdir(), `otix-update-${pluginId}-${Date.now()}`);
      const repoUrl = info.repository;
      const pluginPath = info.sourcePath;

      execSync(`git clone "${repoUrl}" "${tempDir}"`, { stdio: 'pipe', timeout: 120000 });

      const sourceDir = pluginPath ? path.join(tempDir, pluginPath) : tempDir;
      const targetDir = path.join(this.extensionsDir, pluginId);

      // Read new manifest to get new version
      const manifestPath = path.join(sourceDir, 'manifest.json');
      let newManifest: PluginManifest;
      let newVersion = info.version;
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf-8');
        newManifest = JSON.parse(raw);
        newVersion = newManifest.version || info.version;
      } else {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error('Updated plugin is missing manifest.json');
      }

      // Remove old files except hidden files and data dirs, then copy new
      const entries = fs.readdirSync(targetDir);
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'data') continue;
        const fullPath = path.join(targetDir, entry);
        fs.rmSync(fullPath, { recursive: true, force: true });
      }

      // Copy new files
      const newEntries = fs.readdirSync(sourceDir);
      for (const entry of newEntries) {
        if (entry.startsWith('.')) continue;
        const src = path.join(sourceDir, entry);
        const dest = path.join(targetDir, entry);
        fs.cpSync(src, dest, { recursive: true });
      }

      // Update version and manifest in DB
      this.pluginsRepo.updateManifest(pluginId, JSON.stringify(newManifest), newVersion);

      // Clean up temp
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Re-enable if was enabled
      if (wasEnabled) {
        await this.enable(pluginId);
      }

      const updatedRow = this.pluginsRepo.getById(pluginId);
      if (!updatedRow) throw new Error('Plugin vanished after update');
      return pluginRowToInfo(updatedRow);
    } catch (err) {
      // Try to re-enable if update failed
      if (wasEnabled) {
        try { await this.enable(pluginId); } catch {}
      }
      throw err;
    }
  }

  // ── Enable / Disable ───────────────────────────────────────────────

  async enable(pluginId: string): Promise<void> {
    const row = this.pluginsRepo.getById(pluginId);
    if (!row) throw new Error(`Plugin not found: ${pluginId}`);
    const info = pluginRowToInfo(row);

    // Check compatibility at enable time too (app may have been updated since install)
    const compat = checkPluginCompatibility(info.version);
    if (!compat.ok) {
      this.pluginsRepo.updateStatus(pluginId, 'error');
      throw new Error(`Plugin requires Otix v${compat.required} or higher (current: ${app.getVersion()})`);
    }

    if (this.plugins.has(pluginId)) return;

    try {
      const manifest = info.manifest;
      const pluginPath = info.sourcePath || path.join(this.extensionsDir, pluginId);

      // Auto-grant all permissions declared in the manifest.
      // The user already consented by clicking Enable.
      for (const perm of manifest.permissions || []) {
        this.permissionManager.grant(pluginId, perm);
      }

      const entry = await loadPluginMain(pluginPath, manifest);

      const pluginSubscriptions: (() => void)[] = [];
      const pluginDestroyCallbacks: (() => void)[] = [];

      const ctx = this.createContext(
        pluginId,
        manifest,
        pluginSubscriptions,
        pluginDestroyCallbacks
      );

      const entryResult = entry(ctx);

      this.plugins.set(pluginId, {
        info,
        cleanup: typeof entryResult === 'function' ? entryResult : undefined,
      });
      this.subscriptions.set(pluginId, pluginSubscriptions);
      this.destroyCallbacks.set(pluginId, pluginDestroyCallbacks);

      this.pluginsRepo.setEnabled(pluginId);

      // Register slots
      for (const slot of manifest.slots || []) {
        const existing = this.slotsRegistry.get(slot.location) || [];
        this.slotsRegistry.set(slot.location, [...existing, { pluginId, label: slot.label }]);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PluginManager] Failed to enable plugin ${pluginId}: ${message}`);
      this.pluginsRepo.updateStatus(pluginId, 'error');
      throw err;
    }
  }

  async disable(pluginId: string): Promise<void> {

    const runtime = this.plugins.get(pluginId);

    if (!runtime) {
      this.pluginsRepo.setDisabled(pluginId);
      return;
    }

    try {
      if (runtime.cleanup) {
        runtime.cleanup();
      }

      const pluginSubscriptions = this.subscriptions.get(pluginId);
      if (pluginSubscriptions) {
        for (const unsub of pluginSubscriptions) {
          try {
            unsub();
          } catch {
            // Ignore individual unsubscribe errors
          }
        }
        this.subscriptions.delete(pluginId);
      }

      const pluginDestroyCallbacks = this.destroyCallbacks.get(pluginId);
      if (pluginDestroyCallbacks) {
        for (const cb of pluginDestroyCallbacks) {
          try {
            cb();
          } catch {
            // Ignore individual callback errors
          }
        }
        this.destroyCallbacks.delete(pluginId);
      }
    } finally {
      this.plugins.delete(pluginId);
      this.pluginsRepo.setDisabled(pluginId);

      // Remove all slot registrations for this plugin
      for (const [location, registrations] of this.slotsRegistry.entries()) {
        const filtered = registrations.filter(r => r.pluginId !== pluginId);
        if (filtered.length === 0) {
          this.slotsRegistry.delete(location);
        } else {
          this.slotsRegistry.set(location, filtered);
        }
      }
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────

  async discoverPlugins(additionalDirs?: string[]): Promise<PluginInfo[]> {
    const discovered: PluginInfo[] = [];
    const allDirs = [this.extensionsDir, ...(additionalDirs || [])];
    const seenIds = new Set<string>();

    for (const baseDir of allDirs) {
      if (!fs.existsSync(baseDir)) {
        if (baseDir === this.extensionsDir) {
          fs.mkdirSync(this.extensionsDir, { recursive: true });
        }
        continue;
      }

      const entries = fs.readdirSync(baseDir, {
        withFileTypes: true,
      });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const pluginDir = path.join(baseDir, entry.name);
        const manifestPath = path.join(pluginDir, 'manifest.json');

        if (!fs.existsSync(manifestPath)) continue;

        let manifest: PluginManifest;
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8');
          manifest = JSON.parse(raw);
        } catch {
          console.warn(
            `[PluginManager] Invalid manifest.json in ${entry.name}, skipping`
          );
          continue;
        }

        if (!manifest.name || !manifest.version || !manifest.entry?.main) {
          console.warn(
            `[PluginManager] Incomplete manifest.json in ${entry.name}, skipping`
          );
          continue;
        }

        // Primary dir takes priority over additional dirs
        if (seenIds.has(entry.name)) continue;
        seenIds.add(entry.name);

        const existingRow = this.pluginsRepo.getById(entry.name);
        if (existingRow) {
          const existingManifest = (() => { try { return JSON.parse(existingRow.manifest_json); } catch { return null; } })();
          if (JSON.stringify(existingManifest) !== JSON.stringify(manifest) || existingRow.version !== manifest.version) {
            this.pluginsRepo.updateManifest(entry.name, JSON.stringify(manifest), manifest.version);
          }
          continue;
        }

        const isAdditional = baseDir !== this.extensionsDir;
        const now = new Date().toISOString();
        const pluginInfo: PluginInfo = {
          id: entry.name,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || '',
          author: manifest.author || '',
          repository: manifest.repository || '',
          sourcePath: isAdditional ? pluginDir : undefined,
          status: 'installed',
          manifest,
          installedAt: now,
        };

        this.pluginsRepo.insert({
          id: pluginInfo.id,
          name: pluginInfo.name,
          version: pluginInfo.version,
          description: pluginInfo.description,
          author: pluginInfo.author,
          repository: pluginInfo.repository,
          source_path: pluginInfo.sourcePath || null,
          status: pluginInfo.status,
          manifest_json: JSON.stringify(pluginInfo.manifest),
          enabled_at: pluginInfo.enabledAt || null,
        });
        discovered.push(pluginInfo);
      }
    }

    return discovered;
  }

  // ── Queries ────────────────────────────────────────────────────────

  getAllPlugins(): PluginInfo[] {
    const rows = this.pluginsRepo.getAll();
    return rows.map(pluginRowToInfo);
  }

  getPlugin(pluginId: string): PluginInfo | undefined {
    const row = this.pluginsRepo.getById(pluginId);
    return row ? pluginRowToInfo(row) : undefined;
  }

  // ── Plugin status ──────────────────────────────────────────────────

  async getPluginStatus(pluginId: string): Promise<Record<string, unknown> | null> {
    const row = this.pluginsRepo.getById(pluginId);
    if (!row) throw new Error(`Plugin not found: ${pluginId}`);
    const info = pluginRowToInfo(row);

    const manifest = info.manifest;
    const pluginPath = info.sourcePath || path.join(this.extensionsDir, pluginId);

    const statusFn = await loadPluginStatus(pluginPath, manifest);
    if (!statusFn) return null;

    // Re-create context matching the running plugin (same config, etc.)
    const ctx = this.createContext(pluginId, manifest, [], []);

    try {
      return await statusFn(ctx);
    } catch (err) {
      return { error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Plugin data API ─────────────────────────────────────────────────

  async callPluginData(pluginId: string, method: string, ...args: unknown[]): Promise<unknown> {
    const row = this.pluginsRepo.getById(pluginId);
    if (!row) throw new Error(`Plugin not found: ${pluginId}`);
    const info = pluginRowToInfo(row);

    const manifest = info.manifest;
    const pluginPath = info.sourcePath || path.join(this.extensionsDir, pluginId);

    const dataFns = loadPluginData(pluginPath, manifest);
    const fn = dataFns[method];
    if (!fn) throw new Error(`Plugin ${pluginId} has no data method: ${method}`);

    // Use the running plugin's real context if available, otherwise create minimal
    const runtime = this.plugins.get(pluginId);
    const ctx = runtime
      ? this.createContext(pluginId, manifest, [], [])
      : this.createContext(pluginId, manifest, [], []);

    try {
      return await fn(ctx, ...args);
    } catch (err) {
      throw new Error(`Plugin data call ${pluginId}.${method} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Slot registry ──────────────────────────────────────────────────

  getPluginsForSlot(location: string): {pluginId: string; label: string}[] {
    return this.slotsRegistry.get(location) || [];
  }

  async getSlotData(location: string): Promise<{pluginId: string; label: string; data: any}[]> {
    const plugins = this.getPluginsForSlot(location);
    const results: {pluginId: string; label: string; data: any}[] = [];

    for (const { pluginId, label } of plugins) {
      try {
        const data = await this.callPluginData(pluginId, 'slot.render', location);
        results.push({ pluginId, label, data });
      } catch {
        // Skip plugins that error on slot.render
      }
    }

    return results;
  }

  // ── Connection testing ─────────────────────────────────────────────

  async testPluginConfig(pluginId: string, configDraft: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    const row = this.pluginsRepo.getById(pluginId);
    if (!row) throw new Error(`Plugin not found: ${pluginId}`);
    const info = pluginRowToInfo(row);

    const manifest = info.manifest;
    const pluginPath = info.sourcePath || path.join(this.extensionsDir, pluginId);

    const testFn = await loadPluginTest(pluginPath, manifest);
    if (!testFn) {
      return { success: false, message: 'This plugin does not support connection testing.' };
    }

    // Create a temporary context with the DRAFT config values (not saved)
    const tempConfig: PluginConfigStore = {
      getAll: () => ({ ...configDraft }),
      get: <T>(key: string) => configDraft[key] as T | undefined,
      set: () => {}, // no-op — test doesn't save
    };

    // Create minimal context — no events, no DB persistence during test
    const tempCtx: PluginContext = {
      id: pluginId,
      manifest,
      config: tempConfig,
      api: createApiProxy(pluginId, manifest.name, this.permissionManager, () => null, () => this.apiBaseUrl),
      events: { on: () => () => {}, off: () => {} },
      fetch: async (url, init) => {
        // Allow network access for testing
        return fetch(url, init);
      },
      db: { run: () => {}, get: () => null, all: () => [] },
      notifications: { send: () => {} },
      logger: { info: () => {}, warn: () => {}, error: () => {} },
      onDestroy: () => {},
    };

    try {
      return await testFn(tempCtx, configDraft);
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  }

  // ── Lifecycle ──────────────────────────────────────────────────────

  async loadEnabledPlugins(): Promise<void> {
    const allRows = this.pluginsRepo.getAll();
    const allPlugins = allRows.map(pluginRowToInfo);
    const enabled = allPlugins.filter(p => p.status === 'enabled');

    for (const plugin of enabled) {
      try {
        await this.enable(plugin.id);
        console.log(
          `[PluginManager] Loaded plugin: ${plugin.name} v${plugin.version}`
        );
      } catch (err) {
        console.error(
          `[PluginManager] Failed to load plugin ${plugin.id}:`,
          err
        );
      }
    }
  }

  async shutdown(): Promise<void> {
    const pluginIds = Array.from(this.plugins.keys());

    for (const pluginId of pluginIds) {
      try {
        await this.disable(pluginId);
        console.log(`[PluginManager] Shut down plugin: ${pluginId}`);
      } catch (err) {
        console.error(
          `[PluginManager] Error shutting down plugin ${pluginId}:`,
          err
        );
      }
    }
  }

  // ── Context factory ────────────────────────────────────────────────

  private createContext(
    pluginId: string,
    manifest: PluginManifest,
    subscriptions: (() => void)[],
    destroyCallbacks: (() => void)[]
  ): PluginContext {
    // ── Config store ──────────────────────────────────────────────────
    const config: PluginConfigStore = {
      getAll: () => {
        const raw = this.pluginsRepo.getConfig(pluginId);
        const result: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(raw)) {
          try {
            result[key] = JSON.parse(value);
          } catch {
            result[key] = value;
          }
        }
        return result;
      },
      get: <T>(key: string) => {
        const raw = this.pluginsRepo.getConfig(pluginId);
        const value = raw[key];
        if (value === undefined) return undefined;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      },
      set: (key, value) => {
        this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(value));
      },
    };

    // ── Event subscriber ─────────────────────────────────────────────
    const handlerToListener = new Map<Function, Function>();

    const events: EventSubscriber = {
      on: (event, handler) => {
        if (!this.permissionManager.isGranted(pluginId, 'events:subscribe')) {
          console.warn(
            `[Plugin ${pluginId}] Missing 'events:subscribe' permission`
          );
        }
        const listener = (payload: unknown) => {
          handler(payload as never);
        };
        handlerToListener.set(
          handler as Function,
          listener as Function
        );
        (eventBus as any).on(event, listener);
        const unsubscribe = () => {
          (eventBus as any).off(event, listener);
          handlerToListener.delete(handler as Function);
        };
        subscriptions.push(unsubscribe);
        return unsubscribe;
      },
      off: (event, handler) => {
        const listener = handlerToListener.get(handler as Function);
        if (listener) {
          (eventBus as any).off(event, listener);
          handlerToListener.delete(handler as Function);
        }
      },
    };

    // ── Permission-gated fetch ───────────────────────────────────────
    const fetchFunc: PluginFetch = async (url, init) => {
      const result = await this.permissionManager.requestPermission(
        pluginId,
        manifest.name,
        'network:external',
        `Fetch ${url}`
      );
      if (!result.granted) {
        throw new Error('Permission denied: network:external');
      }
      return fetch(url, init);
    };

    // ── Plugin-scoped SQLite database ────────────────────────────────
    const pluginDataPath = path.join(
      this.extensionsDir,
      pluginId,
      'data.db'
    );
    const pluginDataDir = path.dirname(pluginDataPath);
    if (!fs.existsSync(pluginDataDir)) {
      fs.mkdirSync(pluginDataDir, { recursive: true });
    }
    const pluginDataDb = new Database(pluginDataPath);
    pluginDataDb.pragma('journal_mode = WAL');

    const db: PluginDatabase = {
      run: (sql, params) => {
        pluginDataDb.prepare(sql).run(params || []);
      },
      get: (sql, params) => {
        return (
          pluginDataDb.prepare(sql).get(params || []) as any
        ) || null;
      },
      all: (sql, params) => {
        return pluginDataDb
          .prepare(sql)
          .all(params || []) as any[];
      },
    };

    // ── Notifications ────────────────────────────────────────────────
    const notifications: PluginNotifications = {
      send: (title, body) => {
        if (!this.permissionManager.isGranted(pluginId, 'notifications')) {
          this.permissionManager
            .requestPermission(
              pluginId,
              manifest.name,
              'notifications',
              'Send desktop notification'
            )
            .catch(() => {});
          return;
        }
        try {
          new Notification({ title, body }).show();
        } catch (err) {
          console.error(
            `[Plugin ${pluginId}] Failed to show notification:`,
            err
          );
        }
      },
    };

    // ── Logger ───────────────────────────────────────────────────────
    const logger: PluginLogger = {
      info: (msg, data) => {
        console.log(
          `[Plugin:${pluginId}] INFO: ${msg}`,
          data !== undefined ? data : ''
        );
      },
      warn: (msg, data) => {
        console.warn(
          `[Plugin:${pluginId}] WARN: ${msg}`,
          data !== undefined ? data : ''
        );
      },
      error: (msg, data) => {
        console.error(
          `[Plugin:${pluginId}] ERROR: ${msg}`,
          data !== undefined ? data : ''
        );
      },
    };

    // ── Lifecycle callbacks ──────────────────────────────────────────
    const onDestroy = (cb: () => void) => {
      destroyCallbacks.push(cb);
    };

    return {
      id: pluginId,
      manifest,
      config,
      events,
      fetch: fetchFunc,
      db,
      notifications,
      logger,
      api: createApiProxy(pluginId, manifest.name, this.permissionManager, () => this.authToken, () => this.apiBaseUrl),
      onDestroy,
    };
  }
}

// ── Row-to-Info adapter ─────────────────────────────────────────────

function pluginRowToInfo(row: import('../db').PluginRegistryRow): PluginInfo {
  return {
    id: row.id,
    name: row.name,
    version: row.version,
    description: row.description,
    author: row.author,
    repository: row.repository,
    sourcePath: row.source_path || undefined,
    status: row.status as import('./types').PluginStatus,
    manifest: JSON.parse(row.manifest_json) as PluginManifest,
    installedAt: row.installed_at,
    enabledAt: row.enabled_at || undefined,
  };
}

// ── Compatibility check ──────────────────────────────────────────────

function checkPluginCompatibility(pluginVersion: string): { ok: boolean; required?: string } {
  // Old-style SemVer (e.g. "1.0.0") — skip check, assume compatible
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(pluginVersion)) {
    return { ok: true };
  }

  // Extract first 3 components as the target Otix version
  const parts = pluginVersion.split('.');
  const required = `${parts[0]}.${parts[1]}.${parts[2]}`;
  const appVersion = app.getVersion();

  // Manual version comparison (e.g. "0.3.0" <= "0.3.5" → true)
  const parseVersion = (v: string): number[] => v.split('.').map(Number);
  const appParts = parseVersion(appVersion);
  const reqParts = parseVersion(required);
  const maxLen = Math.max(appParts.length, reqParts.length);

  for (let i = 0; i < maxLen; i++) {
    const a = appParts[i] ?? 0;
    const r = reqParts[i] ?? 0;
    if (a > r) return { ok: true, required };
    if (a < r) return { ok: false, required };
  }
  return { ok: true, required };
}