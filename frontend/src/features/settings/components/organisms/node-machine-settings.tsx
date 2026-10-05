import { useState, useEffect, useCallback } from 'react'
import {
  Power,
  MinusCircle,
  XCircle,
  ChevronUp,
  Eye,
  Loader2,
  Cpu,
  Monitor,
  Gamepad2,
  Sparkles,
  Layers,
  HardDrive,
  Download,
  FolderOpen,
  Clock,
  RefreshCw,
  Activity,
  Server as ServerIcon,
} from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { DkButton } from '@ui/atoms/button'
import { DkSelect } from '@ui/atoms/select'
import { useToast } from '@ui/molecules/toast'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { SectionHeader } from '../molecules/settings-section-header'
import { cn, formatBytes, formatRAM, formatTimeAgo } from '@/lib/utils'

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
  overlayEnabled: true,
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

export function readStoredSettings(serverId?: number): NodeMachineData {
  try {
    const key = serverId != null && serverId !== -1 ? `${STORAGE_KEY}:node:${serverId}` : STORAGE_KEY
    const raw = localStorage.getItem(key)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS
}

export function mapNodeSettings(fetched: Record<string, unknown>, fallback?: NodeMachineData): NodeMachineData {
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
    overlayEnabled: Boolean(fetched.overlayEnabled ?? fetched.overlay_enabled ?? fallback?.overlayEnabled ?? true),
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

const DESKTOP_WINDOW_ROWS = [
  { key: 'minimizeToTray' as const, icon: <MinusCircle className="h-5 w-5" />, label: 'Minimize to tray', desc: 'Send the node UI to the tray instead of the taskbar.' },
  { key: 'closeToTray' as const, icon: <XCircle className="h-5 w-5" />, label: 'Close to tray', desc: 'Closing the window keeps the node running in the background.' },
  { key: 'alwaysOnTop' as const, icon: <Eye className="h-5 w-5" />, label: 'Always on top', desc: 'Keep the node window above other windows when it has a UI.' },
  { key: 'startMinimized' as const, icon: <ChevronUp className="h-5 w-5" />, label: 'Start minimized', desc: 'Start hidden in the system tray.' },
]

function formatUptime(seconds?: number): string {
  if (!seconds || seconds <= 0) return 'Just started'
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}m`
}

export function NodeMachineSettings({ server }: { server: GameServer }) {
  const { toast } = useToast()
  const managingLocal = isLocalDesktopNode(server)
  const storageKey = managingLocal ? STORAGE_KEY : `${STORAGE_KEY}:node:${server.id}`
  const [settings, setSettings] = useState<NodeMachineData>(() => readStoredSettings(server.id))
  const [loading, setLoading] = useState(true)
  const [refreshingHardware, setRefreshingHardware] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const [platform, setPlatform] = useState('')

  const api = (window as unknown as { desktopAPI?: {
    getDesktopSettings: () => Promise<DesktopSettingsData>
    setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
    platform?: string
  } }).desktopAPI

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      setLoading(true)
      try {
        if (managingLocal) {
          let mapped = readStoredSettings(server.id)
          if (api?.getDesktopSettings) {
            try {
              const local = await api.getDesktopSettings()
              if (local) mapped = { ...DEFAULT_SETTINGS, ...local }
            } catch {
              // ignore
            }
          }
          if (!cancelled) {
            setSettings(mapped)
            setSupported(true)
            setPlatform(api?.platform || 'desktop')
          }
          return
        }

        const res = await apiClient.get<Record<string, unknown>>(`/library/servers/${server.id}/desktop`)
        const fetchedSettings = res?.data
        if (!cancelled && fetchedSettings) {
          const nextPlatform = String(fetchedSettings.platform || 'linux')
          setPlatform(nextPlatform)
          setSupported(Boolean(fetchedSettings.supported ?? (nextPlatform === 'windows' || nextPlatform === 'linux')))
          const mapped = mapNodeSettings(fetchedSettings)
          setSettings(mapped)
          try {
            localStorage.setItem(storageKey, JSON.stringify(mapped))
          } catch {
            // ignore storage quota error
          }
        }
      } catch {
        if (!cancelled) {
          setSettings(readStoredSettings(server.id))
          setSupported(false)
          setPlatform('unknown')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadSettings()
    return () => {
      cancelled = true
    }
  }, [api, managingLocal, server.id, storageKey])

  const handleRefreshHardware = useCallback(async () => {
    setRefreshingHardware(true)
    try {
      if (managingLocal) {
        if (api?.getDesktopSettings) {
          const local = await api.getDesktopSettings()
          if (local) {
            const mapped = { ...DEFAULT_SETTINGS, ...local }
            setSettings(mapped)
            try {
              localStorage.setItem(storageKey, JSON.stringify(mapped))
            } catch {
              // ignore
            }
          }
        }
        toast({
          title: 'Hardware scan complete',
          description: 'Host machine components updated.',
          variant: 'success',
        })
        return
      }

      const res = await apiClient.get<Record<string, unknown>>(`/library/servers/${server.id}/desktop?refresh=true`)
      if (res?.data) {
        const mapped = mapNodeSettings(res.data)
        setSettings(mapped)
        try {
          localStorage.setItem(storageKey, JSON.stringify(mapped))
        } catch {
          // ignore
        }
        toast({
          title: 'Hardware scan complete',
          description: `Refreshed hardware components on ${server.name}.`,
          variant: 'success',
        })
      }
    } catch (err: unknown) {
      toast({
        title: 'Scan failed',
        description: (err as { message?: string })?.message || 'Could not query host hardware from node daemon.',
        variant: 'error',
      })
    } finally {
      setRefreshingHardware(false)
    }
  }, [api, managingLocal, server.id, server.name, storageKey, toast])

  const handleToggle = useCallback((key: keyof NodeMachineData) => async (checked: boolean) => {
    setSaving(key)
    const next = { ...settings, [key]: checked }
    setSettings(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // ignore storage quota error
    }

    if (managingLocal) {
      try {
        if (api?.setDesktopSettings) {
          const updated = await api.setDesktopSettings({ [key]: checked })
          setSettings({ ...DEFAULT_SETTINGS, ...updated })
        }
      } catch (err) {
        toast({
          title: 'Failed to update setting',
          description: String(err),
          variant: 'error',
        })
      } finally {
        setSaving(null)
      }
      return
    }

    try {
      const res = await apiClient.post<Record<string, unknown>>(`/library/servers/${server.id}/desktop`, {
        [key]: checked,
      })
      const updatedData = res?.data
      if (updatedData) {
        setSettings((prev) => mapNodeSettings(updatedData, prev))
        if (updatedData.platform) {
          setPlatform(String(updatedData.platform))
          setSupported(Boolean(updatedData.supported ?? (updatedData.platform === 'windows' || updatedData.platform === 'linux')))
        }
      }
      toast({
        title: 'Node updated',
        description: supported
          ? `Applied on ${server.name} (${platform}).`
          : `Saved on ${server.name}.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Saved locally',
        description: 'This node is unreachable. Setting saved in the browser until it comes back.',
        variant: 'info',
      })
    } finally {
      setSaving(null)
    }
  }, [api, managingLocal, platform, server.id, server.name, settings, storageKey, supported, toast])

  const handleSelectChange = useCallback((key: keyof NodeMachineData) => async (value: string) => {
    setSaving(key)
    const next = { ...settings, [key]: value }
    setSettings(next)
    try {
      localStorage.setItem(storageKey, JSON.stringify(next))
    } catch {
      // ignore storage quota error
    }

    if (managingLocal) {
      try {
        if (api?.setDesktopSettings) {
          const updated = await api.setDesktopSettings({ [key]: value })
          setSettings((prev) => ({ ...prev, ...updated }))
        }
      } catch (err) {
        toast({
          title: 'Failed to update setting',
          description: String(err),
          variant: 'error',
        })
      } finally {
        setSaving(null)
      }
      return
    }

    try {
      const res = await apiClient.post<Record<string, unknown>>(`/library/servers/${server.id}/desktop`, {
        [key]: value,
      })
      const updatedData = res?.data
      if (updatedData) {
        setSettings((prev) => mapNodeSettings(updatedData, prev))
      }
      toast({
        title: 'Node updated',
        description: `Applied on ${server.name}.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Saved locally',
        description: 'This node is unreachable. Setting saved in the browser until it comes back.',
        variant: 'info',
      })
    } finally {
      setSaving(null)
    }
  }, [api, managingLocal, server.id, server.name, settings, storageKey, toast])

  const caps = settings.capabilities || {}
  const hw = settings.hardware
  const displayPlatform = platform || (managingLocal ? 'Local Desktop' : 'Linux')
  const isWindows = displayPlatform.toLowerCase().includes('win')

  return (
    <div className="space-y-4">
      {/* Hardware & Platform Capabilities Card */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Hardware & Machine Specifications"
          description={
            managingLocal
              ? 'Detected hardware specs, components, and runtime capabilities on this machine.'
              : `Detected hardware specs, components, and runtime capabilities on ${server.name}.`
          }
          action={
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleRefreshHardware}
              disabled={refreshingHardware || loading}
              className="gap-1.5 h-8 px-2.5 text-xs text-white/70 hover:text-white border border-white/10 hover:bg-white/5 cursor-pointer"
            >
              <RefreshCw size={13} className={refreshingHardware ? 'animate-spin text-primary' : ''} />
              <span>{refreshingHardware ? 'Scanning...' : 'Re-scan Hardware'}</span>
            </DkButton>
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary/60" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* System Identity Banner */}
            <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.05] space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-primary/15 border border-primary/25 flex items-center justify-center text-primary">
                    <ServerIcon size={16} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white tracking-tight">
                        {hw?.system?.hostname || settings.hostname || server.name}
                      </span>
                      {hw?.os?.platform && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-white/10 text-white/70 uppercase">
                          {hw.os.platform}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/50">
                      {hw?.system?.model
                        ? `${hw.system.manufacturer ? `${hw.system.manufacturer} ` : ''}${hw.system.model}`
                        : `Host Node: ${server.name}`}
                      {hw?.system?.biosVersion ? ` · BIOS ${hw.system.biosVersion}` : ''}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 text-emerald-300 font-medium">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span>Online & Ready</span>
                  </div>
                  <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/[0.04] text-white/60">
                    <Clock size={12} className="text-white/40" />
                    <span>Uptime: {formatUptime(settings.uptimeSeconds)}</span>
                  </div>
                </div>
              </div>

              {/* OS & Runtime identity sub-row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Operating System</span>
                  <span className="font-semibold text-white truncate block mt-0.5">
                    {hw?.os?.name || displayPlatform} {hw?.os?.version || ''}
                  </span>
                  {hw?.os?.build && <span className="text-[10px] text-white/40">Build {hw.os.build}</span>}
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Architecture</span>
                  <span className="font-semibold text-white truncate block mt-0.5">
                    {hw?.os?.architecture || settings.arch || 'amd64'}
                  </span>
                  <span className="text-[10px] text-white/40">{settings.goVersion || 'Daemon Runtime'}</span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Total Memory</span>
                  <span className="font-semibold text-emerald-300 truncate block mt-0.5">
                    {hw?.memory?.totalBytes ? formatRAM(hw.memory.totalBytes) : 'N/A'}
                  </span>
                  <span className="text-[10px] text-white/40">Physical Capacity</span>
                </div>

                <div>
                  <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Last Hardware Probe</span>
                  <span className="font-semibold text-cyan-300 truncate block mt-0.5">
                    {hw?.probedAt ? formatTimeAgo(hw.probedAt) : 'Live Cached'}
                  </span>
                  <span className="text-[10px] text-white/40">45s dynamic refresh</span>
                </div>
              </div>
            </div>

            {/* Core Hardware Components Grid */}
            {hw ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {/* 1. CPU / Processor Card */}
                <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-cyan-500/15 text-cyan-400">
                        <Cpu size={16} />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Processor (CPU)</span>
                    </div>
                    {hw.cpu?.vendor && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 border border-cyan-500/20">
                        {hw.cpu.vendor}
                      </span>
                    )}
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold text-white leading-snug">
                      {hw.cpu?.modelName || 'Host Processor'}
                    </h4>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-1 border-t border-white/[0.05] text-xs">
                    <div>
                      <span className="text-[10px] text-white/40 block">Cores / Threads</span>
                      <span className="font-semibold text-white/90">
                        {hw.cpu?.cores || 0}C / {hw.cpu?.threads || settings.numCpu || 0}T
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Base Clock</span>
                      <span className="font-semibold text-white/90">
                        {hw.cpu?.baseClockMhz ? `${(hw.cpu.baseClockMhz / 1000).toFixed(2)} GHz` : 'Dynamic'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[10px] text-white/40 block">Architecture</span>
                      <span className="font-semibold text-white/90 uppercase">{hw.cpu?.architecture || 'amd64'}</span>
                    </div>
                  </div>
                </div>

                {/* 2. Graphics (GPU) Card */}
                <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-purple-500/15 text-purple-400">
                        <Monitor size={16} />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">Graphics (GPU)</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {hw.gpus?.length || 0} Adapter{hw.gpus?.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {hw.gpus && hw.gpus.length > 0 ? (
                      hw.gpus.map((gpu, idx) => (
                        <div
                          key={`${gpu.name}-${idx}`}
                          className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-white leading-tight">
                              {gpu.name}
                            </span>
                            <div className="flex items-center gap-1 shrink-0">
                              {gpu.isDiscrete ? (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                                  Discrete
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                                  Integrated
                                </span>
                              )}
                              {gpu.isPrimary && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                                  Primary
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-white/50">
                            <span>
                              {gpu.vramBytes && gpu.vramBytes > 0
                                ? `${formatBytes(gpu.vramBytes)} Dedicated VRAM`
                                : 'Shared System VRAM'}
                            </span>
                            {gpu.driverVersion && (
                              <span className="font-mono text-[10px]">Driver: {gpu.driverVersion}</span>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-white/50 italic py-2">
                        Standard or integrated display adapter detected.
                      </p>
                    )}
                  </div>
                </div>

                {/* 3. System Memory (RAM) Card — Static Physical Memory Spec Only */}
                <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-400">
                        <Activity size={16} />
                      </div>
                      <span className="text-xs font-bold text-white uppercase tracking-wider">System Memory (RAM)</span>
                    </div>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">
                      Physical Memory
                    </span>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="text-xl font-black text-white font-mono">
                        {formatRAM(hw.memory?.totalBytes || 0)}
                      </span>
                      <span className="text-xs text-white/50">Installed Physical RAM</span>
                    </div>
                    <p className="text-[11px] text-white/40">
                      Total physical RAM capacity installed on host machine.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-white/[0.05] text-[11px] text-white/50">
                    <span>Hardware Spec</span>
                    <span className="font-semibold text-white/90">
                      {formatRAM(hw.memory?.totalBytes || 0)} Total
                    </span>
                  </div>
                </div>

                {/* 4. Storage Volumes Card — Fixed Internal Disks Only (No USB) */}
                {(() => {
                  const internalDisks = (hw.storage || []).filter(
                    (d) =>
                      !/usb/i.test(d.drive) &&
                      !/usb/i.test(d.label || '') &&
                      !/removable/i.test(d.label || '') &&
                      !/flash/i.test(d.label || ''),
                  )

                  return (
                    <div className="p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-amber-500/15 text-amber-400">
                            <HardDrive size={16} />
                          </div>
                          <span className="text-xs font-bold text-white uppercase tracking-wider">Fixed Disks</span>
                        </div>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 border border-amber-500/20">
                          {internalDisks.length} Internal Drive{internalDisks.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                        {internalDisks.length > 0 ? (
                          internalDisks.map((disk, idx) => (
                            <div
                              key={`${disk.drive}-${idx}`}
                              className="p-2.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1.5"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-1.5">
                                  <span className="font-mono font-bold text-white">{disk.drive}</span>
                                  {disk.label && (
                                    <span className="text-[11px] text-white/60 truncate max-w-[120px]">
                                      ({disk.label})
                                    </span>
                                  )}
                                  {disk.fileSystem && (
                                    <span className="px-1.5 py-0.2 rounded text-[9px] font-medium bg-white/10 text-white/50">
                                      {disk.fileSystem}
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] font-medium text-white/70">
                                  {disk.usagePercent.toFixed(1)}% used
                                </span>
                              </div>

                              <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                                <div
                                  className={cn(
                                    'h-full rounded-full transition-all duration-500',
                                    disk.usagePercent > 90
                                      ? 'bg-rose-500'
                                      : disk.usagePercent > 75
                                        ? 'bg-amber-400'
                                        : 'bg-primary',
                                  )}
                                  style={{ width: `${Math.min(100, Math.max(0, disk.usagePercent))}%` }}
                                />
                              </div>

                              <div className="flex items-center justify-between text-[10px] text-white/50">
                                <span>{formatBytes(disk.freeBytes)} free</span>
                                <span>{formatBytes(disk.totalBytes)} total</span>
                              </div>
                            </div>
                          ))
                        ) : (
                          <p className="text-xs text-white/50 italic py-2">No fixed internal storage reported.</p>
                        )}
                      </div>
                    </div>
                  )
                })()}

                {/* 5. Connected Displays & Monitor Arrangement Card */}
                {hw.displays && hw.displays.length > 0 && (
                  <div className="md:col-span-2 p-4 rounded-2xl bg-white/[0.025] border border-white/[0.06] space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-sky-500/15 text-sky-400">
                          <Monitor size={16} />
                        </div>
                        <div>
                          <span className="text-xs font-bold text-white uppercase tracking-wider block">
                            Connected Displays & Desktop Arrangement
                          </span>
                          <span className="text-[11px] text-white/50">
                            Physical display layout, resolutions, refresh rates, and spatial orientation.
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 border border-sky-500/20">
                        {hw.displays.length} Attached Monitor{hw.displays.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {/* Interactive Visual Multi-Monitor Layout Canvas */}
                    {(() => {
                      const displays = hw.displays
                      const minX = Math.min(...displays.map((d) => d.positionX))
                      const maxX = Math.max(...displays.map((d) => d.positionX + d.width))
                      const minY = Math.min(...displays.map((d) => d.positionY))
                      const maxY = Math.max(...displays.map((d) => d.positionY + d.height))
                      const totalW = Math.max(1, maxX - minX)
                      const totalH = Math.max(1, maxY - minY)

                      return (
                        <div className="space-y-3">
                          <div className="relative w-full h-48 sm:h-56 rounded-xl bg-black/40 border border-white/[0.08] p-4 flex items-center justify-center overflow-hidden">
                            {/* Desktop canvas grid background */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />

                            <div
                              className="relative"
                              style={{
                                width: '100%',
                                maxWidth: '100%',
                                height: '100%',
                                aspectRatio: `${totalW} / ${totalH}`,
                              }}
                            >
                              {displays.map((d) => {
                                const leftPct = ((d.positionX - minX) / totalW) * 100
                                const topPct = ((d.positionY - minY) / totalH) * 100
                                const widthPct = (d.width / totalW) * 100
                                const heightPct = (d.height / totalH) * 100

                                return (
                                  <div
                                    key={d.deviceName}
                                    className={cn(
                                      'absolute rounded-lg p-2 flex flex-col justify-between transition-all select-none border',
                                      d.isPrimary
                                        ? 'bg-cyan-500/15 border-cyan-400/80 shadow-[0_0_15px_rgba(6,182,212,0.25)]'
                                        : 'bg-white/[0.04] border-white/20 hover:border-white/40',
                                    )}
                                    style={{
                                      left: `${leftPct}%`,
                                      top: `${topPct}%`,
                                      width: `${widthPct}%`,
                                      height: `${heightPct}%`,
                                    }}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span
                                        className={cn(
                                          'text-[10px] font-bold px-1.5 py-0.5 rounded font-mono',
                                          d.isPrimary
                                            ? 'bg-cyan-400 text-black'
                                            : 'bg-white/10 text-white/80',
                                        )}
                                      >
                                        {d.index}
                                      </span>
                                      {d.isPrimary && (
                                        <span className="text-[9px] font-bold px-1 py-0.2 rounded bg-cyan-500/20 text-cyan-300 uppercase tracking-wider">
                                          Primary
                                        </span>
                                      )}
                                    </div>

                                    <div className="min-w-0 py-0.5">
                                      <p className="text-[11px] font-semibold text-white truncate leading-tight">
                                        {d.name || d.model || `Display ${d.index}`}
                                      </p>
                                      <p className="text-[10px] text-white/60 truncate font-mono">
                                        {d.resolution}
                                        {d.refreshRate ? ` @ ${d.refreshRate}Hz` : ''}
                                      </p>
                                    </div>

                                    <div className="flex items-center justify-between text-[9px] text-white/40 pt-0.5 border-t border-white/[0.05]">
                                      <span className="truncate">{d.orientation || 'Landscape'}</span>
                                      <span className="font-mono">{d.positionX},{d.positionY}</span>
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>

                          {/* Monitor Specification Cards */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                            {displays.map((d) => (
                              <div
                                key={d.deviceName}
                                className={cn(
                                  'p-3 rounded-xl border space-y-1.5',
                                  d.isPrimary
                                    ? 'bg-cyan-500/[0.04] border-cyan-500/30'
                                    : 'bg-white/[0.02] border-white/[0.05]',
                                )}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span
                                      className={cn(
                                        'text-[10px] font-bold px-1.5 py-0.2 rounded font-mono shrink-0',
                                        d.isPrimary ? 'bg-cyan-400 text-black' : 'bg-white/10 text-white/70',
                                      )}
                                    >
                                      {d.index}
                                    </span>
                                    <span className="text-xs font-semibold text-white truncate">
                                      {d.name}
                                    </span>
                                  </div>
                                  {d.isPrimary && (
                                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 uppercase tracking-wider shrink-0">
                                      Primary
                                    </span>
                                  )}
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/70 font-mono">
                                    {d.resolution}{d.refreshRate ? ` @ ${d.refreshRate}Hz` : ''}
                                  </span>
                                  {d.orientation && (
                                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-white/5 text-white/50">
                                      {d.orientation}
                                    </span>
                                  )}
                                </div>

                                {d.arrangement && (
                                  <div className="pt-1 border-t border-white/[0.04] flex items-center justify-between text-[10px]">
                                    <span className="text-white/40">Arrangement</span>
                                    <span className="font-medium text-sky-300">{d.arrangement}</span>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ) : null}

            {/* Capability Feature Pills */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] border border-white/[0.04] space-y-2">
              <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                Identified Capabilities & Supported Features
              </span>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-cyan-500/15 text-cyan-300">
                  <Gamepad2 size={13} />
                  Game Process Tracking ({caps.game_tracking !== false ? 'Active' : 'Unsupported'})
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-purple-500/15 text-purple-300">
                  <Sparkles size={13} />
                  {isWindows ? 'Win32 Native In-Game Overlay' : 'OBS / Web HUD Overlay'}
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-emerald-500/15 text-emerald-300">
                  <HardDrive size={13} />
                  Save State Backups (Automated)
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-amber-500/15 text-amber-300">
                  <Download size={13} />
                  Downloader Provider ({caps.downloader_provider ? 'Ready' : 'Standby'})
                </span>

                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium bg-rose-500/15 text-rose-300">
                  <FolderOpen size={13} />
                  {isWindows ? 'Silent Game Installer (NSIS / Inno)' : 'Proton / Wine Runner'}
                </span>
              </div>
            </div>
          </div>
        )}
      </SettingsCard>

      {/* Usable Node Machine Settings Card */}
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Node Daemon & Service Behavior"
          description={
            managingLocal
              ? 'Autostart and background operations for the local node.'
              : `Service startup and background task behavior on ${server.name}.`
          }
        />

        <div className="space-y-2">
          <SettingsRow
            icon={<Power className="h-5 w-5" />}
            label="Launch on startup"
            description="Start this node daemon automatically when the system boots."
            action={
              <DkSwitch
                checked={Boolean(settings.launchOnStartup)}
                onCheckedChange={handleToggle('launchOnStartup')}
                disabled={saving === 'launchOnStartup'}
                className="ml-3 shrink-0"
              />
            }
          />

          <SettingsRow
            icon={<FolderOpen className="h-5 w-5" />}
            label="Scan library on startup"
            description="Rescan and index configured game libraries when the node starts up."
            action={
              <DkSwitch
                checked={Boolean(settings.scanOnLaunch)}
                onCheckedChange={handleToggle('scanOnLaunch')}
                disabled={saving === 'scanOnLaunch'}
                className="ml-3 shrink-0"
              />
            }
          />

          <SettingsRow
            icon={<HardDrive className="h-5 w-5" />}
            label="Auto-backup game saves"
            description="Automatically snapshot game save files whenever a tracked play session closes."
            action={
              <DkSwitch
                checked={Boolean(settings.autoBackupOnExit)}
                onCheckedChange={handleToggle('autoBackupOnExit')}
                disabled={saving === 'autoBackupOnExit'}
                className="ml-3 shrink-0"
              />
            }
          />
        </div>
      </SettingsCard>

      {/* Game Process Tracking & In-Game Overlay Card */}
      {caps.game_tracking !== false && (
        <SettingsCard className="space-y-3">
          <SectionHeader
            title="Game Detection & In-Game Overlay"
            description="Process scanning and performance HUD display on this machine."
          />

          <div className="space-y-2">
            <SettingsRow
              icon={<Gamepad2 className="h-5 w-5" />}
              label="Game process auto-detection"
              description="Monitor active processes every 3 seconds to track gameplay and playtime."
              action={
                <DkSwitch
                  checked={Boolean(settings.gameTracking)}
                  onCheckedChange={handleToggle('gameTracking')}
                  disabled={saving === 'gameTracking'}
                  className="ml-3 shrink-0"
                />
              }
            />

            {isWindows && (
              <>
                <SettingsRow
                  icon={<Sparkles className="h-5 w-5" />}
                  label="In-game performance overlay"
                  description="Click-through Win32 transparent HUD showing live FPS, 1% lows, and playtime. Toggle on/off with Ctrl+`."
                  action={
                    <DkSwitch
                      checked={Boolean(settings.overlayEnabled)}
                      onCheckedChange={handleToggle('overlayEnabled')}
                      disabled={saving === 'overlayEnabled'}
                      className="ml-3 shrink-0"
                    />
                  }
                />

                {settings.overlayEnabled && (
                  <>
                    <SettingsRow
                      icon={<Monitor className="h-5 w-5" />}
                      label="Assigned monitor"
                      description="Display the overlay on a specific screen or follow the active game."
                      action={
                        <DkSelect
                          value={settings.overlayMonitor || 'auto'}
                          onChange={(e) => handleSelectChange('overlayMonitor')(e.target.value)}
                          disabled={saving === 'overlayMonitor'}
                          className="h-9 text-xs py-0 w-48 sm:w-64"
                        >
                          <option value="auto" className="bg-[#18181b] text-white">Auto (Follow Active Game)</option>
                          {settings.overlayMonitors && settings.overlayMonitors.length > 0 ? (
                            settings.overlayMonitors.map((m) => (
                              <option key={m.id} value={m.id} className="bg-[#18181b] text-white">
                                {m.name}{m.width && m.height ? ` (${m.width}x${m.height})` : ''}{m.is_primary || m.isPrimary ? ' - Primary' : ''}
                              </option>
                            ))
                          ) : (
                            <>
                              <option value="1" className="bg-[#18181b] text-white">Monitor 1 (Primary)</option>
                              <option value="2" className="bg-[#18181b] text-white">Monitor 2</option>
                              <option value="3" className="bg-[#18181b] text-white">Monitor 3</option>
                            </>
                          )}
                        </DkSelect>
                      }
                    />

                    <SettingsRow
                      icon={<Layers className="h-5 w-5" />}
                      label="Overlay layout style"
                      description="Choose whether the overlay stretches monitor-wide or docks to a corner."
                      action={
                        <DkSelect
                          value={settings.overlayCorner || 'top-wide'}
                          onChange={(e) => handleSelectChange('overlayCorner')(e.target.value)}
                          disabled={saving === 'overlayCorner'}
                          className="h-9 text-xs py-0 w-48 sm:w-64"
                        >
                          <option value="top-wide" className="bg-[#18181b] text-white">Top Edge (Monitor-Wide Bar)</option>
                          <option value="bottom-wide" className="bg-[#18181b] text-white">Bottom Edge (Monitor-Wide Bar)</option>
                          <option value="top-right" className="bg-[#18181b] text-white">Top Right Pill</option>
                          <option value="top-left" className="bg-[#18181b] text-white">Top Left Pill</option>
                          <option value="bottom-right" className="bg-[#18181b] text-white">Bottom Right Pill</option>
                          <option value="bottom-left" className="bg-[#18181b] text-white">Bottom Left Pill</option>
                        </DkSelect>
                      }
                    />
                  </>
                )}
              </>
            )}
          </div>
        </SettingsCard>
      )}

      {/* Desktop Window Behavior (Conditional: ONLY for Local Electron Desktop GUI) */}
      {managingLocal && (
        <SettingsCard className="space-y-3">
          <SectionHeader
            title="Desktop Application Window"
            description="Window and system tray behavior for the Electron desktop client."
          />
          <div className="space-y-2">
            {DESKTOP_WINDOW_ROWS.map((row) => (
              <SettingsRow
                key={row.key}
                icon={row.icon}
                label={row.label}
                description={row.desc}
                action={
                  <DkSwitch
                    checked={Boolean(settings[row.key])}
                    onCheckedChange={handleToggle(row.key)}
                    disabled={saving === row.key}
                    className="ml-3 shrink-0"
                  />
                }
              />
            ))}
          </div>
        </SettingsCard>
      )}
    </div>
  )
}
