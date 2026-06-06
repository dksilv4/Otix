// TODO: Review this file
import { useState, useCallback, useMemo } from 'react'
import { Helmet } from 'react-helmet-async'
import { Link, Navigate } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { useAdminHydration } from '../admin-queries'
import { Check, X, Minus, Loader2, AlertTriangle, Search, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MEDIA_TYPE_LABEL } from '@/constants/media'
import './admin-hydration-page.scss'

const MEDIA_TYPE_TABS = [
  { value: undefined, label: 'All' },
  { value: 'movie', label: 'Movies' },
  { value: 'show', label: 'Shows' },
  { value: 'game', label: 'Games' },
  { value: 'music', label: 'Music' },
] as const

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
  if (score <= 0.2) return 'dk-admin-hydration__score-fill--low'
  if (score <= 0.5) return 'dk-admin-hydration__score-fill--mid'
  return 'dk-admin-hydration__score-fill--high'
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
    <div className="dk-admin-hydration">
      <Helmet>
        <title>Media Hydration — Otix Admin</title>
      </Helmet>

      <div className="dk-admin-hydration__header">
        <h1 className="dk-admin-hydration__title">Media Hydration</h1>
        <p className="dk-admin-hydration__subtitle">
          Track data completeness for all media items
        </p>
      </div>

      {/* Filters */}
      <div className="dk-admin-hydration__filters">
        <div className="dk-admin-hydration__tabs">
          {MEDIA_TYPE_TABS.map((tab) => (
            <button
              key={tab.label}
              type="button"
              onClick={() => handleMediaTypeChange(tab.value)}
              className={cn(
                'dk-admin-hydration__tab',
                mediaType === tab.value && 'dk-admin-hydration__tab--active',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="dk-admin-hydration__search">
          <div className="dk-admin-hydration__search-field">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
              placeholder="Search title..."
              className="dk-admin-hydration__search-input"
            />
          </div>
          <button
            type="button"
            onClick={handleSearch}
            className="dk-admin-hydration__search-btn"
          >
            Search
          </button>
        </div>
      </div>

      {/* Stats bar */}
      {data && (
        <p className="dk-admin-hydration__stats">
          Showing {data.items.length} of {data.total.toLocaleString()} media items
          {mediaType ? ` (${MEDIA_TYPE_LABEL[mediaType] ?? mediaType})` : ''}
          {search ? ` matching "${search}"` : ''}
        </p>
      )}

      {/* Content */}
      {isLoading ? (
        <div className="dk-admin-hydration__state dk-admin-hydration__state--loading">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <div className="dk-admin-hydration__state dk-admin-hydration__state--error">
          <AlertTriangle className="h-8 w-8 text-amber-400" />
          <p className="dk-admin-hydration__state-text">Failed to load hydration data</p>
          <button
            type="button"
            onClick={() => refetch()}
            className="dk-admin-hydration__retry-btn"
          >
            Retry
          </button>
        </div>
      ) : !data || data.items.length === 0 ? (
        <div className="dk-admin-hydration__state dk-admin-hydration__state--empty">
          <p className="dk-admin-hydration__state-text">
            {search ? `No media found matching "${search}"` : 'No media items yet'}
          </p>
        </div>
      ) : (
        <>
          {/* Table */}
          <div className="dk-admin-hydration__table-wrapper">
            <table className="dk-admin-hydration__table">
              <thead>
                <tr>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sticky-title">
                    <button
                      type="button"
                      onClick={() => handleSort('title')}
                      className="dk-admin-hydration__sort-btn"
                    >
                      Title
                      {sortBy === 'title' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="dk-admin-hydration__sort-spacer" />
                      )}
                    </button>
                  </th>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--label">
                    Type
                  </th>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--center">
                    <button
                      type="button"
                      onClick={() => handleSort('completeness_score')}
                      className="dk-admin-hydration__sort-btn"
                    >
                      Score
                      {sortBy === 'completeness_score' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="dk-admin-hydration__sort-spacer" />
                      )}
                    </button>
                  </th>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--divider" aria-hidden="true">
                    <div className="dk-admin-hydration__divider" />
                  </th>
                  <th colSpan={CORE_COLS.length} className="dk-admin-hydration__th dk-admin-hydration__th--section">
                    Core
                  </th>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--divider" aria-hidden="true">
                    <div className="dk-admin-hydration__divider" />
                  </th>
                  <th colSpan={RELATION_COLS.length} className="dk-admin-hydration__th dk-admin-hydration__th--section">
                    Relations
                  </th>
                  {visibleTypeCols.length > 0 && (
                    <th className="dk-admin-hydration__th dk-admin-hydration__th--divider" aria-hidden="true">
                      <div className="dk-admin-hydration__divider" />
                    </th>
                  )}
                  {visibleTypeCols.length > 0 && (
                    <th colSpan={visibleTypeCols.length} className="dk-admin-hydration__th dk-admin-hydration__th--section">
                      Type-Specific
                    </th>
                  )}
                  {visibleTypeCols.length > 0 && (
                    <th className="dk-admin-hydration__th dk-admin-hydration__th--divider" aria-hidden="true">
                      <div className="dk-admin-hydration__divider" />
                    </th>
                  )}
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--synced">
                    <button
                      type="button"
                      onClick={() => handleSort('synced_at')}
                      className="dk-admin-hydration__sort-btn"
                    >
                      Synced
                      {sortBy === 'synced_at' ? (
                        sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                      ) : (
                        <span className="dk-admin-hydration__sort-spacer" />
                      )}
                    </button>
                  </th>
                </tr>
                <tr>
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--empty-sticky" />
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" />
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" />
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" aria-hidden="true" />
                  {CORE_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="dk-admin-hydration__th dk-admin-hydration__th--col"
                      title={col.label}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="dk-admin-hydration__sort-btn--small"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="dk-admin-hydration__sort-spacer" />
                        )}
                      </button>
                    </th>
                  ))}
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" aria-hidden="true" />
                  {RELATION_COLS.map((col) => (
                    <th
                      key={col.key}
                      className="dk-admin-hydration__th dk-admin-hydration__th--col"
                      title={col.label}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="dk-admin-hydration__sort-btn--small"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="dk-admin-hydration__sort-spacer" />
                        )}
                      </button>
                    </th>
                  ))}
                  {visibleTypeCols.length > 0 && <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" aria-hidden="true" />}
                  {visibleTypeCols.map((col) => (
                    <th
                      key={col.key}
                      className="dk-admin-hydration__th dk-admin-hydration__th--col"
                      title={`${col.label} (${col.type})`}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.key)}
                        className="dk-admin-hydration__sort-btn--small"
                      >
                        {col.label}
                        {sortBy === col.key ? (
                          sortDir === 'asc' ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />
                        ) : (
                          <span className="dk-admin-hydration__sort-spacer" />
                        )}
                      </button>
                    </th>
                  ))}
                  {visibleTypeCols.length > 0 && <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" aria-hidden="true" />}
                  <th className="dk-admin-hydration__th dk-admin-hydration__th--sub" />
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const row = item as unknown as HydrationRow
                  const score = item.completenessScore
                  return (
                    <tr
                      key={item.id}
                      className="dk-admin-hydration__row"
                    >
                      <td className="dk-admin-hydration__cell dk-admin-hydration__cell--title">
                        <Link
                          to="/media/$mediaType/$mediaId"
                          params={{ mediaType: item.mediaType as any, mediaId: String(item.id) }}
                          className="dk-admin-hydration__title-link"
                        >
                          {item.title}
                        </Link>
                      </td>

                      <td className="dk-admin-hydration__cell dk-admin-hydration__cell--type">
                        <span className="dk-admin-hydration__type-badge">
                          {MEDIA_TYPE_LABEL[item.mediaType] ?? item.mediaType}
                        </span>
                      </td>

                      <td className="dk-admin-hydration__score-cell">
                        <div className="dk-admin-hydration__score-wrap">
                          <div className="dk-admin-hydration__score-bar">
                            <div
                              className={cn('dk-admin-hydration__score-fill', completenessColor(score))}
                              style={{ width: `${Math.round(score * 100)}%` }}
                            />
                          </div>
                          <span className="dk-admin-hydration__score-label">
                            {Math.round(score * 100)}%
                          </span>
                        </div>
                      </td>

                      <td className="dk-admin-hydration__cell dk-admin-hydration__cell--divider" aria-hidden="true" />

                      {CORE_COLS.map((col) => (
                        <td key={col.key} className="dk-admin-hydration__cell dk-admin-hydration__cell--icon">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      <td className="dk-admin-hydration__cell dk-admin-hydration__cell--divider" aria-hidden="true" />

                      {RELATION_COLS.map((col) => (
                        <td key={col.key} className="dk-admin-hydration__cell dk-admin-hydration__cell--icon">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      {visibleTypeCols.length > 0 && <td className="dk-admin-hydration__cell dk-admin-hydration__cell--divider" aria-hidden="true" />}

                      {visibleTypeCols.map((col) => (
                        <td key={col.key} className="dk-admin-hydration__cell dk-admin-hydration__cell--icon">
                          <HydrationIcon value={row[col.key] as boolean | null} />
                        </td>
                      ))}

                      {visibleTypeCols.length > 0 && <td className="dk-admin-hydration__cell dk-admin-hydration__cell--divider" aria-hidden="true" />}

                      <td className="dk-admin-hydration__cell dk-admin-hydration__cell--synced">
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
            <div className="dk-admin-hydration__pagination">
              <button
                type="button"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
                className="dk-admin-hydration__page-btn"
              >
                Previous
              </button>
              <span className="dk-admin-hydration__page-info">
                Page {page} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages}
                className="dk-admin-hydration__page-btn"
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
