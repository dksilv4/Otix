import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { DkButton } from '@/old-features/dk-ui/atoms/button'
import { DkSwitch } from '@/old-features/dk-ui/atoms/switch'
import { useDownloadConfig, useConnectionTest, useDownloads } from '@/old-features/downloads/use-downloads'
import { Loader2, ChevronDown, Server, Search, CheckCircle2, XCircle, Plus, Trash2, Clock, ArchiveX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'

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

export function DownloadsSection() {
  const desktop = isDesktop()
  const { user } = useAuth()
  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { testingSabnzbd, testingNzbplanet, testSabnzbd, testNzbplanet } = useConnectionTest()
  const { downloads: downloadHistory, cancelDownload } = useDownloads(user?.id)


  const [sabnzbdForm, setSabnzbdForm] = useState({ host: '', port: 8080, apiKey: '', useSsl: false })
  const [nzbplanetForm, setNzbplanetForm] = useState({ apiKey: '' })
  const [sabnzbdStatus, setSabnzbdStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [nzbplanetStatus, setNzbplanetStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [downloadPath, setDownloadPath] = useState('')
  const [sabnzbdCompletePath, setSabnzbdCompletePath] = useState('')
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [preferredRepackers, setPreferredRepackers] = useState('')
  const [allowHypervisor, setAllowHypervisor] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [autoOrganizeEnabled, setAutoOrganizeEnabled] = useState(false)
  const [namingTemplate, setNamingTemplate] = useState(NAMING_PRESETS[0].template)
  const [presetId, setPresetId] = useState('standard')

  useEffect(() => {
    if (dlConfig) {
      setSabnzbdForm({
        host: dlConfig.sabnzbdHost ?? '',
        port: dlConfig.sabnzbdPort ?? 8080,
        apiKey: dlConfig.sabnzbdApiKey ?? '',
        useSsl: dlConfig.sabnzbdUseSsl ?? false,
      })
      setNzbplanetForm({ apiKey: dlConfig.nzbplanetApiKey ?? '' })
      setDownloadPath(dlConfig.downloadPath ?? '')
      setSabnzbdCompletePath(dlConfig.sabnzbdCompletePath ?? '')
      setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
      setAutoSearch(dlConfig.autoSearchWishlist ?? false)
      setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
      setPreferredRepackers(dlConfig.preferredRepackers ?? '')
      setAllowHypervisor(dlConfig.allowHypervisor ?? false)
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
      sabnzbdHost: sabnzbdForm.host || null,
      sabnzbdPort: sabnzbdForm.port || null,
      sabnzbdApiKey: sabnzbdForm.apiKey || null,
      sabnzbdUseSsl: sabnzbdForm.useSsl,
      nzbplanetApiKey: nzbplanetForm.apiKey || null,
      sabnzbdCompletePath: sabnzbdCompletePath || null,
      downloadPath: downloadPath || null,
      postProcessEnabled,
      autoSearchWishlist: autoSearch,
      wishlistIntervalHours: intervalHours,
      preferredRepackers: preferredRepackers || null,
      allowHypervisor,
    })
  }

  const handleSaveOrganizer = async () => {
    if (!user) return
    await saveConfig({
      ...dlConfig,
      userId: user.id,
      autoOrganizeEnabled,
      namingTemplate: namingTemplate || null,
    } as any)
  }

  const isSabnzbdConnected = !!(dlConfig?.sabnzbdHost && dlConfig?.sabnzbdApiKey)
  const isNzbplanetConnected = !!dlConfig?.nzbplanetApiKey

  const BRAND_COLORS = {
    sabnzbd: '#e5a00d',
    nzbplanet: '#7c3aed',
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  if (!desktop) return null

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Downloads</h2>
        <p className="mt-1 text-sm text-white/60">
          Configure SABnzbd and NZBPlanet to download game ISOs.
        </p>
      </div>

      {/* SABnzbd Card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('sabnzbd')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('sabnzbd'); } }}
          className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer select-none hover:bg-white/5"
          style={{ borderLeft: `3px solid ${BRAND_COLORS.sabnzbd}` }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ color: BRAND_COLORS.sabnzbd, backgroundColor: 'rgba(229, 160, 13, 0.1)' }}
          >
            <Server className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">SABnzbd</p>
              {isSabnzbdConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
            </div>
            <p className="text-xs text-white/60 mt-0.5 truncate">
              {isSabnzbdConnected ? `${sabnzbdForm.host}:${sabnzbdForm.port}` : 'Configure your SABnzbd download client for game ISOs.'}
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform text-white/60', { 'rotate-180': expandedId === 'sabnzbd' })} />
        </div>

        {expandedId === 'sabnzbd' && (
          <div className="border-t border-white/10">
            {/* Connection Settings */}
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">Connection Settings</h4>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr]">
                <div>
                  <label className="text-xs font-medium text-white/60">Host / IP Address</label>
                  <input type="text" value={sabnzbdForm.host}
                    onChange={e => setSabnzbdForm(p => ({ ...p, host: e.target.value }))}
                    placeholder="e.g. 192.168.1.58 or localhost"
                    className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                    style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60">Port</label>
                  <input type="number" value={sabnzbdForm.port}
                    onChange={e => setSabnzbdForm(p => ({ ...p, port: parseInt(e.target.value) || 8080 }))}
                    className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                    style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[2fr_1fr] items-end">
                <div>
                  <label className="text-xs font-medium text-white/60">API Key</label>
                  <input type="password" value={sabnzbdForm.apiKey}
                    onChange={e => setSabnzbdForm(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="SABnzbd API key"
                    className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                    style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                </div>
                <div className="h-9 flex items-center px-1">
                  <div className="flex items-center gap-2">
                    <DkSwitch checked={sabnzbdForm.useSsl} onCheckedChange={v => setSabnzbdForm(p => ({ ...p, useSsl: v }))} />
                    <span className="text-xs text-white/60">Use SSL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Path Configuration */}
            <div className="px-5 py-4 space-y-4 border-t border-white/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">Default Directory Mapping</h4>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className="text-xs font-medium text-white/60">SABnzbd Completed Games Folder</label>
                  <input type="text" value={sabnzbdCompletePath}
                    onChange={e => setSabnzbdCompletePath(e.target.value)}
                    placeholder="e.g. /downloads/completed/games"
                    className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                    style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                  <p className="mt-1 text-[11px] text-white/50">
                    Category subfolder (e.g. <code className="text-white/70">/downloads/completed/games/</code>).
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-white/60">ISO Library Path</label>
                  <input type="text" value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="e.g. D:\Games\ISOs"
                    className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                    style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                  <p className="mt-1 text-[11px] text-white/50">Where Otix moves completed ISO files.</p>
                </div>
              </div>
              <div className="flex items-center justify-between p-3 rounded-xl"
                style={{ backgroundColor: 'color-mix(in srgb, var(--dk-surface-raised) 30%, transparent)' }}>
                <div>
                  <p className="text-xs font-semibold text-white/80">Post-process after download</p>
                  <p className="text-[11px] text-white/60">Automatically find and move ISOs to library</p>
                </div>
                <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
              </div>
            </div>

            {/* Custom Path Mappings */}
            <div className="px-5 py-4 space-y-4 border-t border-white/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">Custom Path Mappings</h4>
                  <p className="mt-0.5 text-[11px] text-white/60">Map multiple remote download folders to local paths.</p>
                </div>
              </div>

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
                <input type="text" value={newSourcePath}
                  onChange={e => setNewSourcePath(e.target.value)}
                  placeholder="Remote Source (e.g. /downloads/...)"
                  className="flex-1 h-8 rounded-lg px-2 text-xs outline-none"
                  style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: '0 0 0 1px hsla(var(--border), 0.2)' }} />
                <span className="text-xs text-white/40">&rarr;</span>
                <input type="text" value={newDestPath}
                  onChange={e => setNewDestPath(e.target.value)}
                  placeholder="Local Destination (e.g. \NAS\...)"
                  className="flex-1 h-8 rounded-lg px-2 text-xs outline-none"
                  style={{ backgroundColor: 'var(--dk-surface-base)', boxShadow: '0 0 0 1px hsla(var(--border), 0.2)' }} />
                <DkButton size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 shadow-none hover:bg-primary/10 hover:text-primary" onClick={handleAddPathMapping} disabled={!newSourcePath || !newDestPath}>
                  <Plus className="h-4 w-4" />
                </DkButton>
              </div>
            </div>

            {/* SABnzbd Footer Actions */}
            <div className="border-t border-white/10 px-5 py-3 flex items-center gap-2">
              <DkButton size="sm" variant="ghost"
                onClick={async () => {
                  const ok = await testSabnzbd(sabnzbdForm.host, sabnzbdForm.port, sabnzbdForm.apiKey, sabnzbdForm.useSsl)
                  setSabnzbdStatus(ok ? 'ok' : 'fail')
                }}
                loading={testingSabnzbd}
                className="shadow-none"
              >
                {sabnzbdStatus === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-400" /> :
                  sabnzbdStatus === 'fail' ? <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-400" /> :
                  null}
                Test Connection
              </DkButton>
              <div className="flex-1" />
              <DkButton size="sm" variant="primary" onClick={handleSave} className="shadow-none">
                Save
              </DkButton>
            </div>
          </div>
        )}
      </div>

      {/* NZBPlanet Card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('nzbplanet')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('nzbplanet'); } }}
          className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer select-none hover:bg-white/5"
          style={{ borderLeft: `3px solid ${BRAND_COLORS.nzbplanet}` }}
        >
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
            style={{ color: BRAND_COLORS.nzbplanet, backgroundColor: 'rgba(124, 58, 237, 0.1)' }}
          >
            <Search className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">NZBPlanet</p>
              {isNzbplanetConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
            </div>
            <p className="text-xs text-white/60 mt-0.5 truncate">
              {isNzbplanetConnected ? 'API key configured' : 'Configure NZBPlanet to search for game NZBs.'}
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform text-white/60', { 'rotate-180': expandedId === 'nzbplanet' })} />
        </div>

        {expandedId === 'nzbplanet' && (
          <div className="border-t border-white/10">
            <div className="px-5 py-4 space-y-4">
              <div>
                <label className="text-xs font-medium text-white/60">API Key</label>
                <input type="password" value={nzbplanetForm.apiKey}
                  onChange={e => setNzbplanetForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="NZBPlanet API key"
                  className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                  style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
              </div>
              <div>
                <label className="text-xs font-medium text-white/60">Preferred Repackers</label>
                <input type="text" value={preferredRepackers}
                  onChange={e => setPreferredRepackers(e.target.value)}
                  placeholder="e.g. ElAmigos, DODI, FitGirl"
                  className="mt-1 w-full h-9 rounded-lg px-3 text-sm outline-none text-white/80"
                  style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)' }} />
                <p className="text-xs text-white/60 mt-1">Comma-separated repacker names. Results matching these are picked first.</p>
              </div>
            </div>
            <div className="border-t border-white/10 px-5 py-3 flex items-center gap-2">
              <DkButton size="sm" variant="ghost"
                onClick={async () => {
                  const ok = await testNzbplanet(nzbplanetForm.apiKey)
                  setNzbplanetStatus(ok ? 'ok' : 'fail')
                }}
                loading={testingNzbplanet}
                className="shadow-none"
              >
                {nzbplanetStatus === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-400" /> :
                  nzbplanetStatus === 'fail' ? <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-400" /> :
                  null}
                Test API Key
              </DkButton>
              <div className="flex-1" />
              <DkButton size="sm" variant="primary" onClick={handleSave} className="shadow-none">
                Save
              </DkButton>
            </div>
          </div>
        )}
      </div>

      {/* Auto-Search */}
      <div
        className="rounded-2xl p-6 space-y-3"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <h3 className="text-sm font-semibold">Auto-Search</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-search wishlist</p>
            <p className="text-xs text-white/60">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-white/60">Interval (hours)</label>
            <input
              type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="mt-1 h-9 rounded-lg px-3 text-sm outline-none text-white/80"
              style={{ backgroundColor: 'var(--dk-surface-raised)', boxShadow: '0 0 0 1px hsla(var(--border), 0.3)', width: '120px' }}
            />
          </div>
        )}
      </div>

      {/* Hypervisor */}
      <div
        className="rounded-2xl p-6 space-y-3"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Allow hypervisor-tagged releases</p>
            <p className="text-xs text-white/60">
              Include releases tagged with HV/hypervisor/vm markers. Disabled by default — these often require VM setup.
            </p>
          </div>
          <DkSwitch checked={allowHypervisor} onCheckedChange={setAllowHypervisor} />
        </div>
      </div>

      {/* Download History */}
      {downloadHistory.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ backgroundColor: 'var(--dk-surface-glass)' }}
        >
          <div className="px-5 py-4 border-b border-white/10">
            <h3 className="text-sm font-semibold">Download History</h3>
          </div>
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
        </div>
      )}

      {!expandedId && (
        <DkButton onClick={handleSave} className="w-full">
          Save Configuration
        </DkButton>
      )}

      {/* ── Organizer ── */}
      <div className="rounded-2xl p-6 space-y-4" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h3 className="text-sm font-semibold text-white">Organization</h3>
          <p className="mt-0.5 text-xs text-white/60">
            Control how downloaded games are automatically renamed and organized.
          </p>
        </div>

        {/* Auto-organize toggle */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-white">Auto-Organize</p>
            <p className="text-xs text-white/60 mt-0.5">
              Automatically rename and sort downloaded games into organized folders.
            </p>
          </div>
          <DkSwitch checked={autoOrganizeEnabled} onCheckedChange={setAutoOrganizeEnabled} />
        </div>

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
          <div className="flex items-center gap-3 mt-4">
            <DkButton size="sm" variant="primary" onClick={handleSaveOrganizer}>
              Save Template
            </DkButton>
          </div>
        </div>
      </div>
    </div>
  )
}
