import { Heart, Bookmark, CheckCircle2, Gamepad2, Play } from 'lucide-react'
import { type ReactNode, useState, useEffect, useRef } from 'react'
import { useAuth } from '@/features/auth'
import { cn } from '@/lib/utils'
import { showXPToast } from '@/features/dk-ui/atoms/xp-toast'
import { DkDialog } from '@dk-ui/molecules/dialog'
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
  onClick,
}: ButtonDef & { active: boolean; mediaId: string; onClick?: () => void }) {
  const toggle = useToggleInteraction(mediaId)
  const [localActive, setLocalActive] = useState<boolean | null>(null)
  const prevActiveRef = useRef(active)

  useEffect(() => {
    if (active !== prevActiveRef.current) {
      prevActiveRef.current = active
      setLocalActive(null)
    }
  }, [active])

  const isActive = localActive ?? active

  const handleClick = () => {
    if (onClick) {
      onClick()
      return
    }
    const nextActive = !isActive
    setLocalActive(nextActive)
    toggle.mutate({ type, active: nextActive })
    if (nextActive) {
      showXPToast(XP_VALUES[type])
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggle.isPending}
      className={cn(
        'group relative flex h-16 w-20 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl bg-[var(--dk-surface-base)] px-3 py-3 transition-all duration-150',
        'hover:bg-[var(--dk-surface-glass)]',
        toggle.isPending && 'pointer-events-none',
      )}
    >
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
  /** For shows: callback when "Watched" is clicked (shows confirmation first) */
  onShowWatchedToggle?: (active: boolean) => void
  /** For shows: total episodes info for confirmation dialog */
  showEpisodeInfo?: { watched: number; total: number }
}

function InteractionSection({
  mediaId,
  mediaType,
  className,
  userInteractions,
  children,
  onShowWatchedToggle,
  showEpisodeInfo,
}: InteractionSectionProps) {
  const { isAuthenticated } = useAuth()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState<boolean>(false)

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
            <a href="/auth/login" className="font-medium text-primary hover:underline">
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
        {visibleButtons.map((btn) => {
          const isWatchedBtn = btn.type === 'watched' && mediaType === 'show' && onShowWatchedToggle
          return (
            <InteractionButton
              key={btn.type}
              {...btn}
              active={interactions?.[btn.type] ?? false}
              mediaId={mediaId}
              onClick={
                isWatchedBtn
                  ? () => {
                      setConfirmAction(!(interactions?.watched ?? false))
                      setConfirmOpen(true)
                    }
                  : undefined
              }
            />
          )
        })}
        {children}
      </div>

      {/* Show-level watch confirmation dialog */}
      <DkDialog
        open={confirmOpen}
        onOpenChange={(open) => { if (!open) setConfirmOpen(false) }}
        title={confirmAction ? "Mark show as watched?" : "Mark show as unwatched?"}
        description={
          confirmAction
            ? showEpisodeInfo
              ? `This will mark all ${showEpisodeInfo.total - showEpisodeInfo.watched} remaining episodes as watched.`
              : "This will mark all episodes in this show as watched."
            : "This will mark all episodes in this show as unwatched."
        }
      >
        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={() => setConfirmOpen(false)}
            className="px-4 py-2 rounded-xl text-sm font-medium bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-glass-hover)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onShowWatchedToggle?.(confirmAction)
              setConfirmOpen(false)
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium text-white transition-colors",
              confirmAction ? "bg-emerald-600 hover:bg-emerald-500" : "bg-red-600 hover:bg-red-500",
            )}
          >
            {confirmAction ? "Mark All Watched" : "Mark All Unwatched"}
          </button>
        </div>
      </DkDialog>
    </section>
  )
}

export { InteractionSection }
export type { InteractionSectionProps }
