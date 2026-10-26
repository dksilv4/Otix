import type { DesktopSettingsData } from '@/lib/desktop/api'

export const STORAGE_KEY = 'otix:desktop-settings'

export interface MachineCPU {
  modelName: string
  cores: number
  threads: number
  baseClockMhz?: number
  architecture: string
  vendor?: string
}

export interface MachineMemory {
  totalBytes: number
  availableBytes: number
  usedBytes: number
  usagePercent: number
}

export interface MachineGPU {
  name: string
  driverVersion?: string
  vramBytes?: number
  isPrimary?: boolean
  isDiscrete?: boolean
}

export interface MachineStorage {
  drive: string
  label?: string
  fileSystem?: string
  totalBytes: number
  freeBytes: number
  usedBytes: number
  usagePercent: number
}

export interface MachineSystem {
  manufacturer?: string
  model?: string
  hostname?: string
  biosVersion?: string
}

export interface MachineOS {
  name: string
  version?: string
  build?: string
  platform: string
  architecture: string
}

export interface MachineDisplay {
  index: number
  deviceName: string
  name: string
  manufacturer?: string
  model?: string
  resolution: string
  width: number
  height: number
  refreshRate?: number
  isPrimary: boolean
  positionX: number
  positionY: number
  orientation?: string
  arrangement?: string
}

export interface MachineHardware {
  probedAt?: string
  cpu: MachineCPU
  memory: MachineMemory
  gpus: MachineGPU[]
  displays?: MachineDisplay[]
  storage: MachineStorage[]
  system: MachineSystem
  os: MachineOS
}

export interface NodeCapabilities {
  game_tracking?: boolean
  in_game_overlay?: boolean
  web_overlay?: boolean
  silent_install?: boolean
  saves_backup?: boolean
  downloader_provider?: boolean
  hypervisor?: boolean
}

export interface NodeMachineData extends DesktopSettingsData {
  hostname?: string
  arch?: string
  numCpu?: number
  goVersion?: string
  uptimeSeconds?: number
  capabilities?: NodeCapabilities
  hardware?: MachineHardware
  gameTracking?: boolean
  overlayEnabled?: boolean
  overlayCorner?: string
  overlayMonitor?: string
  overlayMonitors?: Array<{ id: string; name: string; is_primary?: boolean; isPrimary?: boolean; width?: number; height?: number }>
  overlayHotkey?: string
  autoBackupOnExit?: boolean
}

export const DEFAULT_SETTINGS: NodeMachineData = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  scanOnLaunch: false,
  autoBackupOnExit: true,
  gameTracking: true,
  overlayEnabled: false,
  overlayCorner: 'top-wide',
  overlayMonitor: 'auto',
  overlayHotkey: 'Ctrl+`',
  capabilities: {
    game_tracking: true,
    in_game_overlay: false,
    web_overlay: true,
    silent_install: false,
    saves_backup: true,
    downloader_provider: false,
  },
}

export const readStoredSettings = (serverId?: number): NodeMachineData => {
  try {
    const key = serverId != null && serverId !== -1 ? `${STORAGE_KEY}:node:${serverId}` : STORAGE_KEY
    const raw = localStorage.getItem(key)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS
}

export const mapNodeSettings = (
  fetched: Record<string, unknown>,
  fallback?: NodeMachineData & { platform?: string },
): NodeMachineData => {
  const p = String(fetched.platform || fallback?.platform || 'windows').toLowerCase()
  const isWindows = p.includes('win')

  return {
    launchOnStartup: Boolean(fetched.launchOnStartup ?? fetched.launch_on_startup ?? fallback?.launchOnStartup),
    minimizeToTray: Boolean(fetched.minimizeToTray ?? fetched.minimize_to_tray ?? fallback?.minimizeToTray),
    closeToTray: Boolean(fetched.closeToTray ?? fetched.close_to_tray ?? fallback?.closeToTray),
    alwaysOnTop: Boolean(fetched.alwaysOnTop ?? fetched.always_on_top ?? fallback?.alwaysOnTop),
    startMinimized: Boolean(fetched.startMinimized ?? fetched.start_minimized ?? fallback?.startMinimized),
    gamesDownloadPath: String(fetched.gamesDownloadPath || fetched.games_download_path || fallback?.gamesDownloadPath || ''),
    gamesInstallPath: String(fetched.gamesInstallPath || fetched.games_install_path || fallback?.gamesInstallPath || ''),
    scanOnLaunch: Boolean(fetched.scanOnLaunch ?? fetched.scan_on_launch ?? fallback?.scanOnLaunch),
    autoBackupOnExit: Boolean(
      fetched.autoBackupOnExit ?? fetched.auto_backup_on_exit ?? fallback?.autoBackupOnExit ?? true,
    ),
    gameTracking: Boolean(fetched.gameTracking ?? fetched.game_tracking ?? fallback?.gameTracking ?? true),
    overlayEnabled: Boolean(fetched.overlayEnabled ?? fetched.overlay_enabled ?? fallback?.overlayEnabled ?? false),
    overlayCorner: String(fetched.overlayCorner ?? fetched.overlay_corner ?? fallback?.overlayCorner ?? 'top-wide'),
    overlayMonitor: String(fetched.overlayMonitor ?? fetched.overlay_monitor ?? fallback?.overlayMonitor ?? 'auto'),
    overlayMonitors: (fetched.overlayMonitors ?? fetched.overlay_monitors ?? fallback?.overlayMonitors) as NodeMachineData['overlayMonitors'],
    overlayHotkey: String(fetched.overlayHotkey ?? fetched.overlay_hotkey ?? fallback?.overlayHotkey ?? 'Ctrl+`'),
    hostname: String(fetched.hostname || fallback?.hostname || ''),
    arch: String(fetched.arch || fallback?.arch || 'amd64'),
    numCpu: Number(fetched.numCpu ?? fetched.num_cpu ?? fallback?.numCpu ?? 0),
    goVersion: String(fetched.goVersion || fetched.go_version || fallback?.goVersion || ''),
    uptimeSeconds: Number(fetched.uptimeSeconds ?? fetched.uptime_seconds ?? fallback?.uptimeSeconds ?? 0),
    hardware: (fetched.hardware as MachineHardware) || fallback?.hardware,
    capabilities: (fetched.capabilities as NodeCapabilities) ?? fallback?.capabilities ?? {
      game_tracking: true,
      in_game_overlay: isWindows,
      web_overlay: true,
      silent_install: isWindows,
      saves_backup: true,
      downloader_provider: false,
    },
  }
}

export const formatUptime = (seconds?: number): string => {
  if (!seconds || seconds <= 0) return 'Just started'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export const suggestDuplicateNodeName = (
  sourceName: string,
  existingNames: string[] = [],
): string => {
  const trimmed = sourceName.trim()
  const base = `${trimmed} (Copy)`
  if (!existingNames.includes(base)) return base
  let index = 2
  while (existingNames.includes(`${trimmed} (Copy ${index})`)) {
    index++
  }
  return `${trimmed} (Copy ${index})`
}

export const suggestDuplicateNodeUrl = (sourceUrl?: string | null): string => {
  if (!sourceUrl) return 'http://127.0.0.1:8091'
  try {
    const url = new URL(sourceUrl)
    const port = Number(url.port)
    if (port && !Number.isNaN(port)) {
      url.port = String(port + 1)
      return url.toString().replace(/\/$/, '')
    }
  } catch {
    const match = sourceUrl.match(/:(\d+)$/)
    if (match) {
      const port = Number(match[1]) + 1
      return sourceUrl.replace(/:\d+$/, `:${port}`)
    }
  }
  return sourceUrl
}

export const generateDuplicateNodeToken = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '')
  }
  return Math.random().toString(36).substring(2) + Date.now().toString(36)
}
