import { useState, useEffect, useCallback } from 'react'
import { Search, Upload, Loader2, AlertCircle, Heart, Download } from 'lucide-react'
import { BlueprintCard } from '../../molecules/media-game-blueprint-card'

interface CommunityBlueprint {
  id: string
  author_name: string
  title: string
  description: string
  parsed_data: any
  tags: string[]
  downloads: number
  likes_count: number
  user_has_liked: boolean
  created_at: string
}

interface Props {
  pluginId: string
  onViewDetail: (blueprint: any) => void
}

export function BlueprintCommunity({ pluginId, onViewDetail }: Props) {
  const [blueprints, setBlueprints] = useState<CommunityBlueprint[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [showUpload, setShowUpload] = useState(false)
  const [vaultBlueprints, setVaultBlueprints] = useState<any[]>([])

  const desktopAPI = (window as any).desktopAPI

  const loadCommunity = useCallback(async () => {
    if (!desktopAPI?.plugin?.callData) return
    setLoading(true)
    setError(null)
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.list', {
        q: search || undefined,
        sort,
        page,
      })
      if (res?.success) {
        setBlueprints(res.results || [])
        setTotal(res.count || 0)
      } else {
        setError(res?.error || 'Community unavailable')
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load community blueprints')
    } finally {
      setLoading(false)
    }
  }, [pluginId, search, sort, page, desktopAPI])

  useEffect(() => { loadCommunity() }, [loadCommunity])

  const loadVaultForUpload = async () => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'getBlueprints', {})
      if (res?.success) setVaultBlueprints(res.blueprints || [])
    } catch { /* ignore */ }
  }

  const handleUpload = async (blueprintId: string, title: string, description: string, tags: string[]) => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.upload', {
        blueprintId, title, description, tags,
      })
      if (res?.success) {
        setShowUpload(false)
        loadCommunity()
      }
    } catch { /* ignore */ }
  }

  const handleLike = async (blueprintId: string) => {
    if (!desktopAPI?.plugin?.callData) return
    try {
      const res = await desktopAPI.plugin.callData(pluginId, 'community.like', { id: blueprintId })
      if (res?.success) {
        setBlueprints(prev => prev.map(bp =>
          bp.id === blueprintId
            ? { ...bp, user_has_liked: res.liked, likes_count: res.liked ? bp.likes_count + 1 : bp.likes_count - 1 }
            : bp
        ))
      }
    } catch { /* ignore */ }
  }

  const sortOptions = [
    { value: 'recent', label: 'Recent' },
    { value: 'popular', label: 'Most Downloaded' },
    { value: 'trending', label: 'Trending' },
  ]

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            placeholder="Search community blueprints..."
            className="w-full h-8 pl-8 pr-3 text-xs rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>
        <div className="flex gap-1">
          {sortOptions.map(opt => (
            <button
              key={opt.value}
              onClick={() => { setSort(opt.value); setPage(1) }}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-lg transition-all ${
                sort === opt.value
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-white hover:bg-white/5'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => { setShowUpload(true); loadVaultForUpload() }}
          className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium rounded-lg bg-primary/15 text-primary hover:bg-primary/25 transition-all"
        >
          <Upload className="h-3.5 w-3.5" /> Share
        </button>
      </div>

      {/* Error state */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-500/10 text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty */}
      {!loading && !error && blueprints.length === 0 && (
        <div className="text-center py-12">
          <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No community blueprints yet</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Be the first to share a blueprint!
          </p>
        </div>
      )}

      {/* Grid */}
      {!loading && blueprints.length > 0 && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {blueprints.map((bp) => {
              const cardBp = {
                ...bp.parsed_data,
                id: bp.id,
                label: bp.title,
                description: bp.description,
                tags: bp.tags,
                created_at: bp.created_at,
              }
              return (
                <div key={bp.id} className="relative">
                  <BlueprintCard
                    blueprint={cardBp}
                    onClick={() => onViewDetail({ ...cardBp, _community: bp })}
                  />
                  {/* Community metadata overlay */}
                  <div className="flex items-center gap-3 px-3.5 py-2 text-[10px] text-muted-foreground">
                    <span>{bp.author_name}</span>
                    <span className="flex items-center gap-1">
                      <Download className="h-3 w-3" /> {bp.downloads}
                    </span>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleLike(bp.id) }}
                      className={`flex items-center gap-1 transition-all ${
                        bp.user_has_liked ? 'text-red-400' : 'hover:text-white'
                      }`}
                    >
                      <Heart className={`h-3 w-3 ${bp.user_has_liked ? 'fill-current' : ''}`} />
                      {bp.likes_count}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Pagination */}
          {total > 24 && (
            <div className="flex items-center justify-center gap-2 pt-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/10 text-muted-foreground disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {Math.ceil(total / 24)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 24)}
                className="px-3 py-1.5 text-xs rounded-lg hover:bg-white/10 text-muted-foreground disabled:opacity-30"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowUpload(false)}>
          <div className="glass-card rounded-xl p-6 max-w-lg w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-medium text-white">Share to Community</h3>
            <p className="text-xs text-muted-foreground">Select a blueprint from your vault to publish.</p>
            {vaultBlueprints.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">
                No blueprints in vault. Import one first.
              </p>
            ) : (
              <div className="max-h-48 overflow-y-auto space-y-2">
                {vaultBlueprints.map((bp: any) => (
                  <button
                    key={bp.id}
                    onClick={() => handleUpload(bp.id, bp.parsed_data?.label || bp.label, '', [])}
                    className="w-full text-left p-2.5 rounded-lg hover:bg-white/5 text-xs text-muted-foreground hover:text-white transition-all"
                  >
                    {bp.parsed_data?.label || bp.label}
                  </button>
                ))}
              </div>
            )}
            <div className="flex justify-end">
              <button
                onClick={() => setShowUpload(false)}
                className="px-4 py-2 text-xs rounded-lg hover:bg-white/10 text-muted-foreground transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
