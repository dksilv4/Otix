import { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import './avatar.scss'

interface DkAvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  icon?: React.ReactNode
}

const sizeClasses: Record<string, string> = {
  sm: 'dk-avatar--sm',
  md: 'dk-avatar--md',
  lg: 'dk-avatar--lg',
  xl: 'dk-avatar--xl',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((n) => n[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

const DkAvatar = forwardRef<HTMLDivElement, DkAvatarProps>(
  ({ src, name, size = 'md', className, icon }, ref) => {
    const [imgError, setImgError] = useState(false)

    if (src && !imgError) {
      return (
        <div ref={ref} className={cn('dk-avatar', sizeClasses[size], className)}>
          <img
            src={src}
            alt={name}
            onError={() => setImgError(true)}
            className="dk-avatar__img"
          />
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn('dk-avatar__fallback', sizeClasses[size], className)}
        aria-label={name || 'User avatar'}
      >
        {icon ? icon : getInitials(name)}
      </div>
    )
  },
)
DkAvatar.displayName = 'DkAvatar'

export { DkAvatar }
