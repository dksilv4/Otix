import { useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { DkSkeleton } from './skeleton'

interface DkImageProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  fallback?: ReactNode
  /** Extra classes merged onto the underlying <img> (defaults to a cover fill). */
  imgClassName?: string
  /** Set to true for above-the-fold images to avoid lazy loading delay. */
  priority?: boolean
}

const DkImage = ({
  src,
  className,
  alt,
  fallback,
  imgClassName,
  onError,
  onLoad,
  priority = false,
  ...props
}: DkImageProps) => {
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
        priority={priority}
        {...props}
      />
    </div>
  )
};

const DkImageInner = ({ src, alt, fallback, imgClassName, onError, onLoad, priority = false, ...props }: DkImageProps) => {
  const imgRef = useRef<HTMLImageElement>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  // Cached images can be complete before React attaches onLoad, which leaves
  // the skeleton up and the image at opacity 0.
  useEffect(() => {
    const img = imgRef.current
    if (!img?.complete) return
    if (img.naturalWidth > 0) setIsLoading(false)
    else setHasError(true)
  }, [src])

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
        loading={priority ? 'eager' : (props.loading ?? 'lazy')}
        fetchPriority={priority ? 'high' : (props.fetchPriority ?? 'auto')}
        decoding="async"
        referrerPolicy={props.referrerPolicy ?? 'no-referrer'}
        {...props}
        ref={imgRef}
        src={src}
        alt={alt}
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
      />
    </>
  )
};

export { DkImage, DkImage as Image }
