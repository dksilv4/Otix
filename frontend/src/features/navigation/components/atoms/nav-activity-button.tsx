import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Download, Gamepad2 } from 'lucide-react'
import { useDownloads } from '@/old-features/downloads/use-downloads'
import { usePlayer } from '@/old-features/spotify/use-player'
import type { PlexSession } from '../organisms/plex-now-playing'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { apiClient } from '@/lib/api-client'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { useRunningGame } from '@/old-features/games/hooks/use-running-game'
import { notificationQueries } from '@/old-features/notifications/notification-queries'
import './nav-activity-button.scss'

interface PlexSessionsResponse {
  sessions: PlexSession[]
}

function EqualizerBars({ isPlaying }: { isPlaying: boolean }) {
  return (
    <div className="dk-spotify__equalizer">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            'dk-spotify__equalizer-bar',
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

export function NowPlayingButton({
  isPinned,
  isSidebarOpen,
  onToggleSidebar,
  bare,
}: {
  isPinned?: boolean
  isSidebarOpen?: boolean
  onToggleSidebar?: () => void
  bare?: boolean
}) {
  const { source, isPlaying, currentTrack } = usePlayer()
  const { runningGame } = useRunningGame()

  const { user: currentUser } = useAuth()

  const { data: unreadNotifs } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: !!currentUser,
    refetchInterval: 30000,
  })
  const unreadCount = unreadNotifs?.count ?? 0

  const { data: plexSessions = [] } = useQuery({
    queryKey: ['plex', 'sessions'],
    queryFn: async () => {
      const { data } = await apiClient.get<PlexSessionsResponse>('/integrations/plex/sessions')
      return data.sessions ?? []
    },
    refetchInterval: 15000,
    staleTime: 10000,
    retry: false,
    enabled: !!currentUser?.plexId,
  })

  const { downloads } = useDownloads(currentUser?.id)
  const activeDownloads = downloads.filter(d => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing')
  const hasDownloads = activeDownloads.length > 0

  const hasLocalPlayback = source !== 'none' && currentTrack !== null
  const plexCount = plexSessions.length
  const hasPlex = plexCount > 0

  const handleClick = () => {
    if (isPinned) return
    if (onToggleSidebar) {
      onToggleSidebar()
    }
  }

  return (
    <>
      <button
        type="button"
        data-now-playing-trigger
        onClick={handleClick}
        className={cn(
          'dk-spotify__button outline-none focus:outline-none focus-visible:outline-none',
          isPinned && 'dk-spotify__button--pinned',
          isSidebarOpen && 'dk-spotify__button--sidebar',
          !hasLocalPlayback && hasPlex && 'dk-spotify__button--plex',
          bare && 'dk-spotify__button--bare',
        )}
        aria-label="Activity"
      >
        {runningGame ? (
          <div className="dk-spotify__game-wrapper">
            {runningGame.game.iconUrl || runningGame.game.posterUrl ? (
              <img
                src={runningGame.game.iconUrl || runningGame.game.posterUrl || undefined}
                alt=""
                className="dk-spotify__album-art"
              />
            ) : (
              <Gamepad2 className="h-5 w-5 text-emerald-400" />
            )}
          </div>
        ) : hasLocalPlayback ? (
          currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt=""
              className={cn(
                'dk-spotify__album-art',
                isPlaying && 'animate-spin-slow',
              )}
              style={{ animationDuration: '8s' }}
            />
          ) : (
            <EqualizerBars isPlaying={isPlaying} />
          )
        ) : hasDownloads ? (
          <div className="dk-spotify__download-wrapper">
            <Download className="h-5 w-5 text-blue-400" />
            <span className="dk-spotify__badge dk-spotify__badge--download">
              {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
            </span>
          </div>
        ) : hasPlex ? (
          <PlexIcon className="h-5 w-5 text-[#e5a00d]" />
        ) : (
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
        )}
        {hasPlex && !hasLocalPlayback && (
          <span className="dk-spotify__badge dk-spotify__badge--plex">
            {plexCount > 9 ? '9+' : plexCount}
          </span>
        )}
        {hasLocalPlayback && hasDownloads && (
          <span className="dk-spotify__badge dk-spotify__badge--download">
            {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
          </span>
        )}
        {unreadCount > 0 && (
          <span className="dk-spotify__badge dk-spotify__badge--notifications">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
}
