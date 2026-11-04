import { useState } from 'react'
import {
  Sparkles,
  RefreshCw,
  X,
  ChevronRight,
  HardDrive,
  Gamepad2,
  FolderOpen,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import { MatchReviewCenterModal } from '@/features/settings/components/organisms/match-review-center-modal'
import { useLibraryScanner } from '../hooks/use-library-scanner'
import { cn } from '@/lib/utils'

export interface LibraryScanBarProps {
  className?: string
  /** Whether to show the top scan button or only the summary banner */
  showButton?: boolean
}

export const LibraryScanBar = ({
  className,
  showButton = true,
}: LibraryScanBarProps) => {
  const navigate = useNavigate()
  const {
    isScanning,
    scanProgress,
    scanPhase,
    summary,
    isBannerVisible,
    dismissBanner,
    triggerScan,
    isMatchCenterOpen,
    setIsMatchCenterOpen,
  } = useLibraryScanner()

  const pendingCount = summary.needsReviewCount + summary.unmatchedCount

  return (
    <div className={cn('space-y-3', className)}>
      {/* Top Action Pill (if button display is requested) */}
      {showButton && (
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={triggerScan}
              disabled={isScanning}
              className={cn(
                'inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs',
                isScanning
                  ? 'bg-primary/80 text-primary-foreground opacity-90'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground active:scale-95',
              )}
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isScanning && 'animate-spin')} />
              <span>{isScanning ? `Scanning… ${scanProgress > 0 ? `${Math.round(scanProgress)}%` : ''}` : 'Scan Drives'}</span>
            </button>

            {pendingCount > 0 && (
              <button
                type="button"
                onClick={() => setIsMatchCenterOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground border border-white/[0.04] transition-all cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-primary" />
                <span>Review Matches ({pendingCount})</span>
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => navigate({ to: '/settings/paths' })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors cursor-pointer"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Drive Locations</span>
          </button>
        </div>
      )}

      {/* Results Summary Banner (soft glassmorphism, dismissible) */}
      {isBannerVisible && (
        <div className="rounded-2xl bg-[var(--dk-surface-glass)]/60 backdrop-blur-xl border border-white/[0.04] p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all animate-in fade-in duration-200">
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
              <Gamepad2 className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-foreground">
                  {summary.totalCount > 0 ? `${summary.totalCount} Games Indexed` : 'Library Ready'}
                </span>
                {summary.devicesCount > 1 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-[var(--dk-surface-ghost)] text-muted-foreground border border-white/[0.04]">
                    {summary.devicesCount} devices
                  </span>
                )}
                {pendingCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-primary/15 text-primary">
                    {pendingCount} need attention
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                {pendingCount > 0
                  ? `${summary.matchedCount} automatically matched. Review or link custom titles manually.`
                  : `${summary.matchedCount} titles matched with catalog artwork and metadata.`}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {pendingCount > 0 && (
              <DkButton
                size="sm"
                variant="outline"
                onClick={() => setIsMatchCenterOpen(true)}
                className="h-8 px-3 text-xs bg-[var(--dk-surface-base)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
              >
                <span>Check Matches</span>
                <ChevronRight className="h-3.5 w-3.5 ml-1 text-primary" />
              </DkButton>
            )}
            <button
              type="button"
              onClick={dismissBanner}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors cursor-pointer"
              aria-label="Dismiss scan summary"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Match Review Center Modal */}
      {isMatchCenterOpen && (
        <MatchReviewCenterModal
          open={isMatchCenterOpen}
          onOpenChange={setIsMatchCenterOpen}
        />
      )}
    </div>
  )
}
