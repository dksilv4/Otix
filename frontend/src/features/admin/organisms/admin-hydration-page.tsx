import { useState, useCallback, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { useAdminHydration } from '../admin-queries'
import { Check, X, Minus, Loader2, AlertTriangle, Search, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'

const MEDIA_TYPE_TABS = [
  { value: undefined, label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
] as const

const MEDIA_TYPE_LABELS: Record<string, string> = {
  movie: 'Movie',
  show: 'TV',
  music: 'Music',
  game: 'Game',
}

const PAGE_SIZE = 50

// Column group definitions — keys match camelCase from the API response interceptor
const CORE_COLS = [
  { key: 'hasOverview', label: 'Overview' },
  { key: 'hasPoster', label: 'Poster' },
  { key: 'hasBackdrop', label: 'Backdrop' },
  { key: 'hasLogo', label: 'Logo' },
  { key: 'hasTextlessPoster', label: 'Txtlss Pstr' },
  { key: 'hasReleaseDate', label: 'Rel. Date' },
  { key: 'hasEmbedding', label: 'Embedding' },
  { key: 'hasOriginalLanguage', label: 'Lang' },
] as const

const RELATION_COLS = [
  { key: 'hasGenres', label: 'Genres' },
  { key: 'hasCredits', label: 'Credits' },
  { key: 'hasExternalIds', label: 'Ext IDs' },
  { key: 'hasExternalRatings', label: 'Ratings' },
  { key: 'hasVideos', label: 'Videos' },
  { key: 'hasAssets', label: 'Assets' },
  { key: 'hasReleases', label: 'Releases' },
  { key: 'hasKeywords', label: 'Keywords' },
  { key: 'hasCompanies', label: 'Companies' },
  { key: 'hasWatchProviders', label: 'Watch' },
] as const

const TYPE_SPECIFIC_COLS = [
  { key: 'hasRuntime', label: 'Runtime', type: 'movie' },
  { key: 'hasCollection', label: 'Collect.', type: 'movie' },
  { key: 'hasBudget', label: 'Budget', type: 'movie' },
  { key: 'hasShowStatus', label: 'Status', type: 'show' },
  { key: 'hasEpisodes', label: 'Episodes', type: 'show' },
  { key: 'hasPlatforms', label: 'Platforms', type: 'game' },
  { key: 'hasGameModes', label: 'Modes', type: 'game' },
  { key: 'hasAgeRatings', label: 'Age Rtgs', type: 'game' },
] as const

type HydrationRow = Record<string, boolean | null | string | number>

function HydrationIcon({ value }: { value: boolean | null }) {
  if (value === null) {
    return <Minus className="h-3.5 w-3.5 text-muted-foreground/30" />
  }
  if (value) {
    return <Check className="h-3.5 w-3.5 text-emerald-400" />
  }
  return <X className="h-3.5 w-3.5 text-red-400/60" />
}

function completenessColor(score: number): string {
  if (score <= 0.2) return 'bg-red-500'
  if (score <= 0.5) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export function AdminHydrationPage() {
  const { user } = useAuth()

  const [mediaType, setMediaType] = useState<string | undefined>()
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState('completeness_score')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')

  const handleSort = (column: string) => {
    if (sortBy === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(column)
      setSortDir('asc')
    }
    setPage(1)
  }

  const params = useMemo(() => {
    const p: Record<string, string | number> = {
      page,
      per_page: PAGE_SIZE,
      sort_by: sortBy,
      sort_dir: sortDir,
    }
    if (mediaType) p.media_type = mediaType
    if (search) p.search = search
    return p
  }, [mediaType, search, page, sortBy, sortDir])

  const queryKey = useMemo(
    () => ['admin', 'hydration', params],
    [params],
  )

  const { data, isLoading, isError, refetch } = useAdminHydration(params, queryKey)

  const visibleTypeCols = useMemo(() => {
    if (!mediaType) return TYPE_SPECIFIC_COLS
    return TYPE_SPECIFIC_COLS.filter((c) => c.type === mediaType)
  }, [mediaType])

  const handleSearch = useCallback(() => {
    setPage(1)
    setSearch(searchInput)
  }, [searchInput])

  const handleMediaTypeChange = (mt: string | undefined) => {
    setMediaType(mt)
    setPage(1)
  }

  if (!user?.isAdmin) return <Navigate to="/" />

  const total = data?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-6 lg:px-8">
      <Helmet>
        <title>Media Hydration — Otix Admin</title>
      </Helmet>

      <div className="mb-6 space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Media Hydration</h1>
        <p className="text-sm text-muted-foreground">
          Track data completeness for all media items
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-1 rounded-xl bg-[var(--dk-surface-ghost)] p-1">
          {MEDIA_TYPE_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleMediaTypeChange(tab.value)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium capitalize transition-colors"
              style={{
                background: mediaType === tab.value ? 'var(--dk-surface-base)' : 'transparent',
                color: mediaType === tab.value ? 'var(--foreground)' : 'var(--muted-foreground)',
                boxShadow: mediaType === tab.value ? 'var(--dk-shadow-sm)' : 'none',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Search title..."
              className="h-8 w-48 rounded-lg border border-[var(--dk-border)] bg-[var(--dk-surface-ghost)] pl-8 pr-2.5 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
          >
            Search
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <p className="mb-4 text-xs text-muted-foreground">
          Showing {data.items.length} of {data.total.toLocaleString()} media items
          {mediaType ? ` (${MEDIA_TYPE_LABELS[mediaType] ?? mediaType})` : ''}
          {search ? ` matching "${search}"` : ''}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center gap-3 py-16 text-center">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p className="text-sm text-muted-foreground">Failed to load hydration data</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {search ? `No media found matching "${search}"` : 'No media items yet'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="overflow-x-auto rounded-2xl bg-[var(--dk-surface-glass)]">
            <table className="w-full text-xs">
              <thead>
                <tr className="[&>th]:pb-2 [&>th]:pt-3 [&>th]:px-2">
                  <th className="sticky left-0 z-10 bg-[var(--dk-surface-glass)] backdrop-blur-xl pl-4 pr-2 text-left whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="inline-flex items-center gap-0.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Title
                      {sortBy === 'title' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </th>
                  <th className="text-center font-semibold text-muted-foreground whitespace-nowrap">
                    Type
                  </th>
                  <th className="text-center whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('completeness_score')}
                      className="inline-flex items-center gap-0.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Score
                      {sortBy === 'completeness_score' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </th>
                  <th className="w-px p-0" aria-hidden="true">
                    <div className="mx-2 h-3 w-px bg-foreground/10" />
                  </th>
                  <th colSpan={CORE_COLS.length} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Core
                  </th>
                  <th className="w-px p-0" aria-hidden="true">
                    <div className="mx-2 h-3 w-px bg-foreground/10" />
                  </th>
                  <th colSpan={RELATION_COLS.length} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                    Relations
                  </th>
                  {visibleTypeCols.length > 0 && (
                    <th className="w-px p-0" aria-hidden="true">
                      <div className="mx-2 h-3 w-px bg-foreground/10" />
                    </th>
                  )}
                  {visibleTypeCols.length > 0 && (
                    <th colSpan={visibleTypeCols.length} className="text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/50">
                      Type-Specific
                    </th>
                  )}
                  {visibleTypeCols.length > 0 && (
                    <th className="w-px p-0" aria-hidden="true">
                      <div className="mx-2 h-3 w-px bg-foreground/10" />
                    </th>
                  )}
                  <th className="pr-4 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => handleSort('synced_at')}
                      className="inline-flex items-center gap-0.5 font-semibold text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Synced
                      {sortBy === 'synced_at' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="h-2.5 w-2.5" />
                      )}
                    </button>
                  </th>
                </tr>
                <tr>
                  <th className="sticky left-0 z-10 bg-[var(--dk-surface-glass)] backdrop-blur-xl pl-4 pr-2 pb-3 pt-0" />
                  <th className="pb-3 pt-0" />
                  <th className="pb-3 pt-0" />
                  <th className="pb-3 pt-0" aria-hidden="true" />
                  {CORE_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="px-1.5 pb-3 pt-0 text-center whitespace-nowrap"
                      title={col.label}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="h-2.5 w-2.5" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="pb-3 pt-0" aria-hidden="true" />
                  {RELATION_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="px-1.5 pb-3 pt-0 text-center whitespace-nowrap"
                      title={col.label}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="h-2.5 w-2.5" />
                        )}
                      </button>
                    </th>
                  ))}
                  {visibleTypeCols.length > 0 && <th className="pb-3 pt-0" aria-hidden="true" />}
                  {visibleTypeCols.map((col) => (
                    <th
                      key={col.key}
                      className="px-1.5 pb-3 pt-0 text-center whitespace-nowrap"
                      title={`${col.label} (${col.type})`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="h-2.5 w-2.5" />
                        )}
                      </button>
                    </th>
                  ))}
                  {visibleTypeCols.length > 0 && <th className="pb-3 pt-0" aria-hidden="true" />}
                  <th className="pb-3 pt-0" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const row = item as unknown as HydrationRow
                  const score = item.completenessScore
                  return (
                    <tr
                      key={item.id}
                      className="group/row hover:bg-white/[0.04] transition-colors"
                    >
                      <td className="sticky left-0 z-10 bg-[var(--dk-surface-glass)] backdrop-blur-xl group-hover/row:bg-white/[0.04] transition-colors pl-4 pr-2 py-2 max-w-[200px]">
                        <Link
                          to="/media/$mediaType/$mediaId"
                          params={{ mediaType: item.mediaType as any, mediaId: String(item.id) }}
                          className="text-xs font-medium text-foreground hover:text-primary truncate block"
                        >
                          {item.title}
                        </Link>
                      </td>

                      <td className="px-2 py-2 text-center">
                        <span className="rounded-md bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {MEDIA_TYPE_LABELS[item.mediaType] ?? item.mediaType}
                        </span>
                      </td>

                      <td className="px-2 py-2 text-center">
                        <div className="flex items-center gap-1.5">
                          <div className="h-1.5 w-12 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className={cn('h-full rounded-full transition-colors', completenessColor(score))}
                              style={{ width: `${Math.round(score * 100)}%` }}
                            />
                          </div>
                          <span className="text-[10px] tabular-nums text-muted-foreground w-7">
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                      </td>

                      <td className="p-0" aria-hidden="true" />

                      {CORE_COLS.map((col) => (
                        <td key={col.key} className="px-1.5 py-2 text-center">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      <td className="p-0" aria-hidden="true" />

                      {RELATION_COLS.map((col) => (
                        <td key={col.key} className="px-1.5 py-2 text-center">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      {visibleTypeCols.length > 0 && <td className="p-0" aria-hidden="true" />}

                      {visibleTypeCols.map((col) => (
                        <td key={col.key} className="px-1.5 py-2 text-center">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      {visibleTypeCols.length > 0 && <td className="p-0" aria-hidden="true" />}

                      <td className="pr-4 py-2 text-right text-[10px] text-muted-foreground/50 whitespace-nowrap">
                        {item.syncedAt
                          ? new Date(item.syncedAt).toLocaleDateString()
                          : '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-30 transition-colors"
              >
                Previous
              </button>
              <span className="text-xs text-muted-foreground">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="rounded-lg bg-[var(--dk-surface-ghost)] px-3 py-1.5 text-xs font-medium text-foreground hover:bg-[var(--dk-surface-ghost-hover)] disabled:opacity-30 transition-colors"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
