import { useState, useRef, useEffect, useCallback } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Pin } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePlayer } from './use-player'
import { PlayerBarContent } from './player-bar-content'
import { PlexSessionList } from './plex-now-playing'
import type { PlexSession } from './plex-now-playing'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/features/auth/auth-provider'
import { cn } from '@/lib/utils'

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

const pillBase = cn(
  'flex items-center rounded-[2rem]',
  'bg-gradient-to-br from-[var(--dk-surface-glass)] to-[var(--dk-surface-glass-hover)]',
  'backdrop-blur-lg',
  'shadow-[var(--dk-shadow-glass)]',
)

function EqualizerBars({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="flex items-end gap-[1.5px] h-4 w-4">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'w-[3px] rounded-full bg-primary',
            isPlaying && 'animate-equalizer',
          )}
          style={{
            height: isPlaying ? undefined : `${4 + i * 3}px`,
            animationDelay: isPlaying ? `${i * 0.15}s` : undefined,
          }}
        />
      ))}
    </div>
  )
}

export function NowPlayingButton({ isPinned, onPin }: { isPinned?: boolean; onPin?: () => void }) {
  const { spotifyIsReady, source, isPlaying, currentTrack } = usePlayer()
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const { user: currentUser } = useAuth()

  const { data: plexSessions = [] } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/auth/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: !!currentUser?.plexId,
  })

  const handleClickOutside = useCallback(
    (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-now-playing-trigger]')) return
      if (containerRef.current && !containerRef.current.contains(target)) {
        setOpen(false)
      }
    },
    [],
  )

  useEffect(() => {
    if (!open) return
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') setOpen(false)
    })
    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [open, handleClickOutside])

  const hasLocalPlayback = source !== 'none' && currentTrack !== null
  const plexCount = plexSessions.length
  const hasPlex = plexCount > 0

  if (!hasLocalPlayback && !hasPlex) return null

  const handleClick = () => {
    if (isPinned) return
    setOpen(!open)
  }

  const showLocalInPopover = hasLocalPlayback
  const showPlexInPopover = hasPlex

  return (
    <>
      <button
        type="button"
        data-now-playing-trigger
        onClick={handleClick}
        className={cn(
          pillBase,
          'p-1.5 relative gap-1',
          !isPinned && 'cursor-pointer',
          !hasLocalPlayback && hasPlex && 'ring-1 ring-[#e5a00d]/40',
        )}
        aria-label="Now playing"
      >
        {hasLocalPlayback ? (
          currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt=""
              className={cn(
                'h-6 w-6 rounded-full object-cover',
                isPlaying && 'animate-spin-slow',
              )}
              style={{ animationDuration: '8s' }}
            />
          ) : (
            <EqualizerBars isPlaying={isPlaying} />
          )
        ) : (
          <PlexIcon className={cn('h-5 w-5', hasPlex ? 'text-[#e5a00d]' : 'text-muted-foreground')} />
        )}
        {hasPlex && !hasLocalPlayback && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e5a00d] px-1 text-[10px] font-bold text-black leading-none">
            {plexCount > 9 ? '9+' : plexCount}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && !isPinned && (
          <motion.div
            ref={containerRef}
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed top-[4.5rem] right-4 z-[9999] w-[26rem] max-w-[calc(100vw-2rem)]"
          >
            <div className="flex items-center justify-end mb-1.5">
              {onPin && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false)
                    onPin()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--dk-surface-glass)] px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-glass-hover)] transition-all"
                >
                  <Pin className="h-3 w-3" />
                  Pin
                </button>
              )}
            </div>
            {showLocalInPopover && (
              <PlayerBarContent onDismiss={() => setOpen(false)} />
            )}
            {showPlexInPopover && (
              <div className={cn(showLocalInPopover && 'mt-3 pt-3 border-t border-white/[0.06]')}>
                <div className="flex items-center gap-2 px-2 mb-3">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#e5a00d]" />
                  <span className="text-xs font-semibold text-muted-foreground">
                    Plex &middot; {plexCount} streaming
                  </span>
                </div>
                <PlexSessionList sessions={plexSessions} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
