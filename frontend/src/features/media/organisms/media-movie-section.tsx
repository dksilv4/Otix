// TODO: Review this file
import { Link } from '@tanstack/react-router'
import type { MovieDetail } from '../media-queries'
import { cn } from '@/lib/utils'

interface MovieSectionProps {
  movie: MovieDetail
  className?: string
}

function formatCurrency(amount?: number): string {
  if (!amount) return ''
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function MovieSection({ movie, className }: MovieSectionProps) {
  if (movie.runtime == null && movie.budget == null && movie.revenue == null) return null

  const profitAbs = movie.revenue != null && movie.budget != null && movie.budget > 0
    ? movie.revenue - movie.budget
    : null
  const hasProfit = profitAbs != null
  const isProfitable = hasProfit && profitAbs > 0

  return (
    <section className={cn('space-y-4', className)}>
      <h2 className="text-lg font-semibold">Details</h2>

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {movie.runtime != null && movie.runtime > 0 && (
          <div className="rounded-xl bg-card p-4">
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Runtime</dt>
            <dd className="mt-1 text-sm font-semibold">{movie.runtime} min</dd>
          </div>
        )}
        {movie.budget != null && movie.budget > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'budget' }}
            className="rounded-xl bg-card p-4 hover:bg-card/70 transition-colors"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Budget</dt>
            <dd className="mt-1 text-sm font-semibold">{formatCurrency(movie.budget)}</dd>
          </Link>
        )}
        {movie.revenue != null && movie.revenue > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'revenue' }}
            className="rounded-xl bg-card p-4 hover:bg-card/70 transition-colors"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Revenue</dt>
            <dd className="mt-1 flex items-center gap-2">
              <span className="text-sm font-semibold">{formatCurrency(movie.revenue)}</span>
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
            className="rounded-xl bg-card p-4 hover:bg-card/70 transition-colors"
          >
            <dt className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {isProfitable ? 'Profit' : 'Loss'}
            </dt>
            <dd className="mt-1 flex items-center gap-2">
              <span
                className={cn(
                  'text-sm font-semibold',
                  isProfitable ? 'text-emerald-400' : 'text-red-400',
                )}
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
