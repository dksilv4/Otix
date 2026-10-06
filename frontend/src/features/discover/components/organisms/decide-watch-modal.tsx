import { useEffect, useRef, useState } from 'react'
import { router } from '@/lib/router'
import { useQuery } from '@tanstack/react-query'
import { Ban, Dices, Loader2, RefreshCw, Sparkles } from 'lucide-react'
import { cn, heroImage } from '@/lib/utils'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { showToast } from '@ui/molecules/toast'
import { useAuth } from '@auth/hooks/use-auth'
import { DiscoverMediaCard } from '@discover/components/molecules/discover-media-card'
import { mediaQueries, useBlockRecommendation, type DecideRuntime, type MediaItemSummary } from '@media/queries/media-queries'
import { apiClient } from '@/lib/api/client'
import type { GenreOption } from '@/features/genre/types'
import { MEDIA_TYPE_LABEL } from '@/constants/media'

export interface DecideWatchModalProps {
  onClose: () => void
  isExiting?: boolean
}

type MediaTypeFilter = 'movie' | 'show' | 'game'

const RUNTIME_OPTIONS: Array<{ id: DecideRuntime | 'any'; label: string }> = [
  { id: 'any', label: 'Any length' },
  { id: 'short', label: 'Short' },
  { id: 'medium', label: 'Medium' },
  { id: 'long', label: 'Long' },
]

const TYPE_OPTIONS: Array<{ id: MediaTypeFilter; label: string }> = [
  { id: 'movie', label: 'Movies' },
  { id: 'show', label: 'Shows' },
  { id: 'game', label: 'Games' },
]

import { yearOf } from '@/features/discover/utils/decide'

export const DecideWatchModal = ({ onClose, isExiting }: DecideWatchModalProps) => {
  const { isAuthenticated, isLoading: authLoading } = useAuth()
  const [mediaTypes, setMediaTypes] = useState<MediaTypeFilter[]>(['movie', 'show'])
  const [runtime, setRuntime] = useState<DecideRuntime | 'any'>('any')
  const [genreIds, setGenreIds] = useState<Array<string | number>>([])
  const [seed, setSeed] = useState(() => Date.now() % 1_000_000)
  const [heroOverride, setHeroOverride] = useState<MediaItemSummary | null>(null)
  const [showAllGenres, setShowAllGenres] = useState(false)
  const canDismissRef = useRef(false)

  useEffect(() => {
    canDismissRef.current = false
    const timer = window.setTimeout(() => {
      canDismissRef.current = true
    }, 350)
    return () => window.clearTimeout(timer)
  }, [])

  const requestClose = () => {
    if (!canDismissRef.current) return
    onClose()
  }

  const { data: genres = [] } = useQuery<GenreOption[]>({
    queryKey: ['genres', 'all'],
    queryFn: async () => {
      const { data } = await apiClient.get<GenreOption[]>('/media/genres')
      return data
    },
    staleTime: 1000 * 60 * 60 * 24,
  })

  const uniqueGenres = (() => {
    const seen = new Set<string>()
    return genres.filter((g) => {
      const slug = g.slug?.toLowerCase()
      if (!slug || seen.has(slug)) return false
      seen.add(slug)
      return true
    })
  })()

  const visibleGenres = showAllGenres ? uniqueGenres : uniqueGenres.slice(0, 8)

  const decideQuery = useQuery({
    ...mediaQueries.decide({
      mediaTypes,
      genreIds: genreIds.length ? genreIds : undefined,
      runtime: runtime === 'any' ? null : runtime,
      seed,
      limit: 5,
    }),
    enabled: isAuthenticated && mediaTypes.length > 0,
  })

  const [blockedIds, setBlockedIds] = useState<Set<number | string>>(() => new Set())
  const blockMutation = useBlockRecommendation()

  // Clear local hero override whenever a fresh server pick arrives.
  const pickId = decideQuery.data?.pick?.id
  const pickIdRef = useRef(pickId)
  useEffect(() => {
    if (pickId !== pickIdRef.current) {
      pickIdRef.current = pickId
      setHeroOverride(null)
    }
  }, [pickId])

  const serverPick = decideQuery.data?.pick ?? null
  const shortlist = decideQuery.data?.shortlist ?? []

  const unblockedPick = serverPick && !blockedIds.has(serverPick.id) ? serverPick : null
  const unblockedShortlist = shortlist.filter((item) => !blockedIds.has(item.id))

  const activeHeroOverride =
    heroOverride && !blockedIds.has(heroOverride.id) ? heroOverride : null
  const hero = activeHeroOverride ?? unblockedPick ?? unblockedShortlist[0] ?? null
  const rest = activeHeroOverride
    ? [unblockedPick, ...unblockedShortlist].filter(
        (item): item is MediaItemSummary => !!item && item.id !== hero?.id,
      )
    : unblockedPick
      ? unblockedShortlist
      : unblockedShortlist.slice(1)

  const handleBlock = async (item: MediaItemSummary) => {
    setBlockedIds((prev) => new Set(prev).add(item.id))
    try {
      await blockMutation.mutateAsync({ mediaId: item.id, mediaType: item.mediaType })
      showToast({
        title: 'Blocked from recommendations',
        description: `"${item.title}" will no longer be recommended.`,
        variant: 'default',
      })
    } catch {
      showToast({
        title: 'Failed to block',
        description: `Could not block "${item.title}".`,
        variant: 'error',
      })
      setBlockedIds((prev) => {
        const next = new Set(prev)
        next.delete(item.id)
        return next
      })
      return
    }

    if (hero?.id === item.id) {
      const remainingCandidates = rest.filter((c) => !blockedIds.has(c.id) && c.id !== item.id)
      if (remainingCandidates.length > 0) {
        setHeroOverride(remainingCandidates[0])
      } else {
        pickAgain()
      }
    }
  }

  const toggleType = (type: MediaTypeFilter) => {
    setMediaTypes((prev) => {
      if (prev.includes(type)) {
        if (prev.length === 1) return prev
        return prev.filter((t) => t !== type)
      }
      return [...prev, type]
    })
    setSeed((s) => s + 1)
  }

  const toggleGenre = (id: string | number) => {
    setGenreIds((prev) =>
      prev.some((g) => String(g) === String(id))
        ? prev.filter((g) => String(g) !== String(id))
        : [...prev, id],
    )
    setSeed((s) => s + 1)
  }

  const pickAgain = () => {
    setHeroOverride(null)
    setSeed((s) => s + 1)
  }

  const openTitle = (item: MediaItemSummary | null) => {
    if (!item) return
    canDismissRef.current = true
    onClose()
    void router.navigate({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: item.mediaType || 'movie', mediaId: String(item.id) },
    })
  }

  return (
    <DkDialog
      open={!isExiting}
      onOpenChange={(open) => {
        if (!open) requestClose()
      }}
      title="Decide for me"
      description="One pick from your taste, plus a shortlist. Tweak filters and run it again."
      className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col"
    >
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto pt-1 pb-1">
        {/* Filters */}
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const active = mediaTypes.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleType(opt.id)}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-white text-black'
                      : 'bg-white/5 text-white/70 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {RUNTIME_OPTIONS.map((opt) => {
              const active = runtime === opt.id
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setRuntime(opt.id)
                    setSeed((s) => s + 1)
                  }}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                    active
                      ? 'bg-white/20 text-white'
                      : 'bg-white/5 text-white/60 hover:bg-white/10 hover:text-white',
                  )}
                >
                  {opt.label}
                </button>
              )
            })}
          </div>
          {visibleGenres.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {visibleGenres.map((g) => {
                const active = genreIds.some((id) => String(id) === String(g.id))
                return (
                  <button
                    key={String(g.id)}
                    type="button"
                    onClick={() => toggleGenre(g.id)}
                    className={cn(
                      'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                      active
                        ? 'bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/40'
                        : 'bg-white/5 text-white/55 hover:bg-white/10 hover:text-white',
                    )}
                  >
                    {g.name}
                  </button>
                )
              })}
              {!showAllGenres && uniqueGenres.length > 8 && (
                <button
                  type="button"
                  onClick={() => setShowAllGenres(true)}
                  className="rounded-full px-3 py-1.5 text-xs font-medium text-white/50 hover:text-white"
                >
                  More
                </button>
              )}
            </div>
          )}
        </div>

        {authLoading ? (
          <div className="flex h-48 items-center justify-center text-white/50">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : !isAuthenticated ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 px-6 py-10 text-center">
            <Dices className="h-8 w-8 text-white/40" />
            <p className="text-sm text-white/70">Sign in so we can pick from your taste profile.</p>
            <DkButton
              size="sm"
              onClick={() => {
                canDismissRef.current = true
                onClose()
                void router.navigate({ to: '/auth/login' })
              }}
            >
              Sign in
            </DkButton>
          </div>
        ) : decideQuery.isLoading ? (
          <div className="flex h-56 flex-col items-center justify-center gap-3 text-white/50">
            <Loader2 className="h-6 w-6 animate-spin" />
            <p className="text-sm">Finding something for you…</p>
          </div>
        ) : decideQuery.isError ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 px-6 py-10 text-center">
            <p className="text-sm text-white/70">Couldn’t decide right now.</p>
            <DkButton size="sm" variant="glass" onClick={() => decideQuery.refetch()}>
              Try again
            </DkButton>
          </div>
        ) : !hero ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/5 px-6 py-10 text-center">
            <p className="text-sm text-white/70">
              Nothing matched those filters. Loosen them and pick again.
            </p>
            <DkButton size="sm" variant="glass" leftIcon={RefreshCw} onClick={pickAgain}>
              Pick again
            </DkButton>
          </div>
        ) : (
          <>
            {decideQuery.data?.coldStart && (
              <p className="flex items-center gap-1.5 text-xs text-amber-200/80">
                <Sparkles className="h-3.5 w-3.5" />
                Still learning your taste — here’s what’s popular under these filters.
              </p>
            )}

            <div className="flex flex-col gap-4 sm:flex-row sm:items-stretch">
              <button
                type="button"
                onClick={() => hero && openTitle(hero)}
                className="relative mx-auto aspect-[2/3] w-40 shrink-0 overflow-hidden rounded-2xl bg-black/40 shadow-xl sm:mx-0 sm:w-44"
              >
                {(hero.posterUrl || hero.textlessPosterUrl) && (
                  <img
                    src={heroImage(hero.textlessPosterUrl || hero.posterUrl || '')}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 text-center sm:text-left">
                <div>
                  <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-300/90">
                    Watch this
                  </p>
                  <h3 className="text-xl font-bold leading-tight text-white sm:text-2xl">
                    {hero.title}
                  </h3>
                  <p className="mt-1 text-sm text-white/55">
                    {[
                      MEDIA_TYPE_LABEL[hero.mediaType as keyof typeof MEDIA_TYPE_LABEL] ??
                        hero.mediaType,
                      yearOf(hero),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <div className="flex flex-wrap justify-center gap-2 sm:justify-start">
                  <DkButton size="md" onClick={() => hero && openTitle(hero)} disabled={!hero}>
                    Open
                  </DkButton>
                  <DkButton size="md" variant="glass" leftIcon={RefreshCw} onClick={pickAgain}>
                    Pick again
                  </DkButton>
                  <DkButton
                    size="md"
                    variant="ghost"
                    leftIcon={Ban}
                    className="text-white/60 hover:text-red-400 hover:bg-red-500/10"
                    disabled={blockMutation.isPending}
                    onClick={() => handleBlock(hero)}
                    title="Block this title from future recommendations"
                  >
                    Don't recommend
                  </DkButton>
                </div>
              </div>
            </div>

            {rest.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/40">
                  Or try one of these
                </p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {rest.slice(0, 4).map((item) => (
                    <div key={item.id} className="group relative">
                      <button
                        type="button"
                        className="w-full text-left"
                        onClick={() => setHeroOverride(item)}
                      >
                        <DiscoverMediaCard item={item} showTypeBadge interactive={false} />
                      </button>
                      <button
                        type="button"
                        aria-label={`Block ${item.title} from recommendations`}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleBlock(item)
                        }}
                        className="absolute right-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/60 opacity-0 backdrop-blur-md transition-all hover:bg-red-500 hover:text-white group-hover:opacity-100 focus:opacity-100"
                        title="Don't recommend this"
                      >
                        <Ban className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </DkDialog>
  )
};
