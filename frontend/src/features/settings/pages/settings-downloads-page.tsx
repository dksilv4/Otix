import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/providers/auth'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import { useDownloadConfig, useDownloads } from '@/features/downloads/use-downloads'
import { Loader2, CheckCircle2, XCircle, Plus, Trash2, Clock, ArchiveX } from 'lucide-react'
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

export function SettingsDownloadsPage() {
  const desktop = isDesktop()
  const { user } = useAuth()
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

  useEffect(() => {
    if (dlConfig) {
      setDownloadPath(dlConfig.downloadPath ?? '')
      setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
      setAutoSearch(dlConfig.autoSearchWishlist ?? false)
      setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
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
      downloadPath: downloadPath || null,
      postProcessEnabled,
      autoSearchWishlist: autoSearch,
      wishlistIntervalHours: intervalHours,
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

  if (!desktop) return null

  return (
    <div id="settings-downloads-section" className="space-y-6">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Downloads</h2>
        <p className="mt-1 text-sm text-white/60">
          Configure download paths, auto-search settings, and organization rules.
        </p>
      </div>

      {/* Info banner */}
      <div
        className="rounded-2xl p-4 text-sm"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <p className="text-white/70">
          Download provider settings moved to{' '}
          <span className="font-semibold text-white/90">Plugins &rarr; SABnzbd</span> and{' '}
          <span className="font-semibold text-white/90">Plugins &rarr; NZBPlanet</span>.
        </p>
      </div>

      {/* Default Directory Mapping */}
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-white/60">Default Directory Mapping</h4>
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
      <div
        className="rounded-2xl p-6 space-y-4"
        style={{ backgroundColor: 'var(--dk-surface-glass)' }}
      >
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

      <DkButton onClick={handleSave} className="w-full">
        Save Configuration
      </DkButton>

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
