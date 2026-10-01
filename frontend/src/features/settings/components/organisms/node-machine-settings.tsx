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
  HardDrive,
  Download,
  FolderOpen,
  Clock,
} from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import type { GameServer } from '@/features/downloads/types'
import { isLocalDesktopNode } from '../../local-desktop-node'
import { SettingsCard } from '../molecules/settings-card'
import { SettingsRow } from '../molecules/settings-row'
import { SectionHeader } from '../molecules/settings-section-header'

const STORAGE_KEY = 'otix:desktop-settings'

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
  gameTracking?: boolean
  overlayEnabled?: boolean
  overlayCorner?: string
  autoBackupOnExit?: boolean
}

const DEFAULT_SETTINGS: NodeMachineData = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
  scanOnLaunch: false,
  autoBackupOnExit: true,
  gameTracking: true,
  overlayEnabled: true,
  overlayCorner: 'top-left',
  capabilities: {
    game_tracking: true,
    in_game_overlay: false,
    web_overlay: true,
    silent_install: false,
    saves_backup: true,
    downloader_provider: false,
  },
}

function readStoredSettings(serverId?: number): NodeMachineData {
  try {
    const key = serverId != null && serverId !== -1 ? `${STORAGE_KEY}:node:${serverId}` : STORAGE_KEY
    const raw = localStorage.getItem(key)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS
}

function mapNodeSettings(fetched: Record<string, unknown>, fallback?: NodeMachineData): NodeMachineData {
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
    overlayCorner: String(fetched.overlayCorner ?? fetched.overlay_corner ?? fallback?.overlayCorner ?? 'top-left'),
    hostname: String(fetched.hostname || fallback?.hostname || ''),
    arch: String(fetched.arch || fallback?.arch || 'amd64'),
    numCpu: Number(fetched.numCpu ?? fetched.num_cpu ?? fallback?.numCpu ?? 0),
    goVersion: String(fetched.goVersion || fetched.go_version || fallback?.goVersion || ''),
    uptimeSeconds: Number(fetched.uptimeSeconds ?? fetched.uptime_seconds ?? fallback?.uptimeSeconds ?? 0),
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

  const caps = settings.capabilities || {}
  const displayPlatform = platform || (managingLocal ? 'Local Desktop' : 'Linux')
  const isWindows = displayPlatform.toLowerCase().includes('win')

  return (
    <div className="space-y-4">
      {/* Hardware & Platform Capabilities Card */}
      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Hardware & Platform Capabilities"
          description={
            managingLocal
              ? 'Detected hardware specs and runtime capabilities on this machine.'
              : `Detected hardware specs and runtime capabilities on ${server.name}.`
          }
        />

        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-white/40" />
          </div>
        ) : (
          <div className="space-y-3">
            {/* System Info Banner */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="p-3 rounded-2xl bg-white/[0.03]">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Platform</span>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-white">
                  <Monitor size={14} className="text-primary shrink-0" />
                  <span className="capitalize">{displayPlatform}</span>
                  {settings.arch && <span className="text-[10px] text-white/40">({settings.arch})</span>}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03]">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Host & CPU</span>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-white">
                  <Cpu size={14} className="text-cyan-400 shrink-0" />
                  <span className="truncate">{settings.hostname || server.name}</span>
                  {Boolean(settings.numCpu) && <span className="text-[10px] text-white/40">· {settings.numCpu} cores</span>}
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03]">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Node Daemon</span>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-emerald-400">
                  <Clock size={14} className="shrink-0" />
                  <span>{formatUptime(settings.uptimeSeconds)}</span>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.03]">
                <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider block">Status</span>
                <div className="flex items-center gap-1.5 mt-1 text-xs font-semibold text-emerald-300">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
                  <span>Online & Ready</span>
                </div>
              </div>
            </div>

            {/* Capability Feature Pills */}
            <div className="p-3.5 rounded-2xl bg-white/[0.02] space-y-2">
              <span className="text-[11px] font-semibold text-white/50 uppercase tracking-wider block">
                Identified Capabilities
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
              <SettingsRow
                icon={<Sparkles className="h-5 w-5" />}
                label="Native in-game FPS overlay"
                description="Click-through Win32 transparent HUD showing live FPS, 1% lows, and playtime."
                action={
                  <DkSwitch
                    checked={Boolean(settings.overlayEnabled)}
                    onCheckedChange={handleToggle('overlayEnabled')}
                    disabled={saving === 'overlayEnabled'}
                    className="ml-3 shrink-0"
                  />
                }
              />
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
