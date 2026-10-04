import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { ChevronLeft, ChevronRight, UserRound, Users, ExternalLink } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { Image } from '@ui/atoms/image'
import { Badge } from '@ui/atoms/badge'
import { DkDialog } from '@ui/molecules/dialog'
import { cn } from '@/lib/utils'
import { sortCharactersByImage, type CharacterItem } from '../../utils/characters'

export type { CharacterItem }

interface GameCharactersProps {
  characters?: CharacterItem[]
  className?: string
}

export function GameCharacters({ characters = [], className = '' }: GameCharactersProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [selectedCharacter, setSelectedCharacter] = useState<CharacterItem['character'] | null>(null)
  const [isAllModalOpen, setIsAllModalOpen] = useState(false)

  // Characters with mugshots first, then preserve original order within each group.
  const validCharacters = useMemo(() => {
    const valid = (Array.isArray(characters) ? characters : []).filter(
      (c) => Boolean(c && c.character && c.character.name),
    )
    return sortCharactersByImage(valid)
  }, [characters])

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
  }, [checkScroll])

  const scrollBy = (offset: number) => {
    if (!scrollRef.current) return
    scrollRef.current.scrollBy({ left: offset, behavior: 'smooth' })
  }

  if (validCharacters.length === 0) return null

  return (
    <div className={cn('glass-card py-6 sm:py-7 space-y-4 overflow-visible', className)}>
      {/* ── Header with Title & Nav Chevrons ── */}
      <div className="px-6 sm:px-7 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="h-4 w-0.5 rounded-full bg-primary/60 shrink-0" />
          <h2 className="text-base font-semibold tracking-tight">Characters</h2>
          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-white/[0.06] text-muted-foreground">
            {validCharacters.length}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {validCharacters.length > 12 && (
            <button
              type="button"
              onClick={() => setIsAllModalOpen(true)}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1 mr-2"
            >
              <Users className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">View all</span>
            </button>
          )}

          {/* Nav Controls */}
          <div className="flex items-center gap-1">
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

      {/* ── Horizontal Carousel Track ── */}
      <div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto overscroll-x-contain scroll-smooth scrollbar-none px-6 sm:px-7 py-3.5 -my-2.5"
        style={{ scrollPaddingInline: '1.5rem' }}
        aria-label="Game characters list"
      >
        {validCharacters.map((c) => {
          const char = c.character
          const speciesOrGender = [char.species, char.gender?.replace('_', ' ')].filter(Boolean).join(' • ')

          return (
            <button
              key={c.id || char.id}
              type="button"
              onClick={() => setSelectedCharacter(char)}
              className={cn(
                'group relative h-48 w-28 shrink-0 overflow-hidden rounded-lg bg-muted text-left',
                'shadow-[0_4px_16px_rgba(0,0,0,0.2)] transition-[transform,box-shadow] duration-300 ease-out',
                'sm:h-52 sm:w-32',
                'hover:scale-[1.02] hover:shadow-[0_20px_40px_rgba(0,0,0,0.35)]',
                'active:scale-[1.01]',
              )}
            >
              {char.mugShotUrl ? (
                <Image
                  src={char.mugShotUrl}
                  alt={char.name}
                  className="absolute inset-0 h-full w-full rounded-lg object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  fallback={
                    <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45">
                      <UserRound className="h-10 w-10" aria-hidden="true" />
                    </div>
                  }
                />
              ) : (
                <div className="absolute inset-0 flex h-full w-full items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-950 text-white/45 transition-transform duration-500 ease-out group-hover:scale-110">
                  <UserRound className="h-10 w-10" aria-hidden="true" />
                </div>
              )}

              <div
                className="pointer-events-none absolute inset-0 rounded-lg bg-gradient-to-t from-black/90 via-black/45 to-transparent opacity-90 transition-opacity duration-300 ease-out group-hover:opacity-95"
                aria-hidden="true"
              />

              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3 text-white transition-transform duration-300 ease-out">
                {speciesOrGender && (
                  <p className="min-w-0 truncate text-[10px] font-medium uppercase tracking-wider leading-tight text-white/75 capitalize">
                    {speciesOrGender}
                  </p>
                )}
                <h3 className="truncate text-sm font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.75)] sm:text-base">
                  {char.name}
                </h3>
              </div>
            </button>
          )
        })}
      </div>

      {/* ── Character Detail Modal (DkDialog) ── */}
      {selectedCharacter && (
        <DkDialog
          open={Boolean(selectedCharacter)}
          onOpenChange={(open) => !open && setSelectedCharacter(null)}
          title={selectedCharacter.name}
        >
          <div className="space-y-5 p-1 max-h-[70vh] overflow-y-auto pr-1">
            <div className="flex flex-col sm:flex-row gap-5 items-center sm:items-start">
              {/* Mugshot */}
              <div className="relative w-32 h-40 rounded-xl overflow-hidden shadow-xl bg-zinc-900 shrink-0">
                {selectedCharacter.mugShotUrl ? (
                  <Image
                    src={selectedCharacter.mugShotUrl}
                    alt={selectedCharacter.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground bg-zinc-900">
                    <UserRound className="h-10 w-10 opacity-40" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="space-y-3 flex-1 text-center sm:text-left">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-1.5">
                  {selectedCharacter.species && (
                    <Badge variant="secondary" className="text-xs capitalize bg-white/5 border-0">
                      {selectedCharacter.species}
                    </Badge>
                  )}
                  {selectedCharacter.gender && (
                    <Badge variant="secondary" className="text-xs capitalize bg-white/5 border-0">
                      {selectedCharacter.gender.replace('_', ' ')}
                    </Badge>
                  )}
                </div>

                {selectedCharacter.description ? (
                  <p className="text-sm text-white/75 leading-relaxed">
                    {selectedCharacter.description}
                  </p>
                ) : (
                  <p className="text-sm text-white/40 italic">No description available for this character.</p>
                )}

                <div className="pt-2">
                  <Link
                    to="/character/$characterId"
                    params={{ characterId: selectedCharacter.slug || selectedCharacter.id }}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                    onClick={() => setSelectedCharacter(null)}
                  >
                    <span>View character profile</span>
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </DkDialog>
      )}

      {/* ── View All Characters Dialog ── */}
      {isAllModalOpen && (
        <DkDialog
          open={isAllModalOpen}
          onOpenChange={(open) => setIsAllModalOpen(open)}
          title={`All Characters (${validCharacters.length})`}
        >
          <div className="max-h-[65vh] overflow-y-auto pr-1">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 p-1">
              {validCharacters.map((c) => {
                const char = c.character
                return (
                  <button
                    key={c.id || char.id}
                    type="button"
                    onClick={() => {
                      setIsAllModalOpen(false)
                      setSelectedCharacter(char)
                    }}
                    className="group relative h-48 sm:h-52 w-full overflow-hidden rounded-lg bg-muted text-left shadow-lg"
                  >
                    {char.mugShotUrl ? (
                      <Image
                        src={char.mugShotUrl}
                        alt={char.name}
                        className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center bg-zinc-900 text-white/40">
                        <UserRound className="h-8 w-8" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-2.5 text-white">
                      <h4 className="truncate text-xs sm:text-sm font-semibold">{char.name}</h4>
                      {char.species && (
                        <p className="text-[10px] text-white/60 capitalize truncate">{char.species}</p>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </DkDialog>
      )}
    </div>
  )
}
