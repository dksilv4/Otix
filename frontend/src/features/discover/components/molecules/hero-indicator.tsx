import { motion } from 'framer-motion'

interface HeroIndicatorProps {
  total: number
  activeIndex: number
  onSelect: (index: number) => void
}

export function HeroIndicator({ total, activeIndex, onSelect }: HeroIndicatorProps) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: Math.min(total, 9) }).map((_, i) => (
        <button
          key={i}
          type="button"
          onClick={() => onSelect(i)}
          className="relative h-1.5 rounded-full transition-all duration-300 cursor-pointer"
          style={{
            width: i === activeIndex ? 24 : 6,
            backgroundColor: i === activeIndex ? '#ffffff' : 'rgba(255,255,255,0.3)',
          }}
        >
          {i === activeIndex && (
            <motion.div
              className="absolute inset-0 rounded-full"
              style={{ boxShadow: '0 0 8px #ffffff' }}
              layoutId="active-indicator"
            />
          )}
        </button>
      ))}
    </div>
  )
}
