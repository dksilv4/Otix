import React, { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { DkButton } from '@ui/atoms/button'
import { DkSwitch } from '@ui/atoms/switch'
import { useDownloadConfig, useDownloads } from '@/features/downloads/use-downloads'
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Clock,
  ArchiveX,
  DownloadCloud,
  Search,
  Server,
  Radio,
  ExternalLink,
  HardDrive,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import {
  useGameServers,
  useCreateGameServer,
  useDeleteGameServer,
  usePingGameServer,
} from '@/features/downloads/use-server-downloads'
import { ServerFileExplorer } from '@/features/downloads/molecules/server-file-explorer'
import { PathInput } from '@/components/path-picker'
import { useToast } from '@ui/molecules/toast'
import { Link } from '@tanstack/react-router'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsRow } from '../components/molecules/settings-row'
import { useSettingsSaveBar } from '../context/settings-save-context'

const NAMING_PRESETS = [
  { id: 'standard', label: 'Standard', template: '{Title} ({Year}) [{Platform}]/{OriginalName}.{ext}' },
  { id: 'simple',   label: 'Simple',   template: '{Title}/{OriginalName}.{ext}' },
]

const TOKEN_DOCS = [
  '{Title}        — Clean game title (e.g. "Stellar Blade")',
  '{CleanTitle}   — cleanGameTitle() fallback',
  '{Year}        — Release year (e.g. "2024")',
  '{Edition}     — Edition tag (e.g. "GOTY Edition")',
  '{Platform}    — Platform hint (e.g. "PC", "Multi")',
  '{ReleaseGroup}— Scene release group (e.g. "ElAmigos")',
  '{Version}     — Version number (e.g. "1.03")',
  '{OriginalName}— Raw download folder name',
  '{MediaType}   — "ISO", "PC", or "Update"',
  '{ext}         — File extension (auto-filled)',
]

export function SettingsDownloadsPage() {
  const desktop = isDesktop()
  const { user } = useAuth()
  const { toast } = useToast()
  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { downloads: downloadHistory, cancelDownload } = useDownloads(user?.id)

  const [downloadPath, setDownloadPath] = useState('')
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [allowHypervisor, setAllowHypervisor] = useState(false)
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template)
  const [presetId, setPresetId] = useState('standard')
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

  const [gamesDownloadPath, setGamesDownloadPath] = useState<string>(() => {
    try {
      return localStorage.getItem('otix:games-download-dir') || ''
    } catch {
      return ''
    }
  })

  useEffect(() => {
    const rawApi = (window as any).desktopAPI
    if (rawApi?.getDesktopSettings) {
      rawApi.getDesktopSettings().then((ds: any) => {
        if (ds?.gamesDownloadPath) {
          setGamesDownloadPath(ds.gamesDownloadPath)
          try {
            localStorage.setItem('otix:games-download-dir', ds.gamesDownloadPath)
          } catch {}
        }
      }).catch(() => {})
    }
  }, [])

  useEffect(() => {
    if (dlConfig) {
      setDownloadPath(dlConfig.downloadPath ?? '')
      setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
      setAutoSearch(dlConfig.autoSearchWishlist ?? false)
      setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
      setAllowHypervisor(dlConfig.allowHypervisor ?? false)
      setAutoOrganizeEnabled((dlConfig as any).autoOrganizeEnabled ?? false)
      setNamingTemplate((dlConfig as any).namingTemplate ?? NAMING_PRESETS[0].template)
    }
  }, [dlConfig])

  const [pathMappings, setPathMappings] = useState<any[]>([])
  const [newSourcePath, setNewSourcePath] = useState('')
  const [newDestPath, setNewDestPath] = useState('')

  const fetchPathMappings = useCallback(async () => {
    if (dlConfig && window.desktopAPI) {
      try {
        const mappings = await window.desktopAPI.downloadsGetPathMappings(dlConfig.id)
        setPathMappings(mappings)
      } catch (err) {
        console.error('Failed to fetch path mappings:', err)
      }
    }
  }, [dlConfig])

  useEffect(() => {
    fetchPathMappings()
  }, [fetchPathMappings])

  const handleAddPathMapping = async () => {
    if (!dlConfig || !window.desktopAPI || !newSourcePath || !newDestPath) return
    try {
      await window.desktopAPI.downloadsAddPathMapping(dlConfig.id, newSourcePath, newDestPath)
      setNewSourcePath('')
      setNewDestPath('')
      await fetchPathMappings()
    } catch (err) {
      console.error('Failed to add path mapping:', err)
    }
  }

  const handleRemovePathMapping = async (id: string) => {
    if (!window.desktopAPI) return
    try {
      await window.desktopAPI.downloadsRemovePathMapping(id)
      await fetchPathMappings()
    } catch (err) {
      console.error('Failed to remove path mapping:', err)
    }
  }

  const handleSave = async () => {
    if (!user) return
    await saveConfig({
      userId: user.id,
      downloadPath: downloadPath || null,
      postProcessEnabled,
      autoSearchWishlist: autoSearch,
      wishlistIntervalHours: intervalHours,
      allowHypervisor,
      autoOrganizeEnabled,
      namingTemplate: namingTemplate || null,
    } as any)
  }

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!serverName.trim() || !serverUrl.trim() || !serverToken.trim()) return
    setServerSubmitting(true)
    try {
      const server = await createServerMutation.mutateAsync({
        name: serverName.trim(),
        local_url: serverUrl.trim(),
        auth_token: serverToken.trim() || undefined,
      })
      if (server.isOnline) {
        toast({
          title: 'Game Server Connected',
          description: `Successfully linked ${serverName}.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Saved, but marked offline',
          description:
            server.connectError ||
            'Otix could not reach this URL from the API. Open the node in a browser, copy its access token, and ping again.',
          variant: 'error',
        })
      }
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

  const handleSaveGamesFolder = async (pathVal: string) => {
    const clean = pathVal.trim()
    setGamesDownloadPath(clean)
    try {
      localStorage.setItem('otix:games-download-dir', clean)
    } catch {}
    const rawApi = (window as any).desktopAPI
    if (rawApi?.setDesktopSettings) {
      await rawApi.setDesktopSettings({ gamesDownloadPath: clean }).catch(() => {})
    }
    toast({
      title: 'Games Save Folder Saved',
      description: clean ? `Target folder: ${clean}` : 'Reset to default download location.',
      variant: 'success',
    })
  }

  const hasChanges = Boolean(
    dlConfig &&
      (downloadPath !== (dlConfig.downloadPath ?? '') ||
        postProcessEnabled !== (dlConfig.postProcessEnabled ?? true) ||
        autoSearch !== (dlConfig.autoSearchWishlist ?? false) ||
        intervalHours !== (dlConfig.wishlistIntervalHours ?? 12) ||
        allowHypervisor !== (dlConfig.allowHypervisor ?? false) ||
        autoOrganizeEnabled !== ((dlConfig as any).autoOrganizeEnabled ?? false) ||
        namingTemplate !== ((dlConfig as any).namingTemplate ?? NAMING_PRESETS[0].template)),
  )

  const handleDiscard = () => {
    if (!dlConfig) return
    setDownloadPath(dlConfig.downloadPath ?? '')
    setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
    setAutoSearch(dlConfig.autoSearchWishlist ?? false)
    setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
    setAllowHypervisor(dlConfig.allowHypervisor ?? false)
    setAutoOrganizeEnabled((dlConfig as any).autoOrganizeEnabled ?? false)
    setNamingTemplate((dlConfig as any).namingTemplate ?? NAMING_PRESETS[0].template)
  }

  useSettingsSaveBar({
    hasChanges,
    onSave: handleSave,
    onDiscard: handleDiscard,
    label: 'Save Downloads',
  })

  return (
    <div id="settings-downloads-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={DownloadCloud}
        title="Downloads"
        description="Game servers, local save paths, and organization rules. Linked download clients live under Connections."
      />

      <SettingsCard>
        <SectionHeader
          title="Downloader clients"
          description="SABnzbd, Prowlarr, Radarr, and Sonarr are configured on the Connections page."
          action={
            <DkButton asChild size="sm" variant="ghost">
              <Link to="/settings/connections">Open Connections</Link>
            </DkButton>
          }
        />
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Remote Game Servers"
          description="Connect self-hosted otix-server nodes or NAS storage to host your game library."
          action={
            <DkButton size="sm" variant="ghost" onClick={() => setShowAddServer(!showAddServer)}>
              <Plus size={14} />
              {showAddServer ? 'Cancel' : 'Connect Server'}
            </DkButton>
          }
        />

        {/* Add Server Form */}
        {showAddServer && (
          <form onSubmit={handleAddServer} className="p-4 rounded-xl bg-white/[0.04] space-y-3">
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
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                  Server URL (LAN or Domain)
                </label>
                <input
                  type="url"
                  required
                  placeholder="e.g. http://127.0.0.1:8090"
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-white/60 uppercase tracking-wider block mb-1">
                Access Token
              </label>
              <input
                type="password"
                required
                placeholder="Paste the token from the node's homepage"
                value={serverToken}
                onChange={(e) => setServerToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              <p className="mt-1.5 text-[11px] text-white/40 leading-relaxed">
                Open the node in a browser, copy its access token, then paste it here. Files and downloads will not work without it.
                {serverUrl.trim() ? (
                  <>
                    {' '}
                    <a
                      href={serverUrl.trim()}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      Open node <ExternalLink size={11} />
                    </a>
                  </>
                ) : null}
              </p>
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
                  className="p-3.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.06] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-white/[0.06] flex items-center justify-center shrink-0">
                      <Server size={18} className="text-white/80" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-white">{server.name}</span>
                        <span
                          className={cn(
                            'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                            server.isOnline
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
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
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors',
                        exploringServerId === server.id
                          ? 'bg-primary text-black font-bold shadow-sm'
                          : 'bg-white/5 hover:bg-white/10 text-white/80 hover:text-white'
                      )}
                      title="Explore Server Storage & Download Folder"
                    >
                      <HardDrive size={12} />
                      <span>{exploringServerId === server.id ? 'Close' : 'Explore Files'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePingServer(server.id)}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/70 hover:text-white text-xs font-medium transition-colors"
                      title="Test Connection"
                    >
                      <Radio size={12} />
                      <span>Ping</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteServer(server.id, server.name)}
                      className="p-1.5 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/50 hover:text-rose-400 transition-colors"
                      title="Disconnect Server"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {exploringServerId === server.id && (
                  <div className="mt-2 rounded-2xl overflow-hidden bg-black/40 shadow-xl">
                    <ServerFileExplorer
                      initialServerId={server.id}
                      onClose={() => setExploringServerId(null)}
                    />
                  </div>
                )}
              </React.Fragment>
            ))
          ) : (
            <div className="p-4 rounded-xl bg-white/[0.03] text-center space-y-1">
              <p className="text-xs text-white/50 font-medium">No game servers connected</p>
              <p className="text-[11px] text-white/30 max-w-sm mx-auto">
                Run <span className="font-mono text-white/50">otix-server start</span> on your NAS, Unraid, or PC, then connect it here to access your game installers from any client.
              </p>
            </div>
          )}
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Local Games Save Location"
          description="Where games, installers, and packages downloaded through Otix will be stored locally."
        />

        <div className="space-y-4 pt-1">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2">
            <PathInput
              label="Assigned Save Directory"
              placeholder={desktop ? "e.g. D:\\Games or /Volumes/Games (Default: ~/Downloads/Games)" : "e.g. /path/to/my/games"}
              value={gamesDownloadPath}
              onChange={setGamesDownloadPath}
              target="local"
              className="min-w-0 flex-1"
            />
            <DkButton
              type="button"
              onClick={() => handleSaveGamesFolder(gamesDownloadPath)}
              className="shrink-0 h-9"
            >
              Save Location
            </DkButton>
          </div>

          <p className="text-[11px] text-white/40">
            If left blank, Otix will default to your system Downloads folder.
          </p>
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader title="Default Directory Mapping" />
        <div>
          <PathInput
            label="ISO Library Path"
            value={downloadPath}
            onChange={setDownloadPath}
            placeholder="e.g. /app/storage/installers"
            target="server"
            hint="Where Otix moves completed ISO files. Browse lists folders on the connected game server node."
          />
        </div>
        <SettingsRow
          label="Post-process after download"
          description="Automatically find and move ISOs to library"
          action={<DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />}
        />
      </SettingsCard>

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Custom Path Mappings"
          description="Map multiple remote download folders to local paths."
        />

        {pathMappings.length > 0 ? (
          <div className="space-y-1.5 overflow-y-auto pr-1" style={{ maxHeight: '150px' }}>
            {pathMappings.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg text-xs"
                style={{ backgroundColor: 'var(--dk-surface-raised)' }}>
                <div className="min-w-0 flex-1 space-y-0.5">
                  <p className="truncate font-mono text-[11px] text-white/70"><span className="font-semibold text-white/75">Remote:</span> {m.sourcePath}</p>
                  <p className="truncate font-mono text-[11px] text-white/70"><span className="font-semibold text-white/75">Local:</span> {m.destPath}</p>
                </div>
                <DkButton size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-white/60 hover:text-red-400" onClick={() => handleRemovePathMapping(m.id)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </DkButton>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs italic py-1 text-white/50">No custom path mappings defined.</p>
        )}

        <div className="flex items-center gap-2 p-2 rounded-xl"
          style={{ backgroundColor: 'color-mix(in srgb, var(--dk-surface-raised) 15%, transparent)' }}>
          <PathInput
            compact
            value={newSourcePath}
            onChange={setNewSourcePath}
            placeholder="Remote Source (e.g. /downloads/...)"
            target="server"
            className="min-w-0 flex-1"
            inputClassName="h-8 rounded-lg px-2 text-xs outline-none"
          />
          <span className="text-xs text-white/40">&rarr;</span>
          <PathInput
            compact
            value={newDestPath}
            onChange={setNewDestPath}
            placeholder="Local Destination (e.g. \NAS\...)"
            target="local"
            className="min-w-0 flex-1"
            inputClassName="h-8 rounded-lg px-2 text-xs outline-none"
          />
          <DkButton size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 shadow-none hover:bg-primary/10 hover:text-primary" onClick={handleAddPathMapping} disabled={!newSourcePath || !newDestPath}>
            <Plus className="h-4 w-4" />
          </DkButton>
        </div>
      </SettingsCard>

      <SettingsCard className="space-y-3">
        <SectionHeader title="Auto-Search" />
        <SettingsRow
          icon={<Search className="h-5 w-5" />}
          label="Auto-search wishlist"
          description={`Scan wishlist every ${intervalHours}h for new downloads`}
          action={<DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />}
        />
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-white/60">Interval (hours)</label>
            <input
              type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="mt-1 h-9 rounded-lg px-3 text-sm outline-none text-white/80 focus:ring-2 focus:ring-primary/40"
              style={{ backgroundColor: 'var(--dk-surface-raised)', width: '120px' }}
            />
          </div>
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsRow
          label="Allow hypervisor-tagged releases"
          description="Include releases tagged with HV/hypervisor/vm markers. Disabled by default — these often require VM setup."
          action={<DkSwitch checked={allowHypervisor} onCheckedChange={setAllowHypervisor} />}
        />
      </SettingsCard>

      {/* Download History */}
      {downloadHistory.length > 0 && (
        <SettingsCard className="overflow-hidden">
          <SectionHeader title="Download History" />
          <div className="divide-y divide-white/10 overflow-y-auto" style={{ maxHeight: '16rem' }}>
            {downloadHistory.map((dl) => (
              <div key={dl.id} className="flex items-center gap-3 px-5 py-3 text-xs">
                <div className="shrink-0">
                  {dl.status === 'downloading' ? (
                    <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
                  ) : dl.status === 'completed' ? (
                    <CheckCircle2 className="h-4 w-4 text-green-400" />
                  ) : dl.status === 'failed' ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : dl.status === 'deleted' ? (
                    <ArchiveX className="h-4 w-4 text-white/60" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{dl.nzbName ?? dl.mediaItemTitle ?? 'Unknown'}</p>
                  <p className="mt-0.5 text-white/60">
                    {dl.status}
                    {dl.nzbSize != null && ` · ${(dl.nzbSize / 1073741824).toFixed(1)} GB`}
                    {dl.percentage != null && dl.status === 'downloading' && ` · ${dl.percentage}%`}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0 text-white/60 hover:text-red-400"
                  onClick={() => cancelDownload(dl.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </DkButton>
              </div>
            ))}
          </div>
        </SettingsCard>
      )}

      <SettingsCard className="space-y-4">
        <SectionHeader
          title="Organization"
          description="Control how downloaded games are automatically renamed and organized."
        />

        <SettingsRow
          label="Auto-Organize"
          description="Automatically rename and sort downloaded games into organized folders."
          action={<DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />}
        />

        {/* Naming template */}
        <div>
          <div className="flex flex-wrap gap-2 mb-3">
            {NAMING_PRESETS.map((p: { id: string; label: string; template: string }) => (
              <DkButton
                key={p.id}
                size="sm"
                variant={presetId === p.id ? 'primary' : 'ghost'}
                onClick={() => {
                  setPresetId(p.id)
                  setNamingTemplate(p.template)
                }}
              >
                {p.label}
              </DkButton>
            ))}
            <DkButton
              size="sm"
              variant={presetId === 'custom' ? 'primary' : 'ghost'}
              onClick={() => setPresetId('custom')}
            >
              Custom
            </DkButton>
          </div>
          <input
            type="text"
            value={namingTemplate}
            onChange={(e) => { setNamingTemplate(e.target.value); setPresetId('custom') }}
            className="w-full text-sm text-white outline-none h-9 rounded-xl bg-white/5 px-3 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-150 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)] placeholder:text-white/30"
          />
          <div className="mt-3">
            <details className="group">
              <summary className="cursor-pointer text-[11px] font-medium text-white/40 hover:text-white/60 transition-colors">
                Available tokens
              </summary>
              <div className="mt-2 space-y-1">
                {TOKEN_DOCS.map((doc: string) => (
                  <p key={doc} className="text-[11px] font-mono text-white/30">{doc}</p>
                ))}
              </div>
            </details>
          </div>
        </div>
      </SettingsCard>
    </div>
  )
}
