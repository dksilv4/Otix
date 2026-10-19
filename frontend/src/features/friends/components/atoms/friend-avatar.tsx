import { DkAvatar } from '@ui/atoms/avatar'
import type { FriendOnlineState } from '../../types'

interface FriendAvatarProps {
  src?: string | null
  username: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  state?: FriendOnlineState
  className?: string
}

export const FriendAvatar = ({
  src,
  username,
  size = 'md',
  state,
  className,
}: FriendAvatarProps) => {
  return (
    <div className="relative inline-flex shrink-0">
      <DkAvatar
        src={src}
        name={username}
        size={size}
        className={className}
      />
      {state === 'active_now' && (
        <span
          className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-[var(--dk-surface-base)]"
          title="Active now"
          aria-label="Active now"
        />
      )}
    </div>
  )
};
