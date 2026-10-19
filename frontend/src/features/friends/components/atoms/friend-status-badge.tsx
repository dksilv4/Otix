import type { FriendOnlineState } from '../../types'

interface FriendStatusBadgeProps {
  state: FriendOnlineState
  label: string
  className?: string
}

export const FriendStatusBadge = ({
  state,
  label,
  className = '',
}: FriendStatusBadgeProps) => {
  const stateClasses =
    state === 'active_now'
      ? 'bg-primary/10 text-primary font-semibold'
      : state === 'active_today'
        ? 'bg-[var(--dk-surface-ghost)] text-foreground/80'
        : 'bg-[var(--dk-surface-ghost)] text-muted-foreground'

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-none ${stateClasses} ${className}`}
    >
      {label}
    </span>
  )
};
