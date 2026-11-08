import { Layers, Calendar, ExternalLink, Check } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { GameEdition } from '../../types'
import { getEditionYear, getEditionStores } from '../../utils/editions'
import { useGameEditions } from '../../hooks/use-game-editions'

export interface GameEditionsSectionProps {
  editions?: GameEdition[]
  selectedEditionId?: number | null
  onSelectEdition?: (editionId: number | null) => void
  baseGameTitle?: string
  baseReleaseDate?: string | null
  className?: string
}

export const GameEditionsSection = ({
  editions,
  selectedEditionId,
  onSelectEdition,
  baseGameTitle,
  baseReleaseDate,
  className,
}: GameEditionsSectionProps) => {
  const context = useGameEditions()
  const activeEditions = editions ?? context.editions
  const activeSelectedId = selectedEditionId !== undefined ? selectedEditionId : context.selectedEditionId
  const handleSelect = onSelectEdition ?? context.selectEdition
  const title = baseGameTitle ?? context.activeTitle
  const releaseDate = baseReleaseDate ?? context.activeReleaseDate

  if (!activeEditions || activeEditions.length === 0) {
    return null
  }

  const baseYear = getEditionYear(releaseDate)

  return (
    <section className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Layers className="w-5 h-5 text-primary shrink-0" />
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Available Editions</h2>
          <span className="text-xs font-medium text-muted-foreground px-2 py-0.5 rounded-full bg-muted/40">
            {activeEditions.length + 1}
          </span>
        </div>
        <p className="text-xs text-muted-foreground hidden sm:block">
          Select an edition to preview download packages and store links
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* Standard Edition Card */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => handleSelect(null)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              handleSelect(null)
            }
          }}
          className={cn(
            'group relative flex flex-col justify-between p-4 rounded-xl text-left cursor-pointer',
            'bg-card/40 hover:bg-card/70 border border-white/[0.05] backdrop-blur-md transition-all duration-150',
            activeSelectedId === null && 'ring-1 ring-primary/60 bg-card/80 border-primary/30',
          )}
        >
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground">
                  Base Game
                </span>
                <h3 className="text-sm font-semibold text-foreground truncate">Standard Edition</h3>
              </div>
              {activeSelectedId === null && (
                <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary shrink-0">
                  <Check className="w-3.5 h-3.5" />
                </div>
              )}
            </div>

            <p className="text-xs text-muted-foreground line-clamp-2">
              Original release of {title}.
            </p>
          </div>

          <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs text-muted-foreground">
            {baseYear ? (
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {baseYear}
              </span>
            ) : (
              <span />
            )}
            <span className="text-[11px] font-medium text-primary group-hover:underline">
              {activeSelectedId === null ? 'Active' : 'Select'}
            </span>
          </div>
        </div>

        {/* Alternate Editions Cards */}
        {activeEditions.map((edition) => {
          const isSelected = activeSelectedId === edition.id
          const year = getEditionYear(edition.releaseDate)
          const stores = getEditionStores(edition.externalIds || {})

          return (
            <div
              key={edition.id}
              role="button"
              tabIndex={0}
              onClick={() => handleSelect(edition.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleSelect(edition.id)
                }
              }}
              className={cn(
                'group relative flex flex-col justify-between p-4 rounded-xl text-left cursor-pointer',
                'bg-card/40 hover:bg-card/70 border border-white/[0.05] backdrop-blur-md transition-all duration-150',
                isSelected && 'ring-1 ring-primary/60 bg-card/80 border-primary/30',
              )}
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] uppercase font-bold tracking-wider text-primary">
                      Special Edition
                    </span>
                    <h3 className="text-sm font-semibold text-foreground truncate">
                      {edition.name || edition.rawTitle}
                    </h3>
                  </div>
                  {isSelected && (
                    <div className="flex items-center justify-center w-5 h-5 rounded-full bg-primary/20 text-primary shrink-0">
                      <Check className="w-3.5 h-3.5" />
                    </div>
                  )}
                </div>

                {edition.summary && (
                  <p className="text-xs text-muted-foreground line-clamp-2">{edition.summary}</p>
                )}

                {stores.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {stores.map((s) => (
                      <span
                        key={s.id}
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-muted/40 text-muted-foreground"
                      >
                        <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                        {s.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.04] flex items-center justify-between text-xs text-muted-foreground">
                {year ? (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {year}
                  </span>
                ) : (
                  <span />
                )}
                <span className="text-[11px] font-medium text-primary group-hover:underline">
                  {isSelected ? 'Active' : 'Select'}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
