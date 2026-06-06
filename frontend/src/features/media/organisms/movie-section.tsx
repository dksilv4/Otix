// TODO: Review this file
import { Link } from '@tanstack/react-router'
import type { MovieDetail } from '../media-queries'
import { cn } from '@/lib/utils'
import './movie-section.scss'

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
    <section className={cn('dk-media-movie-section', className)}>
      <h2 className="dk-media-movie-section__title">Details</h2>

      <dl className="dk-media-movie-section__grid">
        {movie.runtime != null && movie.runtime > 0 && (
          <div className="dk-media-movie-section__card">
            <dt className="dk-media-movie-section__label">Runtime</dt>
            <dd className="dk-media-movie-section__value">{movie.runtime} min</dd>
          </div>
        )}
        {movie.budget != null && movie.budget > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'budget' }}
            className="dk-media-movie-section__card--link"
          >
            <dt className="dk-media-movie-section__label">Budget</dt>
            <dd className="dk-media-movie-section__value">{formatCurrency(movie.budget)}</dd>
          </Link>
        )}
        {movie.revenue != null && movie.revenue > 0 && (
          <Link
            to="/browse/$type"
            params={{ type: 'movie' }}
            search={{ sort: 'revenue' }}
            className="dk-media-movie-section__card--link"
          >
            <dt className="dk-media-movie-section__label">Revenue</dt>
            <dd className="dk-media-movie-section__value--flex">
              <span className="dk-media-movie-section__amount">{formatCurrency(movie.revenue)}</span>
              {movie.revenueRank && (
                <span className="dk-media-movie-section__rank dk-media-movie-section__rank--primary">
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
            className="dk-media-movie-section__card--link"
          >
            <dt className="dk-media-movie-section__label">
              {isProfitable ? 'Profit' : 'Loss'}
            </dt>
            <dd className="dk-media-movie-section__value--flex">
              <span
                className={cn(
                  'dk-media-movie-section__amount',
                  isProfitable ? 'dk-media-movie-section__amount--profit' : 'dk-media-movie-section__amount--loss',
                )}
              >
                {isProfitable ? '+' : '-'}{formatCurrency(Math.abs(profitAbs!))}
              </span>
              {isProfitable && movie.profitRank && (
                <span className="dk-media-movie-section__rank dk-media-movie-section__rank--profit">
                  #{movie.profitRank}
                </span>
              )}
              {!isProfitable && movie.lossRank && (
                <span className="dk-media-movie-section__rank dk-media-movie-section__rank--loss">
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
