import { useState } from "react"
import { Link } from '@tanstack/react-router'
import { EyeOff, Eye, Trash2, Pencil } from "lucide-react"
import { StarRating } from "@ui/atoms/star-rating"
import { DkButton } from "@/features/dk-ui/atoms/button"
import { useSwipe } from "../hooks/use-swipe"
import type { ReviewWithUserOut } from "../review-queries"

interface ReviewCardProps {
  review: ReviewWithUserOut
  isOwn?: boolean
  onEdit?: () => void
  onDelete?: () => void
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (days < 1) return "Today"
  if (days < 2) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 365) return d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
}

function ReviewCard({ review, isOwn, onEdit, onDelete }: ReviewCardProps) {
  const [spoilerRevealed, setSpoilerRevealed] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const swipe = useSwipe({
    onSwipeLeft: isOwn ? () => setConfirmDelete(true) : undefined,
    onSwipeRight: isOwn ? onEdit : undefined,
  })

  const showSpoilerOverlay = review.isSpoiler && !spoilerRevealed

  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)]">
      {/* Swipe action backgrounds - only visible during swipe */}
      {isOwn && (
        <>
          <div className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-destructive/10 rounded-r-2xl">
            <Trash2 className="w-4 h-4 text-destructive" />
          </div>
          <div className="absolute inset-y-0 left-0 w-24 flex items-center justify-center bg-primary/10 rounded-l-2xl">
            <Pencil className="w-4 h-4 text-primary" />
          </div>
        </>
      )}

      <div
        className="relative bg-[var(--dk-surface-base)] p-5"
        style={{
          transform: `translateX(${swipe.translateX}px)`,
          transition: swipe.isSwiping ? "none" : "transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
      >
        {/* Header row */}
        <div className="flex items-start gap-3">
          {/* Avatar */}
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] text-sm font-semibold ring-1 ring-white/[0.06]">
            {review.user.username.charAt(0).toUpperCase()}
          </div>

          {/* User + meta */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <Link
                to="/u/$username"
                params={{ username: review.user.username }}
                className="text-sm font-semibold hover:text-primary transition-colors"
              >
                {review.user.username}
              </Link>
              {isOwn && (
                <span className="text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                  You
                </span>
              )}
              {review.isSpoiler && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded-full">
                  <EyeOff className="w-2.5 h-2.5" />
                  Spoiler
                </span>
              )}
              {isOwn && review.isPrivate && (
                <span className="text-[10px] font-medium text-muted-foreground bg-muted-foreground/10 px-1.5 py-0.5 rounded-full">
                  Private
                </span>
              )}
            </div>
            <span className="text-xs text-muted-foreground/60">{formatDate(review.createdAt)}</span>
          </div>

          {/* Score pill */}
          {review.score != null && (
            <div className="shrink-0 flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] px-2.5 py-1 ring-1 ring-white/[0.04]">
              <StarRating score={review.score} maxScore={10} size="sm" />
              <span className="text-sm font-bold tabular-nums">{review.score}</span>
              <span className="text-[10px] text-muted-foreground/50">/10</span>
            </div>
          )}
        </div>

        {/* Title */}
        {review.title && (
          <h4 className="mt-3 text-sm font-semibold">{review.title}</h4>
        )}

        {/* Rating-only (score but no text) */}
        {!review.title && !review.content && review.score != null && (
          <p className="mt-2 text-xs text-muted-foreground/50 italic">Rated only</p>
        )}

        {/* Content */}
        {review.content && (
          <div className="mt-2">
            {showSpoilerOverlay ? (
              <div className="relative rounded-xl overflow-hidden">
                <p className="text-sm text-muted-foreground/70 line-clamp-4 blur-[3px] select-none">
                  {review.content}
                </p>
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-xl bg-[var(--dk-surface-base)]/70 backdrop-blur-[2px]">
                  <EyeOff className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">Spoiler Warning</span>
                  <button
                    onClick={() => setSpoilerRevealed(true)}
                    className="inline-flex items-center gap-1.5 rounded-full bg-[var(--dk-surface-glass)] px-3 py-1 text-xs font-medium text-foreground ring-1 ring-white/[0.06] hover:bg-[var(--dk-surface-glass-hover)] transition-all"
                  >
                    <Eye className="w-3 h-3" />
                    Reveal
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-foreground/80 leading-relaxed whitespace-pre-line">
                {review.content}
              </p>
            )}
          </div>
        )}

        {/* Action buttons (desktop) */}
        {isOwn && (
          <div className="mt-3 flex gap-2 pt-1">
            <DkButton variant="ghost" size="xs" onClick={onEdit}>
              <Pencil className="w-3 h-3" />
              Edit
            </DkButton>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">Delete?</span>
                <DkButton variant="destructive" size="xs" onClick={onDelete}>
                  Yes
                </DkButton>
                <DkButton variant="ghost" size="xs" onClick={() => setConfirmDelete(false)}>
                  No
                </DkButton>
              </div>
            ) : (
              <DkButton variant="ghost" size="xs" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3 h-3" />
                Delete
              </DkButton>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export { ReviewCard }
