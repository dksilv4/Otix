import { useQuery } from '@tanstack/react-query'
import { LayoutGrid, Download, Gamepad2 } from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { usePlayer } from '@/lib/player/use-player'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import { useAuth } from '@/lib/providers/auth'
import { useMatchedRunningGame } from '@/features/launcher'
import { notificationQueries } from '@/features/notifications/queries'
import { usePlexSessions } from '../../hooks/use-plex-sessions'

const GLASS_STYLE: React.CSSProperties = {
  background: `linear-gradient(135deg, var(--dk-surface-glass), var(--dk-surface-glass-hover))`,
  backgroundColor: 'color-mix(in oklch, var(--dk-surface-raised) 25%, transparent)',
  boxShadow: 'var(--dk-shadow-glass)',
  backdropFilter: 'blur(16px)',
  WebkitBackdropFilter: 'blur(16px)',
  borderRadius: '2rem',
}

const EqualizerBars = ({ isPlaying }: { isPlaying: boolean }) => {
  return (
    <div className="flex items-end h-4 w-4 gap-px">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={'rounded-full bg-primary w-[3px]' + (isPlaying ? ' animate-equalizer' : '')}
          style={{
            height: isPlaying ? undefined : `${4 + i * 3}px`,
            animationDelay: isPlaying ? `${i * 0.15}s` : undefined,
          }}
        />
      ))}
    </div>
  )
};

/** Atom button showing current activity state (playing game, music, downloads, Plex). */
export const ActivityModuleButton = ({
  isPinned,
  isSidebarOpen,
  onToggleSidebar,
  bare,
}: {
  isPinned?: boolean
  isSidebarOpen?: boolean
  onToggleSidebar?: () => void
  bare?: boolean
}) => {
  const { source, isPlaying, currentTrack } = usePlayer()
  const { runningGame, runningGames = [], matchedGame } = useMatchedRunningGame()

  const { user: currentUser } = useAuth()

  const { data: unreadNotifs } = useQuery({
    ...notificationQueries.unreadCount(),
    enabled: !!currentUser,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
  })
  const unreadCount = unreadNotifs?.count ?? 0

  const { sessions: plexSessions = [], isAdmin: isPlexAdmin } = usePlexSessions()

  const { downloads } = useDownloads(currentUser?.id)
  const activeDownloads = downloads.filter(
    (d) => d.status === 'queued' || d.status === 'downloading' || d.status === 'processing',
  )
  const hasDownloads = activeDownloads.length > 0

  const hasLocalPlayback = source !== 'none' && currentTrack !== null
  const plexCount = isPlexAdmin ? plexSessions.length : 0
  const hasPlex = isPlexAdmin && plexCount > 0

  const handleClick = () => {
    if (isPinned) return
    if (onToggleSidebar) {
      onToggleSidebar()
    }
  }

  const runningGamePoster =
    matchedGame?.posterUrl || runningGame?.game.posterUrl || runningGame?.game.iconUrl

  return (
    <>
      <button
        type="button"
        data-now-playing-trigger
        onClick={handleClick}
        className={
          'relative gap-1 transition-[transform,background-color,color] duration-100 ease-out flex items-center justify-center rounded-full active:scale-[0.94] focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:outline-none' +
          (!bare ? ' flex items-center p-1.5' : '') +
          (!isPinned ? ' cursor-pointer' : '') +
          (isSidebarOpen ? ' bg-[var(--dk-surface-ghost-active)] text-foreground' : '') +
          (!hasLocalPlayback && hasPlex ? ' bg-primary/10' : '') +
          (bare ? ' w-8 h-8 hover:bg-[var(--dk-surface-ghost-hover)] active:bg-[var(--dk-surface-ghost-active)]' : '')
        }
        style={!bare ? GLASS_STYLE : undefined}
        aria-label="Activity"
      >
        {runningGame ? (
          <div className="relative flex items-center justify-center">
            {runningGamePoster ? (
              <img
                src={runningGamePoster}
                alt={matchedGame?.title || runningGame.game.title}
                className="h-6 w-6 rounded-full object-cover"
              />
            ) : (
              <Gamepad2 className="h-5 w-5 text-primary" />
            )}
            {runningGames.length > 1 && (
              <span
                className="absolute -bottom-1 -right-1 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-primary text-primary-foreground text-[8px] font-mono font-bold px-0.5 shadow-xs ring-1 ring-[var(--dk-surface-root)]"
                title={`${runningGames.length} games running`}
              >
                {runningGames.length}
              </span>
            )}
          </div>
        ) : hasLocalPlayback ? (
          currentTrack.albumArt ? (
            <img
              src={currentTrack.albumArt}
              alt=""
              className={'h-6 w-6 rounded-full object-cover' + (isPlaying ? ' animate-spin-slow' : '')}
              style={{ animationDuration: '8s' }}
            />
          ) : (
            <EqualizerBars isPlaying={isPlaying} />
          )
        ) : hasDownloads ? (
          <div className="relative">
            <Download className="h-5 w-5 text-primary" />
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-3.5 min-w-[14px] px-[3px] text-[9px] font-bold text-primary-foreground leading-none rounded-full bg-primary">
              {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
            </span>
          </div>
        ) : hasPlex ? (
          plexSessions[0]?.thumb ? (
            <div className="relative">
              <img
                src={plexSessions[0].thumb}
                alt=""
                className="h-6 w-6 rounded-full object-cover shadow-sm"
              />
              <span className="absolute -bottom-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <PlexIcon className="h-2 w-2" />
              </span>
            </div>
          ) : (
            <PlexIcon className="h-5 w-5 text-primary" />
          )
        ) : (
          <LayoutGrid className="h-5 w-5 text-muted-foreground" />
        )}
        {hasPlex && !hasLocalPlayback && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold text-primary-foreground leading-none rounded-full bg-primary">
            {plexCount > 9 ? '9+' : plexCount}
          </span>
        )}
        {hasLocalPlayback && hasDownloads && (
          <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center h-3.5 min-w-[14px] px-[3px] text-[9px] font-bold text-primary-foreground leading-none rounded-full bg-primary">
            {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
          </span>
        )}
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -left-0.5 flex items-center justify-center h-4 min-w-4 px-1 text-[10px] font-bold text-primary-foreground leading-none rounded-full bg-primary">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
    </>
  )
};
