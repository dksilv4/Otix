import {
  Files,
  CheckCircle2,
  FolderSync,
  Tag,
  ArrowRight,
  RefreshCw,
  Sparkles,
  Loader2,
  Gamepad2,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { cn } from '@/lib/utils'
import type { ScannedFilesSummaryData } from '../../utils/scanned-summary'

export interface ScannedFilesSummaryProps {
  summary: ScannedFilesSummaryData | null
  isLoading?: boolean
  scanProgress?: number
  scanCurrentDir?: string
  scanPhase?: string
  onOrganizeClick?: () => void
  onRescanClick?: () => void
  onViewGamesClick?: () => void
  className?: string
}

export const ScannedFilesSummary = ({
  summary,
  isLoading = false,
  scanProgress,
  scanCurrentDir,
  scanPhase = 'scanning',
  onOrganizeClick,
  onRescanClick,
  onViewGamesClick,
  className,
}: ScannedFilesSummaryProps) => {
  const hasFiles = summary && summary.totalCount > 0
  const isScanningActive = isLoading || (typeof scanProgress === 'number' && scanProgress > 0 && scanProgress < 100)

  return (
    <div
      className={cn(
        'p-4 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] space-y-3.5 transition-all',
        className,
      )}
    >
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0 shadow-xs">
            <Files className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold text-foreground">Scanned Files Summary</h3>
              {isScanningActive ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary flex items-center gap-1.5 shrink-0">
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span>
                    {scanPhase === 'matching' ? 'Matching…' : 'Scanning…'}{' '}
                    {typeof scanProgress === 'number' && scanProgress > 0 ? `${Math.round(scanProgress)}%` : ''}
                  </span>
                </span>
              ) : hasFiles ? (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary shrink-0">
                  {summary.totalCount} {summary.totalCount === 1 ? 'file' : 'files'}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              Overview of indexed files across monitored directories and organization readiness.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
          {onViewGamesClick && hasFiles && (
            <DkButton
              size="sm"
              variant="outline"
              onClick={onViewGamesClick}
              className="h-7 px-2.5 text-xs bg-[var(--dk-surface-base)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
              title="View indexed games"
            >
              <Gamepad2 className="h-3 w-3 mr-1 text-primary" />
              <span>View Games</span>
            </DkButton>
          )}

          {onRescanClick && (
            <DkButton
              size="sm"
              variant="ghost"
              onClick={onRescanClick}
              disabled={isScanningActive}
              loading={isScanningActive}
              className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
              title="Rescan folders"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              <span>{isScanningActive ? 'Scanning…' : hasFiles ? 'Rescan' : 'Scan Now'}</span>
            </DkButton>
          )}

          {onOrganizeClick && (
            <DkButton
              size="sm"
              variant="outline"
              onClick={onOrganizeClick}
              className="h-7 px-3 text-xs bg-[var(--dk-surface-base)] border border-white/[0.04] hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer"
            >
              <Sparkles className="h-3 w-3 mr-1.5 text-primary" />
              <span>Organize Rules</span>
              <ArrowRight className="h-3 w-3 ml-1 text-muted-foreground" />
            </DkButton>
          )}
        </div>
      </div>

      {/* Empty State when not scanning and no files */}
      {!hasFiles && !isScanningActive && (
        <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] text-center space-y-1">
          <p className="text-xs font-semibold text-foreground">No files scanned yet</p>
          <p className="text-[11px] text-muted-foreground max-w-sm">
            Configure scan folders below and click Scan Now to discover games and analyze organization status.
          </p>
        </div>
      )}

      {/* Metrics Cards Grid */}
      {hasFiles && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
          {/* 1. Total Scanned */}
          <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium">Total Files</span>
              <Files className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight">
              {summary.totalCount}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {summary.installedCount} games · {summary.isoCount} ISOs
            </p>
          </div>

          {/* 2. Organized */}
          <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium">Organized</span>
              <CheckCircle2 className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight">
              {summary.organizedCount}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {summary.organizedPercentage}% adheres to structure
            </p>
          </div>

          {/* 3. Pending Organize */}
          <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium">Pending Organize</span>
              <FolderSync className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight">
              {summary.unorganizedCount}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              {summary.unorganizedCount > 0 ? 'Requires renaming or move' : 'All organized'}
            </p>
          </div>

          {/* 4. Metadata Matched */}
          <div className="p-3 rounded-xl bg-[var(--dk-surface-base)] border border-white/[0.04] space-y-1">
            <div className="flex items-center justify-between text-muted-foreground">
              <span className="text-[11px] font-medium">Metadata Matched</span>
              <Tag className="h-3.5 w-3.5 text-primary" />
            </div>
            <p className="text-lg font-bold text-foreground tracking-tight">
              {summary.matchedCount}
            </p>
            <p className="text-[10px] text-muted-foreground truncate">
              Verified with catalog sidecars
            </p>
          </div>
        </div>
      )}

      {/* Progress Bar (Real-time Scan Progress when active, Organization Status when idle) */}
      {isScanningActive && typeof scanProgress === 'number' ? (
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <div className="flex items-center gap-1.5 min-w-0">
              <Loader2 className="h-3 w-3 text-primary animate-spin shrink-0" />
              <span className="font-medium text-foreground">
                {scanPhase === 'matching' ? 'Writing metadata sidecars…' : 'Scanning directories…'}
              </span>
              {scanCurrentDir && (
                <span className="text-[10px] text-muted-foreground font-mono truncate max-w-xs sm:max-w-md">
                  {scanCurrentDir}
                </span>
              )}
            </div>
            <span className="font-mono text-xs font-semibold text-primary shrink-0 tabular-nums">
              {Math.round(scanProgress)}%
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--dk-surface-base)] overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, scanProgress))}%` }}
            />
          </div>
        </div>
      ) : hasFiles ? (
        <div className="space-y-1 pt-0.5">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>Organization Status</span>
            <span className="font-semibold text-foreground">
              {summary.organizedPercentage}% Organized
            </span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-[var(--dk-surface-base)] overflow-hidden flex">
            <div
              className="h-full bg-primary transition-all duration-500 rounded-full"
              style={{ width: `${Math.min(100, Math.max(0, summary.organizedPercentage))}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
}
