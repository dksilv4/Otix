import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { connectTaskSseStream, type SseEvent } from '@/lib/api/sse-client'
import { DkButton } from '@/old-features/ui/atoms/button'
import { DkDropdown } from '@/old-features/ui/atoms/dropdown'
import { DkSwitch } from '@/old-features/ui/atoms/switch'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import SpotifyIcon from '@/assets/provider-logos/spotify.svg?react'
import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop/api'
import { openExternal } from '@/lib/utils/open-external'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { Loader2, Plus, Unlink, RefreshCw, Download, ChevronDown, Link2, ListMusic, Film, Tv, Music } from 'lucide-react'
import { usePlexLibraries, streamPlexLibrarySync } from '@/old-features/library/library-queries'
import type { PlexLibraryInfo } from '@/old-features/library/library-queries'

type SteamProfile = {
  personaname: string | null
  avatarfull: string | null
  profileurl: string | null
  realname: string | null
  loccountrycode: string | null
  timecreated: number | null
  personastate: number | null
  lastlogoff: number | null
}

type PlexIntegration = {
  name: string
  connected: boolean
  plexId: string | null
  plexUsername: string | null
  plexEmail: string | null
  plexThumb: string | null
}

type PlexSyncResult = {
  servers: number
  libraries: number
  total: number
  matched: number
  seeded: number
}

type PlexLibraryProgress = {
  serverName: string
  libraryName: string
  itemsProcessed: number
  itemsTotal: number
  phase: 'pending' | 'syncing' | 'complete' | 'failed'
}

type SpotifyProgressState = {
  phase: string
  detail?: string
}

type YouTubeProgressState = {
  phase: string
  detail?: string
}

function formatAccountAge(unixTimestamp: number | null): string {
  if (!unixTimestamp) return ''
  const created = new Date(unixTimestamp * 1000)
  const now = new Date()
  const years = now.getFullYear() - created.getFullYear()
  const monthDiff = now.getMonth() - created.getMonth()
  const adjustedYears = monthDiff < 0 ? years - 1 : years
  if (adjustedYears < 1) return 'Joined this year'
  if (adjustedYears === 1) return '1 year on Steam'
  return `${adjustedYears} years on Steam`
}

const PERSONA_STATES: Record<number, string> = {
  0: 'Offline',
  1: 'Online',
  2: 'Busy',
  3: 'Away',
  4: 'Snooze',
  5: 'Looking to trade',
  6: 'Looking to play',
}

function personaStateLabel(state: number | null): string {
  if (state === null || state === undefined) return 'Unknown'
  return PERSONA_STATES[state] ?? 'Unknown'
}

function extractIntegrationMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

function formatDaysAgo(unixTimestamp: number): string {
  const days = Math.floor((Date.now() / 1000 - unixTimestamp) / 86400)
  if (days <= 0) return 'Today'
  if (days === 1) return '1d ago'
  if (days <= 14) return `${days}d ago`
  return ''
}

const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  plex: '#e5a00d',
  spotify: '#1db954',
  tmdb: '#01b4e4',
  google: '#4285F4',
}

const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  plex: 'bg-[#e5a00d]/10',
  spotify: 'bg-[#1db954]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
}

// â”€â”€ Integration card (iOS-style expandable) â”€â”€

function IntegrationCard({
  name,
  description,
  brandColor,
  brandBg,
  icon: Icon,
  isConnected,
  expanded,
  onToggle,
  onConnect,
  connecting,
  onDisconnect,
  disconnecting,
  children,
}: {
  name: string
  description: string
  brandColor: string
  brandBg: string
  icon: React.ComponentType<{ className?: string }>
  isConnected: boolean
  expanded: boolean
  onToggle: () => void
  onConnect?: () => void
  connecting?: boolean
  onDisconnect?: () => void
  disconnecting?: boolean
  children?: React.ReactNode
}) {
  return (
    <div className="rounded-2xl overflow-hidden bg-white/5 backdrop-blur-xl">
      {/* Header */}
      <button
        type="button"
        onClick={isConnected ? onToggle : undefined}
        className={cn(
          'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors duration-150',
          isConnected && 'cursor-pointer hover:bg-white/[0.03] active:bg-white/[0.03]',
        )}
      >
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', brandBg)} style={{ color: brandColor }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{name}</p>
            {isConnected && <span className="h-1.5 w-1.5 rounded-full shrink-0 bg-green-500" />}
          </div>
          <p className="text-xs text-white/60 mt-0.5 truncate">{description}</p>
        </div>
        {isConnected ? (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/40 transition-transform duration-150', expanded && 'rotate-180')} />
        ) : (
          <DkButton size="sm" variant="primary" onClick={onConnect} loading={connecting} className="shrink-0 shadow-none">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </DkButton>
        )}
      </button>

      {/* Expanded content */}
      {isConnected && expanded && (
        <div className="pt-1">
          {children}
          {onDisconnect && (
            <div className="px-5 py-3">
              <DkButton
                size="sm"
                variant="ghost"
                onClick={onDisconnect}
                loading={disconnecting}
                className="w-full bg-red-500/10 text-red-400 shadow-none hover:bg-red-500/15"
              >
                <Unlink className="h-3.5 w-3.5 mr-1.5" />
                Disconnect {name}
              </DkButton>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// â”€â”€ Integration profile row â”€â”€

function IntegrationProfile({
  avatarUrl,
  avatarAlt,
  name,
  detail,
  brandColor,
  brandBg,
  icon: Icon,
  meta,
}: {
  avatarUrl?: string | null
  avatarAlt: string
  name: string
  detail: string
  brandColor?: string
  brandBg?: string
  icon?: React.ComponentType<{ className?: string }>
  meta?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      {avatarUrl ? (
        <img src={avatarUrl} alt={avatarAlt} className="h-10 w-10 rounded-xl object-cover ring-1 ring-white/10" />
      ) : (
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl bg-white/5', brandBg)} style={brandColor ? { color: brandColor } : undefined}>
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-white/60 truncate">{detail}</p>
      </div>
      {meta}
    </div>
  )
}

// â”€â”€ Integration action row â”€â”€

function IntegrationAction({
  label,
  description,
  result,
  buttonLabel,
  buttonIcon: ButtonIcon,
  onPress,
  loading,
  disabled,
  progress,
  children,
  muted,
}: {
  label: string
  description: string
  result?: string | null
  buttonLabel: string
  buttonIcon?: React.ComponentType<{ className?: string }>
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  progress?: React.ReactNode
  children?: React.ReactNode
  muted?: boolean
}) {
  return (
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4', muted && 'bg-white/[0.02]')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase text-white/40 tracking-wider">{label}</p>
          {progress}
        </div>
        <p className="mt-1 text-sm font-medium">{description}</p>
        {result && <p className="text-xs text-white/60 mt-0.5">{result}</p>}
        {children}
      </div>
      <DkButton
        size="sm"
        variant="ghost"
        onClick={onPress}
        loading={loading}
        disabled={disabled}
        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
      >
        {ButtonIcon && <ButtonIcon className="h-3.5 w-3.5 mr-1.5" />}
        {buttonLabel}
      </DkButton>
    </div>
  )
}

// â”€â”€ Integration stats row â”€â”€

function IntegrationStats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-white/60 px-5 py-3">
      {items.map((item) => (
        <span key={item.label}>
          <strong className="text-white font-semibold">{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  )
}

export function IntegrationsSection() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ totalInSteam: number; matchedInOtix: number } | null>(null)
  const [wishlistScanning, setWishlistScanning] = useState(false)
  const [wishlistScanResult, setWishlistScanResult] = useState<{ total: number; matched: number; private?: boolean } | null>(null)
  const [resolving, setResolving] = useState(false)
  const [resolveResult, setResolveResult] = useState<{ resolved: number; synced: number; failed: number; total: number } | null>(null)
  const [plexConnecting, setPlexConnecting] = useState(false)
  const [plexDisconnecting, setPlexDisconnecting] = useState(false)
  const [plexSyncing, setPlexSyncing] = useState(false)
  const [plexSyncResult, setPlexSyncResult] = useState<PlexSyncResult | null>(null)
  const [discoveringPlex, setDiscoveringPlex] = useState(false)
  const [plexLibraryProgress, setPlexLibraryProgress] = useState<Record<string, PlexLibraryProgress>>({})
  const [syncingLibraryIds, setSyncingLibraryIds] = useState<Set<string>>(new Set())
  const abortRef = useRef<AbortController | null>(null)
  // Smooth progress animation â€” drives displayed count toward real server count at observed rate
  const animStateRef = useRef<Record<string, {
    displayed: number
    real: number
    rate: number
    lastItems: number
    lastTime: number
  }>>({})
  const [, setAnimTick] = useState(0)

  // Smooth progress animation loop â€” runs on rAF, only triggers re-render when animating
  useEffect(() => {
    let rafId: number
    function tick() {
      const anim = animStateRef.current
      const keys = Object.keys(anim)
      let anyChanged = false
      for (let i = 0; i < keys.length; i++) {
        const s = anim[keys[i]]
        if (s.displayed >= s.real - 0.01) {
          if (s.displayed !== s.real) s.displayed = s.real
          continue
        }
        const step = Math.max(s.rate / 60, 0.1)
        s.displayed = Math.min(s.displayed + step, s.real)
        anyChanged = true
      }
      if (anyChanged) setAnimTick(t => t + 1)
      rafId = requestAnimationFrame(tick)
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [])

  const [steamMessage, setSteamMessage] = useState('')
  const [steamError, setSteamError] = useState('')
  const [plexMessage, setPlexMessage] = useState('')
  const [plexError, setPlexError] = useState('')
  const [plexWatchlistSyncing, setPlexWatchlistSyncing] = useState(false)
  const [plexWatchlistSyncResult, setPlexWatchlistSyncResult] = useState<{ total: number; matched: number; seeded: number } | null>(null)
  const [steamConnected, setSteamConnected] = useState(Boolean(user?.steamId))
  const [steamId, setSteamId] = useState<string | null>(user?.steamId ?? null)
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null)
  const [plexConnected, setPlexConnected] = useState(Boolean(user?.plexId))
  const [plex, setPlex] = useState<PlexIntegration | null>(null)
  const [plexWatchHistoryEnabled, setPlexWatchHistoryEnabled] = useState(user?.plexWatchHistoryEnabled ?? false)
  const [tmdbConnected, setTmdbConnected] = useState(Boolean(user?.tmdbUsername))
  const [tmdbUsername, setTmdbUsername] = useState<string | null>(user?.tmdbUsername ?? null)
  const [tmdbAvatarUrl, setTmdbAvatarUrl] = useState<string | null>(user?.tmdbAvatarUrl ?? null)
  const [tmdbStats, setTmdbStats] = useState<Record<string, number> | null>(null)
  const [tmdbSyncDirection, setTmdbSyncDirection] = useState(user?.tmdbRatingSyncDirection ?? 'disabled')
  const [tmdbSyncing, setTmdbSyncing] = useState(false)
  const [tmdbWatchlistImporting, setTmdbWatchlistImporting] = useState(false)
  const [tmdbSyncResult, setTmdbSyncResult] = useState<{ imported: number; exported: number; skipped: number } | null>(null)
  const [tmdbWatchlistResult, setTmdbWatchlistResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [tmdbConnecting, setTmdbConnecting] = useState(false)
  const [tmdbDisconnecting, setTmdbDisconnecting] = useState(false)
  const [tmdbMessage, setTmdbMessage] = useState('')
  const [tmdbError, setTmdbError] = useState('')
  const [spotifyConnected, setSpotifyConnected] = useState(Boolean(user?.spotifyId))
  const [spotifyUsername, setSpotifyUsername] = useState<string | null>(user?.spotifyUsername ?? null)
  const [spotifyAvatarUrl, setSpotifyAvatarUrl] = useState<string | null>(user?.spotifyAvatarUrl ?? null)
  const [spotifyStats, setSpotifyStats] = useState<Record<string, unknown> | null>(null)
  const [spotifyConnecting, setSpotifyConnecting] = useState(false)
  const [spotifyDisconnecting, setSpotifyDisconnecting] = useState(false)
  const [spotifyMessage, setSpotifyMessage] = useState('')
  const [spotifyError, setSpotifyError] = useState('')
  const [spotifySyncing, setSpotifySyncing] = useState(false)
  const [spotifySyncResult, setSpotifySyncResult] = useState<{ likedTotal: number; likedMatched: number; likedSeeded: number } | null>(null)
  const [spotifyProgress, setSpotifyProgress] = useState<SpotifyProgressState | null>(null)
  const [spotifyRecentlyPlayedSyncing, setSpotifyRecentlyPlayedSyncing] = useState(false)
  const [spotifyRecentlyPlayedResult, setSpotifyRecentlyPlayedResult] = useState<{ total: number; matched: number; seeded: number } | null>(null)
  const [spotifyRecentlyPlayedMessage, setSpotifyRecentlyPlayedMessage] = useState('')
  const isSpotifyConnected = spotifyConnected
  const [googleConnected, setGoogleConnected] = useState(Boolean(user?.googleId))
  const [googleName, setGoogleName] = useState<string | null>(user?.googleName ?? null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(user?.googleEmail ?? null)
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(user?.googleAvatarUrl ?? null)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [youtubeSyncing, setYoutubeSyncing] = useState(false)
  const [youtubeSyncResult, setYoutubeSyncResult] = useState<{ total: number; musicVideos: number; matched: number; channelLinks: number } | null>(null)
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeMessage, setYoutubeMessage] = useState('')
  const isGoogleConnected = googleConnected
  const isSteamConnected = steamConnected
  const displayedSteamId = steamId ?? user?.steamId ?? null
  const isPlexConnected = plexConnected
  const isTmdbConnected = tmdbConnected
  const { data: plexLibraries, isLoading: plexLibrariesLoading, refetch: refetchLibraries } = usePlexLibraries({ enabled: isPlexConnected })

  // â”€â”€ SABnzbd + NZBPlanet moved to Downloads section â”€â”€

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const fetchIntegrations = async () => {
    try {
      const { data } = await apiClient.get('/auth/oauth')
      const steam = (data.providers as Array<{
        name: string
        connected: boolean
        steamId: string | null
        steamProfile: SteamProfile | null
      }>).find((p) => p.name === 'steam')
      if (steam) {
        setSteamConnected(steam.connected)
        setSteamId(steam.steamId ?? null)
        setSteamProfile(steam.steamProfile ?? null)
      }
      const plexProvider = (data.providers as PlexIntegration[]).find((p) => p.name === 'plex')
      if (plexProvider) {
        setPlexConnected(plexProvider.connected)
        setPlex(plexProvider)
      }
      const tmdbProvider = (data.providers as Array<{
        name: string
        connected: boolean
        tmdbUsername: string | null
        tmdbAvatarUrl: string | null
        tmdbStats: Record<string, number> | null
        tmdbRatingSyncDirection: string | null
      }>).find((p) => p.name === 'tmdb')
      if (tmdbProvider) {
        setTmdbConnected(tmdbProvider.connected)
        setTmdbUsername(tmdbProvider.tmdbUsername ?? null)
        setTmdbAvatarUrl(tmdbProvider.tmdbAvatarUrl ?? null)
        setTmdbStats(tmdbProvider.tmdbStats ?? null)
        setTmdbSyncDirection(tmdbProvider.tmdbRatingSyncDirection ?? 'disabled')
      }
      const spotifyProvider = (data.providers as Array<{
        name: string
        connected: boolean
        spotifyUsername: string | null
        spotifyAvatarUrl: string | null
        spotifyStats: Record<string, unknown> | null
      }>).find((p) => p.name === 'spotify')
      if (spotifyProvider) {
        setSpotifyConnected(spotifyProvider.connected)
        setSpotifyUsername(spotifyProvider.spotifyUsername ?? null)
        setSpotifyAvatarUrl(spotifyProvider.spotifyAvatarUrl ?? null)
        setSpotifyStats(spotifyProvider.spotifyStats ?? null)
      }
      const googleProvider = (data.providers as Array<{
        name: string
        connected: boolean
        googleName: string | null
        googleEmail: string | null
        googleAvatarUrl: string | null
      }>).find((p) => p.name === 'google')
      if (googleProvider) {
        setGoogleConnected(googleProvider.connected)
        setGoogleName(googleProvider.googleName ?? null)
        setGoogleEmail(googleProvider.googleEmail ?? null)
        setGoogleAvatarUrl(googleProvider.googleAvatarUrl ?? null)
      }
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    queueMicrotask(() => {
      if (isAuthenticated) fetchIntegrations()
      else setLoading(false)
    })
  }, [isAuthenticated, authLoading])

  // Re-fetch integrations when the window regains visibility â€” this catches
  // the case where an OAuth flow completed in the system browser and the
  // user has returned to the Electron app. Debounce to avoid rapid re-fetches.
  useEffect(() => {
    if (!isAuthenticated) return
    let lastFetch = 0
    const onVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return
      const now = Date.now()
      if (now - lastFetch < 30_000) return
      lastFetch = now
      fetchIntegrations()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [isAuthenticated])

  const handleConnect = async () => {
    setConnecting(true)
    setSteamError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/steam', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl)
    } catch (err) {
      setConnecting(false)
      setSteamError(extractIntegrationMessage(err))
    }
  }

  const handlePlexConnect = async () => {
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/plex')
      openExternal(data.authUrl)
    } catch (err) {
      setPlexConnecting(false)
      setPlexError(extractIntegrationMessage(err))
    }
  }

  const handlePlexDisconnect = async () => {
    setPlexDisconnecting(true)
    setPlexError('')
    setPlexMessage('')
    try {
      await apiClient.delete('/auth/oauth/plex/disconnect')
      setPlexConnected(false)
      setPlex(null)
      setPlexMessage('Plex account unlinked.')
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexDisconnecting(false)
    }
  }

  const handleTmdbConnect = async () => {
    setTmdbConnecting(true)
    setTmdbError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/tmdb')
      openExternal(data.authUrl)
    } catch (err) {
      setTmdbConnecting(false)
      setTmdbError(extractIntegrationMessage(err))
    }
  }

  const handleTmdbDisconnect = async () => {
    setTmdbDisconnecting(true)
    setTmdbError('')
    setTmdbMessage('')
    try {
      await apiClient.delete('/auth/oauth/tmdb/disconnect')
      setTmdbConnected(false)
      setTmdbUsername(null)
      setTmdbAvatarUrl(null)
      setTmdbStats(null)
      setTmdbSyncDirection('disabled')
      setTmdbMessage('TMDb account unlinked.')
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbDisconnecting(false)
    }
  }

  const handleSpotifyConnect = async () => {
    setSpotifyConnecting(true)
    setSpotifyError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/spotify')
      openExternal(data.authUrl)
    } catch (err) {
      setSpotifyConnecting(false)
      setSpotifyError(extractIntegrationMessage(err))
    }
  }

  const handleSpotifyDisconnect = async () => {
    setSpotifyDisconnecting(true)
    setSpotifyError('')
    setSpotifyMessage('')
    try {
      await apiClient.delete('/auth/oauth/spotify/disconnect')
      setSpotifyConnected(false)
      setSpotifyUsername(null)
      setSpotifyAvatarUrl(null)
      setSpotifyMessage('Spotify account unlinked.')
    } catch (err) {
      setSpotifyError(extractIntegrationMessage(err))
    } finally {
      setSpotifyDisconnecting(false)
    }
  }

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true)
    setGoogleError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/google')
      openExternal(data.authUrl)
    } catch (err) {
      setGoogleConnecting(false)
      setGoogleError(extractIntegrationMessage(err))
    }
  }

  const handleGoogleDisconnect = async () => {
    setGoogleDisconnecting(true)
    setGoogleError('')
    setGoogleMessage('')
    try {
      await apiClient.delete('/auth/oauth/google/disconnect')
      setGoogleConnected(false)
      setGoogleName(null)
      setGoogleEmail(null)
      setGoogleAvatarUrl(null)
      setGoogleMessage('Google account unlinked.')
    } catch (err) {
      setGoogleError(extractIntegrationMessage(err))
    } finally {
      setGoogleDisconnecting(false)
    }
  }

  const handleYouTubeSync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setYoutubeSyncing(true)
    setYoutubeError('')
    setYoutubeSyncResult(null)
    setYoutubeMessage('')
    setYoutubeProgress({ phase: 'Starting sync...' })

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      await connectTaskSseStream(
        {
          createEndpoint: '/integrations/youtube/sync',
          streamEndpoint: (taskId: string) => `/integrations/youtube/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event: SseEvent) => {
          switch (event.type) {
            case 'sync_started':
              setYoutubeProgress({ phase: 'Connected to YouTube...' })
              break
            case 'fetching_liked_videos':
              setYoutubeProgress({ phase: 'Fetching liked videos from YouTube...' })
              break
            case 'liked_videos_fetched':
              setYoutubeProgress({ phase: `Fetched ${event.count} liked videos` })
              break
            case 'videos_analyzed':
              setYoutubeProgress({
                phase: `Found ${event.musicVideos} music videos out of ${event.total} total`,
              })
              break
            case 'matching_complete':
              setYoutubeProgress({
                phase: `Matched ${event.matched} of ${event.totalMusic} music videos`,
              })
              break
            case 'sync_complete':
              setYoutubeSyncResult({
                total: event.total as number,
                musicVideos: event.musicVideos as number,
                matched: event.matched as number,
                channelLinks: event.channelLinks as number,
              })
              setYoutubeMessage(
                `Synced ${event.total} liked videos: ${event.musicVideos} music videos, ${event.matched} matched to catalog, ${event.channelLinks} channels linked.`,
              )
              setYoutubeProgress(null)
              break
            case 'error':
              setYoutubeError(event.message as string)
              setYoutubeProgress(null)
              break
          }
        },
      )

      // Stream ended without a terminal event â€” nothing to do
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setYoutubeError(extractIntegrationMessage(err))
      setYoutubeProgress(null)
    } finally {
      setYoutubeSyncing(false)
    }
  }

  const handleSpotifySync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setSpotifySyncing(true)
    setSpotifyError('')
    setSpotifySyncResult(null)
    setSpotifyMessage('')
    setSpotifyProgress({ phase: 'Starting sync...' })

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      await connectTaskSseStream(
        {
          createEndpoint: '/integrations/spotify/sync',
          streamEndpoint: (taskId: string) => `/integrations/spotify/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event: SseEvent) => {
          switch (event.type) {
            case 'sync_started':
              setSpotifyProgress({ phase: 'Connected to Spotify...' })
              break
            case 'fetching_tracks':
              setSpotifyProgress({ phase: 'Fetching liked tracks from Spotify...' })
              break
            case 'tracks_fetched':
              setSpotifyProgress({ phase: `Fetched ${event.count} liked tracks` })
              break
            case 'matching_tracks':
              setSpotifyProgress({ phase: `Matching ${event.count} tracks against catalog...` })
              break
            case 'tracks_matched':
              setSpotifyProgress({ phase: `Matched ${event.matched} of ${event.total} tracks`, detail: `${event.matched} interactions created` })
              break
            case 'seeding_albums':
              setSpotifyProgress({ phase: `Seeding ${event.count} missing albums...` })
              break
            case 'albums_seeded':
              setSpotifyProgress({ phase: `Seeded ${event.count} new albums` })
              break
            case 'sync_complete':
              setSpotifySyncResult({ likedTotal: event.likedTotal as number, likedMatched: event.likedMatched as number, likedSeeded: event.likedSeeded as number })
              setSpotifyMessage(
                `Synced ${event.likedTotal} liked tracks: ${event.likedMatched} matched in catalog, ${event.likedSeeded} new albums seeded.`,
              )
              setSpotifyProgress(null)
              break
            case 'error':
              setSpotifyError(event.message as string)
              setSpotifyProgress(null)
              break
          }
        },
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSpotifyError(extractIntegrationMessage(err))
      setSpotifyProgress(null)
    } finally {
      setSpotifySyncing(false)
    }
  }

  const handleSpotifyRecentlyPlayedSync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setSpotifyRecentlyPlayedSyncing(true)
    setSpotifyRecentlyPlayedResult(null)
    setSpotifyRecentlyPlayedMessage('')

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: '/integrations/spotify/recently-played/sync',
          streamEndpoint: (taskId: string) => `/integrations/spotify/recently-played/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (_event: SseEvent) => {
          // Progress events â€” not displayed inline for this sync
        },
      )

      if (terminal.type === 'sync_complete') {
        setSpotifyRecentlyPlayedResult({
          total: terminal.total as number,
          matched: terminal.matched as number,
          seeded: terminal.seeded as number,
        })
        setSpotifyRecentlyPlayedMessage(
          `Synced ${terminal.total} recently played tracks: ${terminal.matched} matched, ${terminal.seeded} seeded.`,
        )
      } else if (terminal.type === 'error') {
        setSpotifyRecentlyPlayedMessage('')
        setSpotifyError(terminal.message as string ?? 'Recently played sync failed')
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSpotifyError(extractIntegrationMessage(err))
    } finally {
      setSpotifyRecentlyPlayedSyncing(false)
    }
  }

  const tmdbSyncDirections = [
    { value: 'disabled', label: 'Off' },
    { value: 'import', label: 'TMDb â†’ Otix' },
    { value: 'export', label: 'Otix â†’ TMDb' },
    { value: 'bidirectional', label: 'Both ways' },
  ]

  const handleTmdbRatingSync = async () => {
    setTmdbSyncing(true)
    setTmdbError('')
    setTmdbSyncResult(null)
    try {
      const { data } = await apiClient.post('/integrations/tmdb/rating-sync', { direction: tmdbSyncDirection })
      setTmdbSyncResult({ imported: data.imported, exported: data.exported, skipped: data.skipped })
      if (data.errors?.length) setTmdbError(data.errors.join(', '))
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbSyncing(false)
    }
  }

  const handleTmdbWatchlistImport = async () => {
    setTmdbWatchlistImporting(true)
    setTmdbError('')
    setTmdbWatchlistResult(null)
    try {
      const { data } = await apiClient.post('/integrations/tmdb/watchlist-import')
      setTmdbWatchlistResult({ imported: data.imported, skipped: data.skipped })
      if (data.errors?.length) setTmdbError(data.errors.join(', '))
    } catch (err) {
      setTmdbError(extractIntegrationMessage(err))
    } finally {
      setTmdbWatchlistImporting(false)
    }
  }

  const handlePlexSync = async () => {
    abortRef.current?.abort()
    const abortController = new AbortController()
    abortRef.current = abortController

    setPlexSyncing(true)
    setPlexError('')
    setPlexSyncResult(null)
    setPlexLibraryProgress({})
    animStateRef.current = {}

    const progressKey = (server: string, library: string) => `${server}:${library}`

    try {
      const token = localStorage.getItem(ACCESS_TOKEN_KEY) ?? ''
      await connectTaskSseStream(
        {
          createEndpoint: '/integrations/plex/sync',
          streamEndpoint: (taskId: string) => `/integrations/plex/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event: SseEvent) => {
          switch (event.type) {
            case 'server_found':
              break
            case 'library_found': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              setPlexLibraryProgress((prev) => ({
                ...prev,
                [key]: {
                  serverName: event.serverName as string,
                  libraryName: event.libraryName as string,
                  itemsProcessed: 0,
                  itemsTotal: 0,
                  phase: 'pending',
                },
              }))
              if (!animStateRef.current[key]) {
                animStateRef.current[key] = { displayed: 0, real: 0, rate: 5, lastItems: 0, lastTime: performance.now() }
              }
              break
            }
            case 'syncing_library': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              setPlexLibraryProgress((prev) => ({
                ...prev,
                [key]: {
                  serverName: event.serverName as string,
                  libraryName: event.libraryName as string,
                  itemsProcessed: 0,
                  itemsTotal: event.itemsTotal as number,
                  phase: 'syncing',
                },
              }))
              if (!animStateRef.current[key]) {
                animStateRef.current[key] = { displayed: 0, real: 0, rate: 5, lastItems: 0, lastTime: performance.now() }
              }
              break
            }
            case 'library_progress': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              const realValue = event.itemsProcessed as number
              const now = performance.now()
              // Update rate tracking in the animation state
              const s = animStateRef.current[key]
              if (s) {
                const deltaItems = realValue - s.lastItems
                const deltaTime = now - s.lastTime
                if (deltaItems > 0 && deltaTime > 30) {
                  const instantRate = deltaItems / (deltaTime / 1000)
                  s.rate = s.rate ? s.rate * 0.4 + instantRate * 0.6 : instantRate
                }
                s.real = realValue
                s.lastItems = realValue
                s.lastTime = now
              } else {
                animStateRef.current[key] = {
                  displayed: Math.max(0, realValue - 5),
                  real: realValue,
                  rate: 5,
                  lastItems: realValue,
                  lastTime: now,
                }
              }
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                if (!lib) return prev
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    itemsProcessed: realValue,
                    itemsTotal: event.itemsTotal as number,
                  },
                }
              })
              break
            }
            case 'library_complete': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              const total = event.total as number
              if (animStateRef.current[key]) {
                animStateRef.current[key].real = total
              }
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                if (!lib) return prev
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    itemsProcessed: total,
                    itemsTotal: total,
                    phase: 'complete' as const,
                  },
                }
              })
              break
            }
            case 'sync_complete':
              setPlexSyncResult(event as unknown as PlexSyncResult)
              setPlexMessage(
                `Synced ${event.total} Plex items from ${event.libraries} libraries on ${event.servers} server(s). Seeded ${event.seeded} new catalog items.`,
              )
              break
            case 'error':
              setPlexError(event.message as string)
              break
          }
        },
      )
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexSyncing(false)
    }
  }

  // Cleanup SSE on unmount
  useEffect(() => {
    return () => {
      abortRef.current?.abort()
    }
  }, [])

  const handlePlexWatchlistSync = async () => {
    setPlexWatchlistSyncing(true)
    setPlexError('')
    setPlexWatchlistSyncResult(null)
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; seeded: number }>(
        '/integrations/plex/watchlist/sync',
      )
      setPlexWatchlistSyncResult(data)
      setPlexMessage(`Found ${data.matched} matches out of ${data.total} watchlist items. Seeded ${data.seeded} items.`)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexWatchlistSyncing(false)
    }
  }

  const handleDiscoverLibraries = async () => {
    setDiscoveringPlex(true)
    setPlexError('')
    try {
      await apiClient.get('/integrations/plex/servers')
      await refetchLibraries()
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setDiscoveringPlex(false)
    }
  }

  const handleSyncLibrary = async (library: PlexLibraryInfo) => {
    if (syncingLibraryIds.has(library.id)) return
    setSyncingLibraryIds((prev) => new Set(prev).add(library.id))
    setPlexError('')
    const key = `${library.serverName}:${library.title}`
    setPlexLibraryProgress((prev) => ({
      ...prev,
      [key]: {
        serverName: library.serverName,
        libraryName: library.title,
        itemsProcessed: 0,
        itemsTotal: 0,
        phase: 'pending',
      },
    }))
    if (!animStateRef.current[key]) {
      animStateRef.current[key] = { displayed: 0, real: 0, rate: 5, lastItems: 0, lastTime: performance.now() }
    }

    try {
      const result = await streamPlexLibrarySync(library.id, (event) => {
        switch (event.type) {
          case 'syncing_library': {
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [key]: {
                ...prev[key],
                phase: 'syncing',
                itemsTotal: event.itemsTotal as number,
              },
            }))
            break
          }
          case 'library_progress': {
            const realValue = event.itemsProcessed as number
            const now = performance.now()
            const s = animStateRef.current[key]
            if (s) {
              const deltaItems = realValue - s.lastItems
              const deltaTime = now - s.lastTime
              if (deltaItems > 0 && deltaTime > 30) {
                const instantRate = deltaItems / (deltaTime / 1000)
                s.rate = s.rate ? s.rate * 0.4 + instantRate * 0.6 : instantRate
              }
              s.real = realValue
              s.lastItems = realValue
              s.lastTime = now
            } else {
              animStateRef.current[key] = { displayed: Math.max(0, realValue - 5), real: realValue, rate: 5, lastItems: realValue, lastTime: now }
            }
            setPlexLibraryProgress((prev) => {
              const lib = prev[key]
              if (!lib) return prev
              return { ...prev, [key]: { ...lib, itemsProcessed: realValue, itemsTotal: event.itemsTotal as number } }
            })
            break
          }
          case 'library_complete': {
            const total = event.total as number
            if (animStateRef.current[key]) {
              animStateRef.current[key].real = total
            }
            setPlexLibraryProgress((prev) => {
              const lib = prev[key]
              if (!lib) return prev
              return { ...prev, [key]: { ...lib, itemsProcessed: total, itemsTotal: total, phase: 'complete' as const } }
            })
            break
          }
        }
      })
      setPlexMessage(`Synced ${library.title}: ${result.matched} matched, ${result.seeded} seeded out of ${result.total} items.`)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
      setPlexLibraryProgress((prev) => {
        const lib = prev[key]
        if (!lib) return prev
        return { ...prev, [key]: { ...lib, phase: 'failed' as const } }
      })
    } finally {
      setSyncingLibraryIds((prev) => {
        const next = new Set(prev)
        next.delete(library.id)
        return next
      })
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setSteamError('')
    setSteamMessage('')
    try {
      await apiClient.delete('/auth/oauth/steam/disconnect')
      setSteamConnected(false)
      setSteamId(null)
      setSteamProfile(null)
      setSteamMessage('Steam account unlinked.')
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setSteamError('')
    setScanResult(null)
    try {
      const { data } = await apiClient.post<{ totalInSteam: number; matchedInOtix: number }>(
        '/integrations/steam/scan',
      )
      setScanResult(data)
      setSteamMessage(`Found ${data.matchedInOtix} matches out of ${data.totalInSteam} Steam games.`)
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setScanning(false)
    }
  }

  const handleWishlistScan = async () => {
    setWishlistScanning(true)
    setSteamError('')
    setWishlistScanResult(null)
    try {
      const { data } = await apiClient.post<{ total: number; matched: number; private?: boolean }>(
        '/integrations/steam/wishlist/scan',
      )
      setWishlistScanResult(data)
      if (data.private) {
        setSteamError('Your Steam wishlist is private. Set your Steam privacy settings to Public to import your wishlist.')
      } else {
        setSteamMessage(`Found ${data.matched} wishlist matches out of ${data.total} items.`)
      }
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setWishlistScanning(false)
    }
  }

  const handleResolveUnmatched = async () => {
    setResolving(true)
    setSteamError('')
    setResolveResult(null)
    try {
      const { data } = await apiClient.post<{ resolved: number; synced: number; failed: number; total: number }>(
        '/integrations/steam/resolve-unmatched',
      )
      setResolveResult(data)
      let msg = ''
      if (data.resolved > 0) msg += `${data.resolved} linked, `
      if (data.synced > 0) msg += `${data.synced} synced, `
      if (data.failed > 0) msg += `${data.failed} failed, `
      msg = msg.replace(/,\s*$/, '')
      setSteamMessage(`Unmatched games resolved: ${msg || 'none found'}.`)
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setResolving(false)
    }
  }

  if (!isAuthenticated) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl p-6 space-y-6" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Link2 className="h-8 w-8 text-white/40" />
            <div>
              <p className="text-sm font-medium">Sign in required</p>
              <p className="text-xs text-white/60 mt-1">Sign in to manage integrations.</p>
            </div>
            <Link
              to="/auth/login"
              search={{ redirect: location.href }}
              className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-none transition-all duration-150 hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97]"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const query = searchQuery.toLowerCase().trim()

  const integrationDefs = [
    {
      id: 'steam',
      name: 'Steam',
      keywords: 'steam game library wishlist sign in valve',
      description: isSteamConnected && steamProfile?.personaname ? `Linked as ${steamProfile.personaname}` : 'Sign in with Steam, sync your game library, and import your wishlist.',
      isConnected: isSteamConnected,
      brandColor: BRAND_COLORS.steam,
      brandBg: BRAND_BG.steam,
      icon: SteamIcon,
      onConnect: handleConnect,
      connecting,
      onDisconnect: handleDisconnect,
      disconnecting,
    },
    {
      id: 'plex',
      name: 'Plex',
      keywords: 'plex media server watchlist library sync',
      description: isPlexConnected && plex?.plexUsername ? `Linked as ${plex.plexUsername}` : 'Link your Plex account to import and sync your media servers.',
      isConnected: isPlexConnected,
      brandColor: BRAND_COLORS.plex,
      brandBg: BRAND_BG.plex,
      icon: PlexIcon,
      onConnect: handlePlexConnect,
      connecting: plexConnecting,
      onDisconnect: handlePlexDisconnect,
      disconnecting: plexDisconnecting,
    },
    {
      id: 'spotify',
      name: 'Spotify',
      keywords: 'spotify music liked songs albums library sync',
      description: isSpotifyConnected && spotifyUsername ? `Linked as ${spotifyUsername}` : 'Link your Spotify account to sync your liked songs and saved albums.',
      isConnected: isSpotifyConnected,
      brandColor: BRAND_COLORS.spotify,
      brandBg: BRAND_BG.spotify,
      icon: SpotifyIcon,
      onConnect: handleSpotifyConnect,
      connecting: spotifyConnecting,
      onDisconnect: handleSpotifyDisconnect,
      disconnecting: spotifyDisconnecting,
    },
    {
      id: 'google',
      name: 'Google',
      keywords: 'google youtube music liked videos sync',
      description: isGoogleConnected && googleEmail ? `Linked as ${googleEmail}` : 'Link your Google account for YouTube Music and more.',
      isConnected: isGoogleConnected,
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      onConnect: handleGoogleConnect,
      connecting: googleConnecting,
      onDisconnect: handleGoogleDisconnect,
      disconnecting: googleDisconnecting,
    },
    {
      id: 'tmdb',
      name: 'TMDb',
      keywords: 'tmdb themoviedb ratings watchlist movies shows sync import',
      description: isTmdbConnected && tmdbUsername ? `Linked as ${tmdbUsername}` : 'Link your TMDb account to sync ratings and import your watchlist.',
      isConnected: isTmdbConnected,
      brandColor: BRAND_COLORS.tmdb,
      brandBg: BRAND_BG.tmdb,
      icon: TmdbIcon,
      onConnect: handleTmdbConnect,
      connecting: tmdbConnecting,
      onDisconnect: handleTmdbDisconnect,
      disconnecting: tmdbDisconnecting,
    },
  ]

  const filteredIntegrations = (query
    ? integrationDefs.filter((i) =>
        i.name.toLowerCase().includes(query) ||
        i.keywords.includes(query) ||
        i.description.toLowerCase().includes(query)
      )
    : integrationDefs)

  return (
    <div className="space-y-6">
      <div className="rounded-2xl p-6 space-y-6" style={{ backgroundColor: 'var(--dk-surface-glass)' }}>
        <div>
          <h2 className="text-lg font-semibold">Integrations</h2>
          <p className="text-sm text-white/60 mt-1">Connect your Otix account to other platforms.</p>
        </div>
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search integrations..."
            className="w-full text-sm text-white outline-none h-9 rounded-xl bg-white/5 pl-9 pr-3 shadow-[0_0_0_1px_rgba(255,255,255,0.1)] transition-shadow duration-150 placeholder:text-white/30 focus:shadow-[0_0_0_1px_rgba(255,255,255,0.3)]"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/30" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-8 text-sm text-white/60">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading integrations...
          </div>
        ) : filteredIntegrations.length === 0 ? (
          <div className="rounded-2xl p-8 text-center bg-white/5">
            <p className="text-sm text-white/60">No integrations match &quot;{searchQuery}&quot;</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredIntegrations.map((i) => (
              <IntegrationCard
                key={i.id}
                name={i.name}
                description={i.description}
                brandColor={i.brandColor}
                brandBg={i.brandBg}
                icon={i.icon}
                isConnected={i.isConnected}
                expanded={expandedId === i.id}
                onToggle={() => toggleExpand(i.id)}
                onConnect={i.onConnect}
                connecting={i.connecting}
                onDisconnect={i.onDisconnect}
                disconnecting={i.disconnecting}
              >
                {/* Steam content */}
                {i.id === 'steam' && (
                  <>
                    <IntegrationProfile
                      avatarUrl={steamProfile?.avatarfull}
                      avatarAlt={steamProfile?.personaname ?? 'Steam avatar'}
                      name={steamProfile?.personaname ?? 'Steam User'}
                      detail={steamProfile?.realname ?? (displayedSteamId ? `Steam ID: ${displayedSteamId}` : 'Steam account linked')}
                      brandBg={BRAND_BG.steam}
                      icon={SteamIcon}
                      brandColor={BRAND_COLORS.steam}
                      meta={steamProfile?.profileurl && (
                        <a href={steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="text-xs text-white/40 hover:text-primary transition-colors duration-150 shrink-0">
                          View Profile &rarr;
                        </a>
                      )}
                    />
                    {steamProfile && (
                      <IntegrationStats items={[
                        ...(steamProfile.timecreated ? [{ label: 'account age', value: formatAccountAge(steamProfile.timecreated) }] : []),
                        ...(steamProfile.loccountrycode ? [{ label: 'location', value: steamProfile.loccountrycode }] : []),
                        ...(steamProfile.personastate !== null && steamProfile.personastate !== undefined ? [{ label: 'status', value: personaStateLabel(steamProfile.personastate) }] : []),
                      ]} />
                    )}
                    <IntegrationAction label="Library Sync" description="Steam Library" result={scanResult ? `${scanResult.matchedInOtix} matches out of ${scanResult.totalInSteam} games` : null} buttonLabel={scanning ? 'Scanning...' : scanResult ? 'Re-scan' : 'Scan Library'} buttonIcon={RefreshCw} onPress={handleScan} loading={scanning} />
                    <IntegrationAction label="Wishlist Sync" description="Steam Wishlist" result={wishlistScanResult ? `${wishlistScanResult.matched} matches out of ${wishlistScanResult.total} wishlist items` : null} buttonLabel={wishlistScanning ? 'Scanning...' : wishlistScanResult ? 'Re-scan' : 'Scan Wishlist'} buttonIcon={RefreshCw} onPress={handleWishlistScan} loading={wishlistScanning} muted />
                    <IntegrationAction label="Game Matching" description="Match unmapped games to IGDB" result={resolveResult ? `${resolveResult.resolved} linked${resolveResult.synced > 0 ? `, ${resolveResult.synced} synced` : ''}${resolveResult.failed > 0 ? `, ${resolveResult.failed} failed` : ''} out of ${resolveResult.total}` : null} buttonLabel={resolving ? 'Resolving...' : resolveResult ? 'Resolve Again' : 'Resolve Unmatched'} buttonIcon={Link2} onPress={handleResolveUnmatched} loading={resolving} />
                    {steamMessage && <p className="px-5 py-2 text-xs text-green-400">{steamMessage}</p>}
                    {steamError && <p className="px-5 py-2 text-xs text-red-400">{steamError}</p>}
                  </>
                )}

                {/* Plex content */}
                {i.id === 'plex' && (
                  <>
                    <IntegrationProfile
                      avatarUrl={plex?.plexThumb}
                      avatarAlt={plex?.plexUsername ?? 'Plex avatar'}
                      name={plex?.plexUsername ?? 'Plex User'}
                      detail={plex?.plexEmail ?? (plex?.plexId ?? user?.plexId ?? 'Plex account linked')}
                      brandBg={BRAND_BG.plex}
                      icon={PlexIcon}
                      brandColor={BRAND_COLORS.plex}
                    />

                    {/* Libraries list */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold uppercase text-white/40 tracking-wider">Plex Libraries</p>
                        <p className="mt-1 text-sm font-medium">
                          {plexLibrariesLoading
                            ? 'Loading...'
                            : plexLibraries && plexLibraries.length > 0
                              ? `${plexLibraries.length} librar${plexLibraries.length === 1 ? 'y' : 'ies'} found`
                              : 'Discover your Plex libraries to sync individually'}
                        </p>
                      </div>
                      <DkButton
                        size="sm"
                        variant="ghost"
                        onClick={handleDiscoverLibraries}
                        loading={discoveringPlex}
                        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                      >
                        <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                        {plexLibraries && plexLibraries.length > 0 ? 'Refresh' : 'Discover'}
                      </DkButton>
                    </div>

                    {plexLibraries && plexLibraries.length > 0 && (
                      <div className="px-5 py-2 space-y-2">
                        {plexLibraries.map((lib) => {
                          const TypeIcon = lib.libraryType === 'movie' ? Film : lib.libraryType === 'show' ? Tv : Music
                          const typeLabel = lib.libraryType === 'artist' ? 'Music' : lib.libraryType === 'movie' ? 'Movies' : 'TV Shows'
                          const libKey = `${lib.serverName}:${lib.title}`
                          const libProgress = plexLibraryProgress[libKey]
                          const isSyncing = syncingLibraryIds.has(lib.id)

                          return (
                            <div key={lib.id} className="flex items-center gap-3 rounded-xl p-3 bg-white/[0.03]">
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium truncate">{lib.title}</span>
                                  <span className="inline-flex items-center gap-1 text-xs text-white/60 shrink-0 bg-white/5 rounded-md px-1.5 py-0.5">
                                    <TypeIcon className="h-3 w-3" />
                                    {typeLabel}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5 text-xs text-white/40 mt-0.5">
                                  <span className="font-medium text-white/60">{lib.serverName}</span>
                                  <span className="text-white/20">Â·</span>
                                  <span>{lib.itemCount} items</span>
                                  {lib.lastSyncedAt && (
                                    <>
                                      <span className="text-white/20">Â·</span>
                                      <span>last synced {formatDaysAgo(Math.floor(new Date(lib.lastSyncedAt).getTime() / 1000)) || 'today'}</span>
                                    </>
                                  )}
                                </div>
                                {libProgress && (
                                  <div className="overflow-hidden rounded-full h-1.5 w-full bg-white/10 mt-1">
                                    <div
                                      className="rounded-full h-full bg-primary"
                                      style={{ width: `${libProgress.itemsTotal > 0 ? (libProgress.itemsProcessed / libProgress.itemsTotal) * 100 : 0}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                              <DkButton
                                size="sm"
                                variant="ghost"
                                onClick={() => handleSyncLibrary(lib)}
                                loading={isSyncing}
                                disabled={isSyncing}
                                className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                              >
                                <RefreshCw className={isSyncing ? 'h-3 w-3 mr-1 animate-spin' : 'h-3 w-3 mr-1'} />
                                {isSyncing ? 'Syncing' : 'Sync'}
                              </DkButton>
                            </div>
                          )
                        })}
                      </div>
                    )}

                    {/* Sync All */}
                    <IntegrationAction label="Sync All Libraries" description="Sync all selected Plex libraries at once" result={plexSyncResult ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded` : null} buttonLabel={plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync All' : 'Sync All'} buttonIcon={RefreshCw} onPress={handlePlexSync} loading={plexSyncing} progress={Object.keys(plexLibraryProgress).length > 0 && <span className="text-xs text-primary">{Object.values(plexLibraryProgress).filter(l => l.phase === 'syncing').length} libraries syncing</span>} muted />

                    <IntegrationAction label="Watchlist Sync" description="Plex Watchlist" result={plexWatchlistSyncResult ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items` : null} buttonLabel={plexWatchlistSyncing ? 'Syncing...' : plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'} buttonIcon={RefreshCw} onPress={handlePlexWatchlistSync} loading={plexWatchlistSyncing} muted />
                    <div className="flex items-center justify-between gap-4 px-5 py-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium">Watch History Sync</p>
                        <p className="mt-0.5 text-xs text-white/60">
                          Sync episode-level watch history from Plex to your Otix library.
                        </p>
                      </div>
                      <DkSwitch
                        checked={plexWatchHistoryEnabled}
                        onCheckedChange={async (checked) => {
                          setPlexWatchHistoryEnabled(checked)
                          try {
                            await apiClient.patch('/auth/me', { plex_watch_history_enabled: checked })
                          } catch {
                            setPlexWatchHistoryEnabled(!checked)
                          }
                        }}
                      />
                    </div>
                    {plexMessage && <p className="px-5 py-2 text-xs text-green-400">{plexMessage}</p>}
                    {plexError && <p className="px-5 py-2 text-xs text-red-400">{plexError}</p>}
                  </>
                )}

                {/* Spotify content */}
                {i.id === 'spotify' && (
                  <>
                    <IntegrationProfile
                      avatarUrl={spotifyAvatarUrl}
                      avatarAlt={spotifyUsername ?? 'Spotify avatar'}
                      name={spotifyUsername ?? 'Spotify User'}
                      detail="Spotify account linked"
                      brandBg={BRAND_BG.spotify}
                      icon={SpotifyIcon}
                      brandColor={BRAND_COLORS.spotify}
                    />
                    {spotifyStats && (
                      <IntegrationStats items={[
                        ...(spotifyStats.product ? [{ label: 'plan', value: String(spotifyStats.product) }] : []),
                        ...(spotifyStats.followers ? [{ label: 'followers', value: String(spotifyStats.followers) }] : []),
                        ...(spotifyStats.country ? [{ label: 'country', value: String(spotifyStats.country) }] : []),
                      ]} />
                    )}
                    <IntegrationAction label="Library Sync" description="Spotify Library" result={spotifySyncResult ? `${spotifySyncResult.likedMatched} matched out of ${spotifySyncResult.likedTotal} liked songs` : null} buttonLabel={spotifySyncing ? 'Syncing...' : spotifySyncResult ? 'Re-sync' : 'Sync Library'} buttonIcon={RefreshCw} onPress={handleSpotifySync} loading={spotifySyncing} disabled={spotifySyncing} progress={spotifyProgress && <span className="text-xs text-primary">{spotifyProgress.phase}{spotifyProgress.detail ? ` (${spotifyProgress.detail})` : ''}</span>} />
                    <IntegrationAction label="Recently Played Sync" description="Spotify Recently Played" result={spotifyRecentlyPlayedResult ? `${spotifyRecentlyPlayedResult.matched} matched out of ${spotifyRecentlyPlayedResult.total} tracks` : null} buttonLabel={spotifyRecentlyPlayedSyncing ? 'Syncing...' : spotifyRecentlyPlayedResult ? 'Re-sync' : 'Sync Recently Played'} buttonIcon={RefreshCw} onPress={handleSpotifyRecentlyPlayedSync} loading={spotifyRecentlyPlayedSyncing} disabled={spotifyRecentlyPlayedSyncing} muted />
                    <IntegrationAction label="Playlists" description="Spotify Playlists" buttonLabel="Browse" buttonIcon={ListMusic} onPress={() => navigate({ to: '/library/spotify/playlists' })} muted />
                    {spotifyMessage && <p className="px-5 py-2 text-xs text-green-400">{spotifyMessage}</p>}
                    {spotifyRecentlyPlayedMessage && <p className="px-5 py-2 text-xs text-green-400">{spotifyRecentlyPlayedMessage}</p>}
                    {spotifyError && <p className="px-5 py-2 text-xs text-red-400">{spotifyError}</p>}
                  </>
                )}

                {/* Google content */}
                {i.id === 'google' && (
                  <>
                    <IntegrationProfile
                      avatarUrl={googleAvatarUrl}
                      avatarAlt={googleName ?? 'Google avatar'}
                      name={googleName ?? 'Google User'}
                      detail={googleEmail ?? 'Google account linked'}
                      brandBg={BRAND_BG.google}
                      icon={GoogleIcon}
                      brandColor={BRAND_COLORS.google}
                    />
                    <IntegrationAction label="YouTube Sync" description="YouTube Liked Videos" result={youtubeSyncResult ? `${youtubeSyncResult.total} videos (${youtubeSyncResult.matched} matched, ${youtubeSyncResult.musicVideos} music)` : null} buttonLabel={youtubeSyncing ? 'Syncing...' : youtubeSyncResult ? 'Re-sync' : 'Sync Liked Videos'} buttonIcon={RefreshCw} onPress={handleYouTubeSync} loading={youtubeSyncing} disabled={youtubeSyncing} progress={youtubeProgress && <span className="text-xs text-primary">{youtubeProgress.phase}{youtubeProgress.detail ? ` (${youtubeProgress.detail})` : ''}</span>} />
                    {googleMessage && <p className="px-5 py-2 text-xs text-green-400">{googleMessage}</p>}
                    {googleError && <p className="px-5 py-2 text-xs text-red-400">{googleError}</p>}
                    {youtubeMessage && <p className="px-5 py-2 text-xs text-green-400">{youtubeMessage}</p>}
                    {youtubeError && <p className="px-5 py-2 text-xs text-red-400">{youtubeError}</p>}
                  </>
                )}

                {/* TMDb content */}
                {i.id === 'tmdb' && (
                  <>
                    <IntegrationProfile
                      avatarUrl={tmdbAvatarUrl}
                      avatarAlt={tmdbUsername ?? 'TMDb avatar'}
                      name={tmdbUsername ?? 'TMDb User'}
                      detail="TMDb account linked"
                      brandBg={BRAND_BG.tmdb}
                      icon={TmdbIcon}
                      brandColor={BRAND_COLORS.tmdb}
                    />
                    {tmdbStats && (
                      <IntegrationStats items={[
                        { label: 'rated movies', value: tmdbStats.ratedMovies },
                        { label: 'rated shows', value: tmdbStats.ratedTv },
                        { label: 'watchlist movies', value: tmdbStats.watchlistMovies },
                        { label: 'watchlist shows', value: tmdbStats.watchlistTv },
                      ]} />
                    )}
                    <IntegrationAction label="Rating Sync" description="Sync ratings between Otix and TMDb" result={tmdbSyncResult ? `${tmdbSyncResult.imported > 0 ? `${tmdbSyncResult.imported} imported` : ''}${tmdbSyncResult.imported > 0 && tmdbSyncResult.exported > 0 ? ', ' : ''}${tmdbSyncResult.exported > 0 ? `${tmdbSyncResult.exported} exported` : ''}${tmdbSyncResult.skipped > 0 ? ` (${tmdbSyncResult.skipped} skipped)` : ''}` : null} buttonLabel={tmdbSyncing ? 'Syncing...' : 'Sync Ratings'} buttonIcon={RefreshCw} onPress={handleTmdbRatingSync} loading={tmdbSyncing} disabled={tmdbSyncDirection === 'disabled'}>
                      <div className="mt-2">
                        <DkDropdown options={tmdbSyncDirections} value={tmdbSyncDirection} onChange={setTmdbSyncDirection} placeholder="Direction" />
                      </div>
                    </IntegrationAction>
                    <IntegrationAction label="Watchlist Import" description="Import your TMDb watchlist into Otix" result={tmdbWatchlistResult ? `${tmdbWatchlistResult.imported} imported, ${tmdbWatchlistResult.skipped} skipped` : null} buttonLabel={tmdbWatchlistImporting ? 'Importing...' : tmdbWatchlistResult ? 'Re-import' : 'Import'} buttonIcon={Download} onPress={handleTmdbWatchlistImport} loading={tmdbWatchlistImporting} muted />
                    {tmdbMessage && <p className="px-5 py-2 text-xs text-green-400">{tmdbMessage}</p>}
                    {tmdbError && <p className="px-5 py-2 text-xs text-red-400">{tmdbError}</p>}
                  </>
                )}
              </IntegrationCard>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
