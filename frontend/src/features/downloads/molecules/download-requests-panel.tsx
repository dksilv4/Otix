import { useState, useMemo } from 'react'
import {
  BookmarkCheck,
  Film,
  Tv,
  Gamepad2,
  Trash2,
  Search,
  ExternalLink,
  Layers,
  Radio,
  Clock,
  Server,
  Loader2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { showToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import {
  useMediaRequests,
  useDeleteMediaRequest,
  type MediaRequestItem,
} from '../use-media-requests'
import {
  filterMediaRequests,
  formatRequestRelativeTime,
  getRequestServiceLabel,
  getRequestStatusBadgeClass,
  getRequestStatusLabel,
} from '../utils/requests'

export interface DownloadRequestsPanelProps {
  className?: string
  serverId?: number
}

export const DownloadRequestsPanel = ({
  className,
  serverId,
}: DownloadRequestsPanelProps) => {
  const { data, isLoading } = useMediaRequests({ serverId })
  const deleteMutation = useDeleteMediaRequest()
  const [searchQuery, setSearchQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'movie' | 'show' | 'game'>('all')

  const items = useMemo(() => data?.items ?? [], [data?.items])

  const filteredItems = useMemo(
    () => filterMediaRequests(items, searchQuery, typeFilter),
    [items, searchQuery, typeFilter],
  )

  const counts = useMemo(() => {
    return {
      all: items.length,
      movie: items.filter((i) => i.mediaType === 'movie').length,
      show: items.filter((i) => i.mediaType === 'show').length,
      game: items.filter((i) => i.mediaType === 'game' || i.mediaType === 'usenet').length,
    }
  }, [items])

  const handleDelete = async (item: MediaRequestItem) => {
    try {
      await deleteMutation.mutateAsync(item.id)
      showToast({
        title: 'Request removed',
        description: `Removed "${item.title}" from your requests`,
        variant: 'info',
      })
    } catch {
      showToast({
        title: 'Failed to remove',
        description: 'Could not remove this request record',
        variant: 'error',
      })
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Sub-toolbar: Search & Category Filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          <button
            type="button"
            onClick={() => setTypeFilter('all')}
            className={cn(
              'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
              typeFilter === 'all'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            All Requests ({counts.all})
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('movie')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
              typeFilter === 'movie'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Film className="h-3 w-3" />
            <span>Movies ({counts.movie})</span>
          </button>
          <button
            type="button"
            onClick={() => setTypeFilter('show')}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
              typeFilter === 'show'
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <Tv className="h-3 w-3" />
            <span>TV Shows ({counts.show})</span>
          </button>
          {counts.game > 0 && (
            <button
              type="button"
              onClick={() => setTypeFilter('game')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all border border-white/[0.04]',
                typeFilter === 'game'
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <Gamepad2 className="h-3 w-3" />
              <span>Games ({counts.game})</span>
            </button>
          )}
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search requested media..."
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-xl bg-[var(--dk-surface-ghost)] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary border border-white/[0.04]"
          />
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center p-12 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin text-primary mb-2" />
          <p className="text-xs">Loading media requests…</p>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredItems.length === 0 && (
        <div className="rounded-2xl p-10 text-center bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] border border-white/[0.04] space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <BookmarkCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-foreground">
              {searchQuery ? 'No matching requests' : 'No requests yet'}
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `No requests match "${searchQuery}". Try a different keyword.`
                : 'When you request movies, TV shows, or releases from Otix to your node, they will be stored and tracked here.'}
            </p>
          </div>
        </div>
      )}

      {/* Request Cards Grid / List */}
      {!isLoading && filteredItems.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filteredItems.map((item) => {
            const isMovie = item.mediaType === 'movie'
            const isShow = item.mediaType === 'show'
            const isGame = item.mediaType === 'game' || item.mediaType === 'usenet'
            const serviceLabel = getRequestServiceLabel(item.service, item.mediaType)
            const statusLabel = getRequestStatusLabel(item.status)
            const statusBadgeClass = getRequestStatusBadgeClass(item.status)
            const relativeTime = formatRequestRelativeTime(item.createdAt)

            const detailLink =
              isMovie && item.tmdbId
                ? `/media/movie/tmdb:${item.tmdbId}`
                : isShow && item.tmdbId
                ? `/media/show/tmdb:${item.tmdbId}`
                : isShow && item.tvdbId
                ? `/media/show/tvdb:${item.tvdbId}`
                : isGame && item.mediaItemId
                ? `/media/game/${item.mediaItemId}`
                : null

            return (
              <div
                key={item.id}
                className="group relative flex flex-col justify-between p-4 rounded-2xl bg-[var(--dk-surface-glass)] backdrop-blur-xl shadow-[var(--dk-shadow-glass)] border border-white/[0.04] hover:border-white/[0.08] transition-all"
              >
                {/* Top Section */}
                <div className="flex items-start gap-3.5">
                  {/* Poster / Thumbnail */}
                  <div className="relative h-20 w-14 shrink-0 rounded-xl overflow-hidden bg-muted/40 shadow-md">
                    {item.posterUrl ? (
                      <img
                        src={item.posterUrl}
                        alt={item.title}
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground bg-muted/30">
                        {isMovie ? (
                          <Film className="h-5 w-5 text-primary" />
                        ) : isShow ? (
                          <Tv className="h-5 w-5 text-primary" />
                        ) : (
                          <Gamepad2 className="h-5 w-5 text-primary" />
                        )}
                      </div>
                    )}
                    <span className="absolute bottom-1 right-1 p-1 rounded-md bg-black/70 backdrop-blur-md text-[9px] text-foreground">
                      {isMovie ? (
                        <Film className="h-2.5 w-2.5" />
                      ) : isShow ? (
                        <Tv className="h-2.5 w-2.5" />
                      ) : (
                        <Gamepad2 className="h-2.5 w-2.5" />
                      )}
                    </span>
                  </div>

                  {/* Title & Metadata */}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4
                          className="font-bold text-sm text-foreground truncate"
                          title={item.title}
                        >
                          {item.title}
                        </h4>
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                          {item.year && <span>{item.year}</span>}
                          <span>·</span>
                          <span className="font-medium text-foreground/80">{serviceLabel}</span>
                          {item.serverName && (
                            <>
                              <span>·</span>
                              <span className="truncate max-w-[120px]">{item.serverName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Status Badge */}
                      <span
                        className={cn(
                          'shrink-0 px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide',
                          statusBadgeClass,
                        )}
                      >
                        {statusLabel}
                      </span>
                    </div>

                    {/* Node / Preset Badges */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px] text-muted-foreground">
                      {item.instanceName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/40 font-mono">
                          <Server className="h-2.5 w-2.5 text-primary" />
                          <span>{item.instanceName}</span>
                        </span>
                      )}
                      {item.qualityProfileName && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/40 font-mono">
                          <Layers className="h-2.5 w-2.5 text-primary" />
                          <span>{item.qualityProfileName}</span>
                        </span>
                      )}
                      {item.monitored && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-primary/10 text-primary font-medium">
                          <Radio className="h-2.5 w-2.5" />
                          <span>Monitored</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Date & Actions */}
                <div className="flex items-center justify-between pt-3 mt-3 border-t border-white/[0.04] text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span>Requested {relativeTime || 'recently'}</span>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {detailLink && (
                      <Link
                        to={detailLink as any}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-muted/40 hover:bg-muted text-foreground font-medium transition-colors"
                      >
                        <span>View</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    )}
                    <button
                      type="button"
                      onClick={() => handleDelete(item)}
                      disabled={deleteMutation.isPending}
                      className="p-1 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Delete request"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
