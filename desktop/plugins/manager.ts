import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import { PluginRuntime } from './runtime'
import { eventBus } from './event-bus'
import { PluginsRepository } from '../db/repositories/plugins'

import { fetchAllRegistries } from './marketplace'
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

const execFileAsync = promisify(execFile)

const PAGE_SLOT_MAP: Record<string, string[]> = {
  'settings/library': ['settings/library/extensions'],
  'settings/matching': ['settings/matching/extensions'],
  'settings/plugins': ['settings/plugins/extensions'],
  'media/detail': [
    'media/movie/detail/actions',
    'media/show/detail/actions',
    'media/game/detail/actions',
  ],
}

export class PluginManager {
  private runtimes: Map<string, PluginRuntime> = new Map()
  private locks: Map<string, Promise<void>> = new Map()
  private lockResolvers: Map<string, () => void> = new Map()
  private pluginsRepo: PluginsRepository
  private extensionsDir: string
  private devExtensionsDir: string | undefined
  private apiBaseUrl = 'http://127.0.0.1:8000/api'
  private authToken = ''
  // In-memory slot registry (SlotRegistry from Task 4.1 will replace this)
  private slotRegistry: Map<string, { pluginId: string; label: string }[]> = new Map()

  constructor(
    extensionsDir: string,
    pluginsRepo: PluginsRepository,
    _userDataPath: string,
    devExtensionsDir?: string,
  ) {
    this.extensionsDir = extensionsDir
    this.devExtensionsDir = devExtensionsDir
    this.pluginsRepo = pluginsRepo
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
          this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(value))
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
          // Request permission — the bridge will handle the IPC prompt
          // For now, auto-grant if the manifest declared it
          if (info.manifest.permissions.includes(perm)) {
            this.pluginsRepo.grantPermission(pluginId, perm, 'always')
            return true
          }
          return false
        },
        configStore,
        this.apiBaseUrl,
        this.authToken,
      )

      await runtime.start()
      this.runtimes.set(pluginId, runtime)

      // Register manifest slots
      for (const slot of info.manifest.slots || []) {
        const existing = this.slotRegistry.get(slot.location) || []
        existing.push({ pluginId, label: slot.label })
        this.slotRegistry.set(slot.location, existing)
      }

      // Register settings tabs under special slot
      const tabs = info.manifest.settings?.tabs || []
      if (tabs.length > 0) {
        const existing = this.slotRegistry.get('settings/tabs') || []
        existing.push({ pluginId, label: info.name })
        this.slotRegistry.set('settings/tabs', existing)
      }

      this.pluginsRepo.setEnabled(pluginId)
      console.log(`[PluginManager] Enabled plugin: ${pluginId}`)
    } catch (err: any) {
      this.pluginsRepo.updateStatus(pluginId, 'error', err.message)
      throw err
    } finally {
      this.releaseLock(pluginId)
    }
  }

  async disable(pluginId: string): Promise<void> {
    await this.acquireLock(pluginId)
    try {
      const runtime = this.runtimes.get(pluginId)
      if (runtime) {
        await runtime.stop()
        this.runtimes.delete(pluginId)
      }

      // Unregister slots
      for (const [location, entries] of this.slotRegistry.entries()) {
        this.slotRegistry.set(
          location,
          entries.filter((e) => e.pluginId !== pluginId),
        )
      }

      this.pluginsRepo.setDisabled(pluginId)
      console.log(`[PluginManager] Disabled plugin: ${pluginId}`)
    } finally {
      this.releaseLock(pluginId)
    }
  }

  // ── Install from Git ────────────────────────────────────────────

  async installFromGit(
    repoUrl: string,
    pluginPath?: string,
  ): Promise<PluginInfo> {
    // Validate URL
    const parsed = new URL(repoUrl)
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Only HTTP(S) repository URLs are supported')
    }

    const repoName = repoUrl.replace(/\.git$/, '').split('/').pop()
    if (!repoName) throw new Error(`Invalid repo URL: ${repoUrl}`)

    const pluginId = pluginPath ? path.basename(pluginPath) : repoName
    const targetDir = path.join(this.extensionsDir, pluginId)

    if (fs.existsSync(targetDir)) {
      throw new Error(`Plugin directory already exists: ${targetDir}`)
    }

    // Determine clone dir — for monorepo (pluginPath given), clone to temp first
    const cloneDir = pluginPath
      ? path.join(
          os.tmpdir(),
          `otix-plugin-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        )
      : targetDir

    // Use execFile to avoid shell injection
    try {
      await execFileAsync('git', ['clone', '--depth', '1', repoUrl, cloneDir], {
        timeout: 120_000,
      })
    } catch (err) {
      if (fs.existsSync(cloneDir)) {
        fs.rmSync(cloneDir, { recursive: true, force: true })
      }
      throw new Error(
        `Git clone failed for ${repoUrl}: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    // Read manifest
    const manifestDir = pluginPath ? path.join(cloneDir, pluginPath) : cloneDir
    const manifestPath = path.join(manifestDir, 'manifest.json')

    if (!fs.existsSync(manifestPath)) {
      fs.rmSync(cloneDir, { recursive: true, force: true })
      throw new Error(
        pluginPath
          ? `Plugin at path "${pluginPath}" is missing manifest.json`
          : `manifest.json not found — not a valid plugin`,
      )
    }

    let manifest: PluginManifest
    try {
      const raw = fs.readFileSync(manifestPath, 'utf-8')
      manifest = JSON.parse(raw)
    } catch (err) {
      fs.rmSync(cloneDir, { recursive: true, force: true })
      throw new Error(
        `Plugin ${repoName} has invalid manifest.json: ${err instanceof Error ? err.message : String(err)}`,
      )
    }

    if (!manifest.name || !manifest.version || !manifest.entry?.main) {
      fs.rmSync(cloneDir, { recursive: true, force: true })
      throw new Error(
        'Plugin has incomplete manifest.json (name, version, and entry.main are required)',
      )
    }

    // Check compatibility
    this.checkCompatibility(pluginId, manifest)

    // For monorepo: copy the plugin subdirectory to the extensions dir, then remove temp clone
    if (pluginPath) {
      try {
        fs.cpSync(manifestDir, targetDir, { recursive: true })
      } catch (err) {
        fs.rmSync(cloneDir, { recursive: true, force: true })
        throw new Error(
          `Failed to copy plugin: ${err instanceof Error ? err.message : String(err)}`,
        )
      }
      fs.rmSync(cloneDir, { recursive: true, force: true })
    }

    this.pluginsRepo.insert({
      id: pluginId,
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      author: manifest.author || '',
      repository: manifest.repository || repoUrl,
      source_path: pluginPath || null,
      status: 'installed',
      manifest_json: JSON.stringify(manifest),
      enabled_at: null,
    })

    return this.getPlugin(pluginId)!
  }

  // ── Update ──────────────────────────────────────────────────────

  async updatePlugin(pluginId: string): Promise<PluginInfo> {
    const row = this.pluginsRepo.getById(pluginId)
    if (!row) throw new PluginNotFoundError(pluginId)
    const info = this.pluginRowToInfo(row)

    const wasEnabled = info.status === 'enabled'

    // Disable first if enabled
    if (wasEnabled) {
      await this.disable(pluginId)
    }

    try {
      // Clone fresh copy to temp dir
      const tempDir = path.join(
        os.tmpdir(),
        `otix-update-${pluginId}-${Date.now()}`,
      )
      const repoUrl = info.repository

      await execFileAsync('git', ['clone', repoUrl, tempDir], {
        timeout: 120_000,
      })

      const sourceDir = info.sourcePath
        ? path.join(tempDir, info.sourcePath)
        : tempDir
      const targetDir = this.getPluginDir(pluginId)

      // Read new manifest to get new version
      const manifestPath = path.join(sourceDir, 'manifest.json')
      let newManifest: PluginManifest
      let newVersion = info.version
      if (fs.existsSync(manifestPath)) {
        const raw = fs.readFileSync(manifestPath, 'utf-8')
        newManifest = JSON.parse(raw)
        newVersion = newManifest.version || info.version
      } else {
        fs.rmSync(tempDir, { recursive: true, force: true })
        throw new Error('Updated plugin is missing manifest.json')
      }

      // Remove old files except hidden files and data dirs, then copy new
      const entries = fs.readdirSync(targetDir)
      for (const entry of entries) {
        if (entry.startsWith('.') || entry === 'data') continue
        const fullPath = path.join(targetDir, entry)
        fs.rmSync(fullPath, { recursive: true, force: true })
      }

      // Copy new files
      const newEntries = fs.readdirSync(sourceDir)
      for (const entry of newEntries) {
        if (entry.startsWith('.')) continue
        const src = path.join(sourceDir, entry)
        const dest = path.join(targetDir, entry)
        fs.cpSync(src, dest, { recursive: true })
      }

      // Update version and manifest in DB
      this.pluginsRepo.updateManifest(pluginId, JSON.stringify(newManifest), newVersion)

      // Clean up temp
      fs.rmSync(tempDir, { recursive: true, force: true })

      // Re-enable if was enabled
      if (wasEnabled) {
        await this.enable(pluginId)
      }

      const updatedRow = this.pluginsRepo.getById(pluginId)
      if (!updatedRow) throw new Error('Plugin vanished after update')
      return this.pluginRowToInfo(updatedRow)
    } catch (err) {
      // Try to re-enable if update failed
      if (wasEnabled) {
        try {
          await this.enable(pluginId)
        } catch {
          // swallow re-enable error
        }
      }
      throw err
    }
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
    return this.slotRegistry.get(location) || []
  }

  async getSlotData(location: string): Promise<SlotContribution[]> {
    const plugins = this.slotRegistry.get(location) || []
    const results: SlotContribution[] = []

    for (const { pluginId, label } of plugins) {
      const runtime = this.runtimes.get(pluginId)
      if (!runtime) continue

      try {
        const data = await Promise.race([
          runtime.callMethod('slotRender', location),
          new Promise<never>((_, reject) =>
            setTimeout(
              () => reject(new Error('Slot render timeout')),
              5000,
            ),
          ),
        ])
        results.push({
          pluginId,
          label,
          data: (data as any) || { widgets: [] },
        })
      } catch (err: any) {
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
    return results
  }

  getPluginTabs(): PluginSettingsTab[] {
    const tabs: PluginSettingsTab[] = []
    for (const [pluginId] of this.runtimes) {
      const info = this.getPlugin(pluginId)
      if (!info) continue
      const pluginTabs = info.manifest.settings?.tabs || []
      tabs.push(...pluginTabs)
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
          status: 'installed',
          manifest_json: JSON.stringify(manifest),
          enabled_at: null,
        })
        discovered.push(
          this.getPlugin(entry.name) as PluginInfo,
        )
      }
    }

    return discovered
  }

  // ── Lifecycle ───────────────────────────────────────────────────

  async loadEnabledPlugins(): Promise<void> {
    const allRows = this.pluginsRepo.getAll()
    const enabled = allRows.filter((r) => r.status === 'enabled')

    for (const row of enabled) {
      try {
        await this.enable(row.id)
        console.log(
          `[PluginManager] Loaded plugin: ${row.name} v${row.version}`,
        )
      } catch (err) {
        console.error(
          `[PluginManager] Failed to load plugin ${row.id}:`,
          err,
        )
      }
    }
  }

  async shutdown(): Promise<void> {
    const pluginIds = Array.from(this.runtimes.keys())

    for (const pluginId of pluginIds) {
      try {
        await this.disable(pluginId)
        console.log(`[PluginManager] Shut down plugin: ${pluginId}`)
      } catch (err) {
        console.error(
          `[PluginManager] Error shutting down plugin ${pluginId}:`,
          err,
        )
      }
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

  // ── Plugin status ───────────────────────────────────────────────

  async getPluginStatus(
    pluginId: string,
  ): Promise<Record<string, unknown> | null> {
    const runtime = this.runtimes.get(pluginId)
    if (!runtime) throw new PluginNotRunningError(pluginId)

    try {
      const result = await runtime.callMethod('status')
      return (result as Record<string, unknown>) || null
    } catch (err: any) {
      return { error: err.message }
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
    this.pluginsRepo.setConfig(pluginId, key, JSON.stringify(value))
  }

  // ── Auth / API config ───────────────────────────────────────────

  setAuthToken(token: string): void {
    this.authToken = token
  }

  setApiBaseUrl(url: string): void {
    this.apiBaseUrl = url
  }

  getApiBaseUrl(): string {
    return this.apiBaseUrl
  }

  // ── Marketplace ─────────────────────────────────────────────────

  async fetchMarketplace(): Promise<{
    success: boolean
    plugins?: unknown[]
    errors?: string[]
  }> {
    try {
      const result = await fetchAllRegistries()
      return {
        success: true,
        plugins: result.entries,
        errors: result.errors.length > 0 ? result.errors : undefined,
      }
    } catch (err: any) {
      return { success: false, errors: [err.message] }
    }
  }

  // ── Repo management ─────────────────────────────────────────────

  getRepos(): { url: string; label?: string; added_at?: string }[] {
    return this.pluginsRepo.getRepos().map((r) => ({
      url: r.url,
      label: r.label || undefined,
      added_at: r.added_at,
    }))
  }

  addRepo(url: string, label?: string): void {
    this.pluginsRepo.addRepo(url, label)
  }

  removeRepo(url: string): void {
    this.pluginsRepo.removeRepo(url)
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
