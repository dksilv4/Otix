import { Sparkles } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'

export interface GameMatchReviewBannerProps {
  pendingMatchesCount: number
  onOpenMatchCenter: () => void
}

export const GameMatchReviewBanner = ({
  pendingMatchesCount,
  onOpenMatchCenter,
}: GameMatchReviewBannerProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-foreground">Game Match Review Center</h3>
            {pendingMatchesCount > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/10 text-primary border border-primary/20">
                {pendingMatchesCount} need review
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pure database matching. Verify catalog links or correct candidate matches.
          </p>
        </div>
      </div>
      <DkButton
        size="sm"
        variant="outline"
        onClick={onOpenMatchCenter}
        className="shrink-0 text-xs font-semibold rounded-xl cursor-pointer"
      >
        Open Match Center
      </DkButton>
    </div>
  )
}
