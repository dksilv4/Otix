import { Sparkles, Gamepad2, X, CheckCircle2, AlertTriangle } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import {
  type MatchingProgressData,
  formatMatchingPercent,
  formatMatchingRatio,
  getMatchingStatusLabel,
} from '../../utils/matching-progress'

export interface MatchingProgressCardProps {
  data: MatchingProgressData
  onCancel?: () => void
  className?: string
}

export const MatchingProgressCard = ({
  data,
  onCancel,
  className,
}: MatchingProgressCardProps) => {
  if (!data.isMatching && data.status !== 'completed' && data.status !== 'error') {
    return null
  }

  const isComplete = data.status === 'completed'
  const isError = data.status === 'error'
  const isRunning = data.isMatching || data.status === 'running'

  return (
    <div
      role="region"
      aria-label="Game catalog matching progress"
      className={cn(
        'p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] backdrop-blur-xl space-y-3 transition-colors duration-300 shadow-xs',
        className,
      )}
    >
      {/* Header Row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
            {isRunning ? (
              <Sparkles className="h-3.5 w-3.5 animate-pulse" />
            ) : isComplete ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-semibold text-foreground truncate">
              {isRunning
                ? 'Matching Library with Catalog'
                : isComplete
                  ? 'Catalog Matching Complete'
                  : 'Matching Issue'}
            </h4>
            <p className="text-[11px] text-muted-foreground truncate">
              {getMatchingStatusLabel(data)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="font-mono text-xs font-semibold text-primary tabular-nums">
            {formatMatchingPercent(data.percent)}
          </span>
          {isRunning && onCancel && (
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground cursor-pointer rounded-lg"
              title="Cancel matching"
            >
              <X className="h-3.5 w-3.5" />
            </DkButton>
          )}
        </div>
      </div>

      {/* Current Matched Item Card (when running or recent) */}
      {data.currentItem && (
        <div className="flex items-center justify-between gap-3 p-2 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04]">
          <div className="flex items-center gap-2.5 min-w-0">
            {data.currentPosterUrl ? (
              <img
                src={data.currentPosterUrl}
                alt={data.currentItem}
                className="h-9 w-6 rounded-md object-cover bg-[var(--dk-surface-ghost)] shrink-0 shadow-xs border border-white/[0.04]"
                loading="lazy"
              />
            ) : (
              <div className="flex h-9 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0 border border-white/[0.04]">
                <Gamepad2 className="h-3 w-3" />
              </div>
            )}
            <div className="min-w-0 space-y-0.5">
              <p className="text-xs font-medium text-foreground truncate">
                {data.currentItem}
              </p>
              <p className="text-[10px] text-muted-foreground font-mono">
                {formatMatchingRatio(data.processed, data.total)}
              </p>
            </div>
          </div>

          {data.confidence != null && (
            <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-primary/10 text-primary shrink-0">
              {Math.round(data.confidence * 100)}% match
            </span>
          )}
        </div>
      )}

      {/* Progress Track */}
      <div
        role="progressbar"
        aria-valuenow={Math.round(data.percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full rounded-full bg-[var(--dk-surface-raised)] overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-colors duration-300 ease-out',
            isError ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, Math.max(0, data.percent))}%` }}
        />
      </div>
    </div>
  )
}
