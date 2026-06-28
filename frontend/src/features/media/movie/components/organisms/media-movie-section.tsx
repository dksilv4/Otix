import { Link } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { mediaQueries, formatCurrency, useMediaParams } from '@media'

interface MovieSectionProps {
  className?: string
}

export function MovieSection({ className }: MovieSectionProps = {}) {
  const { mediaId } = useMediaParams()

  const { data } = useQuery(mediaQueries.detail('movie', mediaId))
  if (!data || !data.movie) return null
  const movie = data.movie

  if (movie.runtime == null && movie.budget == null && movie.revenue == null) return null

  const profitAbs = movie.revenue != null && movie.budget != null && movie.budget > 0
    ? movie.revenue - movie.budget
    : null
  const hasProfit = profitAbs != null
  const isProfitable = hasProfit && profitAbs > 0

  return (
    <section id="media-movie-section" className={className || ''}>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 ">

        {movie.budget != null && movie.budget > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'budget' }}
            className="glass-inset px-4 py-3 transition-all"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget</dt>
            <dd className="mt-1 text-sm font-semibold text-white">{formatCurrency(movie.budget)}</dd>
          </Link>
        )}
        {movie.revenue != null && movie.revenue > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'revenue' }}
            className="glass-inset px-4 py-3 transition-all"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="text-sm font-semibold text-white">{formatCurrency(movie.revenue)}</span>
              {movie.revenueRank && (
                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-primary/10 text-primary">
                  #{movie.revenueRank}
                </span>
              )}
            </dd>
          </Link>
        )}
        {hasProfit && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={isProfitable ? { sort: 'profit' } : { sort: 'profit', dir: 'asc' }}
            className="glass-inset px-4 py-3 transition-all"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isProfitable ? 'Profit' : 'Loss'}
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <span
                className={`text-sm font-semibold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}
              >
                {isProfitable ? '+' : '-'}{formatCurrency(Math.abs(profitAbs!))}
              </span>
              {isProfitable && movie.profitRank && (
                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-emerald-400/10 text-emerald-400">
                  #{movie.profitRank}
                </span>
              )}
              {!isProfitable && movie.lossRank && (
                <span className="inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-bold bg-red-400/10 text-red-400">
                  #{movie.lossRank}
                </span>
              )}
            </dd>
          </Link>
        )}
      </dl>
    </section>
  )
}
