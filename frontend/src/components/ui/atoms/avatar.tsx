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

const isKnownFailedUrl = (url: string): boolean => {
  if (typeof window === 'undefined') return false
  try {
    const raw = sessionStorage.getItem('otix_failed_img_urls')
    if (!raw) return false
    const list = JSON.parse(raw)
    return Array.isArray(list) && list.includes(url)
  } catch {
    return false
  }
}

const markFailedUrl = (url: string): void => {
  if (typeof window === 'undefined') return
  try {
    const raw = sessionStorage.getItem('otix_failed_img_urls')
    const list = raw ? JSON.parse(raw) : []
    if (Array.isArray(list) && !list.includes(url)) {
      list.push(url)
      sessionStorage.setItem('otix_failed_img_urls', JSON.stringify(list))
    }
  } catch {}
}

const DkAvatar = forwardRef<HTMLDivElement, DkAvatarProps>(
  ({ src, name, size = 'md', className, icon }, ref) => {
    const [imgError, setImgError] = useState(false)
    const cleanSrc = sanitizeImageUrl(src)
    const isFailed = Boolean(cleanSrc && (imgError || isKnownFailedUrl(cleanSrc)))

    if (cleanSrc && !isFailed) {
      return (
        <div ref={ref} className={cn('relative shrink-0', sizeClasses[size], className)}>
          <img
            src={cleanSrc}
            alt={name}
            onError={() => {
              if (cleanSrc) markFailedUrl(cleanSrc)
              setImgError(true)
            }}
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
