import { motion, AnimatePresence } from 'framer-motion'
import { Trophy, X } from 'lucide-react'
import { useAchievementNotifications } from '../../hooks/use-game-achievements'

export const LauncherAchievementToast = () => {
  const { toasts, dismissToast } = useAchievementNotifications()

  return (
    <div className="fixed top-6 right-6 z-[999] flex flex-col gap-3 pointer-events-none max-w-sm w-full">
      <AnimatePresence>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: -20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className="pointer-events-auto p-4 rounded-2xl bg-[var(--dk-surface-overlay)] border border-white/[0.06] backdrop-blur-xl shadow-2xl flex items-center gap-3.5 relative overflow-hidden"
          >
            {/* Subtle glow wash */}
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 via-transparent to-transparent pointer-events-none" />

            {/* Achievement Icon / Trophy */}
            <div className="relative shrink-0 w-12 h-12 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.06] flex items-center justify-center overflow-hidden">
              {toast.iconUrl ? (
                <img
                  src={toast.iconUrl}
                  alt={toast.displayName}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Trophy size={22} className="text-primary" />
              )}
            </div>

            {/* Texts */}
            <div className="flex-1 min-w-0 pr-6">
              <div className="flex items-center gap-1.5 mb-0.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Achievement Unlocked
                </span>
                {toast.points > 0 && (
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    +{toast.points} XP
                  </span>
                )}
              </div>
              <h4 className="text-sm font-bold text-foreground truncate leading-tight">
                {toast.displayName}
              </h4>
              {toast.description && (
                <p className="text-xs text-muted-foreground line-clamp-1 mt-0.5 font-normal">
                  {toast.description}
                </p>
              )}
              <span className="text-[10px] text-muted-foreground/80 block mt-1 truncate">
                {toast.gameTitle}
              </span>
            </div>

            {/* Dismiss button */}
            <button
              onClick={() => dismissToast(toast.id)}
              className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 rounded-lg hover:bg-[var(--dk-surface-ghost)]"
              aria-label="Dismiss"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
