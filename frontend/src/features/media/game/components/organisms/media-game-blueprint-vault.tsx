import { useState, useEffect } from 'react'
import { Search, Plus, Upload, Loader2, AlertCircle } from 'lucide-react'
import { BlueprintCard } from '../../molecules/media-game-blueprint-card'

export interface ParsedBlueprint {
  type: string
  label: string
  description: string
  icons: string[]
  entities: Record<string, number>
  entityCount: number
  tiles: Record<string, number>
  tileCount: number
  dimensions: { width: number; height: number }
  version: string
  raw: string
  id?: string
  tags?: string[]
  created_at?: string
}

interface Props {
  pluginId: string
  onViewDetail: (blueprint: ParsedBlueprint) => void
}

export function BlueprintVault({ pluginId, onViewDetail }: Props) {
  const [blueprints, setBlueprints] = useState<ParsedBlueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<string>('date')
  const [showImport, setShowImport] = useState(false)
  const [importString, setImportString] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [importPreview, setImportPreview] = useState<ParsedBlueprint | null>(null)
  const [refreshCounter, setRefreshCounter] = useState(0)

  const desktopAPI = (window as Record<string, unknown>).desktopAPI as Record<string, unknown> | undefined

  useEffect(() => {
    let cancelled = false
    async function fetchBlueprints() {
      const api = desktopAPI as Record<string, unknown> | undefined
      if (!api?.plugin || typeof api.plugin !== 'object') return
      const plugin = api.plugin as Record<string, unknown>
      if (typeof plugin.callData !== 'function') return

      setLoading(true)
      setError(null)
      try {
        const res = await (plugin.callData as (...args: unknown[]) => Promise<Record<string, unknown>>)(
          pluginId, 'getBlueprints',
          { search: search || undefined, sort_by: sortBy },
        )
        if (!cancelled && res) {
          if (res.success) {
            setBlueprints((res.blueprints || []) as ParsedBlueprint[])
          } else {
            setError((res.error as string) || 'Failed to load blueprints')
          }
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load blueprints')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchBlueprints()
    return () => { cancelled = true }
  }, [pluginId, search, sortBy, refreshCounter, desktopAPI])

  const handleImport = async () => {
    if (!importString.trim()) return
    const api = desktopAPI as Record<string, unknown> | undefined
    if (!api?.plugin || typeof api.plugin !== 'object') return
    const plugin = api.plugin as Record<string, unknown>
    if (typeof plugin.callData !== 'function') return

    setImporting(true)
    setImportError(null)
    try {
      const res = await (plugin.callData as (...args: unknown[]) => Promise<Record<string, unknown>>)(
        pluginId, 'importBlueprint',
        { rawString: importString.trim() },
      )
      if (res?.success) {
        setShowImport(false)
        setImportString('')
        setImportPreview(null)
        setRefreshCounter((c) => c + 1)
      } else if (res?.error === 'duplicate') {
        setImportError('This blueprint is already in your vault')
      } else {
        setImportError((res?.error as string) || 'Failed to import blueprint')
      }
    } catch (err: unknown) {
      setImportError(err instanceof Error ? err.message : 'Failed to import blueprint')
    } finally {
      setImporting(false)
    }
  }

  const handleDelete = async (id: string) => {
    const api = desktopAPI as Record<string, unknown> | undefined
    if (!api?.plugin || typeof api.plugin !== 'object') return
    const plugin = api.plugin as Record<string, unknown>
    if (typeof plugin.callData !== 'function') return

    try {
      const res = await (plugin.callData as (...args: unknown[]) => Promise<Record<string, unknown>>)(
        pluginId, 'deleteBlueprint', { id },
      )
      if (res?.success) setRefreshCounter((c) => c + 1)
    } catch {
      /* ignore */
    }
  }

  const handleCopy = (rawString: string) => {
    navigator.clipboard.writeText(rawString)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search blueprints..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          className="h-8 px-2 text-xs rounded-lg bg-white/5 border border-white/10 text-muted-foreground focus:outline-none focus:border-primary/50"
        >
          <option value="date">Date</option>
          <option value="name">Name</option>
          <option value="entity_count">Entities</option>
        </select>
        <button
          onClick={() => setShowImport(true)}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
        >
          <Plus className="h-3.5 w-3.5" /> Import
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && blueprints.length === 0 && (
        <div className="text-center py-12">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No blueprints yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Import a blueprint string to get started
          </p>
          <button
            onClick={() => setShowImport(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
          >
            <Plus className="h-3.5 w-3.5" /> Import Blueprint
          </button>
        </div>
      )}

      {/* Blueprint grid */}
      {!loading && blueprints.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {blueprints.map((bp) => (
            <BlueprintCard
              key={bp.id}
              blueprint={bp}
              showActions
              onCopy={handleCopy}
              onEdit={() => { /* inline edit modal — future */ }}
              onDelete={handleDelete}
              onClick={() => onViewDetail(bp)}
            />
          ))}
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowImport(false)}>
          <div className="glass-card rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-white">Import Blueprint</h3>
            <p className="text-xs text-muted-foreground">
              Paste a Factorio blueprint string below. Starts with 0 or 1.
            </p>
            <textarea
              value={importString}
              onChange={(e) => { setImportString(e.target.value); setImportPreview(null); setImportError(null) }}
              placeholder="0eNqdk21vg..."
              rows={4}
              className="w-full px-3 py-2 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50 font-mono resize-none"
            />
            {importError && (
              <p className="text-xs text-red-400">{importError}</p>
            )}
            {importPreview && (
              <div className="p-3 rounded-lg bg-white/5">
                <p className="text-xs text-muted-foreground">Preview ready — will parse on import</p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowImport(false); setImportString(''); setImportError(null); setImportPreview(null) }}
                className="px-4 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importString.trim()}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin inline" /> : null}
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
