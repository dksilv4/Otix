import { useMemo } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { Download, ChevronRight, Loader2 } from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { useServerUsenetQueue } from '@/features/downloads/use-server-usenet'
import { useServerSonarrQueue, useServerRadarrQueue } from '@/features/downloads/use-server-arr'
import { useAuth } from '@/lib/providers/auth'
import { ActivityModuleSection } from './activity-module-section'
import { computeDownloadsSummary } from '../../utils/downloads'

/**
 * Downloads Summary Card for the Activity Panel.
 * Replaces the raw downloads list with a compact, interactive summary card
 * that displays active counts, speed, primary download progress, and links directly to /downloads.
 */
export const ActivityModuleDownloads = () => {
  const navigate = useNavigate()
  const { user: currentUser } = useAuth()
  const { downloads } = useDownloads(currentUser?.id)
  const { data: gameServers = [] } = useGameServers()

  const activeServer = useMemo(
    () =>
      gameServers.find((s) => typeof s.id === 'number' && s.id > 0 && s.isActive) ??
      gameServers.find((s) => typeof s.id === 'number' && s.id > 0),
    [gameServers],
  )
  const activeServerId = activeServer?.id

  const { data: usenetQueue } = useServerUsenetQueue(activeServerId)
  const { data: sonarrQueue } = useServerSonarrQueue(activeServerId)
  const { data: radarrQueue } = useServerRadarrQueue(activeServerId)

  const summary = useMemo(
    () =>
      computeDownloadsSummary({
        localDownloads: downloads,
        serverItems: usenetQueue?.items ?? [],
        sonarrRecords: sonarrQueue?.records ?? [],
        radarrRecords: radarrQueue?.records ?? [],
        usenetSpeed: usenetQueue?.speed,
      }),
    [downloads, usenetQueue?.items, usenetQueue?.speed, sonarrQueue?.records, radarrQueue?.records],
  )

  if (!summary.hasDownloads) return null

  const handleOpenDownloads = () => {
    navigate({ to: '/downloads' })
  }

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
      <div
        role="button"
        tabIndex={0}
        onClick={handleOpenDownloads}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleOpenDownloads()
          }
        }}
        className="group relative flex flex-col gap-2.5 p-3 rounded-2xl bg-[var(--dk-surface-overlay)]/70 hover:bg-[var(--dk-surface-overlay)] border border-white/[0.04] transition-colors duration-200 cursor-pointer shadow-sm hover:shadow-md text-left outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
        title="Open Downloads Manager"
        aria-label="Open Downloads Manager"
      >
        {/* Header: Title, Active Badge, and Navigation Indicator */}
        <div className="flex items-center justify-between gap-2 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="relative flex items-center justify-center shrink-0">
              {summary.isDownloading ? (
                <Loader2 className="h-4 w-4 text-primary animate-spin" />
              ) : (
                <Download className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-foreground">
              Downloads
            </span>
            {summary.totalActive > 0 && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-primary/15 text-primary">
                {summary.totalActive} active
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors">
            {summary.activeSpeed && (
              <span className="text-[11px] font-mono font-semibold text-primary">
                {summary.activeSpeed}
              </span>
            )}
            <ChevronRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </div>

        {/* Primary In-Progress Item Summary */}
        {summary.primaryItemTitle && (
          <div className="min-w-0 space-y-1.5">
            <p className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors" title={summary.primaryItemTitle}>
              {summary.primaryItemTitle}
            </p>

            {/* Progress bar */}
            <div className="flex items-center gap-2.5">
              <div className="h-1.5 rounded-full overflow-hidden flex-1 bg-muted">
                <div
                  className="h-full rounded-full transition-colors duration-500 bg-primary"
                  style={{ width: `${Math.max(summary.primaryProgress, 2)}%` }}
                />
              </div>
              <span className="text-[10px] font-mono tabular-nums font-semibold text-muted-foreground">
                {summary.primaryProgress}%
              </span>
            </div>
          </div>
        )}

        {/* Footer Link Hint */}
        <div className="flex items-center justify-between text-[10px] text-muted-foreground pt-0.5 font-medium">
          <span>Manage Queue &amp; History</span>
          <span className="group-hover:text-foreground transition-colors font-semibold">View All &rarr;</span>
        </div>
      </div>
    </ActivityModuleSection>
  )
}
