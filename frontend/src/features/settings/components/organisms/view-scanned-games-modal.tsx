import { useState, useEffect, useMemo } from 'react'
import { Search, Gamepad2, Disc, Loader2, Sparkles } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import {
  type ScannedGameItem,
  fetchScannedGamesList,
  formatBytes,
} from '../../utils/scanned-summary'
import { cn } from '@/lib/utils'

export interface ViewScannedGamesModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  nodeId?: number | null
  nodeName?: string
}

export const ViewScannedGamesModal = ({
  open,
  onOpenChange,
  nodeId,
  nodeName = 'Node',
}: ViewScannedGamesModalProps) => {
  const [games, setGames] = useState<ScannedGameItem[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'installed' | 'iso'>('all')

  useEffect(() => {
    if (!open) return
    let active = true
    setLoading(true)
    fetchScannedGamesList(nodeId)
      .then((items) => {
        if (active) {
          setGames(items)
          setLoading(false)
        }
      })
      .catch(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [open, nodeId])

  const filteredGames = useMemo(() => {
    const q = search.trim().toLowerCase()
    return games.filter((g) => {
      if (filter === 'installed' && g.isIso) return false
      if (filter === 'iso' && !g.isIso) return false
      if (q) {
        return (
          g.title.toLowerCase().includes(q) ||
          g.path.toLowerCase().includes(q) ||
          (g.format && g.format.toLowerCase().includes(q))
        )
      }
      return true
    })
  }, [games, search, filter])

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Scanned Games — ${nodeName}`}
      description={`Browse indexed game libraries and disk images discovered on this node.`}
      className="max-w-2xl max-h-[85vh] flex flex-col"
    >
      <div className="flex flex-col gap-3 pt-2 min-h-0 flex-1">
        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 shrink-0">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search scanned titles or paths…"
              className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary/40 transition-all"
            />
          </div>

          <div className="flex items-center gap-1 shrink-0 self-end sm:self-auto">
            {(['all', 'installed', 'iso'] as const).map((tab) => {
              const active = filter === tab
              const label = tab === 'all' ? `All (${games.length})` : tab === 'installed' ? 'Games' : 'ISOs'
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilter(tab)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer capitalize',
                    active
                      ? 'bg-primary text-primary-foreground shadow-xs'
                      : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                  )}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto space-y-2 min-h-[260px] max-h-[50vh] pr-1 scrollbar-thin">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              <span className="text-xs">Loading scanned games…</span>
            </div>
          ) : filteredGames.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-2 text-center text-muted-foreground p-6 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              {search ? (
                <>
                  <Search className="h-6 w-6 text-muted-foreground/60" />
                  <p className="text-xs">No scanned games matched &ldquo;{search}&rdquo;.</p>
                </>
              ) : (
                <>
                  <Gamepad2 className="h-8 w-8 text-primary/40 mb-1" />
                  <p className="text-sm font-semibold text-foreground">No Games Indexed Yet</p>
                  <p className="text-xs max-w-sm">
                    Configure your monitored library paths and click &ldquo;Scan Now&rdquo; to populate games from this node.
                  </p>
                </>
              )}
            </div>
          ) : (
            filteredGames.map((game) => (
              <div
                key={`${game.id}-${game.path}`}
                className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] border border-white/[0.04] transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  {game.posterUrl ? (
                    <img
                      src={game.posterUrl}
                      alt={game.title}
                      className="h-12 w-9 rounded-lg object-cover bg-[var(--dk-surface-base)] shrink-0 shadow-xs"
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex h-12 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                      {game.isIso ? <Disc className="h-5 w-5" /> : <Gamepad2 className="h-5 w-5" />}
                    </div>
                  )}

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-semibold text-foreground truncate max-w-xs sm:max-w-md">
                        {game.title}
                      </h4>
                      {game.matched && (
                        <span className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-primary/15 text-primary shrink-0 flex items-center gap-1">
                          <Sparkles className="h-2.5 w-2.5" />
                          <span>Matched</span>
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate max-w-xs sm:max-w-md" title={game.path}>
                      {game.path}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0 text-right">
                  <div className="space-y-0.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-base)] text-muted-foreground border border-white/[0.04]">
                      {game.format}
                    </span>
                    {Boolean(game.sizeBytes) && (
                      <div className="text-[10px] text-muted-foreground">
                        {formatBytes(game.sizeBytes)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-3 border-t border-white/[0.04] shrink-0 text-xs text-muted-foreground">
          <span>{filteredGames.length} of {games.length} games displayed</span>
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs h-7 px-3"
          >
            Close
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
