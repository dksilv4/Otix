import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Trophy, Award } from 'lucide-react'
import { userQueries, type BadgeDef } from '../../user-queries'
import { SectionHeader } from '../molecules/section-header'
import type { SectionVisibility } from '../../types'

interface UserProfileBadgesProps {
  username: string
  isOwner?: boolean
  visibility?: SectionVisibility
  onToggleVisibility?: () => void | Promise<void>
  onChangeVisibility?: (visibility: SectionVisibility) => void | Promise<void>
  isUpdatingVisibility?: boolean
  onRemove?: () => void | Promise<void>
  isRemoving?: boolean
}

export const UserProfileBadges = ({
  username,
  isOwner = false,
  visibility = 'public',
  onToggleVisibility,
  onChangeVisibility,
  isUpdatingVisibility = false,
  onRemove,
  isRemoving = false,
}: UserProfileBadgesProps) => {
  const query = useQuery(userQueries.badges(username))
  const badges: BadgeDef[] = useMemo(
    () => (Array.isArray(query.data) ? query.data : []),
    [query.data],
  )

  const earned = useMemo(() => badges.filter((b) => b.earned), [badges])
  const summary = badges.length > 0 ? `${earned.length}/${badges.length} unlocked` : undefined

  return (
    <div data-testid="user-profile-badges" className="w-full space-y-4">
      <SectionHeader
        icon={Trophy}
        title="Achievements"
        summary={summary}
        isOwner={isOwner}
        visibility={visibility}
        onToggleVisibility={onToggleVisibility}
        onChangeVisibility={onChangeVisibility}
        isUpdatingVisibility={isUpdatingVisibility}
        onRemove={onRemove}
        isRemoving={isRemoving}
      />

      <div className="px-4 sm:px-6 lg:px-8">
        {query.isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className="h-20 rounded-2xl bg-[var(--dk-surface-ghost)] animate-pulse border border-[var(--dk-separator)]"
              />
            ))}
          </div>
        ) : badges.length === 0 ? (
          <div className="py-8 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed border-[var(--dk-separator)] bg-[var(--dk-surface-ghost)]/40">
            <Trophy className="h-6 w-6 text-muted-foreground/40 mb-1.5" />
            <p className="text-xs font-semibold text-muted-foreground">
              No badges recorded yet
            </p>
            <p className="text-[11px] text-muted-foreground/60 max-w-xs mt-0.5">
              Interact, review, and log media to unlock achievements.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {badges.slice(0, 8).map((badge) => (
              <div
                key={badge.badgeKey}
                className={`p-3.5 rounded-2xl border border-[var(--dk-separator)] flex items-center gap-3 transition-colors ${
                  badge.earned
                    ? 'bg-[var(--dk-surface-base)] text-foreground'
                    : 'bg-[var(--dk-surface-ghost)]/50 opacity-60'
                }`}
              >
                <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-[var(--dk-surface-ghost)] shrink-0 text-primary">
                  <Award className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-xs font-semibold truncate block">
                    {badge.label}
                  </span>
                  <span className="text-[10px] text-muted-foreground truncate block">
                    {badge.earned ? 'Unlocked' : `${badge.currentValue}/${badge.targetValue}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
