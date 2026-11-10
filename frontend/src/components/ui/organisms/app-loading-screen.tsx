import { cn } from '@/lib/utils'
import { Logo } from '@ui/atoms/logo'
import { useAppLoadingState } from '@/features/updater/hooks/use-app-loading-state'
import { preventInteraction } from '@/features/updater/utils/loading-screen-utils'

export interface AppLoadingScreenProps {
  className?: string
  minDisplayMs?: number
}

/**
 * Top-level application loading gate that covers the entire viewport until
 * all critical startup criteria (cache restore, desktop IPC, auth, real-time update checks & downloads)
 * have completed.
 *
 * It is completely non-interactive and prevents all pointer and keyboard events
 * from passing through to underlying components until the application is ready.
 */
export const AppLoadingScreen = ({
  className,
  minDisplayMs,
}: AppLoadingScreenProps) => {
  const {
    isMounted,
    isExiting,
    statusMessage,
    progress,
    isDownloadingUpdate,
  } = useAppLoadingState(minDisplayMs)

  if (!isMounted) {
    return null
  }

  const showProgress = isDownloadingUpdate || progress.percent > 0

  return (
    <div
      className={cn(
        'fixed inset-0 z-[999999] flex flex-col items-center justify-center bg-background select-none overflow-hidden transition-opacity duration-500 ease-out',
        isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100 pointer-events-auto cursor-default',
        className,
      )}
      onPointerDown={preventInteraction}
      onMouseDown={preventInteraction}
      onClick={preventInteraction}
      onContextMenu={preventInteraction}
      onTouchStart={preventInteraction}
      onKeyDown={preventInteraction}
      role="status"
      aria-live="polite"
      aria-busy="true"
      tabIndex={-1}
    >
      {/* Soft ambient background glow */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-[32rem] h-[32rem] rounded-full bg-primary/10 blur-[100px] pointer-events-none" />
      </div>

      {/* Center content pod */}
      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <Logo
          className="h-16 sm:h-20 drop-shadow-[0_0_32px_color-mix(in_oklch,var(--primary)_35%,transparent)]"
          animateInfinity
        />

        <div className="mt-8 flex flex-col items-center gap-2 max-w-xs sm:max-w-sm">
          <span className="text-sm font-medium text-foreground tracking-wide">
            {statusMessage}
          </span>

          {showProgress && (
            <div className="flex flex-col items-center w-64 sm:w-72 mt-2 gap-1.5 animate-in fade-in duration-300">
              {/* Progress track */}
              <div className="w-full h-1.5 rounded-full overflow-hidden bg-muted/40 relative">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-200"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>

              {/* Progress metrics */}
              <div className="flex items-center justify-between w-full text-[11px] font-mono text-muted-foreground px-0.5">
                <span>{progress.percent}%</span>
                {progress.transferredText && (
                  <span>{progress.transferredText}</span>
                )}
              </div>

              {progress.speedText && (
                <span className="text-[10px] font-mono text-muted-foreground/80">
                  {progress.speedText}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
