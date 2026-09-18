import { useState, useEffect, useCallback } from 'react'
import { Monitor, Power, MinusCircle, XCircle, ChevronUp, Eye, Loader2, Server } from 'lucide-react'
import { DkSwitch } from '@ui/atoms/switch'
import { useToast } from '@ui/molecules/toast'
import { useDesktopPlatform } from '@/lib/desktop/platform'
import type { DesktopSettingsData } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import { cn } from '@/lib/utils'

const STORAGE_KEY = 'otix:desktop-settings'

const DEFAULT_SETTINGS: DesktopSettingsData = {
  launchOnStartup: false,
  minimizeToTray: false,
  closeToTray: false,
  alwaysOnTop: false,
  startMinimized: false,
}

interface NodeDesktopInfo {
  platform: string
  supported: boolean
  serverName: string
  serverId?: number
}

function readStoredSettings(): DesktopSettingsData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {}
  return DEFAULT_SETTINGS
}

export function SettingsDesktopPage() {
  const { isDesktop } = useDesktopPlatform()
  const { toast } = useToast()
  const { data: servers = [], isLoading: serversLoading } = useGameServers()
  const [settings, setSettings] = useState<DesktopSettingsData>(readStoredSettings)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState<string | null>(null)
  const [nodeInfo, setNodeInfo] = useState<NodeDesktopInfo | null>(null)
  useSettingsHashScroll()

  const api = (window as any).desktopAPI as {
    getDesktopSettings: () => Promise<DesktopSettingsData>
    setDesktopSettings: (s: Partial<DesktopSettingsData>) => Promise<DesktopSettingsData>
  } | undefined

  const activeServer = servers[0]

  useEffect(() => {
    let cancelled = false

    async function loadSettings() {
      // 1. Electron desktop app mode: use native IPC
      if (api?.getDesktopSettings) {
        try {
          const s = await api.getDesktopSettings()
          if (!cancelled) {
            setSettings(s)
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch {}
          }
        } catch {}
        if (!cancelled) setLoading(false)
        return
      }

      // 2. Web mode: Query the server node (via backend proxy or direct desktop endpoint)
      try {
        let fetchedSettings: any = null
        let platform = 'unknown'
        let supported = false
        const serverName = activeServer?.name || 'Local Game Server'

        if (activeServer?.id) {
          const res = await apiClient.get<any>(`/library/servers/${activeServer.id}/desktop`)
          if (res?.data) {
            fetchedSettings = res.data
            platform = res.data.platform || 'linux'
            supported = res.data.supported ?? (platform === 'windows' || platform === 'linux')
          }
        } else {
          // Direct local server node fallback
          const res = await apiClient.get<any>('/desktop/settings')
          if (res?.data) {
            fetchedSettings = res.data
            platform = res.data.platform || 'windows'
            supported = res.data.supported ?? (platform === 'windows' || platform === 'linux')
          }
        }

        if (!cancelled && fetchedSettings) {
          setNodeInfo({
            platform,
            supported,
            serverName,
            serverId: activeServer?.id,
          })
          const mapped: DesktopSettingsData = {
            launchOnStartup: Boolean(fetchedSettings.launchOnStartup ?? fetchedSettings.launch_on_startup),
            minimizeToTray: Boolean(fetchedSettings.minimizeToTray ?? fetchedSettings.minimize_to_tray),
            closeToTray: Boolean(fetchedSettings.closeToTray ?? fetchedSettings.close_to_tray),
            alwaysOnTop: Boolean(fetchedSettings.alwaysOnTop ?? fetchedSettings.always_on_top),
            startMinimized: Boolean(fetchedSettings.startMinimized ?? fetchedSettings.start_minimized),
            gamesDownloadPath: fetchedSettings.gamesDownloadPath || fetchedSettings.games_download_path || '',
          }
          setSettings(mapped)
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(mapped)) } catch {}
        }
      } catch {
        if (!cancelled) {
          setSettings(readStoredSettings())
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    if (!serversLoading) {
      loadSettings()
    }

    return () => {
      cancelled = true
    }
  }, [api, activeServer?.id, activeServer?.name, serversLoading])

  const handleToggle = useCallback((key: keyof DesktopSettingsData) => async (checked: boolean) => {
    setSaving(key)
    const next = { ...settings, [key]: checked }
    setSettings(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch {}

    // 1. Electron desktop app mode: use local IPC
    if (api?.setDesktopSettings) {
      try {
        const updated = await api.setDesktopSettings({ [key]: checked })
        setSettings(updated)
      } catch (err) {
        toast({
          title: 'Failed to update setting',
          description: String(err),
          variant: 'destructive',
        })
      } finally {
        setSaving(null)
      }
      return
    }

    // 2. Web mode: Apply changes to Otix server node if running on Windows or Linux
    try {
      let updatedData: any = null
      if (activeServer?.id) {
        const res = await apiClient.post<any>(`/library/servers/${activeServer.id}/desktop`, {
          [key]: checked,
        })
        updatedData = res?.data
      } else {
        const res = await apiClient.post<any>('/desktop/settings', {
          [key]: checked,
        })
        updatedData = res?.data
      }

      if (updatedData) {
        setSettings((prev) => ({
          ...prev,
          launchOnStartup: updatedData.launchOnStartup ?? prev.launchOnStartup,
          minimizeToTray: updatedData.minimizeToTray ?? prev.minimizeToTray,
          closeToTray: updatedData.closeToTray ?? prev.closeToTray,
          alwaysOnTop: updatedData.alwaysOnTop ?? prev.alwaysOnTop,
          startMinimized: updatedData.startMinimized ?? prev.startMinimized,
        }))
        if (updatedData.platform) {
          setNodeInfo((prev) => ({
            platform: updatedData.platform,
            supported: updatedData.supported ?? (updatedData.platform === 'windows' || updatedData.platform === 'linux'),
            serverName: prev?.serverName || activeServer?.name || 'Local Game Server',
            serverId: activeServer?.id,
          }))
        }
      }

      toast({
        title: 'Settings Updated',
        description: nodeInfo?.supported
          ? `Changes applied to Otix server node (${nodeInfo.platform}).`
          : 'Changes applied to server node configuration.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Saved locally',
        description: 'Server node is currently unreachable. Setting saved to browser storage.',
        variant: 'info',
      })
    } finally {
      setSaving(null)
    }
  }, [api, activeServer?.id, activeServer?.name, nodeInfo, settings, toast])

  const rows = [
    { key: 'launchOnStartup' as const, icon: <Power className="h-5 w-5" />, label: 'Launch on startup', desc: 'Automatically open Otix when you log in to your computer or launch your server node.' },
    { key: 'minimizeToTray' as const, icon: <MinusCircle className="h-5 w-5" />, label: 'Minimize to tray', desc: 'When minimizing, send Otix to the system tray instead of the taskbar.' },
    { key: 'closeToTray' as const, icon: <XCircle className="h-5 w-5" />, label: 'Close to tray', desc: 'Closing the window keeps Otix running in the background.' },
    { key: 'alwaysOnTop' as const, icon: <Eye className="h-5 w-5" />, label: 'Always on top', desc: 'Keep the Otix window above all other windows.' },
    { key: 'startMinimized' as const, icon: <ChevronUp className="h-5 w-5" />, label: 'Start minimized', desc: 'Otix starts hidden in the system tray.' },
  ]

  const isDesktopApp = isDesktop || Boolean(api)

  return (
    <div id="settings-desktop-section" className="space-y-8">
      <SectionHeader
        variant="page"
        icon={Monitor}
        title="Desktop"
        description="System tray, startup behavior, and server node management."
      />

      {/* Connected Server Node indicator banner in web mode */}
      {!isDesktopApp && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl bg-white/[0.03] border border-white/10">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {nodeInfo?.serverName || (servers[0]?.name ?? 'Otix Server Node')}
                </span>
                <span
                  className={cn(
                    'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border',
                    nodeInfo?.supported
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-400 border-amber-500/30',
                  )}
                >
                  {nodeInfo?.platform ? `${nodeInfo.platform}` : 'Server Node'}
                </span>
              </div>
              <p className="text-xs text-white/50 mt-0.5">
                {nodeInfo?.supported
                  ? `Desktop settings configure your Otix server node on ${nodeInfo.platform === 'windows' ? 'Windows' : 'Linux'}.`
                  : 'Desktop settings configure your Otix server node.'}
              </p>
            </div>
          </div>
          {servers.length > 1 && (
            <div className="text-xs text-white/40 self-start sm:self-auto">
              Node 1 of {servers.length}
            </div>
          )}
        </div>
      )}

      <div id="desktop" className="space-y-5 scroll-mt-28">
        <SettingsCard>
          <SectionHeader
            title="Window & System Tray"
            description="Configure background execution, autostart, and window behavior."
          />

          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-white/40" />
            </div>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <SettingsRow
                  key={r.key}
                  icon={r.icon}
                  label={r.label}
                  description={r.desc}
                  action={
                    <DkSwitch
                      checked={settings[r.key]}
                      onCheckedChange={handleToggle(r.key)}
                      disabled={saving === r.key}
                      className="ml-3 shrink-0"
                    />
                  }
                />
              ))}
            </div>
          )}
        </SettingsCard>
      </div>
    </div>
  )
}

