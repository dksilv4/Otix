import { Building2, Globe, DollarSign, Calendar, Layers, ShieldAlert } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { MediaItemDetail } from '@media'
import { formatCurrency, formatDate, languageName } from '@media'

interface MediaSpecsCardProps {
  detail: MediaItemDetail
  className?: string
}

export function MediaSpecsCard({ detail, className = '' }: MediaSpecsCardProps) {
  const movie = detail.movie
  const game = detail.game
  const companies = Array.isArray(detail?.involvedCompanies) ? detail.involvedCompanies : []
  const validCompanies = companies.filter((ic) => Boolean(ic && ic.company && ic.company.id))
  const hasCompanies = validCompanies.length > 0

  const budget = movie?.budget != null && movie.budget > 0 ? movie.budget : null
  const revenue = movie?.revenue != null && movie.revenue > 0 ? movie.revenue : null
  const profitAbs = budget && revenue ? revenue - budget : null
  const isProfitable = profitAbs != null && profitAbs > 0

  return (
    <div className={`glass-card p-5 sm:p-6 space-y-5 ${className}`}>
      <h3 className="text-sm font-semibold tracking-tight">Information &amp; Specs</h3>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 text-xs">
        {/* Original Language */}
        {detail.originalLanguage && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Original Language
            </dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {languageName(detail.originalLanguage)}
            </dd>
          </div>
        )}

        {/* Release Date */}
        {detail.releaseDate && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Release Date
            </dt>
            <dd className="mt-0.5 font-medium text-foreground">
              {formatDate(detail.releaseDate)}
            </dd>
          </div>
        )}

        {/* Status */}
        {(detail.show?.status || detail.game?.releaseStatus) && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Status
            </dt>
            <dd className="mt-0.5 font-medium capitalize text-foreground">
              {(detail.show?.status || detail.game?.releaseStatus)?.replace(/_/g, ' ')}
            </dd>
          </div>
        )}

        {/* Website */}
        {game?.website && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Website
            </dt>
            <dd className="mt-0.5 font-medium">
              <a
                href={game.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary hover:underline truncate block"
              >
                Official Site
              </a>
            </dd>
          </div>
        )}

        {/* Budget */}
        {budget && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Budget
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground">
              {formatCurrency(budget)}
            </dd>
          </div>
        )}

        {/* Revenue */}
        {revenue && (
          <div>
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Revenue
            </dt>
            <dd className="mt-0.5 font-semibold text-foreground flex items-center gap-1.5">
              <span>{formatCurrency(revenue)}</span>
              {movie?.revenueRank && (
                <span className="text-[10px] px-1 rounded bg-primary/10 text-primary font-bold">
                  #{movie.revenueRank}
                </span>
              )}
            </dd>
          </div>
        )}

        {/* Profit / Loss */}
        {profitAbs != null && (
          <div className="col-span-2">
            <dt className="text-muted-foreground uppercase tracking-wider text-[10px] font-semibold">
              Box Office Result
            </dt>
            <dd
              className={`mt-0.5 font-semibold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}
            >
              {isProfitable ? '+' : '-'}{formatCurrency(Math.abs(profitAbs))} ({isProfitable ? 'Profit' : 'Loss'})
            </dd>
          </div>
        )}
      </dl>

      {/* Production Companies */}
      {hasCompanies && (
        <div className="border-t border-white/[0.06] pt-4 space-y-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Production
          </span>

          <div className="flex flex-wrap gap-2">
            {validCompanies.slice(0, 6).map((ic) => (
              <Link
                key={ic.id}
                to="/company/$companyId"
                params={{ companyId: ic.company.id }}
                className="glass-inset inline-flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-white/[0.08] transition-colors max-w-full"
                title={ic.company.name}
              >
                {ic.company.logoUrl ? (
                  <img
                    src={ic.company.logoUrl}
                    alt=""
                    className="h-4 max-w-[48px] object-contain opacity-75"
                  />
                ) : (
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
                <span className="text-xs font-medium text-muted-foreground hover:text-foreground truncate max-w-[140px]">
                  {ic.company.name}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
