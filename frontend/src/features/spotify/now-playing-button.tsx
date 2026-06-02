import { useQuery } from '@tanstack/react-query'
import { Music, Download } from 'lucide-react'
import { useDownloads } from '@/features/downloads/use-downloads'
import { usePlayer } from './use-player'
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
          !bare && pillBase,
          !bare && 'p-1.5',
          'relative gap-1 transition-all flex items-center justify-center rounded-full',
          !isPinned && 'cursor-pointer',
          isSidebarOpen && 'ring-1 ring-purple-400/50 bg-purple-400/[0.06]',
          !hasLocalPlayback && hasPlex && 'ring-1 ring-[#e5a00d]/40',
          bare && 'w-8 h-8 hover:bg-white/[0.06]',
        )}
        aria-label="Activity"
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
        ) : hasDownloads ? (
          <div className="relative">
            <Download className="h-5 w-5 text-blue-400" />
            <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-[3px] text-[9px] font-bold text-black leading-none">
              {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
            </span>
          </div>
        ) : hasPlex ? (
          <PlexIcon className="h-5 w-5 text-[#e5a00d]" />
        ) : (
          <Music className="h-5 w-5 text-muted-foreground" />
        )}
        {hasPlex && !hasLocalPlayback && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[#e5a00d] px-1 text-[10px] font-bold text-black leading-none">
            {plexCount > 9 ? '9+' : plexCount}
          </span>
        )}
        {hasLocalPlayback && hasDownloads && (
          <span className="absolute -top-1.5 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-blue-500 px-[3px] text-[9px] font-bold text-black leading-none">
            {activeDownloads.length > 9 ? '9+' : activeDownloads.length}
          </span>
        )}
      </button>

      {/* Dropdown removed - always slide in panel instead */}
    </>
  )
}
