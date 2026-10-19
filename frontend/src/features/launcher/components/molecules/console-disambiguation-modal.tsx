import { Gamepad2, Disc3, Check } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { getConsoleOptionInfo } from '@/features/launcher/utils/console-disambiguation'
import type { LocalGame } from '@/features/launcher/types'

interface ConsoleDisambiguationModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  game: LocalGame
  candidatePlatforms: string[]
  onSelectPlatform: (platform: string) => void
  isSubmitting?: boolean
}

export const ConsoleDisambiguationModal = ({
  open,
  onOpenChange,
  game,
  candidatePlatforms,
  onSelectPlatform,
  isSubmitting = false,
}: ConsoleDisambiguationModalProps) => {
  const options = candidatePlatforms.map(getConsoleOptionInfo)

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      className="w-full max-w-md border border-[var(--dk-separator)] shadow-2xl"
    >
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-[var(--dk-separator)]">
        <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Disc3 size={18} className="text-primary" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-foreground">Select Console</h2>
          <p className="text-xs text-muted-foreground">
            This format can run on multiple systems. Choose the console to launch with.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Game summary */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
          <div className="w-10 h-10 rounded-xl overflow-hidden shrink-0 bg-[var(--dk-surface-field)] flex items-center justify-center">
            {game.iconUrl ? (
              <img src={game.iconUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <Gamepad2 size={20} className="text-muted-foreground/60" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground truncate">{game.title}</p>
            <p className="text-xs text-muted-foreground truncate">{game.exePath}</p>
          </div>
        </div>

        {/* Console choices */}
        <div className="grid grid-cols-1 gap-2 pt-2">
          {options.map((opt) => (
            <button
              key={opt.platform}
              type="button"
              disabled={isSubmitting}
              onClick={() => onSelectPlatform(opt.platform)}
              className="flex items-center justify-between p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] transition-all text-left group disabled:opacity-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--dk-surface-field)] flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:text-foreground group-hover:bg-primary/20 transition-colors">
                  <Gamepad2 size={16} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {opt.label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {opt.vendor} • {opt.generation}
                  </div>
                </div>
              </div>
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-muted-foreground/40 group-hover:text-primary transition-colors">
                <Check size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </button>
          ))}
        </div>
      </div>
    </DkDialog>
  )
};
