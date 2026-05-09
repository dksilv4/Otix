import { useRef, useState, useEffect, useCallback } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { cn } from '@/lib/utils'
import { Image } from '@ui/atoms/image'
import { Badge } from '@ui/atoms/badge'

interface CreditItem {
  id: string
  person: { id: string; name: string; photoUrl?: string }
  role: string
  characterName?: string
  sortOrder: number
}

interface CastCrewListProps {
  credits: CreditItem[]
  className?: string
}

function groupByRole(credits: CreditItem[]) {
  const cast = credits.filter((c) => c.role === 'cast')
  const directors = credits.filter((c) => c.role === 'director')
  const writers = credits.filter((c) => c.role === 'writer')
  const producers = credits.filter((c) => c.role === 'producer')
  const composers = credits.filter((c) => c.role === 'composer')
  const crew = credits.filter(
    (c) => !['cast', 'director', 'writer', 'producer', 'composer'].includes(c.role),
  )
  return { cast, directors, writers, producers, composers, crew }
}

const roleLabel: Record<string, string> = {
  director: 'Director',
  writer: 'Writer',
  producer: 'Producer',
}

function KeyCrewCard({ credit }: { credit: CreditItem }) {
  return (
    <Link
      to="/person/$personId"
      params={{ personId: credit.person.id }}
      className="flex items-center gap-3 rounded-xl bg-card p-3 transition-colors hover:bg-card/80"
    >
      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-full border-2 border-primary/20">
        <Image
          src={credit.person.photoUrl}
          alt={credit.person.name}
          className="h-full w-full"
          fallback={credit.person.name[0]}
        />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold truncate">{credit.person.name}</p>
        <Badge variant="secondary" className="mt-0.5 text-[10px]">
          {roleLabel[credit.role] ?? credit.role}
        </Badge>
      </div>
    </Link>
  )
}

function PersonCard({ credit }: { credit: CreditItem }) {
  return (
    <Link
      to="/person/$personId"
      params={{ personId: credit.person.id }}
      className="group block w-24 shrink-0 text-center sm:w-28"
    >
      <div className="relative mx-auto aspect-square w-full overflow-hidden rounded-full ring-1 ring-border/50 transition-shadow group-hover:ring-primary/30 group-hover:shadow-lg">
        <Image
          src={credit.person.photoUrl}
          alt={credit.person.name}
          className="h-full w-full transition-transform group-hover:scale-105"
          fallback={credit.person.name[0]}
        />
      </div>
      <p className="mt-0.5 text-[10px] text-muted-foreground leading-tight truncate">
        {credit.characterName || credit.role}
      </p>
      <p className="mt-0.5 text-xs font-medium leading-tight truncate">
        {credit.person.name}
      </p>
    </Link>
  )
}

const scrollButton = cn(
  'absolute top-1/2 -translate-y-1/2 z-10',
  'flex w-10 h-10 items-center justify-center rounded-full',
  'bg-[var(--dk-surface-glass)] backdrop-blur-md',
  'shadow-[var(--dk-shadow-glass)]',
  'text-foreground/70 hover:text-foreground',
  'transition-opacity duration-[var(--dk-duration-fast)]',
)

function CreditRow({ label, items }: { label: string; items: CreditItem[] }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 0)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  useEffect(() => {
    checkScroll()
    window.addEventListener('resize', checkScroll)
    return () => window.removeEventListener('resize', checkScroll)
  }, [checkScroll])

  if (items.length === 0) return null

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -300 : 300, behavior: 'smooth' })
  }

  return (
    <div>
      <h4 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label}
      </h4>
      <div className="relative">
        <button
          onClick={() => scroll('left')}
          className={cn(scrollButton, 'left-0', canScrollLeft ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          aria-label="Scroll left"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div
          ref={scrollRef}
          onScroll={checkScroll}
          className="flex gap-3 overflow-x-auto scrollbar-none px-10 pb-2"
        >
          {items.map((c) => (
            <PersonCard key={c.id} credit={c} />
          ))}
        </div>

        <button
          onClick={() => scroll('right')}
          className={cn(scrollButton, 'right-0', canScrollRight ? 'opacity-100' : 'opacity-0 pointer-events-none')}
          aria-label="Scroll right"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  )
}

export function CastCrewList({ credits, className }: CastCrewListProps) {
  const { cast, directors, writers, producers, composers, crew } = groupByRole(credits)
  const keyCrew = [...directors, ...writers, ...producers]

  if (credits.length === 0) return null

  return (
    <div className={cn('space-y-8', className)}>
      {keyCrew.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Key Crew</h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {keyCrew.map((c) => (
              <KeyCrewCard key={c.id} credit={c} />
            ))}
          </div>
        </section>
      )}

      {(cast.length > 0 || composers.length > 0 || crew.length > 0) && (
        <section className="space-y-5">
          <h2 className="text-lg font-semibold">Cast & Crew</h2>
          <CreditRow label="Cast" items={cast} />
          <CreditRow label="Composers" items={composers} />
          <CreditRow label="Crew" items={crew} />
        </section>
      )}
    </div>
  )
}
