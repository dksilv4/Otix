// TODO: Review this file
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { useDownloadConfig, useConnectionTest, useDownloads } from '@/old-features/downloads/use-downloads'
import { Loader2, ChevronDown, Server, Search, CheckCircle2, XCircle, Plus, Trash2, Clock, ArchiveX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import './downloads-section.scss'

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

  if (!desktop) return null

  return (
    <div className="dk-settings-downloads__body">
      <div>
        <h2 className="dk-settings-downloads__title">Downloads</h2>
        <p className="dk-settings-downloads__desc">
          Configure SABnzbd and NZBPlanet to download game ISOs.
        </p>
      </div>

      {/* SABnzbd Card */}
      <div className="dk-settings-downloads__card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('sabnzbd')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('sabnzbd'); } }}
          className="dk-settings-downloads__card-trigger"
          style={{ borderLeft: `3px solid ${BRAND_COLORS.sabnzbd}` }}
        >
          <div className={cn('dk-settings-downloads__card-icon', BRAND_BG.sabnzbd)} style={{ color: BRAND_COLORS.sabnzbd }}>
            <Server className="h-5 w-5" />
          </div>
          <div className="dk-settings-downloads__card-content">
            <div className="dk-settings-downloads__card-title-row">
              <p className="dk-settings-downloads__card-title">SABnzbd</p>
              {isSabnzbdConnected && <span className="dk-settings-downloads__status-dot" />}
            </div>
            <p className="dk-settings-downloads__card-subtitle">
              {isSabnzbdConnected ? `${sabnzbdForm.host}:${sabnzbdForm.port}` : 'Configure your SABnzbd download client for game ISOs.'}
            </p>
          </div>
          <ChevronDown className={cn('dk-settings-downloads__chevron', { 'dk-settings-downloads__chevron--open': expandedId === 'sabnzbd' })} />
        </div>

        {expandedId === 'sabnzbd' && (
          <div className="dk-settings-downloads__card-body">
            {/* Connection Settings */}
            <div className="dk-settings-downloads__section">
              <div className="dk-settings-downloads__section-header">
                <h4 className="dk-settings-downloads__section-title">Connection Settings</h4>
              </div>
              <div className="dk-settings-downloads__input-group">
                <div className="md:col-span-2">
                  <label className="dk-settings-downloads__label">Host / IP Address</label>
                  <input type="text" value={sabnzbdForm.host}
                    onChange={e => setSabnzbdForm(p => ({ ...p, host: e.target.value }))}
                    placeholder="e.g. 192.168.1.58 or localhost"
                    className="dk-settings-downloads__input" />
                </div>
                <div>
                  <label className="dk-settings-downloads__label">Port</label>
                  <input type="number" value={sabnzbdForm.port}
                    onChange={e => setSabnzbdForm(p => ({ ...p, port: parseInt(e.target.value) || 8080 }))}
                    className="dk-settings-downloads__input" />
                </div>
              </div>
              <div className="dk-settings-downloads__input-group items-end">
                <div className="md:col-span-2">
                  <label className="dk-settings-downloads__label">API Key</label>
                  <input type="password" value={sabnzbdForm.apiKey}
                    onChange={e => setSabnzbdForm(p => ({ ...p, apiKey: e.target.value }))}
                    placeholder="SABnzbd API key"
                    className="dk-settings-downloads__input" />
                </div>
                <div className="dk-settings-downloads__ssl-row">
                  <div className="flex items-center gap-2">
                    <DkSwitch checked={sabnzbdForm.useSsl} onCheckedChange={v => setSabnzbdForm(p => ({ ...p, useSsl: v }))} />
                    <span className="dk-settings-downloads__switch-text">Use SSL</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Path Configuration */}
            <div className="dk-settings-downloads__section--bordered">
              <div className="dk-settings-downloads__section-header">
                <h4 className="dk-settings-downloads__section-title">Default Directory Mapping</h4>
              </div>
              <div className="dk-settings-downloads__input-group--2col">
                <div>
                  <label className="dk-settings-downloads__label">SABnzbd Completed Games Folder</label>
                  <input type="text" value={sabnzbdCompletePath}
                    onChange={e => setSabnzbdCompletePath(e.target.value)}
                    placeholder="e.g. /downloads/completed/games"
                    className="dk-settings-downloads__input" />
                  <p className="dk-settings-downloads__footnote">
                    Category subfolder (e.g. <code>/downloads/completed/games/</code>).
                  </p>
                </div>
                <div>
                  <label className="dk-settings-downloads__label">ISO Library Path</label>
                  <input type="text" value={downloadPath}
                    onChange={e => setDownloadPath(e.target.value)}
                    placeholder="e.g. D:\\Games\\ISOs"
                    className="dk-settings-downloads__input" />
                  <p className="dk-settings-downloads__footnote">Where Otix moves completed ISO files.</p>
                </div>
              </div>
              <div className="dk-settings-downloads__switch-card">
                <div>
                  <p className="dk-settings-downloads__switch-card-label">Post-process after download</p>
                  <p className="dk-settings-downloads__switch-card-desc">Automatically find and move ISOs to library</p>
                </div>
                <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
              </div>
            </div>

            {/* Custom Path Mappings */}
            <div className="dk-settings-downloads__section--bordered">
              <div className="dk-settings-downloads__section-header">
                <div>
                  <h4 className="dk-settings-downloads__section-title">Custom Path Mappings</h4>
                  <p className="dk-settings-downloads__section-desc">Map multiple remote download folders to local paths.</p>
                </div>
              </div>

              {pathMappings.length > 0 ? (
                <div className="dk-settings-downloads__mapping-list">
                  {pathMappings.map((m) => (
                    <div key={m.id} className="dk-settings-downloads__mapping-row">
                      <div className="dk-settings-downloads__mapping-path">
                        <p className="dk-settings-downloads__mapping-path-text"><span className="font-semibold text-foreground/75">Remote:</span> {m.sourcePath}</p>
                        <p className="dk-settings-downloads__mapping-path-text"><span className="font-semibold text-foreground/75">Local:</span> {m.destPath}</p>
                      </div>
                      <DkButton size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0 text-muted-foreground hover:text-destructive" onClick={() => handleRemovePathMapping(m.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </DkButton>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dk-settings-downloads__mapping-empty">No custom path mappings defined.</p>
              )}

              <div className="dk-settings-downloads__mapping-form">
                <input type="text" value={newSourcePath}
                  onChange={e => setNewSourcePath(e.target.value)}
                  placeholder="Remote Source (e.g. /downloads/...)"
                  className="dk-settings-downloads__mapping-input" />
                <span className="dk-settings-downloads__mapping-arrow">&rarr;</span>
                <input type="text" value={newDestPath}
                  onChange={e => setNewDestPath(e.target.value)}
                  placeholder="Local Destination (e.g. \\NAS\...)"
                  className="dk-settings-downloads__mapping-input" />
                <DkButton size="sm" variant="ghost" className="h-8 w-8 p-0 shrink-0 shadow-none hover:bg-primary/10 hover:text-primary" onClick={handleAddPathMapping} disabled={!newSourcePath || !newDestPath}>
                  <Plus className="h-4 w-4" />
                </DkButton>
              </div>
            </div>

            {/* SABnzbd Footer Actions */}
            <div className="dk-settings-downloads__footer">
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
      <div className="dk-settings-downloads__card">
        <div
          role="button"
          tabIndex={0}
          onClick={() => toggleExpand('nzbplanet')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand('nzbplanet'); } }}
          className="dk-settings-downloads__card-trigger"
          style={{ borderLeft: `3px solid ${BRAND_COLORS.nzbplanet}` }}
        >
          <div className={cn('dk-settings-downloads__card-icon', BRAND_BG.nzbplanet)} style={{ color: BRAND_COLORS.nzbplanet }}>
            <Search className="h-5 w-5" />
          </div>
          <div className="dk-settings-downloads__card-content">
            <div className="dk-settings-downloads__card-title-row">
              <p className="dk-settings-downloads__card-title">NZBPlanet</p>
              {isNzbplanetConnected && <span className="dk-settings-downloads__status-dot" />}
            </div>
            <p className="dk-settings-downloads__card-subtitle">
              {isNzbplanetConnected ? 'API key configured' : 'Configure NZBPlanet to search for game NZBs.'}
            </p>
          </div>
          <ChevronDown className={cn('dk-settings-downloads__chevron', { 'dk-settings-downloads__chevron--open': expandedId === 'nzbplanet' })} />
        </div>

        {expandedId === 'nzbplanet' && (
          <div className="dk-settings-downloads__card-body">
            <div className="dk-settings-downloads__section">
              <div>
                <label className="dk-settings-downloads__label">API Key</label>
                <input type="password" value={nzbplanetForm.apiKey}
                  onChange={e => setNzbplanetForm(p => ({ ...p, apiKey: e.target.value }))}
                  placeholder="NZBPlanet API key"
                  className="dk-settings-downloads__input" />
              </div>
              <div>
                <label className="dk-settings-downloads__label">Preferred Repackers</label>
                <input type="text" value={preferredRepackers}
                  onChange={e => setPreferredRepackers(e.target.value)}
                  placeholder="e.g. ElAmigos, DODI, FitGirl"
                  className="dk-settings-downloads__input" />
                <p className="text-xs text-muted-foreground mt-1">Comma-separated repacker names. Results matching these are picked first.</p>
              </div>
            </div>
            <div className="dk-settings-downloads__footer">
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
      <div className="dk-settings-downloads__card dk-settings-downloads__card--padded">
        <h3 className="dk-settings-downloads__card-title">Auto-Search</h3>
        <div className="dk-settings-downloads__row">
          <div>
            <p className="dk-settings-downloads__row-label">Auto-search wishlist</p>
            <p className="dk-settings-downloads__row-desc">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="dk-settings-downloads__label">Interval (hours)</label>
            <input
              type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="dk-settings-downloads__input--narrow"
            />
          </div>
        )}
      </div>

      {/* Hypervisor */}
      <div className="dk-settings-downloads__card dk-settings-downloads__card--padded">
        <div className="dk-settings-downloads__row">
          <div>
            <p className="dk-settings-downloads__row-label">Allow hypervisor-tagged releases</p>
            <p className="dk-settings-downloads__row-desc">
              Include releases tagged with HV/hypervisor/vm markers. Disabled by default â€” these often require VM setup.
            </p>
          </div>
          <DkSwitch checked={allowHypervisor} onCheckedChange={setAllowHypervisor} />
        </div>
      </div>

      {/* Download History */}
      {downloadHistory.length > 0 && (
        <div className="dk-settings-downloads__card">
          <div className="dk-settings-downloads__history-header">
            <h3 className="dk-settings-downloads__card-title">Download History</h3>
          </div>
          <div className="dk-settings-downloads__history-list">
            {downloadHistory.map((dl) => (
              <div key={dl.id} className="dk-settings-downloads__history-item">
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
                <div className="dk-settings-downloads__history-info">
                  <p className="dk-settings-downloads__history-title">{dl.nzbName ?? dl.mediaItemTitle ?? 'Unknown'}</p>
                  <p className="dk-settings-downloads__history-meta">
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
