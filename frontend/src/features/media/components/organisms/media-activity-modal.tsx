import React, { useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import {
  Clock,
  Download,
  ExternalLink,
  HardDrive,
  Loader2,
  Play,
  Server,
} from 'lucide-react'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { DkDialog } from '@ui/molecules/dialog'
import { showToast } from '@ui/molecules/toast'
import type { MediaActivityItem } from '../../types/media-activity'
import {
  formatActivityBytes,
  formatActivityStatusLabel,
} from '../../utils/media-activity'
import { mediaActivityKeys } from '../../hooks/use-media-activity'
import { useQuickStream } from '../../hooks/use-quick-stream'

export interface MediaActivityModalProps {
  activity: MediaActivityItem
  mediaId: string
  initialPosterUrl?: string | null
  open?: boolean
  isOpen?: boolean
  isExiting?: boolean
  onOpenChange?: (open: boolean) => void
  onClose?: () => void
}

export const MediaActivityModal = ({
  activity,
  mediaId,
  initialPosterUrl,
  open,
  isOpen,
  isExiting,
  onOpenChange,
  onClose,
}: MediaActivityModalProps) => {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { quickStream, isStartingStream } = useQuickStream()
  const [isCancelling, setIsCancelling] = useState(false)

  const isModalOpen = (open ?? isOpen ?? true) && !isExiting

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange?.(nextOpen)
    if (!nextOpen) {
      onClose?.()
    }
  }

  const handleClose = () => {
    handleOpenChange(false)
  }

  const {
    status,
    title,
    year,
    mediaType,
    tmdbId,
    progress = 0,
    size,
    sizeLeft,
    timeleft,
    queueStatus,
    episodeLabel,
    episodeCount,
    totalEpisodes,
    isPartial,
    nodeName,
    nodeId,
    isOwned,
    canManage,
    owner,
    queueId,
  } = activity

  const handleNavigateDetail = () => {
    handleClose()
    navigate({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType, mediaId },
    })
  }

  const handleNavigateDownloads = () => {
    handleClose()
    navigate({ to: '/downloads' })
  }

  const handleStreamClick = async () => {
    handleClose()
    try {
      await quickStream({
        mediaId,
        tmdbId,
        title,
        mediaType,
      })
    } catch (err) {
      console.error('Quick stream failed:', err)
    }
  }

  const handleCancelDownload = async () => {
    if (!nodeId || !queueId || !canManage) return
    setIsCancelling(true)
    try {
      const endpoint =
        mediaType === 'movie'
          ? `/library/nodes/${nodeId}/radarr/queue/${queueId}`
          : `/library/nodes/${nodeId}/sonarr/queue/${queueId}`
      await apiClient.delete(endpoint, {
        params: { remove_from_client: true, blocklist: false },
      })
      showToast({
        title: 'Download Cancelled',
        description: `${title} has been removed from the queue.`,
      })
      await queryClient.invalidateQueries({ queryKey: mediaActivityKeys.all })
      handleClose()
    } catch (err) {
      showToast({
        title: 'Cancellation Failed',
        description: err instanceof Error ? err.message : 'Could not cancel download.',
      })
    } finally {
      setIsCancelling(false)
    }
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={handleOpenChange}
      className="max-w-lg p-0 sm:p-0 flex flex-col overflow-hidden"
    >
      {/* Header Row with Poster thumbnail & Metadata */}
      <div className="p-5 flex items-start gap-4">
        {initialPosterUrl ? (
          <img
            src={initialPosterUrl}
            alt={title}
            className="w-16 h-24 object-cover rounded-lg shadow-md shrink-0 bg-white/5 border border-white/[0.04]"
          />
        ) : (
          <div className="w-16 h-24 rounded-lg bg-white/5 border border-white/[0.04] flex items-center justify-center text-muted-foreground shrink-0">
            <HardDrive className="h-6 w-6" />
          </div>
        )}

        <div className="flex-1 min-w-0 pr-8">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase',
                status === 'available' && 'bg-primary/20 text-primary',
                status === 'processing' && 'bg-sky-500/20 text-sky-400',
                status === 'requested' && 'bg-amber-500/20 text-amber-400',
              )}
            >
              {status === 'available' && <Play className="h-2.5 w-2.5 fill-current" />}
              {status === 'processing' && <Loader2 className="h-2.5 w-2.5 animate-spin" />}
              {status === 'requested' && <Clock className="h-2.5 w-2.5" />}
              <span>{formatActivityStatusLabel(status, isPartial, episodeCount, totalEpisodes)}</span>
            </span>
            {year && <span className="text-xs text-muted-foreground font-medium">{year}</span>}
          </div>

          <h2 className="text-lg font-bold text-foreground truncate">{title}</h2>
          {episodeLabel && (
            <p className="text-xs font-semibold text-primary mt-0.5">
              Episode {episodeLabel}
            </p>
          )}
        </div>
      </div>

      <div className="px-5 pb-5 space-y-3">
        {/* Supplying Node Pod */}
        <div className="rounded-xl bg-[var(--dk-surface-ghost)] p-3.5 border border-white/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-lg bg-white/10 flex items-center justify-center text-primary shrink-0">
              <Server className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">
                {nodeName || 'Otix Node'}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">
                {isOwned ? 'Your Node' : `Shared by ${owner.displayName || owner.username}`}
              </p>
            </div>
          </div>

          <span
            className={cn(
              'px-2 py-0.5 rounded-md text-[10px] font-medium tracking-wide shrink-0',
              isOwned
                ? 'bg-primary/10 text-primary'
                : 'bg-white/10 text-muted-foreground',
            )}
          >
            {isOwned ? 'Owner' : canManage ? 'Friend (Admin)' : 'Friend'}
          </span>
        </div>

        {/* Processing / Download Progress Details */}
        {status === 'processing' && (
          <div className="rounded-xl bg-[var(--dk-surface-ghost)] p-3.5 border border-white/[0.04] space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-sky-400" />
                <span>{queueStatus || 'Downloading'}</span>
              </span>
              <span className="font-bold tabular-nums text-sky-400">{progress.toFixed(0)}%</span>
            </div>

            {/* Progress bar */}
            <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-300 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>

            {/* Metrics */}
            <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1">
              <span>
                {size != null && sizeLeft != null
                  ? `${formatActivityBytes(size - sizeLeft)} / ${formatActivityBytes(size)}`
                  : 'Calculating size…'}
              </span>
              {timeleft && timeleft !== '00:00:00' && (
                <span className="tabular-nums">ETA {timeleft}</span>
              )}
            </div>
          </div>
        )}

        {/* TV Series Episode Availability Details */}
        {status === 'available' && mediaType === 'show' && totalEpisodes != null && (
          <div className="rounded-xl bg-[var(--dk-surface-ghost)] p-3.5 border border-white/[0.04] flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Episodes Downloaded</span>
            <span className="font-semibold text-foreground">
              {episodeCount ?? 0} of {totalEpisodes} episodes
            </span>
          </div>
        )}
      </div>

      {/* Action Footer Pod */}
      <div className="p-4 bg-[var(--dk-surface-ghost)] border-t border-white/[0.04] flex items-center justify-between gap-3 shrink-0">
        <button
          type="button"
          onClick={handleNavigateDetail}
          className="text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5 cursor-pointer"
        >
          <span>View Full Details</span>
          <ExternalLink className="h-3 w-3" />
        </button>

        <div className="flex items-center gap-2">
          {status === 'processing' && (
            <>
              <button
                type="button"
                onClick={handleNavigateDownloads}
                className="px-3.5 py-1.5 rounded-full bg-white/10 hover:bg-white/15 text-foreground font-semibold text-xs transition-all active:scale-95 cursor-pointer"
              >
                Downloads
              </button>

              {canManage && (
                <button
                  type="button"
                  onClick={handleCancelDownload}
                  disabled={isCancelling}
                  className="px-3.5 py-1.5 rounded-full bg-destructive/15 hover:bg-destructive/25 text-destructive font-semibold text-xs transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                >
                  {isCancelling ? 'Cancelling…' : 'Cancel Download'}
                </button>
              )}
            </>
          )}

          {status === 'available' && (
            <button
              type="button"
              onClick={handleStreamClick}
              disabled={isStartingStream}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground font-semibold text-xs transition-all active:scale-95 shadow-md cursor-pointer"
            >
              {isStartingStream ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Play className="h-3 w-3 fill-current ml-0.5" />
              )}
              <span>Stream Now</span>
            </button>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
