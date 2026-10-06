import { useCallback, useState } from 'react'
import { Compass, RefreshCw } from 'lucide-react'

interface DiscoverEmptyFeedProps {
  /** Re-runs the hero fetch (e.g. after the catalog gets seeded). */
  onRefresh?: () => void | Promise<void>
}

/**
 * Page-level filler for the rare case where the catalog has no content at all.
 *
 * Shown from DiscoverHero's resolved-empty branch. The hero pool is the
 * broadest catalog query (needs artwork, no date window), so an empty hero
 * implies every media section would be empty too — making this the single
 * correct signal for a truly empty discover feed.
 */
export const DiscoverEmptyFeed = ({ onRefresh }: DiscoverEmptyFeedProps) => {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = useCallback(async () => {
    if (!onRefresh) return
    setRefreshing(true)
    try {
      await onRefresh()
    } finally {
      setRefreshing(false)
    }
  }, [onRefresh])

  return (
    <section
      id="discover-empty-feed"
      className="relative flex min-h-[calc(100dvh-10rem)] w-full flex-col items-center justify-center gap-5 px-6 py-16 text-center"
    >
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5">
        <Compass className="h-8 w-8 text-white/30" aria-hidden />
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-white/90">Nothing to explore yet</h2>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-white/45">
          The catalog hasn&apos;t been populated, so there&apos;s nothing to discover right now.
          Trending and popular picks will show up here as soon as titles are added.
        </p>
      </div>
      {onRefresh && (
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm text-white/80 transition-colors hover:bg-white/20 hover:text-white disabled:opacity-60"
        >
          <RefreshCw
            className={refreshing ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'}
            aria-hidden
          />
          Check again
        </button>
      )}
    </section>
  )
};
