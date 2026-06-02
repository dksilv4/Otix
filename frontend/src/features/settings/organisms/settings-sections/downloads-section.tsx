import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/features/auth/auth-provider'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { useDownloadConfig, useConnectionTest, useDownloads } from '@/features/downloads/use-downloads'
import { Loader2, ChevronDown, Server, Search, CheckCircle2, XCircle, Plus, Trash2, Clock, ArchiveX } from 'lucide-react'
import { cn } from '@/lib/utils'

export function DownloadsSection() {
  const isElectron = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron')
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
    if (dlConfig && window.electronAPI) {
      try {
        const mappings = await window.electronAPI.downloadsGetPathMappings(dlConfig.id)
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
    if (!dlConfig || !window.electronAPI || !newSourcePath || !newDestPath) return
    try {
      await window.electronAPI.downloadsAddPathMapping(dlConfig.id, newSourcePath, newDestPath)
      setNewSourcePath('')
      setNewDestPath('')
      await fetchPathMappings()
    } catch (err) {
      console.error('Failed to add path mapping:', err)
    }
  }

  const handleRemovePathMapping = async (id: string) => {
    if (!window.electronAPI) return
    try {
      await window.electronAPI.downloadsRemovePathMapping(id)
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

  const isSabnzbdConnected = !!(dlConfig?.sabnzbdHost && dlConfig?.sabnzbdApiKey)
  const isNzbplanetConnected = !!dlConfig?.nzbplanetApiKey

  const BRAND_COLORS = {
    sabnzbd: '#e5a00d',
    nzbplanet: '#7c3aed',
  }

  const BRAND_BG = {
    sabnzbd: 'bg-[#e5a00d]/10',
    nzbplanet: 'bg-[#7c3aed]/10',
  }

  const toggleExpand = (id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }

  if (!isElectron) return null

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Downloads</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Configure SABnzbd and NZBPlanet to download game ISOs.
        </p>
      </div>

      {/* SABnzbd Card */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('sabnzbd')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('sabnzbd'); } }}
          className={cn(
            'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer select-none',
            'hover:bg-[var(--dk-surface-glass)] active:bg-[var(--dk-surface-glass)]',
          )}
          style={{ borderLeft: `3px solid ${BRAND_COLORS.sabnzbd}` }}
        >
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', BRAND_BG.sabnzbd)} style={{ color: BRAND_COLORS.sabnzbd }}>
            <Server className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">SABnzbd</p>
              {isSabnzbdConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {isSabnzbdConnected ? `${sabnzbdForm.host}:${sabnzbdForm.port}` : 'Configure your SABnzbd download client for game ISOs.'}
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandedId === 'sabnzbd' && 'rotate-180')} />
        </div>

        {expandedId === 'sabnzbd' && (
          <div className="border-t border-border/20">
            {/* Connection Settings */}
            <div className="px-5 py-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/10 pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground/80">Connection Settings</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">Host / IP Address</label>
                  <input type="text" value={sabnzbdForm.host}
                    onChange={e => setSabnzbdForm(p => ({ ...p, host: e.target.value }))}
                    placeholder="e.g. 192.168.1.58 or localhost"
                    className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">Port</label>
                  <input type="number" value={sabnzbdForm.port}
                    onChange={e => setSabnzbdForm(p => ({ ...p, port: parseInt(e.target.value) || 8080 }))}
                    className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-muted-foreground">API Key</label>
                  <input type="password" value={sabnzbdForm.apiKey}
                    onChange={e => setSabnzbdForm(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="SABnzbd API key"
                    className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                </div>
                <div className="h-9 flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <DkSwitch checked={sabnzbdForm.useSsl} onCheckedChange={v => setSabnzbdForm(p => ({ ...p, useSsl: v }))} />
                    <span className="text-xs text-muted-foreground">Use SSL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Path Configuration */}
            <div className="border-t border-border/20 px-5 py-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/10 pb-2">
                <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground/80">Default Directory Mapping</h4>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground">SABnzbd Completed Games Folder</label>
                  <input type="text" value={sabnzbdCompletePath}
                    onChange={e => setSabnzbdCompletePath(e.target.value)}
                    placeholder="e.g. /downloads/completed/games"
                    className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                  <p className="text-[11px] text-muted-foreground/60 mt-1 leading-normal">
                    Category subfolder (e.g. <code>/downloads/completed/games/</code>).
                  </p>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground">ISO Library Path</label>
                  <input type="text" value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="e.g. D:\\Games\\ISOs"
                    className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                  <p className="text-[11px] text-muted-foreground/60 mt-1 leading-normal">Where Otix moves completed ISO files.</p>
                </div>
              </div>
              <div className="flex items-center justify-between bg-[var(--dk-surface-raised)]/30 p-3 rounded-xl /10">
                <div>
                  <p className="text-xs font-semibold text-foreground/80">Post-process after download</p>
                  <p className="text-[11px] text-muted-foreground">Automatically find and move ISOs to library</p>
                </div>
                <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
              </div>
            </div>

            {/* Custom Path Mappings */}
            <div className="border-t border-border/20 px-5 py-4 space-y-4">
              <div className="flex items-center justify-between border-b border-border/10 pb-2">
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-[0.05em] text-muted-foreground/80">Custom Path Mappings</h4>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Map multiple remote download folders to local paths.</p>
                </div>
              </div>

              {pathMappings.length > 0 ? (
                <div className="space-y-1.5 max-h-[150px] overflow-y-auto pr-1">
                  {pathMappings.map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[var(--dk-surface-raised)] /10 text-xs">
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="truncate font-mono text-muted-foreground/95 text-[11px]"><span className="font-semibold text-foreground/75">Remote:</span> {m.sourcePath}</p>
                        <p className="truncate font-mono text-muted-foreground/95 text-[11px]"><span className="font-semibold text-foreground/75">Local:</span> {m.destPath}</p>
                      </div>
                      <DkButton size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePathMapping(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </DkButton>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground/60 italic py-1">No custom path mappings defined.</p>
              )}

              <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--dk-surface-raised)] /15">
                <input type="text" value={newSourcePath}
                  onChange={e => setNewSourcePath(e.target.value)}
                  placeholder="Remote Source (e.g. /downloads/...)"
                  className="flex-1 h-8 rounded-lg bg-[var(--dk-surface-base)] px-2 text-xs outline-none ring-1 ring-border/20 focus:ring-primary/30" />
                <span className="text-muted-foreground/40 text-xs">&rarr;</span>
                <input type="text" value={newDestPath}
                  onChange={e => setNewDestPath(e.target.value)}
                  placeholder="Local Destination (e.g. \\NAS\...)"
                  className="flex-1 h-8 rounded-lg bg-[var(--dk-surface-base)] px-2 text-xs outline-none ring-1 ring-border/20 focus:ring-primary/30" />
                <DkButton size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 shadow-none hover:bg-primary/10 hover:text-primary" onClick={handleAddPathMapping} disabled={!newSourcePath || !newDestPath}>
                  <Plus className="h-4 w-4" />
                </DkButton>
              </div>
            </div>

            {/* SABnzbd Footer Actions */}
            <div className="border-t border-border/20 px-5 py-3 flex items-center gap-2">
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
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('nzbplanet')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('nzbplanet'); } }}
          className={cn(
            'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer select-none',
            'hover:bg-[var(--dk-surface-glass)] active:bg-[var(--dk-surface-glass)]',
          )}
          style={{ borderLeft: `3px solid ${BRAND_COLORS.nzbplanet}` }}
        >
          <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', BRAND_BG.nzbplanet)} style={{ color: BRAND_COLORS.nzbplanet }}>
            <Search className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold">NZBPlanet</p>
              {isNzbplanetConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
              {isNzbplanetConnected ? 'API key configured' : 'Configure NZBPlanet to search for game NZBs.'}
            </p>
          </div>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandedId === 'nzbplanet' && 'rotate-180')} />
        </div>

        {expandedId === 'nzbplanet' && (
          <div className="border-t border-border/20">
            <div className="px-5 py-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">API Key</label>
                <input type="password" value={nzbplanetForm.apiKey}
                  onChange={e => setNzbplanetForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="NZBPlanet API key"
                  className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Preferred Repackers</label>
                <input type="text" value={preferredRepackers}
                  onChange={e => setPreferredRepackers(e.target.value)}
                  placeholder="e.g. ElAmigos, DODI, FitGirl"
                  className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                <p className="text-xs text-muted-foreground mt-1">Comma-separated repacker names. Results matching these are picked first.</p>
              </div>
            </div>
            <div className="border-t border-border/20 px-5 py-3 flex items-center gap-2">
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
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <h3 className="text-sm font-semibold">Auto-Search</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-search wishlist</p>
            <p className="text-xs text-muted-foreground">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Interval (hours)</label>
            <input
              type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="mt-1 w-24 h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40"
            />
          </div>
        )}
      </div>

      {/* Hypervisor */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Allow hypervisor-tagged releases</p>
            <p className="text-xs text-muted-foreground">
              Include releases tagged with HV/hypervisor/vm markers. Disabled by default â€” these often require VM setup.
            </p>
          </div>
          <DkSwitch checked={allowHypervisor} onCheckedChange={setAllowHypervisor} />
        </div>
      </div>

      {/* Download History */}
      {downloadHistory.length > 0 && (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
          <div className="px-5 py-4 border-b border-border/20">
            <h3 className="text-sm font-semibold">Download History</h3>
          </div>
          <div className="divide-y divide-border/10 max-h-64 overflow-y-auto">
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
                    <ArchiveX className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <Clock className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{dl.nzbName ?? dl.mediaItemTitle ?? 'Unknown'}</p>
                  <p className="text-muted-foreground mt-0.5">
                    {dl.status}
                    {dl.nzbSize != null && ` · ${(dl.nzbSize / 1073741824).toFixed(1)} GB`}
                    {dl.percentage != null && dl.status === 'downloading' && ` · ${dl.percentage}%`}
                  </p>
                </div>
                <DkButton
                  size="sm"
                  variant="ghost"
                  className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive"
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
    </div>
  )
}

