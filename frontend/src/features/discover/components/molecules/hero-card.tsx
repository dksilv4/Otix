import { useRef, type ReactNode } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { useCardTilt } from '@discover/hooks/use-card-tilt'
import type { MediaItemSummary } from '@media/queries/media-queries'

interface HeroCardProps {
  item: MediaItemSummary
  isActive: boolean
  layerDistance: number
  style?: React.CSSProperties
  className?: string
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClick?: () => void
  onTouchStart?: (e: React.TouchEvent) => void
  onTouchEnd?: (e: React.TouchEvent) => void
  children?: ReactNode
}

export function HeroCard({
  item,
  isActive,
  layerDistance,
  style,
  className,
  onMouseEnter,
  onMouseLeave,
  onClick,
  onTouchStart,
  onTouchEnd,
  children,
}: HeroCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const tilt = useCardTilt()

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    tilt.handleMouseMove(e, rect)
  }

  return (
    <motion.div
      ref={cardRef}
      className={cn(
        'absolute rounded-xl cursor-pointer',
        'shadow-[0_24px_60px_rgba(0,0,0,0.85)]',
        isActive ? 'z-10' : '',
        className,
      )}
      style={{
        ...style,
        ...(isActive ? {} : { filter: `brightness(0.6) blur(${layerDistance * 2}px)` }),
      }}
      onMouseMove={isActive ? handleMouseMove : undefined}
      onMouseEnter={onMouseEnter}
      onMouseLeave={(e) => { tilt.handleMouseLeave(); onMouseLeave?.() }}
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <motion.div
        className="relative w-full h-full"
        style={{
          ...(isActive ? tilt.style : {}),
          transformStyle: 'preserve-3d',
        }}
      >
        <motion.div
          className="absolute inset-0 overflow-hidden"
          style={{ clipPath: 'inset(0 round 12px)' }}
        >
          {(item.textlessPosterUrl) ? (
            <img
              src={item.textlessPosterUrl}
              alt={item.title}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-muted">
              <span className="text-muted-foreground text-sm">{item.title}</span>
            </div>
          )}
          {isActive && (
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
          )}
        </motion.div>
        {children}
      </motion.div>
    </motion.div>
  )
}
