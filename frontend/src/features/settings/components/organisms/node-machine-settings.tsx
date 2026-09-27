import { useState, useEffect, useCallback } from 'react'
import { Power, MinusCircle, XCircle, ChevronUp, Eye, Loader2 } from 'lucide-react'
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

const DEFAULT_SETTINGS: DesktopSettingsData = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
}

function readStoredSettings(serverId?: number): DesktopSettingsData {
  try {
    const key = serverId != null && serverId !== -1 ? `${STORAGE_KEY}:node:${serverId}` : STORAGE_KEY
    const raw = localStorage.getItem(key)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS
}

function mapNodeSettings(fetched: Record<string, any>, fallback?: DesktopSettingsData): DesktopSettingsData {
  return {
    launchOnStartup: Boolean(fetched.launchOnStartup ?? fetched.launch_on_startup ?? fallback?.launchOnStartup),
    minimizeToTray: Boolean(fetched.minimizeToTray ?? fetched.minimize_to_tray ?? fallback?.minimizeToTray),
    closeToTray: Boolean(fetched.closeToTray ?? fetched.close_to_tray ?? fallback?.closeToTray),
    alwaysOnTop: Boolean(fetched.alwaysOnTop ?? fetched.always_on_top ?? fallback?.alwaysOnTop),
    startMinimized: Boolean(fetched.startMinimized ?? fetched.start_minimized ?? fallback?.startMinimized),
    gamesDownloadPath: fetched.gamesDownloadPath || fetched.games_download_path || fallback?.gamesDownloadPath || '',
    gamesInstallPath: fetched.gamesInstallPath || fetched.games_install_path || fallback?.gamesInstallPath || '',
    scanOnLaunch: Boolean(fetched.scanOnLaunch ?? fetched.scan_on_launch ?? fallback?.scanOnLaunch),
  }
}

const ROWS = [
  { key: 'launchOnStartup' as const, icon: <Power className="h-5 w-5" />, label: 'Launch on startup', desc: 'Start this node when the machine logs in.' },
  { key: 'minimizeToTray' as const, icon: <MinusCircle className="h-5 w-5" />, label: 'Minimize to tray', desc: 'Send the node UI to the tray instead of the taskbar.' },
  { key: 'closeToTray' as const, icon: <XCircle className="h-5 w-5" />, label: 'Close to tray', desc: 'Closing the window keeps the node running in the background.' },
  { key: 'alwaysOnTop' as const, icon: <Eye className="h-5 w-5" />, label: 'Always on top', desc: 'Keep the node window above other windows when it has a UI.' },
  { key: 'startMinimized' as const, icon: <ChevronUp className="h-5 w-5" />, label: 'Start minimized', desc: 'Start hidden in the system tray.' },
]

export function NodeMachineSettings({ server }: { server: GameServer }) {
  const { toast } = useToast()
  const managingLocal = isLocalDesktopNode(server)
  const storageKey = managingLocal ? STORAGE_KEY : `${STORAGE_KEY}:node:${server.id}`
  const [settings, setSettings] = useState<DesktopSettingsData>(() => readStoredSettings(server.id))
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [supported, setSupported] = useState(false)
  const [platform, setPlatform] = useState('')

  const api = (window as any).desktopAPI as {
    getDesktopSettings: () => Promise<DesktopSettingsData>
    setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
    platform?: string
  } | undefined

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

        const res = await apiClient.get<any>(`/library/servers/${server.id}/desktop`)
        const fetchedSettings = res?.data
        if (!cancelled && fetchedSettings) {
          const nextPlatform = fetchedSettings.platform || 'linux'
          setPlatform(nextPlatform)
          setSupported(fetchedSettings.supported ?? (nextPlatform === 'windows' || nextPlatform === 'linux'))
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

  const handleToggle = useCallback((key: keyof DesktopSettingsData) => async (checked: boolean) => {
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
      const res = await apiClient.post<any>(`/library/servers/${server.id}/desktop`, {
        [key]: checked,
      })
      const updatedData = res?.data
      if (updatedData) {
        setSettings((prev) => mapNodeSettings(updatedData, prev))
        if (updatedData.platform) {
          setPlatform(updatedData.platform)
          setSupported(updatedData.supported ?? (updatedData.platform === 'windows' || updatedData.platform === 'linux'))
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
  }, [api, managingLocal, platform, server.id, server.name, settings, supported, toast])

  return (
    <SettingsCard>
      <SectionHeader
        title="Node machine"
        description={
          managingLocal
            ? 'Startup and tray behavior for the Otix app on this computer.'
            : `Autostart and tray behavior on ${server.name}.`
        }
      />
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-white/40" />
        </div>
      ) : (
        <div className="space-y-2">
          {ROWS.map((row) => (
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
      )}
    </SettingsCard>
  )
}
