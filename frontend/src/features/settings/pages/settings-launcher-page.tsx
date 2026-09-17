import React, { useState, useEffect, useCallback } from 'react'

import { useNavigate } from '@tanstack/react-router'
import {
  Gamepad2,
  Palette,
  FolderOpen,
  FolderPlus,
  RefreshCw,
  Monitor,
  CheckCircle2,
  HardDrive,
  Sliders,
  Play,
  ArrowRight,
  Server,
  Trash2,
  Plus,
  Radio,
  DownloadCloud,
  Search,
} from 'lucide-react'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { DkSwitch } from '@ui/atoms/switch'
import { useLauncherSettings } from '@/features/launcher/hooks/use-launcher-settings'
import { LAUNCHER_THEMES, type LauncherThemeId } from '@/features/launcher/themes/theme-context'
import { hasDesktopAPI, getDesktopAPI } from '@/lib/desktop/api'
import { useToast } from '@ui/molecules/toast'
import { cn, formatBytes } from '@/lib/utils'
import {
  useGameServers,
  useCreateGameServer,
  useDeleteGameServer,
  usePingGameServer,
} from '@/features/downloads/use-server-downloads'
import { ServerFileExplorer } from '@/features/downloads/molecules/server-file-explorer'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { useModal } from '@/lib/modals'


export function SettingsLauncherPage() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const { openModal } = useModal()
  const isDesktop = hasDesktopAPI()
  const { settings, update } = useLauncherSettings()

  const [activeTheme, setActiveTheme] = useState<LauncherThemeId>(() => {
    try {
      const stored = localStorage.getItem('otix:launcher-theme') as LauncherThemeId | null
      if (stored && LAUNCHER_THEMES.some((t) => t.id === stored)) return stored
    } catch {}
    return 'modern'
  })

  // Desktop native settings
  const [desktopSettings, setDesktopSettings] = useState({
    launchOnStartup: false,
    minimizeToTray: false,
    closeToTray: false,
  })
  const [scanPaths, setScanPaths] = useState<string[]>([])
  const [isScanning, setIsScanning] = useState(false)
  const [gamesDownloadPath, setGamesDownloadPath] = useState<string>(() => {
    try {
      return localStorage.getItem('otix:games-download-dir') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const api = window.desktopAPI as any
    if (!api) return

    api.getDesktopSettings?.().then((ds: any) => {
      if (ds) {
        setDesktopSettings(ds)
        if (ds.gamesDownloadPath) {
          setGamesDownloadPath(ds.gamesDownloadPath)
          try {
            localStorage.setItem('otix:games-download-dir', ds.gamesDownloadPath)
          } catch {}
        }
      }
    }).catch(() => {})

    api.getScanPaths?.().then((paths: any[]) => {
      if (Array.isArray(paths)) {
        setScanPaths(paths.filter((p) => p.type === 'game').map((p) => p.path))
      }
    }).catch(() => {})
  }, [])

  // Game Servers (Plex for Games) state
  const { data: gameServers = [] } = useGameServers()
  const createServerMutation = useCreateGameServer()
  const deleteServerMutation = useDeleteGameServer()
  const pingServerMutation = usePingGameServer()

  const [showAddServer, setShowAddServer] = useState(false)
  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [serverSubmitting, setServerSubmitting] = useState(false)
  const [exploringServerId, setExploringServerId] = useState<number | null>(null)


  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverName.trim() || !serverUrl.trim()) return
    setServerSubmitting(true)
    try {
      await createServerMutation.mutateAsync({
        name: serverName.trim(),
        local_url: serverUrl.trim(),
        auth_token: serverToken.trim() || undefined,
      })
      toast({
        title: 'Game Server Connected',
        description: `Successfully linked ${serverName}.`,
        variant: 'success',
      })
      setServerName('')
      setServerUrl('')
      setServerToken('')
      setShowAddServer(false)
    } catch (err: any) {
      toast({
        title: 'Failed to Connect Server',
        description: err.message || 'Check URL and network connection.',
        variant: 'error',
      })
    } finally {
      setServerSubmitting(false)
    }
  }

  const handleDeleteServer = async (id: number, name: string) => {
    try {
      await deleteServerMutation.mutateAsync(id)
      toast({
        title: 'Server Disconnected',
        description: `Removed ${name} from your game servers.`,
        variant: 'default',
      })
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handlePingServer = async (id: number) => {
    try {
      const res: any = await pingServerMutation.mutateAsync(id)
      if (res?.online) {
        toast({
          title: 'Server Online',
          description: `Ping: ${res.latency_ms}ms · ${res.server?.total_files ?? 0} games indexed.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Server Offline',
          description: res?.error || 'Could not reach server node.',
          variant: 'error',
        })
      }
    } catch (err: any) {
      toast({
        title: 'Ping Failed',
        description: err.message,
        variant: 'error',
      })
    }
  }

  const handleSelectTheme = (themeId: LauncherThemeId) => {
    setActiveTheme(themeId)
    localStorage.setItem('otix:launcher-theme', themeId)
    window.dispatchEvent(new Event('storage'))
    toast({
      title: 'Launcher Theme Updated',
      description: `Default layout set to ${LAUNCHER_THEMES.find((t) => t.id === themeId)?.name}.`,
      variant: 'success',
    })
  }

  const handleDesktopToggle = useCallback(
    async (key: 'launchOnStartup' | 'minimizeToTray' | 'closeToTray', val: boolean) => {
      const api = window.desktopAPI as any
      if (!api?.setDesktopSettings) return
      setDesktopSettings((prev) => ({ ...prev, [key]: val }))
      try {
        await api.setDesktopSettings({ [key]: val })
      } catch {
        setDesktopSettings((prev) => ({ ...prev, [key]: !val }))
      }
    },
    []
  )

  const handleAddScanFolder = async () => {
    const api = getDesktopAPI()
    if (!api?.selectDirectory || !api?.getScanPaths || !api?.saveScanPaths) return
    try {
      const dir = await api.selectDirectory()
      if (!dir) return
      const existing = await api.getScanPaths()
      await api.saveScanPaths([...existing, { path: dir, type: 'game' }])
      setScanPaths((prev) => [...prev, dir])
      toast({
        title: 'Library Path Added',
        description: `Added ${dir} to game scan paths.`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to add folder path.',
        variant: 'error',
      })
    }
  }

  const handleTriggerScan = async () => {
    const api = getDesktopAPI()
    if (!api?.scanPaths) return
    try {
      setIsScanning(true)
      await api.scanPaths(scanPaths, [])
      toast({
        title: 'Scan Finished',
        description: 'Updated your local library with detected executables.',
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Scan Error',
        description: 'Failed to scan library paths.',
        variant: 'error',
      })
    } finally {
      setIsScanning(false)
    }
  }

  const handleBrowseGamesFolder = async () => {
    const api = getDesktopAPI()
    if (!api?.selectDirectory) return
    try {
      const dir = await api.selectDirectory()
      if (!dir) return
      setGamesDownloadPath(dir)
      try {
        localStorage.setItem('otix:games-download-dir', dir)
      } catch {}
      const rawApi = window.desktopAPI as any
      if (rawApi?.setDesktopSettings) {
        await rawApi.setDesktopSettings({ gamesDownloadPath: dir })
      }
      toast({
        title: 'Games Save Folder Updated',
        description: `Downloaded games will be saved to: ${dir}`,
        variant: 'success',
      })
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to select folder.',
        variant: 'error',
      })
    }
  }

  const handleSaveGamesFolder = async (pathVal: string) => {
    const clean = pathVal.trim()
    setGamesDownloadPath(clean)
    try {
      localStorage.setItem('otix:games-download-dir', clean)
    } catch {}
    const rawApi = window.desktopAPI as any
    if (rawApi?.setDesktopSettings) {
      await rawApi.setDesktopSettings({ gamesDownloadPath: clean }).catch(() => {})
    }
    toast({
      title: 'Games Save Folder Saved',
      description: clean ? `Target folder: ${clean}` : 'Reset to default download location.',
      variant: 'success',
    })
  }

  return (
    <div id="settings-launcher-section" className="space-y-6">
      {/* ── Quick Launch Banner ── */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-primary/15 via-primary/5 to-transparent border border-primary/25 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-primary flex items-center justify-center text-black font-black shadow-lg shadow-primary/20">
            <Gamepad2 size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">Otix Game Launcher</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Experience your games across 10 completely unique layouts and console experiences.
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate({ to: '/launcher' })}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-black font-bold text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md shadow-primary/20"
        >
          <span>Open Launcher</span>
          <ArrowRight size={14} />
        </button>
      </div>

      {/* ── Theme Selection Section ── */}
      <SettingsCard>
        <SectionHeader
          title="Launcher Theme & Layout Edition"
          description="Select your default launcher interface. All 10 themes read the same game library, user profiles, and active play sessions."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 pt-2">
          {LAUNCHER_THEMES.map((theme) => {
            const isSelected = activeTheme === theme.id
            return (
              <button
                key={theme.id}
                type="button"
                onClick={() => handleSelectTheme(theme.id)}
                className={cn(
                  'flex flex-col items-start p-4 rounded-xl border transition-all text-left cursor-pointer group relative overflow-hidden',
                  isSelected
                    ? 'border-primary bg-primary/10 shadow-[0_0_20px_rgba(var(--primary),0.25)]'
                    : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/20'
                )}
              >
                {isSelected && (
                  <div
                    className="absolute top-0 left-0 right-0 h-1 bg-primary"
                    style={{ backgroundColor: theme.accentColor }}
                  />
                )}
                <div className="flex items-center justify-between w-full mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-mono font-black uppercase px-2 py-0.5 rounded bg-white/10 text-white/80">
                      {theme.version}
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      BETA
                    </span>
                  </div>
                  {isSelected ? (
                    <span className="flex items-center gap-1 text-[10px] font-extrabold text-primary">
                      <CheckCircle2 size={12} />
                      Active
                    </span>
                  ) : null}
                </div>

                <span className="text-sm font-bold text-white group-hover:text-primary transition-colors">
                  {theme.name}
                </span>
                <span className="text-[10px] text-primary/80 font-semibold tracking-wide uppercase mt-0.5">
                  {theme.subtitle}
                </span>
                <p className="text-[11px] text-white/50 font-normal leading-relaxed mt-2 line-clamp-2">
                  {theme.description}
                </p>
              </button>
            )
          })}
        </div>
      </SettingsCard>

      {/* ── Playback & Display Options ── */}
      <SettingsCard>
        <SectionHeader
          title="Display & Behavior"
          description="Fine-tune animations, backdrop transitions, and launcher start behaviors."
        />

        <div className="space-y-2">
          <SettingsRow
            icon={<Palette className="h-5 w-5" />}
            label="Dynamic Background Transitions"
            description="Dynamically shift wallpaper artwork and cinematic gradients based on hovered games"
            action={
              <DkSwitch
                checked={settings.backgroundTransitions}
                onCheckedChange={(checked) => update('backgroundTransitions', checked)}
              />
            }
          />

          <SettingsRow
            icon={<Monitor className="h-5 w-5" />}
            label="Landing View Format"
            description="Default tab or landing format when entering the launcher"
            action={
              <select
                value={settings.defaultPage}
                onChange={(e) => update('defaultPage', e.target.value as any)}
                className="bg-white/10 border border-white/15 rounded-xl px-3 py-1.5 text-xs text-white outline-none cursor-pointer hover:border-white/30 transition-colors"
              >
                <option value="library" className="bg-neutral-900 text-white">
                  Library (Full Catalog)
                </option>
                <option value="slide-picker" className="bg-neutral-900 text-white">
                  Spotlight Carousel
                </option>
              </select>
            }
          />
        </div>
      </SettingsCard>

      {/* ── Desktop & Process Management (When running Desktop App) ── */}
      {isDesktop && (
        <SettingsCard>
          <SectionHeader
            title="Desktop Process Integration"
            description="Configure system startup, background tray residency, and game scanning directories."
          />

          <div className="space-y-2">
            <SettingsRow
              icon={<Sliders className="h-5 w-5" />}
              label="Launch on System Startup"
              description="Automatically start Otix when logging into your computer"
              action={
                <DkSwitch
                  checked={desktopSettings.launchOnStartup}
                  onCheckedChange={(checked) => handleDesktopToggle('launchOnStartup', checked)}
                />
              }
            />

            <SettingsRow
              icon={<HardDrive className="h-5 w-5" />}
              label="Minimize to System Tray"
              description="Keep Otix running quietly in the tray when minimized"
              action={
                <DkSwitch
                  checked={desktopSettings.minimizeToTray}
                  onCheckedChange={(checked) => handleDesktopToggle('minimizeToTray', checked)}
                />
              }
            />

            <SettingsRow
              icon={<Play className="h-5 w-5" />}
              label="Close to System Tray"
              description="Do not terminate the application when closing the window"
              action={
                <DkSwitch
                  checked={desktopSettings.closeToTray}
                  onCheckedChange={(checked) => handleDesktopToggle('closeToTray', checked)}
                />
              }
            />

            {/* Scan Paths */}
            <div className="py-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-sm font-semibold text-white block">Game Library Scan Paths</span>
                  <span className="text-xs text-white/50">
                    Folders where Otix automatically locates game executables and metadata.
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAddScanFolder}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <FolderPlus size={14} />
                    <span>Add Folder</span>
                  </button>
                  <button
                    onClick={handleTriggerScan}
                    disabled={isScanning}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <RefreshCw size={13} className={isScanning ? 'animate-spin' : ''} />
                    <span>{isScanning ? 'Scanning...' : 'Scan Now'}</span>
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                {scanPaths.length > 0 ? (
                  scanPaths.map((p, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs font-mono text-white/70 flex items-center gap-2"
                    >
                      <FolderOpen size={14} className="text-primary shrink-0" />
                      <span className="truncate">{p}</span>
                    </div>
                  ))
                ) : (
                  <div className="px-3 py-3 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-xs text-white/40 text-center">
                    No custom directories added yet. Standard Steam/GOG libraries are automatically detected.
                  </div>
                )}
              </div>
            </div>
          </div>
        </SettingsCard>
      )}

      {/* ── Games Download & Save Location ── */}
      <SettingsCard>
        <SectionHeader
          title="Games Download & Save Location"
          description="Choose where your games should be saved when downloading from your self-hosted server or ISO repository."
        />

        <div className="space-y-4 pt-2">
          <div>
            <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1.5">
              Assigned Save Directory
            </label>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <FolderOpen className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-primary shrink-0" />
                <input
                  type="text"
                  placeholder={isDesktop ? "e.g. /Volumes/Games or D:\\Games (Default: ~/Downloads/Games)" : "e.g. /path/to/my/games"}
                  value={gamesDownloadPath}
                  onChange={(e) => setGamesDownloadPath(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs font-mono text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {isDesktop && (
                  <button
                    type="button"
                    onClick={handleBrowseGamesFolder}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/10 text-xs font-semibold cursor-pointer transition-colors"
                  >
                    <FolderPlus size={14} />
                    <span>Browse...</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleSaveGamesFolder(gamesDownloadPath)}
                  className="px-4 py-2 rounded-xl bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors"
                >
                  Save Location
                </button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-white/40">
            All game installers, ISOs, and packages downloaded through Otix will be stored in this directory. If left blank, Otix saves to your system Downloads folder.
          </p>
        </div>
      </SettingsCard>

      {/* ── Remote Game Servers (Plex for Games) ── */}
      <SettingsCard>
        <SectionHeader
          title="Remote Game Servers (Plex for Games)"
          description="Connect self-hosted otix-server nodes or Unraid NAS storage to host your game installer library and stream/download games anywhere."
        />

        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server size={18} className="text-primary" />
              <span className="text-sm font-semibold text-white">Connected Servers</span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-white/[0.06] text-white/60">
                {gameServers.length}
              </span>
            </div>

            <button
              onClick={() => setShowAddServer(!showAddServer)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary/20 hover:bg-primary/30 text-primary border border-primary/30 text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus size={14} />
              <span>{showAddServer ? 'Cancel' : 'Connect Server'}</span>
            </button>
          </div>

          {/* Add Server Form */}
          {showAddServer && (
            <form onSubmit={handleAddServer} className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                    Server Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Home NAS"
                    value={serverName}
                    onChange={(e) => setServerName(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                    Server URL (LAN or Domain)
                  </label>
                  <input
                    type="url"
                    required
                    placeholder="e.g. http://192.168.1.150:8000"
                    value={serverUrl}
                    onChange={(e) => setServerUrl(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                  Auth Token (Optional)
                </label>
                <input
                  type="password"
                  placeholder="Server secret token from config.yaml"
                  value={serverToken}
                  onChange={(e) => setServerToken(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 border border-white/10 text-xs text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddServer(false)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={serverSubmitting}
                  className="px-4 py-1.5 rounded-lg bg-primary text-black text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {serverSubmitting ? 'Testing & Saving...' : 'Save & Link'}
                </button>
              </div>
            </form>
          )}

          {/* Servers List */}
          <div className="space-y-2">
            {gameServers.length > 0 ? (
              gameServers.map((server) => (
                <React.Fragment key={server.id}>
                  <div
                    className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:border-white/10 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >

                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/10 flex items-center justify-center shrink-0">
                      <Server size={18} className="text-white/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{server.name}</span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            server.isOnline
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          )}
                        >
                          <span
                            className={cn(
                              'w-1.5 h-1.5 rounded-full',
                              server.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                            )}
                          />
                          {server.isOnline ? 'Online' : 'Offline'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-white/40 mt-0.5">
                        <span className="font-mono text-white/60">{server.primaryUrl}</span>
                        {server.totalFiles > 0 && (
                          <span>· {server.totalFiles} games</span>
                        )}
                        {server.storageFreeBytes > 0 && (
                          <span>· {formatBytes(server.storageFreeBytes)} free</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <button
                      type="button"
                      onClick={() => setExploringServerId(exploringServerId === server.id ? null : server.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors',
                        exploringServerId === server.id
                          ? 'bg-primary text-black border-primary font-bold shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border-white/10'
                      )}
                      title="Explore Server Storage & Download Folder"
                    >
                      <HardDrive size={12} />
                      <span>{exploringServerId === server.id ? 'Close' : 'Explore Files'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const close = openModal(
                          <ServerSabnzbdSettingsModal
                            serverId={server.id}
                            serverName={server.name}
                            onClose={() => close()}
                          />
                        )
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium border border-white/10 transition-colors"
                      title="Configure SABnzbd on this Server"
                    >
                      <DownloadCloud size={12} />
                      <span>SABnzbd</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const close = openModal(
                          <ServerProwlarrSettingsModal
                            serverId={server.id}
                            serverName={server.name}
                            onClose={() => close()}
                          />
                        )
                      }}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-xs font-medium border border-white/10 transition-colors"
                      title="Configure Prowlarr on this Server"
                    >
                      <Search size={12} />
                      <span>Prowlarr</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePingServer(server.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium border border-white/10 transition-colors"
                      title="Test Connection"
                    >
                      <Radio size={12} />
                      <span>Ping</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteServer(server.id, server.name)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 border border-white/10 transition-colors"
                      title="Disconnect Server"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {exploringServerId === server.id && (
                  <div className="mt-2 rounded-2xl overflow-hidden border border-white/10 bg-black/40 shadow-xl">
                    <ServerFileExplorer
                      initialServerId={server.id}
                      onClose={() => setExploringServerId(null)}
                    />
                  </div>
                )}
              </React.Fragment>
            ))

            ) : (
              <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-white/10 text-center space-y-1">
                <p className="text-xs text-white/50 font-medium">No game servers connected</p>
                <p className="text-[11px] text-white/30 max-w-sm mx-auto">
                  Run <span className="font-mono text-white/50">otix-server start</span> on your NAS, Unraid, or PC, then connect it here to access your game installers from any client.
                </p>
              </div>
            )}
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
