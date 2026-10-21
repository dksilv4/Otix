import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { PluginRuntime } from './runtime'
import { eventBus } from './event-bus'
import { getApiV1Url } from '../config'
import { ServiceRegistry } from './service-registry'
import { PluginsRepository } from '../db/repositories/plugins'
import { initPluginsDb } from '../db/plugins-db'
import type { PermissionManager } from './permissions'

import { SlotRegistry } from './slots'
import { getAllActivity } from './activity'
import type { PluginActivityItem } from './types'
import { FreeGamesAggregator } from '../free-games/aggregator'
import type {
  PluginManifest,
  PluginInfo,
  PluginStatus,
  PluginPermission,
  PluginSettingsTab,
  SlotContribution,
} from './types'
import {
  PluginNotFoundError,
  PluginNotRunningError,
  PluginIncompatibleError,
} from './errors'
import { validateConfigValue } from './config-validation'
import { validateManifestSchema } from './manifest-validation'

const execFileAsync = promisify(execFile)

// System plugins auto-get access to well-known tables they own — no prompt.
// This is a transitional safety net: as plugins migrate to framework data
// layers (e.g. the downloads plugin using the framework downloads API), they
// stop needing raw SQL access entirely.
const SYSTEM_TABLE_GRANTS: Record<string, string[]> = {}

const PAGE_SLOT_MAP: Record<string, string[]> = {
  'settings/library': ['settings/library/extensions'],
  'settings/matching': ['settings/matching/extensions'],
  'settings/plugins': ['settings/plugins/extensions'],
  'media/detail': [
    'media/movie/detail/actions',
    'media/show/detail/actions',
    'media/game/detail/actions',
    'media/game/detail/tabs',
  ],
  'activity': ['activity:panel'],
  'library': ['library:tabs'],
  'settings/downloads': ['settings/downloads/main'],
}

export class PluginManager {
  private runtimes: Map<string, PluginRuntime> = new Map()
  private locks: Map<string, Promise<void>> = new Map()
  private lockResolvers: Map<string, () => void> = new Map()
  private pluginsRepo: PluginsRepository
  private permissionManager: PermissionManager | null = null
  private extensionsDir: string
  private devExtensionsDir: string | undefined
  private apiBaseUrl = getApiV1Url('')
  private authToken = ''
  private slotRegistry: SlotRegistry = new SlotRegistry()
  public readonly serviceRegistry: ServiceRegistry = new ServiceRegistry()
  public readonly freeGames: FreeGamesAggregator
  private pluginWatcher: fs.FSWatcher | null = null
  private pluginReloadTimers: Map<string, NodeJS.Timeout> = new Map()

  constructor(
    extensionsDir: string,
    pluginsRepo: PluginsRepository,
    _userDataPath: string,
    devExtensionsDir?: string,
  ) {
    this.extensionsDir = extensionsDir
    this.devExtensionsDir = devExtensionsDir
    this.pluginsRepo = pluginsRepo
    this.freeGames = new FreeGamesAggregator(this)
    initPluginsDb(_userDataPath)
  }

  setPermissionManager(pm: PermissionManager): void {
    this.permissionManager = pm
  }

  // ── Per-plugin mutex ─────────────────────────────────────────────

  private async acquireLock(pluginId: string): Promise<void> {
    while (this.locks.has(pluginId)) {
      await this.locks.get(pluginId)
    }
    let release!: () => void
    const lock = new Promise<void>((resolve) => {
      release = resolve
    })
    this.locks.set(pluginId, lock)
    this.lockResolvers.set(pluginId, release!)
  }

  private releaseLock(pluginId: string): void {
    const release = this.lockResolvers.get(pluginId)
    if (release) {
      this.lockResolvers.delete(pluginId)
      this.locks.delete(pluginId)
      release()
    }
  }

  // ── Plugin helpers ───────────────────────────────────────────────

  private getPluginDir(pluginId: string): string {
    return path.join(this.extensionsDir, pluginId)
  }

  private pluginRowToInfo(row: any): PluginInfo {
    return {
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      author: row.author,
      repository: row.repository,
      sourcePath: row.source_path || undefined,
      status: row.status as PluginStatus,
      error: row.error || undefined,
      manifest: JSON.parse(row.manifest_json),
      installedAt: row.installed_at,
      enabledAt: row.enabled_at || undefined,
    }
  }

  getAllPlugins(): PluginInfo[] {
    return this.pluginsRepo.getAll().map((r) => this.pluginRowToInfo(r))
  }

  async getAllPluginsWithStatuses(): Promise<PluginInfo[]> {
    const plugins = this.getAllPlugins()
    const batchResults = await Promise.allSettled(
      plugins.map(async (p) => {
        if (p.status !== 'enabled') return { id: p.id, connected: undefined }
        const runtime = this.runtimes.get(p.id)
        if (!runtime) return { id: p.id, connected: undefined }
        try {
          const result = await runtime.callMethod('status')
          const status = (result as Record<string, unknown>) || {}
          return { id: p.id, connected: !!(status.connected || status.authenticated) }
        } catch {
          return { id: p.id, connected: undefined }
        }
      }),
    )
    const connectedMap = new Map<string, boolean | undefined>()
    for (const r of batchResults) {
      if (r.status === 'fulfilled') connectedMap.set(r.value.id, r.value.connected)
    }
    return plugins.map((p) => ({ ...p, connected: connectedMap.get(p.id) }))
  }

  getPlugin(pluginId: string): PluginInfo | null {
    const row = this.pluginsRepo.getById(pluginId)
    return row ? this.pluginRowToInfo(row) : null
  }

  // ── Enable / Disable ────────────────────────────────────────────

  async enable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      if (this.runtimes.has(pluginId)) return // already running

      const info = this.getPlugin(pluginId)
      if (!info) throw new PluginNotFoundError(pluginId)

      // Check compatibility
      this.checkCompatibility(pluginId, info.manifest)

      // Structurally validate the manifest's config schema + declared
      // permissions before booting the worker. Without this, a typo'd field
      // type or a select with no options slips through value validation and
      // silently mis-renders the settings UI instead of failing loudly.
      const schemaErrors = validateManifestSchema(info.manifest).issues.filter(
        (i) => i.severity === 'error',
      )
      if (schemaErrors.length > 0) {
        const detail = schemaErrors
          .map((issue) => `  - ${issue.path}: ${issue.message}`)
          .join('\n')
        throw new Error(`Plugin "${pluginId}" has an invalid manifest:\n${detail}`)
      }

      const pluginDir = this.getPluginDir(pluginId)

      // Build config store from DB
      const configStore = {
        getAll: () => {
          const raw = this.pluginsRepo.getConfig(pluginId)
          const parsed: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(raw)) {
            try {
              parsed[k] = JSON.parse(v)
            } catch {
              parsed[k] = v
            }
          }
          return parsed
        },
        get: (key: string) => {
          const raw = this.pluginsRepo.getConfig(pluginId)
          const val = raw[key]
          if (val === undefined) return undefined
          try {
            return JSON.parse(val)
          } catch {
            return val
          }
        },
        set: (key: string, value: unknown) => {
          const field = info.manifest.config?.[key]
          if (field) {
            const result = validateConfigValue(field, value)
            if (result.ok) {
              this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(result.value))
            } else {
              console.warn(
                `[plugin:${pluginId}] config "${key}" rejected (${result.error}); storing raw value`,
              )
              this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(value))
            }
          } else {
            this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(value))
          }
        },
      }

      const runtime = new PluginRuntime(
        pluginId,
        info.manifest,
        pluginDir,
        eventBus,
        (perm: PluginPermission) =>
          this.pluginsRepo
            .getPermissions(pluginId)
            .some((p) => p.permission === perm),
        async (perm: PluginPermission) => {
          // table:* access is always a runtime decision — show the permission
          // modal, unless the plugin is a system plugin accessing its own
          // well-known tables (SYSTEM_TABLE_GRANTS).
          if (perm.startsWith('table:')) {
            const tableName = perm.slice('table:'.length)
            if (SYSTEM_TABLE_GRANTS[pluginId]?.includes(tableName)) {
              this.pluginsRepo.grantPermission(pluginId, perm, 'always')
              return true
            }
            if (!this.permissionManager) return false
            return this.permissionManager.requestTableAccess(
              pluginId, info.name, tableName,
            )
          }
          // Non-table permissions: auto-grant only if the manifest declared
          // them (the user consented at install time).
          if (info.manifest.permissions.includes(perm)) {
            this.pluginsRepo.grantPermission(pluginId, perm, 'always')
            return true
          }
          return false
        },
        configStore,
        this.apiBaseUrl,
        this.authToken,
        // Inter-plugin call routing
        async (targetId, method, args) => {
          const targetRuntime = this.runtimes.get(targetId)
          if (!targetRuntime) throw new Error(`Plugin not running: ${targetId}`)
          return targetRuntime.callMethod(method, [args])
        },
        this.serviceRegistry,
      )

      await runtime.start()

      // ── Mandatory plugin tests ─────────────────────────────────
      // Every plugin must export a "test" function that returns
      // { passed: boolean, failures?: string[] }. Tests run on every
      // enable. A failing test logs a warning but does not block
      // enablement — the plugin may need to be running for the user
      // to configure it (e.g. sign in) before it can pass.
      try {
        const result = await runtime.callMethod('test') as { passed: boolean; failures?: string[] } | undefined;
        if (!result?.passed) {
          const failures = result?.failures?.join('; ') || 'tests did not pass'
          console.warn(`[PluginManager] Plugin "${pluginId}" tests failed: ${failures}`)
        }
      } catch (err: any) {
        if (
          err.message.includes('not found') ||
          err.message.includes('Export "test"')
        ) {
          console.warn(`[PluginManager] Plugin "${pluginId}" does not export a test function`)
        } else {
          console.warn(`[PluginManager] Plugin "${pluginId}" test threw: ${err.message}`)
        }
      }

      this.runtimes.set(pluginId, runtime)

      // Register manifest services in service registry
      const manifestServices = info.manifest.services || []
      for (const svc of manifestServices) {
        const svcDecl = typeof svc === 'string' ? { type: svc } : svc
        const { type, protocol, ...metadata } = svcDecl as any
        this.serviceRegistry.register(
          pluginId,
          type,
          ['*'],
          protocol,
          Object.keys(metadata).length ? metadata : undefined,
        )
      }

      // Register manifest slots
      for (const slot of info.manifest.slots || []) {
        this.slotRegistry.register(pluginId, slot.location, slot.label)
      }

      // Register settings tabs under special slot
      const tabs = info.manifest.settings?.tabs || []
      if (tabs.length > 0) {
        this.slotRegistry.register(pluginId, 'settings/tabs', info.name)
        // Register each tab section slot so plugin settings pages can render
        // content (the frontend calls slotRender with the section slot location).
        for (const tab of tabs) {
          for (const section of tab.sections || []) {
            this.slotRegistry.register(pluginId, section.slot, section.label)
          }
        }
      }

      this.pluginsRepo.setEnabled(pluginId)
      eventBus.emit('plugin:enabled', { pluginId })
      eventBus.emit('plugin:slots-changed', { pluginId })
      console.log(`[PluginManager] Enabled plugin: ${pluginId}`)
    } catch (err: any) {
      this.pluginsRepo.updateStatus(pluginId, 'error', err.message)
      throw err
    } finally {
      this.releaseLock(pluginId)
    }
  }

  /**
   * Plugins that declare this plugin in their manifest's `depends_on`,
   * transitively. Used to warn before disabling a plugin others rely on and to
   * cascade the disable through them.
   */
  getDependents(pluginId: string): string[] {
    const dependentsOf = new Map<string, string[]>()
    for (const p of this.getAllPlugins()) {
      for (const dep of p.manifest.depends_on ?? []) {
        const list = dependentsOf.get(dep) ?? []
        list.push(p.id)
        dependentsOf.set(dep, list)
      }
    }
    const result: string[] = []
    const seen = new Set<string>([pluginId])
    const queue = [pluginId]
    while (queue.length) {
      const current = queue.shift()!
      for (const dependent of dependentsOf.get(current) ?? []) {
        if (seen.has(dependent)) continue
        seen.add(dependent)
        result.push(dependent)
        queue.push(dependent)
      }
    }
    return result
  }

  /**
   * Disable a plugin and every plugin that depends on it (transitively).
   * Dependents are stopped before the plugin they rely on. Returns the full
   * list of plugin ids disabled, including `pluginId` itself.
   */
  async disable(pluginId: string): Promise<string[]> {
    const affected = [pluginId, ...this.getDependents(pluginId)]
    for (const id of [...affected].reverse()) {
      await this.disableOne(id)
    }
    return affected
  }

  private async disableOne(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      const runtime = this.runtimes.get(pluginId)
      if (runtime) {
        await runtime.stop()
        this.runtimes.delete(pluginId)
      }

      // Unregister services and slots for this plugin
      this.serviceRegistry.unregister(pluginId)
      this.slotRegistry.unregisterAll(pluginId)

      this.pluginsRepo.setDisabled(pluginId)
      eventBus.emit('plugin:disabled', { pluginId })
      eventBus.emit('plugin:slots-changed', { pluginId })
      console.log(`[PluginManager] Disabled plugin: ${pluginId}`)
    } finally {
      this.releaseLock(pluginId)
    }
  }

  async reload(pluginId: string, opts?: { refreshSource?: boolean }): Promise<void> {
    let info = this.getPlugin(pluginId)
    if (!info) throw new PluginNotFoundError(pluginId)

    // The dev watcher reloads from the source dir, so a manifest.json /
    // config-schema edit must be pushed into the DB before re-enabling —
    // otherwise enable() keeps validating against the stale cached manifest
    // and schema changes never take effect without a manual discover.
    if (opts?.refreshSource && !this.refreshManifestFromDisk(pluginId)) {
      return // source invalid or unreadable — keep the running plugin as-is
    }
    info = this.getPlugin(pluginId) as PluginInfo

    if (info.manifest.system) {
      // System plugins restart the worker in place rather than a full
      // disable()+enable() cycle, avoiding churn in status/events.
      const runtime = this.runtimes.get(pluginId)
      if (runtime) {
        await runtime.stop()
        this.runtimes.delete(pluginId)
      }
      await this.enable(pluginId)
      return
    }
    await this.disableOne(pluginId)
    await this.enable(pluginId)
  }

  /**
   * Re-read `<extensionsDir>/<pluginId>/manifest.json`, run the same
   * structural validation the enable path uses, and persist it back to the DB
   * manifest row. Returns false (and leaves everything untouched) when the
   * source is missing, unparseable, incomplete, or fails schema validation.
   */
  private refreshManifestFromDisk(pluginId: string): boolean {
    const pluginDir = this.getPluginDir(pluginId)
    const manifestPath = path.join(pluginDir, 'manifest.json')
    let manifest: PluginManifest
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    } catch (err: any) {
      console.warn(`[plugins] Reload: could not re-read ${manifestPath}: ${err?.message ?? err}`)
      return false
    }
    if (!manifest.name || !manifest.version || !manifest.entry?.main) {
      console.warn(`[plugins] Reload: ${manifestPath} is incomplete; keeping running plugin`)
      return false
    }
    const schemaErrors = validateManifestSchema(manifest).issues.filter((i) => i.severity === 'error')
    if (schemaErrors.length > 0) {
      console.warn(`[plugins] Reload: ${pluginId} manifest has schema errors; keeping running plugin:`)
      for (const issue of schemaErrors) {
        console.warn(`  - ${issue.path}: ${issue.message}`)
      }
      return false
    }
    try {
      this.pluginsRepo.updateManifest(pluginId, JSON.stringify(manifest), manifest.version)
    } catch (err: any) {
      console.warn(`[plugins] Reload: failed to persist ${manifestPath}: ${err?.message ?? err}`)
      return false
    }
    return true
  }

  // ── Dev auto-reload ─────────────────────────────────────────────
  // In dev, plugins load straight from the repo (extensionsDir) and a
  // running worker never re-requires its module, so editing main.js has
  // no effect until the worker is respawned. Watch plugin sources and
  // reload the affected plugin on change so dev iteration doesn't need a
  // manual toggle or app restart. Gated on devExtensionsDir being set,
  // which only happens in dev (main.ts passes it only when isDev).
  watchPluginSources(debounceMs = 250, warmupMs = 2000): void {
    if (!this.devExtensionsDir) return // dev-only
    if (this.pluginWatcher) return
    // macOS FSEvents fires an initial burst of events for every existing file
    // when the watch starts. Ignore that window so plugins don't get reloaded
    // immediately after being loaded at startup.
    const startedAt = Date.now()
    let watcher: fs.FSWatcher
    try {
      watcher = fs.watch(this.extensionsDir, { recursive: true }, (_eventType, filename) => {
        if (!filename) return
        if (Date.now() - startedAt < warmupMs) return
        const rel = String(filename)
        if (!this.shouldWatchPluginFile(rel)) return
        const pluginId = rel.split(/[/\\]/)[0]
        if (!pluginId) return
        this.schedulePluginReload(pluginId, debounceMs)
      })
    } catch (err: any) {
      console.warn('[plugins] Dev auto-reload watcher failed to start:', err.message)
      return
    }
    watcher.on('error', (err) => {
      console.warn('[plugins] Dev auto-reload watcher error:', err.message)
    })
    this.pluginWatcher = watcher
    console.log(`[plugins] Dev auto-reload: watching ${this.extensionsDir}`)
  }

  private shouldWatchPluginFile(rel: string): boolean {
    const parts = rel.split(/[/\\]/)
    if (parts.some((s) => ['node_modules', '.git', 'dist', 'build', '.vite'].includes(s))) return false
    return /\.(?:js|mjs|cjs|json)$/.test(rel)
  }

  private schedulePluginReload(pluginId: string, debounceMs: number): void {
    const existing = this.pluginReloadTimers.get(pluginId)
    if (existing) clearTimeout(existing)
    this.pluginReloadTimers.set(
      pluginId,
      setTimeout(() => {
        this.pluginReloadTimers.delete(pluginId)
        if (!this.runtimes.has(pluginId)) return // not running — nothing to reload
        console.log(`[plugins] Source changed, reloading "${pluginId}"`)
        // Dev reloads re-read the manifest from disk so schema edits land too;
        // a lone main.js edit just reloads the (unchanged) cached manifest.
        this.reload(pluginId, { refreshSource: true }).catch((err: any) => {
          console.warn(`[plugins] Reload "${pluginId}" failed:`, err.message)
        })
      }, debounceMs),
    )
  }

  stopWatching(): void {
    for (const t of this.pluginReloadTimers.values()) clearTimeout(t)
    this.pluginReloadTimers.clear()
    this.pluginWatcher?.close()
    this.pluginWatcher = null
  }

  // ── Uninstall ───────────────────────────────────────────────────

  async uninstall(pluginId: string): Promise<void> {
    await this.disable(pluginId)

    const pluginDir = this.getPluginDir(pluginId)
    if (fs.existsSync(pluginDir)) {
      fs.rmSync(pluginDir, { recursive: true, force: true })
    }

    this.pluginsRepo.deleteAllPermissions(pluginId)
    this.pluginsRepo.deleteAllConfig(pluginId)
    this.pluginsRepo.delete(pluginId)
  }

  // ── Slots ───────────────────────────────────────────────────────

  getPluginsForSlot(
    location: string,
  ): { pluginId: string; label: string }[] {
    return this.slotRegistry.getPluginsForSlot(location)
  }

  async getSlotData(location: string, context?: Record<string, unknown>): Promise<SlotContribution[]> {
    const plugins = this.slotRegistry.getPluginsForSlot(location)
    const results: SlotContribution[] = []

    for (const { pluginId, label } of plugins) {
      const runtime = this.runtimes.get(pluginId)
      if (!runtime) continue
      if (this.slotRegistry.isSuspended(pluginId, location)) continue

      try {
        const data = await Promise.race([
          runtime.callMethod('slotRender', location, context),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Slot render timeout')),
              5000,
            ),
          ),
        ])
        this.slotRegistry.resetFailures(pluginId, location)
        results.push({
          pluginId,
          label,
          data: (data as any) || { widgets: [] },
        })
      } catch (err: any) {
        this.slotRegistry.recordFailure(pluginId, location)
        console.error(
          `[PluginManager] Slot render failed for ${pluginId} at ${location}:`,
          err.message,
        )
      }
    }

    return results
  }

  async getPageSlotData(
    pageId: string,
  ): Promise<Record<string, SlotContribution[]>> {
    const locations = PAGE_SLOT_MAP[pageId] || []
    const results: Record<string, SlotContribution[]> = {}
    for (const location of locations) {
      results[location] = await this.getSlotData(location)
    }

    // Dynamic plugin settings tabs: settings/<tabId> resolves to that tab's
    // section slots (registered at enable time from manifest.settings.tabs).
    if (pageId.startsWith('settings/')) {
      const tabId = pageId.slice('settings/'.length)
      for (const [pluginId] of this.runtimes) {
        const info = this.getPlugin(pluginId)
        if (!info) continue
        const tab = (info.manifest.settings?.tabs || []).find((t) => t.id === tabId)
        if (!tab) continue
        for (const section of tab.sections || []) {
          const contributions = await this.getSlotData(section.slot)
          if (contributions.length > 0) {
            results[section.slot] = (results[section.slot] || []).concat(contributions)
          }
        }
      }
    }

    return results
  }

  getActivity(): Array<{ pluginId: string; label: string; activities: PluginActivityItem[] }> {
    const slotLabels = new Map(
      this.slotRegistry.getPluginsForSlot('activity:panel').map((s) => [s.pluginId, s.label]),
    )
    return getAllActivity().map(({ pluginId, activities }) => ({
      pluginId,
      label: slotLabels.get(pluginId) || this.getPlugin(pluginId)?.name || pluginId,
      activities,
    }))
  }

  getPluginTabs(): PluginSettingsTab[] {
    const tabs: PluginSettingsTab[] = []
    for (const [pluginId] of this.runtimes) {
      const info = this.getPlugin(pluginId)
      if (!info) continue
      const pluginTabs = info.manifest.settings?.tabs || []
      tabs.push(...pluginTabs.map((tab) => ({ ...tab, pluginId })))
    }
    return tabs
  }

  // ── Discovery ───────────────────────────────────────────────────

  async discoverPlugins(additionalDirs?: string[]): Promise<PluginInfo[]> {
    const discovered: PluginInfo[] = []
    const allDirs = [this.extensionsDir, ...(additionalDirs || [])]
    const seenIds = new Set<string>()

    const devDirs = this.devExtensionsDir ? [this.devExtensionsDir] : []
    const scanDirs = [...new Set([...allDirs, ...devDirs])]

    for (const baseDir of scanDirs) {
      if (!fs.existsSync(baseDir)) {
        if (baseDir === this.extensionsDir) {
          fs.mkdirSync(this.extensionsDir, { recursive: true })
        }
        continue
      }

      const entries = fs.readdirSync(baseDir, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isDirectory()) continue

        const pluginDir = path.join(baseDir, entry.name)
        const manifestPath = path.join(pluginDir, 'manifest.json')

        if (!fs.existsSync(manifestPath)) continue

        let manifest: PluginManifest
        try {
          const raw = fs.readFileSync(manifestPath, 'utf-8')
          manifest = JSON.parse(raw)
        } catch {
          console.warn(
            `[PluginManager] Invalid manifest.json in ${entry.name}, skipping`,
          )
          continue
        }

        if (!manifest.name || !manifest.version || !manifest.entry?.main) {
          console.warn(
            `[PluginManager] Incomplete manifest.json in ${entry.name}, skipping`,
          )
          continue
        }

        // Primary dir takes priority over additional dirs
        if (seenIds.has(entry.name)) continue
        seenIds.add(entry.name)

        const existingRow = this.pluginsRepo.getById(entry.name)
        if (existingRow) {
          try {
            const existingManifest = (() => {
              try {
                return JSON.parse(existingRow.manifest_json)
              } catch {
                return null
              }
            })()
            if (
              existingManifest &&
              (JSON.stringify(existingManifest) !== JSON.stringify(manifest) ||
                existingRow.version !== manifest.version)
            ) {
              this.pluginsRepo.updateManifest(
                entry.name,
                JSON.stringify(manifest),
                manifest.version,
              )
            }
          } catch {
            // skip update if manifest comparison fails
          }
          continue
        }

        const isAdditional = baseDir !== this.extensionsDir
        const now = new Date().toISOString()

        this.pluginsRepo.insert({
          id: entry.name,
          name: manifest.name,
          version: manifest.version,
          description: manifest.description || '',
          author: manifest.author || '',
          repository: manifest.repository || '',
          source_path: isAdditional ? pluginDir : null,
          status: manifest.system ? 'enabled' : 'installed',
          manifest_json: JSON.stringify(manifest),
          enabled_at: manifest.system ? now : null,
        })
        discovered.push(
          this.getPlugin(entry.name) as PluginInfo,
        )
      }
    }

    // Clean up registry rows for plugins that no longer exist on disk
    const allRows = this.pluginsRepo.getAll()
    for (const row of allRows) {
      if (!seenIds.has(row.id)) {
        this.pluginsRepo.delete(row.id)
        console.log(`[PluginManager] Cleaned up obsolete plugin from DB: ${row.id}`)
      }
    }

    return discovered
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async loadEnabledPlugins(): Promise<void> {
    const allRows = this.pluginsRepo.getAll()
    // Respect stored status for every plugin, including system ones — a user
    // can disable a system plugin and have it stay disabled across restarts.
    // Plugins that errored previously are still retried in case the failure
    // was transient.
    const enabled = allRows.filter((r) => r.status === 'enabled')
    const errored = allRows.filter((r) => r.status === 'error')

    for (const row of enabled) {
      try {
        await this.enable(row.id)
        console.log(`[PluginManager] Loaded plugin: ${row.name} v${row.version}`)
      } catch (err) {
        console.error(
          `[PluginManager] Failed to load plugin ${row.id}:`,
          err,
        )
      }
    }

    // Retry previously-errored plugins — they may have been fixed
    for (const row of errored) {
      try {
        await this.enable(row.id)
        console.log(`[PluginManager] Recovered plugin: ${row.name} v${row.version}`)
      } catch {
        // Still failing — status remains error, no spam
      }
    }
  }

  async shutdown(): Promise<void> {
    this.stopWatching()
    const pluginIds = Array.from(this.runtimes.keys())

    for (const pluginId of pluginIds) {
      const runtime = this.runtimes.get(pluginId)
      if (runtime) {
        try {
          await runtime.stop()
        } catch (err) {
          console.error(
            `[PluginManager] Error stopping plugin ${pluginId}:`,
            err,
          )
        }
        this.runtimes.delete(pluginId)
      }
      // Stop the runtime but do NOT persist 'disabled' — the app is exiting,
      // not the user disabling the plugin. Persisting here un-enables every
      // plugin in the DB on each quit, so they stop auto-loading on boot.
      this.serviceRegistry.unregister(pluginId)
      this.slotRegistry.unregisterAll(pluginId)
    }
  }

  // ── Plugin data API ─────────────────────────────────────────────

  async callPluginData(
    pluginId: string,
    method: string,
    ...args: unknown[]
  ): Promise<unknown> {
    const runtime = this.runtimes.get(pluginId)
    if (!runtime) throw new PluginNotRunningError(pluginId)

    try {
      return await runtime.callMethod(method, ...args)
    } catch (err: any) {
      throw new Error(
        `Plugin data call ${pluginId}.${method} failed: ${err.message}`,
      )
    }
  }

  getRuntime(pluginId: string): PluginRuntime | null {
    return this.runtimes.get(pluginId) || null
  }

  // ── Plugin status ───────────────────────────────────────────────

  async getPluginStatus(
    pluginId: string,
  ): Promise<Record<string, unknown> | null> {
    const runtime = this.runtimes.get(pluginId)
    if (!runtime) throw new PluginNotRunningError(pluginId)

    try {
      const result = await runtime.callMethod('status')
      const status = (result as Record<string, unknown>) || null
      if (status) {
        eventBus.emit('plugin:status-changed', { pluginId, status })
      }
      return status
    } catch (err: any) {
      const status = { error: err.message }
      eventBus.emit('plugin:status-changed', { pluginId, status })
      return status
    }
  }

  // ── Configuration ───────────────────────────────────────────────

  getConfig(pluginId: string): Record<string, unknown> {
    const raw = this.pluginsRepo.getConfig(pluginId)
    const parsed: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(raw)) {
      try {
        parsed[key] = JSON.parse(value)
      } catch {
        parsed[key] = value
      }
    }
    return parsed
  }

  setConfig(pluginId: string, key: string, value: unknown): void {
    const info = this.getPlugin(pluginId)
    const field = info?.manifest.config?.[key]
    let stored = value
    if (field) {
      const result = validateConfigValue(field, value)
      if (!result.ok) {
        throw new Error(result.error)
      }
      stored = result.value
    }
    this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(stored))

    // Notify the renderer and the running worker so config-caching plugins react.
    const config = this.getConfig(pluginId)
    eventBus.emit('plugin:config-changed', { pluginId, key, config })
    this.runtimes.get(pluginId)?.pushConfig(config)
  }

  // ── Auth / API config ───────────────────────────────────────────

  setAuthToken(token: string): void {
    this.authToken = token
    this.freeGames.setAuthToken(token)
    for (const runtime of this.runtimes.values()) runtime.setAuthToken(token)
  }

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url
    this.freeGames.setApiBaseUrl(url)
    for (const runtime of this.runtimes.values()) runtime.setApiBaseUrl(url)
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl
  }

  // ── Connection testing ──────────────────────────────────────────

  async testPluginConfig(
    pluginId: string,
    configDraft: Record<string, unknown>,
  ): Promise<{ success: boolean; message: string }> {
    const runtime = this.runtimes.get(pluginId)
    if (!runtime) {
      return {
        success: false,
        message: 'Plugin is not running. Enable the plugin first to test configuration.',
      }
    }

    try {
      const result = await runtime.callMethod('test', configDraft) as { success: boolean; message: string }
      return result ?? { success: false, message: 'Plugin did not return a test result.' }
    } catch (err) {
      return {
        success: false,
        message: err instanceof Error ? err.message : String(err),
      }
    }
  }

  async testInstance(
    url: string,
    apiKey: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const response = await fetch(
        `${url.replace(/\/+$/, '')}/api/v3/system/status`,
        {
          headers: { 'X-Api-Key': apiKey },
        },
      )
      if (response.ok) {
        const data = await response.json()
        return { success: true, message: `Connected (v${data.version || '?'})` }
      }
      if (response.status === 401) {
        return {
          success: false,
          message: 'Authentication failed — check API Key.',
        }
      }
      return {
        success: false,
        message: `Connection failed (HTTP ${response.status}).`,
      }
    } catch {
      return {
        success: false,
        message: `Could not reach ${url}. Is it running?`,
      }
    }
  }

  // ── Compatibility check ─────────────────────────────────────────

  private checkCompatibility(
    pluginId: string,
    manifest: PluginManifest,
  ): void {
    const required = manifest.min_app_version
    if (!required) return

    const appVersion = app.getVersion()
    const parseVersion = (v: string): number[] =>
      v.split('.').map(Number)
    const appParts = parseVersion(appVersion)
    const reqParts = parseVersion(required)
    const maxLen = Math.max(appParts.length, reqParts.length)

    for (let i = 0; i < maxLen; i++) {
      const a = appParts[i] ?? 0
      const r = reqParts[i] ?? 0
      if (a > r) return
      if (a < r)
        throw new PluginIncompatibleError(
          pluginId,
          `requires Otix v${required} or higher (current: ${appVersion})`,
        )
    }
  }
}
