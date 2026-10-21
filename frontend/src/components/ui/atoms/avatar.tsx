import { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { getInitials } from '@/lib/utils/avatar'
import { sanitizeImageUrl } from '@/lib/utils/image-url'

interface DkAvatarProps {
  src?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  icon?: React.ReactNode
}

const sizeClasses: Record<string, string> = {
  sm: 'h-8 w-8 text-xs',
  md: 'h-10 w-10 text-sm',
  lg: 'h-12 w-12 text-base',
  xl: 'h-16 w-16 text-lg',
}

const DkAvatar = forwardRef<HTMLDivElement, DkAvatarProps>(
  ({ src, name, size = 'md', className, icon }, ref) => {
    const [imgError, setImgError] = useState(false)
    const cleanSrc = sanitizeImageUrl(src)

    if (cleanSrc && !imgError) {
      return (
        <div ref={ref} className={cn('relative shrink-0', sizeClasses[size], className)}>
          <img
            src={cleanSrc}
            alt={name}
            onError={() => setImgError(true)}
            className="h-full w-full rounded-full object-cover shadow-sm"
          />
        </div>
      )
    }

    return (
      <div
        ref={ref}
        className={cn(
          'flex shrink-0 items-center justify-center rounded-full font-medium shadow-sm bg-primary/10 text-primary',
          sizeClasses[size],
          className,
        )}
        aria-label={name || 'User avatar'}
      >
        {icon ? icon : getInitials(name)}
      </div>
    )
  },
)
DkAvatar.displayName = 'DkAvatar'

export { DkAvatar }
