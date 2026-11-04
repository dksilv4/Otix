import { Sparkles, Trophy } from 'lucide-react'
import { getLevelTier, getLevelTitle } from '../../utils'
import { DkDialog } from '@ui/molecules/dialog'

export interface LevelUpModalProps {
  level: number
  title?: string
  open?: boolean
  isOpen?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
  isExiting?: boolean
}

export const LevelUpModal = ({
  level,
  title,
  open,
  isOpen,
  onClose,
  onOpenChange,
  isExiting = false,
}: LevelUpModalProps) => {
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting
  const levelTitle = title ?? getLevelTitle(level)
  const tier = getLevelTier(level)

  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      className="max-w-sm flex flex-col items-center text-center p-7"
    >
      <div className="flex flex-col items-center text-center w-full">
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
          onClick={handleClose}
          className="mt-6 w-full cursor-pointer rounded-xl bg-primary py-3 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90 shadow-md"
        >
          Awesome!
        </button>
      </div>
    </DkDialog>
  )
};
