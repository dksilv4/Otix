import { Heart, Bookmark, CheckCircle2, Gamepad2, Play } from 'lucide-react'
import { type ReactNode, useState, useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import {
  useToggleInteraction,
  useUserInteractions,
  type InteractionType,
  type UserInteractionState,
} from '../interaction-queries'

// ── Button configs ──────────────────────────────────────────────

interface ButtonDef {
  type: InteractionType
  label: string
  activeColor: string
  activeGlow: string
  Icon: typeof Heart
  showFor: 'all' | 'movie_show' | 'game' | 'music'
}

const XP_VALUES: Record<InteractionType, number> = {
  liked: 10,
  watchlisted: 10,
  watched: 30,
  played: 30,
  started: 10,
  listened: 30,
}

const BUTTONS: ButtonDef[] = [
  {
    type: 'liked',
    label: 'Like',
    activeColor: 'text-red-400',
    activeGlow: 'from-red-500/15',
    Icon: Heart,
    showFor: 'all',
  },
  {
    type: 'watchlisted',
    label: 'Watchlist',
    activeColor: 'text-sky-400',
    activeGlow: 'from-sky-500/15',
    Icon: Bookmark,
    showFor: 'movie_show',
  },
  {
    type: 'watchlisted',
    label: 'Wishlist',
    activeColor: 'text-sky-400',
    activeGlow: 'from-sky-500/15',
    Icon: Bookmark,
    showFor: 'game',
  },
  {
    type: 'watched',
    label: 'Watched',
    activeColor: 'text-emerald-400',
    activeGlow: 'from-emerald-500/15',
    Icon: CheckCircle2,
    showFor: 'movie_show',
  },
  {
    type: 'started',
    label: 'Started',
    activeColor: 'text-violet-400',
    activeGlow: 'from-violet-500/15',
    Icon: Play,
    showFor: 'game',
  },
  {
    type: 'played',
    label: 'Played',
    activeColor: 'text-emerald-400',
    activeGlow: 'from-emerald-500/15',
    Icon: Gamepad2,
    showFor: 'game',
  },
  {
    type: 'watchlisted',
    label: 'Wishlist',
    activeColor: 'text-sky-400',
    activeGlow: 'from-sky-500/15',
    Icon: Bookmark,
    showFor: 'music',
  },
  {
    type: 'listened',
    label: 'Listened',
    activeColor: 'text-amber-400',
    activeGlow: 'from-amber-500/15',
    Icon: CheckCircle2,
    showFor: 'music',
  },
]

// ── Single button ───────────────────────────────────────────────

function InteractionButton({
  type,
  label,
  activeColor,
  activeGlow,
  Icon,
  active,
  mediaId,
}: ButtonDef & { active: boolean; mediaId: string }) {
  const toggle = useToggleInteraction(mediaId)
  const [localActive, setLocalActive] = useState<boolean | null>(null)
  const prevActiveRef = useRef(active)

  // Reset local state when server confirms
  useEffect(() => {
    if (active !== prevActiveRef.current) {
      prevActiveRef.current = active
      setLocalActive(null)
    }
  }, [active])

  const isActive = localActive ?? active

  return (
    <button
      type="button"
      onClick={() => {
        const nextActive = !isActive
        setLocalActive(nextActive)
        toggle.mutate({ type, active: nextActive })
        if (nextActive) {
          showXPToast(XP_VALUES[type])
        }
      }}
      disabled={toggle.isPending}
      className={cn(
        'group relative flex h-16 w-20 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-[var(--dk-surface-base)] px-3 py-3 transition-all duration-150',
        'hover:bg-[var(--dk-surface-glass)]',
        toggle.isPending && 'pointer-events-none',
      )}
    >
      {/* Ambient glow when active */}
      {isActive && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,var(--tw-gradient-from),transparent_70%)]',
            activeGlow,
          )}
        />
      )}

      <Icon
        className={cn(
          'relative h-5 w-5 transition-all duration-200',
          isActive
            ? cn(activeColor, 'fill-current scale-110')
            : 'text-muted-foreground scale-100',
        )}
      />

      <span className="relative text-[11px] font-medium text-muted-foreground">
        {label}
      </span>
    </button>
  )
}

// ── Section ─────────────────────────────────────────────────────

interface InteractionSectionProps {
  mediaId: string
  mediaType: 'movie' | 'show' | 'game' | 'music'
  className?: string
  userInteractions?: UserInteractionState | null
  children?: ReactNode
}

function InteractionSection({
  mediaId,
  mediaType,
  className,
  userInteractions,
  children,
}: InteractionSectionProps) {
  const { isAuthenticated } = useAuth()

  const { data: fetchedInteractions } = useUserInteractions(mediaId, {
    enabled: isAuthenticated && userInteractions == null,
  })

  const interactions = userInteractions ?? fetchedInteractions ?? null

  if (!isAuthenticated) {
    const listLabel = mediaType === 'game' || mediaType === 'music' ? 'wishlist' : 'watchlist'
    return (
      <section className={cn(className)}>
        <div className="rounded-3xl border border-white/[0.06] bg-[var(--dk-surface-base)] p-6 text-center">
          <p className="text-sm text-muted-foreground">
            <a href="/auth" className="font-medium text-primary hover:underline">
              Sign in
            </a>{' '}
            to like, {listLabel}, and track this title.
          </p>
        </div>
      </section>
    )
  }

  const visibleButtons = BUTTONS.filter((b) => {
    if (b.showFor === 'all') return true
    if (b.showFor === 'movie_show') return mediaType === 'movie' || mediaType === 'show'
    if (b.showFor === 'game') return mediaType === 'game'
    return mediaType === 'music'
  })

  return (
    <section className={cn(className)}>
      <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3">
        {visibleButtons.map((btn) => (
          <InteractionButton
            key={btn.type}
            {...btn}
            active={interactions?.[btn.type] ?? false}
            mediaId={mediaId}
          />
        ))}
        {children}
      </div>
    </section>
  )
}

export { InteractionSection }
export type { InteractionSectionProps }
