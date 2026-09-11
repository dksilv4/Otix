import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DkSkeleton } from './skeleton'

interface DkImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode
  /** Extra classes merged onto the underlying <img> (defaults to a cover fill). */
  imgClassName?: string
}

function DkImage({ src, className, alt, fallback, imgClassName, onError, onLoad, ...props }: DkImageProps) {
  if (!src) {
    return (
      <div className={cn('flex items-center justify-center bg-muted text-xs text-muted-foreground', className)}>
        {fallback ?? alt?.[0]?.toUpperCase() ?? '?'}
      </div>
    )
  }
  // key=src remounts the loader per URL: while a new image loads, the previous
  // frame is never shown — a placeholder renders first, then the new one fades in.
  return (
    <div className={cn('relative overflow-hidden', className)}>
      <DkImageInner
        key={src}
        src={src}
        alt={alt}
        fallback={fallback}
        imgClassName={imgClassName}
        onError={onError}
        onLoad={onLoad}
        {...props}
      />
    </div>
  )
}

function DkImageInner({ src, alt, fallback, imgClassName, onError, onLoad, ...props }: DkImageProps) {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  if (hasError) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-muted text-xs text-muted-foreground">
        {fallback ?? alt?.[0]?.toUpperCase() ?? '?'}
      </div>
    )
  }

  return (
    <>
      {isLoading && <DkSkeleton className="absolute inset-0 rounded-none" />}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        className={cn(
          'h-full w-full transition-opacity duration-300',
          !imgClassName && 'object-cover',
          isLoading && 'opacity-0',
          imgClassName,
        )}
        onLoad={(e) => {
          setIsLoading(false)
          onLoad?.(e)
        }}
        onError={(e) => {
          setHasError(true)
          onError?.(e)
        }}
        {...props}
      />
    </>
  )
}

export { DkImage, DkImage as Image }
