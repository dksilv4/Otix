import { Building2, ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import type { MediaItemDetail } from '@media'
import { formatCurrency, formatDate, languageName } from '@media'

interface MediaSpecsCardProps {
  detail: MediaItemDetail
  className?: string
}

export const MediaSpecsCard = ({ detail, className = '' }: MediaSpecsCardProps) => {
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
      {/* <h3 className="text-sm font-semibold tracking-tight">Information &amp; Specs</h3> */}

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
              className={`mt-0.5 font-semibold ${isProfitable ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}
            >
              {isProfitable ? '+' : '-'}{formatCurrency(Math.abs(profitAbs))} ({isProfitable ? 'Profit' : 'Loss'})
            </dd>
          </div>
        )}
      </dl>

      {/* Production Companies */}
      {hasCompanies && (
        <div className="pt-2 space-y-2.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Production &amp; Studios
          </span>

          <div className="flex flex-col gap-2">
            {validCompanies.slice(0, 6).map((ic) => {
              const role = ic.developer
                ? 'Developer'
                : ic.publisher
                  ? 'Publisher'
                  : ic.production
                    ? 'Production'
                    : ic.porting
                      ? 'Porting'
                      : ic.supporting
                        ? 'Supporting'
                        : null

              return (
                <Link
                  key={ic.id}
                  to="/company/$companyId"
                  params={{ companyId: ic.company.id }}
                  className="w-full flex items-center justify-between p-2.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-glass-hover)] transition-all duration-200 group shadow-xs cursor-pointer"
                  title={ic.company.name}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-8 w-10 rounded-lg bg-[var(--dk-surface-glass)] flex items-center justify-center p-1 shrink-0 overflow-hidden">
                      {ic.company.logoUrl ? (
                        <img
                          src={ic.company.logoUrl}
                          alt=""
                          className="h-full w-full object-contain opacity-85 group-hover:opacity-100 transition-opacity"
                        />
                      ) : (
                        <Building2 className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                      )}
                    </div>
                    <span className="text-xs font-medium text-foreground/90 group-hover:text-primary transition-colors truncate">
                      {ic.company.name}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    {role && (
                      <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary">
                        {role}
                      </span>
                    )}
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                </Link>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
};
