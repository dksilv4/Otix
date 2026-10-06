import { useState, useRef, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight, Users } from 'lucide-react'
import { PeopleCard } from '@people/components/molecules/people-card'
import { groupByRole } from '@media'
import { DkDialog } from '@ui/molecules/dialog'
import { cn } from '@/lib/utils'

export interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string } | null
  role: string
  characterName?: string
  sortOrder: number
}

interface CastCrewProps {
  credits?: CreditItem[]
  className?: string
}

export type CastCrewV4Props = CastCrewProps

type CreditCategory = 'cast' | 'directing' | 'crew'

export const CastCrew = ({ credits = [], className = '' }: CastCrewProps) => {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<CreditCategory>('cast')

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
  }, [])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    checkScroll()
    el.addEventListener('scroll', checkScroll, { passive: true })
    window.addEventListener('resize', checkScroll)
    return () => {
      el.removeEventListener('scroll', checkScroll)
      window.removeEventListener('resize', checkScroll)
    }
  }, [checkScroll, activeTab])

  const validCredits = (Array.isArray(credits) ? credits : []).filter((c) => Boolean(c && c.person && c.person.id))
  if (validCredits.length === 0) return null

  const { cast, directors, writers, producers, composers, crew } = groupByRole(validCredits)
  const directingWriters = [...directors, ...writers]
  const productionCrew = [...composers, ...producers, ...crew]

  const categories: Array<{ key: CreditCategory; label: string; count: number; items: CreditItem[] }> = []
  if (cast.length > 0) {
    categories.push({ key: 'cast', label: 'Top Cast', count: cast.length, items: cast })
  }
  if (directingWriters.length > 0) {
    categories.push({ key: 'directing', label: 'Directing & Writing', count: directingWriters.length, items: directingWriters })
  }
  if (productionCrew.length > 0) {
    categories.push({ key: 'crew', label: 'Production & Crew', count: productionCrew.length, items: productionCrew })
  }

  if (categories.length === 0) return null

  const activeCategory = categories.find((c) => c.key === activeTab) ?? categories[0]

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  return (
    <div className={cn('glass-card py-6 sm:py-7 space-y-4 overflow-visible', className)}>
      {/* ── Header with Category Tabs & Nav Chevrons ── */}
      <div className="px-6 sm:px-7 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
          <h2 className="text-base font-semibold tracking-tight">Cast &amp; Crew</h2>
        </div>

        <div className="flex items-center gap-3">
          {/* Segmented Category Filter */}
          {categories.length > 1 && (
            <div className="flex items-center gap-1 rounded-xl bg-white/[0.04] p-0.5 overflow-x-auto scrollbar-none">
              {categories.map((cat) => {
                const isActive = activeTab === cat.key
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => {
                      setActiveTab(cat.key)
                      if (scrollRef.current) scrollRef.current.scrollLeft = 0
                    }}
                    className={cn(
                      'rounded-lg px-2.5 py-1 text-xs font-medium transition-all whitespace-nowrap',
                      isActive
                        ? 'bg-white/10 text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {cat.label}
                    <span className="ml-1 text-[10px] opacity-60">({cat.count})</span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Desktop Chevron Controls */}
          <div className="hidden sm:flex items-center gap-1">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => scrollBy(-260)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-foreground disabled:opacity-25 transition-all"
              aria-label="Scroll left"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => scrollBy(260)}
              className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-foreground disabled:opacity-25 transition-all"
              aria-label="Scroll right"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Horizontal Carousel Track (Full-Bleed Across Card, No Padding Clipping, No Masking) ── */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-none px-6 sm:px-7 py-3.5 -my-2.5 [mask-image:none] [-webkit-mask-image:none]"
        style={{ scrollPaddingInline: '1.5rem' }}
        aria-label={`${activeCategory.label} credits`}
      >
        {activeCategory.items.slice(0, 16).map((c) =>
          c.person ? (
            <PeopleCard
              key={c.id}
              id={c.person.id}
              name={c.person.name}
              imageUrl={c.person.photoUrl}
              role={c.characterName || c.role}
            />
          ) : null,
        )}
      </div>

      {/* ── View All Dialog Trigger ── */}
      {activeCategory.items.length > 16 && (
        <div className="px-6 sm:px-7 flex justify-end pt-1">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            <Users className="h-3.5 w-3.5" />
            <span>View all {activeCategory.items.length} {activeCategory.label.toLowerCase()}</span>
          </button>
        </div>
      )}

      {/* ── Full Credits Modal Dialog ── */}
      {isModalOpen && (
        <DkDialog
          open={isModalOpen}
          onOpenChange={(open) => setIsModalOpen(open)}
          title={`All ${activeCategory.label} (${activeCategory.items.length})`}
        >
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
              {activeCategory.items.map((c) =>
                c.person ? (
                  <PeopleCard
                    key={c.id}
                    id={c.person.id}
                    name={c.person.name}
                    imageUrl={c.person.photoUrl}
                    role={c.characterName || c.role}
                    className="w-full sm:w-full h-48 sm:h-52"
                  />
                ) : null,
              )}
            </div>
          </div>
        </DkDialog>
      )}
    </div>
  )
};

export { CastCrew as CastCrewV4 }
