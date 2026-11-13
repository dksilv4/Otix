import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HeroIndicatorProps {
  total: number
  activeIndex: number
  onSelect: (index: number) => void
}

export const HeroIndicator = ({ total, activeIndex, onSelect }: HeroIndicatorProps) => {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: Math.min(total, 9) }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className={cn(
            'relative h-1.5 rounded-full transition-colors duration-300 cursor-pointer',
            i === activeIndex ? 'w-6 bg-primary shadow-xs' : 'w-1.5 bg-muted-foreground/40 hover:bg-muted-foreground/60',
          )}
        >
          {i === activeIndex && (
            <motion.div
              className="absolute inset-0 rounded-full shadow-xs"
              layoutId="active-indicator"
            />
          )}
        </button>
      ))}
    </div>
  )
};
