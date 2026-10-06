import { useEffect, useState } from 'react'
import { getPluginAPI } from '@/features/plugins/api'
import { cn } from '@/lib/utils'

// Plugins contribute badge widgets to the `media/card/badges` slot; each
// rendered as a small pill overlaid on the media card poster.
const SLOT_LOCATION = 'media/card/badges'

export interface CardBadge {
  pluginId: string
  text: string
  tone?: 'default' | 'info' | 'success' | 'warning' | 'danger'
}

interface MediaCardBadgesProps {
  mediaId: string
  mediaType: string
  tmdbId?: string | null
  className?: string
}

const TONE_STYLES: Record<NonNullable<CardBadge['tone']>, string> = {
  default: 'text-white/80 bg-white/10 border-white/10',
  info: 'text-sky-300 bg-sky-500/15 border-sky-400/30',
  success: 'text-emerald-300 bg-emerald-500/15 border-emerald-400/30',
  warning: 'text-amber-300 bg-amber-500/15 border-amber-400/30',
  danger: 'text-red-300 bg-red-500/15 border-red-400/30',
}

export const MediaCardBadges = ({ mediaId, mediaType, tmdbId, className }: MediaCardBadgesProps) => {
  const [badges, setBadges] = useState<CardBadge[]>([])

  useEffect(() => {
    let cancelled = false
    const api = getPluginAPI()
    if (!api?.getSlotData) return

    api
      .getSlotData(SLOT_LOCATION, { mediaId, mediaType, tmdbId: tmdbId || null })
      .then((data) => {
        if (cancelled) return
        const list: CardBadge[] = []
        for (const entry of (data as Array<{
          pluginId: string
          data?: { widgets?: Array<{ type: string; props?: Record<string, unknown> }> }
        }>) || []) {
          for (const widget of entry.data?.widgets || []) {
            if (widget.type !== 'badge' || !widget.props?.text) continue
            list.push({
              pluginId: entry.pluginId,
              text: String(widget.props.text),
              tone: (widget.props.tone as CardBadge['tone']) || 'default',
            })
          }
        }
        setBadges(list)
      })
      .catch(() => {
        /* slot failures render no badges */
      })

    return () => {
      cancelled = true
    }
  }, [mediaId, mediaType, tmdbId])

  if (badges.length === 0) return null

  return (
    <div
      className={cn(
        'absolute top-14 right-2 z-10 flex flex-col items-end gap-1 pointer-events-none',
        className,
      )}
    >
      {badges.map((badge, i) => (
        <span
          key={`${badge.pluginId}-${i}`}
          className={cn(
            'inline-flex items-center px-1.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider border backdrop-blur-md shadow-lg',
            TONE_STYLES[badge.tone ?? 'default'],
          )}
        >
          {badge.text}
        </span>
      ))}
    </div>
  )
};
