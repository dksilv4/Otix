import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ScanProgressState } from '../../hooks/use-scan-progress'

export interface ScanProgressBarProps {
  isScanning: boolean
  progress: number
  currentDir?: string
  phase?: ScanProgressState['phase']
  className?: string
}

export const ScanProgressBar = ({
  isScanning,
  progress,
  currentDir,
  phase = 'idle',
  className,
}: ScanProgressBarProps) => {
  if (!isScanning && phase !== 'complete' && phase !== 'error') {
    return null
  }

  const isComplete = phase === 'complete' || progress >= 100
  const isError = phase === 'error'
  const isMatching = phase === 'matching'

  const titleText = isError
    ? 'Scan issue encountered'
    : isComplete
      ? 'Library scan complete'
      : isMatching
        ? 'Matching metadata…'
        : 'Scanning library…'

  return (
    <div
      role="region"
      aria-label="Library scan progress"
      className={cn('space-y-1.5 transition-all duration-200', className)}
    >
      <div className="flex items-center justify-between text-[11px] gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          {!isComplete && !isError && (
            <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
          )}
          <span className="font-medium text-foreground truncate">{titleText}</span>
          {currentDir && (
            <span className="text-[10px] text-muted-foreground font-mono truncate max-w-xs sm:max-w-md">
              {currentDir}
            </span>
          )}
        </div>
        <span className="font-mono text-xs font-semibold text-primary shrink-0 tabular-nums">
          {Math.round(progress)}%
        </span>
      </div>

      <div
        role="progressbar"
        aria-valuenow={Math.round(progress)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={titleText}
        className="h-1.5 w-full rounded-full bg-[var(--dk-surface-raised)] overflow-hidden"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all duration-300 ease-out',
            isError ? 'bg-destructive' : 'bg-primary',
          )}
          style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
        />
      </div>
    </div>
  )
}
