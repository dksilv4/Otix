import { useEffect } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, Trophy, X } from 'lucide-react'
import { getLevelTier, getLevelTitle } from '../../utils'

interface LevelUpModalProps {
  level: number
  title?: string
  onClose: () => void
  isExiting?: boolean
}

const EASE = [0.16, 1, 0.3, 1] as const

export const LevelUpModal = ({
  level,
  title,
  onClose,
  isExiting = false,
}: LevelUpModalProps) => {
  const visible = !isExiting
  const levelTitle = title ?? getLevelTitle(level)
  const tier = getLevelTier(level)

  useEffect(() => {
    if (!visible) return
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [visible, onClose])

  return (
    <div className="fixed inset-0 z-[var(--dk-z-modal)] flex items-center justify-center p-4 pointer-events-none">
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: visible ? 1 : 0 }}
        transition={{ duration: 0.22, ease: EASE }}
        className="absolute inset-0 bg-black/80 backdrop-blur-md pointer-events-auto"
        onClick={onClose}
      />

      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Level Up!"
        initial={{ opacity: 0, scale: 0.92, y: 20 }}
        animate={{
          opacity: visible ? 1 : 0,
          scale: visible ? 1 : 0.94,
          y: visible ? 0 : 14,
        }}
        transition={{ duration: 0.32, ease: EASE }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center overflow-hidden rounded-3xl p-7 text-center text-foreground pointer-events-auto bg-card border border-primary/30 shadow-2xl"
        style={{
          boxShadow: `0 0 40px ${tier.glow}, 0 20px 50px rgba(0, 0, 0, 0.8)`,
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-xl p-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors cursor-pointer"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-1.5 text-xs font-black uppercase tracking-widest text-primary mb-3">
          <Sparkles className="h-4 w-4 animate-pulse" />
          <span>Level Up!</span>
          <Sparkles className="h-4 w-4 animate-pulse" />
        </div>

        {/* Circular Level Ring */}
        <div
          className="relative my-4 flex h-28 w-28 items-center justify-center rounded-full border-2 border-primary/50 shadow-inner"
          style={{ backgroundColor: tier.barColor }}
        >
          <div className="flex flex-col items-center">
            <Trophy className="h-6 w-6 text-primary mb-0.5" />
            <span className="text-3xl font-black tracking-tight text-foreground">
              {level}
            </span>
          </div>
        </div>

        <h2 className="text-2xl font-black tracking-tight text-foreground mt-1">
          {levelTitle}
        </h2>
        <p className="text-xs text-muted-foreground mt-2 max-w-xs leading-relaxed">
          Congratulations! You've unlocked Level {level} status. Keep engaging with
          movies, shows, games, and workouts to climb the ranks.
        </p>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 shadow-md"
        >
          Awesome!
        </button>
      </motion.div>
    </div>
  )
};
