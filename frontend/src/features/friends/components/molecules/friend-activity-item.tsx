import { Link } from '@tanstack/react-router'
import { Star, Film, Tv, Gamepad2 } from 'lucide-react'
import { FriendAvatar } from '../atoms/friend-avatar'
import { formatRelativeTime } from '../../utils'
import type { FriendActivityEvent } from '../../types'

interface FriendActivityItemProps {
  activity: FriendActivityEvent
}

export const FriendActivityItem = ({ activity }: FriendActivityItemProps) => {
  const { user, mediaItem, type, summary, score, content, timestamp } = activity
  const relativeTime = formatRelativeTime(timestamp)

  const mediaPath = mediaItem
    ? mediaItem.mediaType === 'game'
      ? `/launcher/${mediaItem.id}`
      : `/media/${mediaItem.id}`
    : null

  return (
    <div className="flex gap-4 rounded-2xl bg-[var(--dk-surface-glass)] p-4 transition-all duration-200 border border-[var(--dk-separator)] shadow-sm hover:bg-[var(--dk-surface-ghost-hover)]">
      {/* User avatar */}
      <Link
        to="/u/$username"
        params={{ username: user.username }}
        className="shrink-0"
      >
        <FriendAvatar
          src={user.avatarUrl}
          username={user.username}
          size="md"
        />
      </Link>

      {/* Main body */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <Link
              to="/u/$username"
              params={{ username: user.username }}
              className="text-xs font-semibold text-foreground hover:text-primary transition-colors"
            >
              {user.username}
            </Link>
            <span className="text-xs text-muted-foreground">{summary}</span>
          </div>

          <span className="shrink-0 text-[11px] text-muted-foreground">
            {relativeTime}
          </span>
        </div>

        {/* Review rating & text */}
        {type === 'review' && (
          <div className="mt-2 rounded-xl bg-[var(--dk-surface-ghost)] p-2.5 text-xs">
            {typeof score === 'number' && (
              <div className="mb-1 flex items-center gap-1 text-primary font-bold">
                <Star className="h-3.5 w-3.5 fill-current" />
                <span>{score}/10</span>
              </div>
            )}
            {content && (
              <p className="line-clamp-3 text-foreground/90 italic">
                "{content}"
              </p>
            )}
          </div>
        )}

        {/* Media Item Preview */}
        {mediaItem && (
          <div className="mt-2.5 flex items-center gap-3 rounded-xl bg-[var(--dk-surface-ghost)] p-2">
            {mediaItem.posterUrl ? (
              <img
                src={mediaItem.posterUrl}
                alt={mediaItem.title}
                className="h-12 w-8 shrink-0 rounded-md object-cover shadow-sm"
              />
            ) : (
              <div className="flex h-12 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--dk-surface-ghost-active)] text-muted-foreground">
                {mediaItem.mediaType === 'game' ? (
                  <Gamepad2 className="h-4 w-4" />
                ) : mediaItem.mediaType === 'show' ? (
                  <Tv className="h-4 w-4" />
                ) : (
                  <Film className="h-4 w-4" />
                )}
              </div>
            )}

            <div className="min-w-0 flex-1">
              {mediaPath ? (
                <Link
                  to={mediaPath}
                  className="truncate text-xs font-semibold text-foreground hover:text-primary transition-colors block"
                >
                  {mediaItem.title}
                </Link>
              ) : (
                <p className="truncate text-xs font-semibold text-foreground">
                  {mediaItem.title}
                </p>
              )}
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {mediaItem.mediaType}
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
};
