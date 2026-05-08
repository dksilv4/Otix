import { Heart, Bookmark, CheckCircle2, Gamepad2, Play } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'
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
  showFor: 'all' | 'movie_show' | 'game'
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

  return (
    <button
      type="button"
      onClick={() => toggle.mutate({ type, active: !active })}
      className={cn(
        'group relative flex flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)] px-4 py-3 transition-all duration-150',
        'hover:border-white/[0.12] hover:bg-[var(--dk-surface-glass)]',
        active && 'border-white/[0.10]',
      )}
    >
      {/* Ambient glow when active */}
      {active && (
        <div
          className={cn(
            'pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_50%,var(--tw-gradient-from),transparent_70%)]',
            activeGlow,
          )}
        />
      )}

      <Icon
        className={cn(
          'relative h-5 w-5 transition-colors',
          active ? cn(activeColor, 'fill-current') : 'text-muted-foreground',
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
  mediaType: 'movie' | 'show' | 'game'
  className?: string
  userInteractions?: UserInteractionState | null
}

function InteractionSection({
  mediaId,
  mediaType,
  className,
  userInteractions,
}: InteractionSectionProps) {
  const { isAuthenticated } = useAuth()

  const { data: fetchedInteractions } = useUserInteractions(mediaId, {
    enabled: isAuthenticated && userInteractions == null,
  })

  const interactions = userInteractions ?? fetchedInteractions ?? null

  if (!isAuthenticated) {
    const listLabel = mediaType === 'game' ? 'wishlist' : 'watchlist'
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
    return mediaType === 'game'
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
      </div>
    </section>
  )
}

export { InteractionSection }
export type { InteractionSectionProps }
