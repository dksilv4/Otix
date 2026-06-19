import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { Notification, WebContents } from 'electron';
import Database from 'better-sqlite3';
import { eventBus } from './event-bus';
import {
  ensurePluginDb,
  getAllPlugins as dbGetAllPlugins,
  getPlugin as dbGetPlugin,
  insertPlugin,
  updatePluginStatus,
  deletePlugin,
  getPluginConfig,
  setPluginConfig,
  updatePluginManifest,
  updatePluginVersion,
} from './plugin-db';
import { PermissionManager } from './permissions';
import { loadPluginMain, loadPluginTest, loadPluginStatus, loadPluginData } from './plugin-loader';
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
  private dbReady: Promise<void>;
  private authToken: string | null = null;
  private apiBaseUrl = process.env.OTIX_BACKEND_URL || 'http://127.0.0.1:8000/api';

  constructor(
    private extensionsDir: string,
    private permissionManager: PermissionManager,
    private userDataPath: string
  ) {
    this.dbReady = ensurePluginDb();
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

  private async ensureReady(): Promise<void> {
    await this.dbReady;
  }

  // ── Install / Uninstall ────────────────────────────────────────────

  async installFromGit(repoUrl: string, pluginPath?: string): Promise<PluginInfo> {
    await this.ensureReady();

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

    insertPlugin(pluginInfo);
    return pluginInfo;
  }

  async uninstall(pluginId: string): Promise<void> {
    await this.ensureReady();

    await this.disable(pluginId);

    const pluginDir = path.join(this.extensionsDir, pluginId);
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true });
    }

    deletePlugin(pluginId);
  }

  // ── Update ──────────────────────────────────────────────────────────

  async updatePlugin(pluginId: string): Promise<PluginInfo> {
    await this.ensureReady();

    const info = dbGetPlugin(pluginId);
    if (!info) throw new Error(`Plugin not found: ${pluginId}`);

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
      updatePluginVersion(pluginId, newVersion, newManifest);

      // Clean up temp
      fs.rmSync(tempDir, { recursive: true, force: true });

      // Re-enable if was enabled
      if (wasEnabled) {
        await this.enable(pluginId);
      }

      const updated = dbGetPlugin(pluginId);
      if (!updated) throw new Error('Plugin vanished after update');
      return updated;
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
    await this.ensureReady();

    const info = dbGetPlugin(pluginId);
    if (!info) throw new Error(`Plugin not found: ${pluginId}`);

    if (this.plugins.has(pluginId)) return;

    try {
      const manifest = info.manifest;
      const pluginPath = path.join(this.extensionsDir, pluginId);

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

      updatePluginStatus(pluginId, 'enabled');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[PluginManager] Failed to enable plugin ${pluginId}: ${message}`);
      updatePluginStatus(pluginId, 'error', message);
      throw err;
    }
  }

  async disable(pluginId: string): Promise<void> {
    await this.ensureReady();

    const runtime = this.plugins.get(pluginId);

    if (!runtime) {
      updatePluginStatus(pluginId, 'disabled');
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
      updatePluginStatus(pluginId, 'disabled');
    }
  }

  // ── Discovery ──────────────────────────────────────────────────────

  async discoverPlugins(): Promise<PluginInfo[]> {
    await this.ensureReady();

    const discovered: PluginInfo[] = [];

    if (!fs.existsSync(this.extensionsDir)) {
      fs.mkdirSync(this.extensionsDir, { recursive: true });
      return discovered;
    }

    const entries = fs.readdirSync(this.extensionsDir, {
      withFileTypes: true,
    });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const pluginDir = path.join(this.extensionsDir, entry.name);
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

      const existing = dbGetPlugin(entry.name);
      if (existing) {
        // Refresh manifest from disk (supports config changes)
        if (JSON.stringify(existing.manifest) !== JSON.stringify(manifest)) {
          updatePluginManifest(entry.name, manifest);
        }
        continue;
      }

      const now = new Date().toISOString();
      const pluginInfo: PluginInfo = {
        id: entry.name,
        name: manifest.name,
        version: manifest.version,
        description: manifest.description || '',
        author: manifest.author || '',
        repository: manifest.repository || '',
        status: 'installed',
        manifest,
        installedAt: now,
      };

      insertPlugin(pluginInfo);
      discovered.push(pluginInfo);
    }

    return discovered;
  }

  // ── Queries ────────────────────────────────────────────────────────

  getAllPlugins(): PluginInfo[] {
    return dbGetAllPlugins();
  }

  getPlugin(pluginId: string): PluginInfo | undefined {
    const info = dbGetPlugin(pluginId);
    return info || undefined;
  }

  // ── Plugin status ──────────────────────────────────────────────────

  async getPluginStatus(pluginId: string): Promise<Record<string, unknown> | null> {
    await this.ensureReady();
    const info = dbGetPlugin(pluginId);
    if (!info) throw new Error(`Plugin not found: ${pluginId}`);

    const manifest = info.manifest;
    const pluginPath = path.join(this.extensionsDir, pluginId);

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
    await this.ensureReady();

    const info = dbGetPlugin(pluginId);
    if (!info) throw new Error(`Plugin not found: ${pluginId}`);

    const manifest = info.manifest;
    const pluginPath = path.join(this.extensionsDir, pluginId);

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

  // ── Connection testing ─────────────────────────────────────────────

  async testPluginConfig(pluginId: string, configDraft: Record<string, unknown>): Promise<{ success: boolean; message: string }> {
    await this.ensureReady();

    const info = dbGetPlugin(pluginId);
    if (!info) throw new Error(`Plugin not found: ${pluginId}`);

    const manifest = info.manifest;
    const pluginPath = path.join(this.extensionsDir, pluginId);

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
    await this.ensureReady();

    const allPlugins = dbGetAllPlugins();
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
        const raw = getPluginConfig(pluginId);
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
        const raw = getPluginConfig(pluginId);
        const value = raw[key];
        if (value === undefined) return undefined;
        try {
          return JSON.parse(value) as T;
        } catch {
          return value as unknown as T;
        }
      },
      set: (key, value) => {
        setPluginConfig(pluginId, key, JSON.stringify(value));
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
