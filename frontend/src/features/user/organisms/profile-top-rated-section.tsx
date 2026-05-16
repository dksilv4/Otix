import { useQuery } from '@tanstack/react-query'
import { Trophy } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { userQueries } from '../user-queries'
import { Skeleton } from '@ui/atoms/skeleton'
import { cn } from '@/lib/utils'

export function TopRatedSection({ username }: { username: string }) {
  const topRatedQuery = useQuery(userQueries.topRated(username))

  if (topRatedQuery.isLoading) return <TopRatedSkeleton />
  if (topRatedQuery.isError || !topRatedQuery.data) return null

  const items = topRatedQuery.data
  if (items.length === 0) return null

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Trophy className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Top Rated</h2>
      </div>

      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {items.map((item) => (
          <Link
            key={item.review.mediaItemId}
            to="/media/$mediaType/$mediaId"
            params={{ mediaType: item.mediaItem.mediaType, mediaId: item.mediaItem.id }}
            className="group relative overflow-hidden rounded-xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-sm)] hover:shadow-[var(--dk-shadow-md)] transition-all"
          >
            <div className="aspect-[2/3] bg-[var(--dk-surface-raised)]">
              {item.mediaItem.posterUrl ? (
                <img
                  src={item.mediaItem.posterUrl}
                  alt={item.mediaItem.title}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full items-center justify-center p-2 text-center">
                  <span className="text-xs text-muted-foreground line-clamp-3">{item.mediaItem.title}</span>
                </div>
              )}
            </div>
            <div className="absolute top-2 right-2">
              <span className={cn(
                'rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums shadow',
                (item.review.score ?? 0) >= 8 ? 'bg-emerald-500 text-white' :
                (item.review.score ?? 0) >= 6 ? 'bg-sky-500 text-white' :
                (item.review.score ?? 0) >= 4 ? 'bg-amber-500 text-black' :
                'bg-red-500 text-white',
              )}>
                {item.review.score}
              </span>
            </div>
            <div className="p-2">
              <p className="text-xs font-medium truncate">{item.mediaItem.title}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}

function TopRatedSkeleton() {
  return (
    <section>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] rounded-xl" />
        ))}
      </div>
    </section>
  )
}
