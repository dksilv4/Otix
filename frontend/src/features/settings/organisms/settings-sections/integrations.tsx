import { useState, useRef, useEffect } from 'react'
import { Link, useLocation } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient, API_BASE_URL, convertKeysToCamelCase } from '@/lib/api-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { SpotifyIcon } from '@/features/dk-ui/atoms/spotify-icon'
import { GoogleIcon } from '@/features/dk-ui/atoms/google-icon'
import { TmdbIcon } from '@/features/dk-ui/atoms/tmdb-icon'
import { cn } from '@/lib/utils'
import { useDownloadConfig, useConnectionTest } from '@/features/downloads/use-downloads'
import { useExperiment } from '@/features/experiments/experiments-provider'
import { Loader2, Plus, Unlink, RefreshCw, Download, ChevronDown, Link2, Server, Search, CheckCircle2, XCircle } from 'lucide-react'

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

type PlexSyncEvent =
  | { type: 'server_found'; serverName: string }
  | { type: 'library_found'; serverName: string; libraryName: string; libraryType: string }
  | { type: 'syncing_library'; serverName: string; libraryName: string; itemsTotal: number }
  | { type: 'library_progress'; serverName: string; libraryName: string; itemsProcessed: number; itemsTotal: number }
  | { type: 'library_complete'; serverName: string; libraryName: string; total: number; matched: number; seeded: number }
  | { type: 'sync_complete'; servers: number; libraries: number; total: number; matched: number; seeded: number }
  | { type: 'error'; message: string }

type PlexProgressState = {
  phase: string
  libraryName?: string
  itemsProcessed?: number
  itemsTotal?: number
}

type SpotifySyncEvent =
  | { type: 'sync_started' }
  | { type: 'fetching_tracks' }
  | { type: 'tracks_fetched'; count: number }
  | { type: 'matching_tracks'; count: number }
  | { type: 'tracks_matched'; matched: number; total: number }
  | { type: 'seeding_albums'; count: number }
  | { type: 'albums_seeded'; count: number }
  | { type: 'sync_complete'; likedTotal: number; likedMatched: number; likedSeeded: number }
  | { type: 'error'; message: string }

type SpotifyProgressState = {
  phase: string
  detail?: string
}

type YouTubeSyncEvent =
  | { type: 'sync_started' }
  | { type: 'fetching_history' }
  | { type: 'history_fetched'; count: number }
  | { type: 'fetching_liked_videos' }
  | { type: 'liked_videos_fetched'; count: number }
  | { type: 'videos_analyzed'; total: number; musicVideos: number }
  | { type: 'matching_complete'; matched: number; totalMusic: number }
  | { type: 'sync_complete'; total: number; musicVideos: number; matched: number; channelLinks: number }
  | { type: 'error'; message: string }

type YouTubeProgressState = {
  phase: string
  detail?: string
}

async function* parseYouTubeSseEvents(response: Response): AsyncGenerator<YouTubeSyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield convertKeysToCamelCase(JSON.parse(line.slice(6))) as YouTubeSyncEvent
        }
      }
    }
  }
}

async function* parseSpotifySseEvents(response: Response): AsyncGenerator<SpotifySyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield convertKeysToCamelCase(JSON.parse(line.slice(6))) as SpotifySyncEvent
        }
      }
    }
  }
}

async function* parseSseEvents(response: Response): AsyncGenerator<PlexSyncEvent> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const frames = buffer.split('\n\n')
    buffer = frames.pop() || ''

    for (const frame of frames) {
      for (const line of frame.split('\n')) {
        if (line.startsWith('data: ')) {
          yield convertKeysToCamelCase(JSON.parse(line.slice(6))) as PlexSyncEvent
        }
      }
    }
  }
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

const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  plex: '#e5a00d',
  spotify: '#1db954',
  tmdb: '#01b4e4',
  google: '#4285F4',
  sabnzbd: '#f0a000',
  nzbplanet: '#7c3aed',
}

const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  plex: 'bg-[#e5a00d]/10',
  spotify: 'bg-[#1db954]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
  sabnzbd: 'bg-[#f0a000]/10',
  nzbplanet: 'bg-[#7c3aed]/10',
}

// ── Integration card (iOS-style expandable) ──

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
    <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={isConnected ? onToggle : undefined}
        className={cn(
          'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors',
          isConnected && 'hover:bg-[var(--dk-surface-glass)] active:bg-[var(--dk-surface-glass)]',
        )}
        style={{ borderLeft: `3px solid ${brandColor}` }}
      >
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', brandBg)} style={{ color: brandColor }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold">{name}</p>
            {isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{description}</p>
        </div>
        {isConnected ? (
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expanded && 'rotate-180')} />
        ) : (
          <DkButton size="sm" variant="primary" onClick={onConnect} loading={connecting} className="shrink-0 shadow-none">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </DkButton>
        )}
      </button>

      {/* Expanded content */}
      {isConnected && expanded && (
        <div className="border-t border-border/20">
          {children}
          {onDisconnect && (
            <div className="border-t border-border/20 px-5 py-3">
              <DkButton
                size="sm"
                variant="ghost"
                onClick={onDisconnect}
                loading={disconnecting}
                className="w-full bg-destructive/10 text-destructive shadow-none hover:bg-destructive/15"
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

// ── Integration profile row ──

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
        <img src={avatarUrl} alt={avatarAlt} className="h-10 w-10 rounded-xl object-cover ring-1 ring-border/20" />
      ) : (
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', brandBg || 'bg-muted/20')} style={brandColor ? { color: brandColor } : undefined}>
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-muted-foreground truncate">{detail}</p>
      </div>
      {meta}
    </div>
  )
}

// ── Integration action row ──

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
    <div className={cn('flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-4', muted && 'bg-[var(--dk-surface-overlay)]/30')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">{label}</p>
          {progress}
        </div>
        <p className="mt-1 text-sm font-medium">{description}</p>
        {result && <p className="text-xs text-muted-foreground mt-0.5">{result}</p>}
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

// ── Integration stats row ──

function IntegrationStats({ items }: { items: { label: string; value: string | number }[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1 px-5 py-3 text-xs text-muted-foreground border-t border-border/20">
      {items.map((item) => (
        <span key={item.label}>
          <strong className="text-foreground">{item.value}</strong> {item.label}
        </span>
      ))}
    </div>
  )
}

export function IntegrationsSection() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const location = useLocation()
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
  const [plexProgress, setPlexProgress] = useState<PlexProgressState | null>(null)
  const abortRef = useRef<AbortController | null>(null)
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

  // ── SABnzbd + NZBPlanet ──
  const { config: dlConfig, saveConfig } = useDownloadConfig(user?.id)
  const { testingSabnzbd, testingNzbplanet, testSabnzbd, testNzbplanet } = useConnectionTest()
  const [sabnzbdForm, setSabnzbdForm] = useState({ host: '', port: 8080, apiKey: '', useSsl: false })
  const [nzbplanetForm, setNzbplanetForm] = useState({ apiKey: '' })
  const [sabnzbdStatus, setSabnzbdStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [nzbplanetStatus, setNzbplanetStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  const [downloadPath, setDownloadPath] = useState('')
  const [sabnzbdCompletePath, setSabnzbdCompletePath] = useState('')
  const [postProcessEnabled, setPostProcessEnabled] = useState(true)
  const [autoSearch, setAutoSearch] = useState(false)
  const [intervalHours, setIntervalHours] = useState(12)
  const [preferredRepackers, setPreferredRepackers] = useState('')

  useEffect(() => {
    if (dlConfig) {
      setSabnzbdForm({
        host: dlConfig.sabnzbdHost ?? '',
        port: dlConfig.sabnzbdPort ?? 8080,
        apiKey: dlConfig.sabnzbdApiKey ?? '',
        useSsl: dlConfig.sabnzbdUseSsl ?? false,
      })
      setNzbplanetForm({ apiKey: dlConfig.nzbplanetApiKey ?? '' })
      setDownloadPath(dlConfig.downloadPath ?? '')
      setSabnzbdCompletePath(dlConfig.sabnzbdCompletePath ?? '')
      setPostProcessEnabled(dlConfig.postProcessEnabled ?? true)
      setAutoSearch(dlConfig.autoSearchWishlist ?? false)
      setIntervalHours(dlConfig.wishlistIntervalHours ?? 12)
      setPreferredRepackers(dlConfig.preferredRepackers ?? '')
    }
  }, [dlConfig])

  const isSabnzbdConnected = !!(dlConfig?.sabnzbdHost && dlConfig?.sabnzbdApiKey)
  const isNzbplanetConnected = !!dlConfig?.nzbplanetApiKey

  // Admin + experiment gate for download feature
  const { enabled: downloadsEnabled } = useExperiment('download_integration')
  const showDownloads = user?.isAdmin && downloadsEnabled

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const fetchIntegrations = async () => {
    try {
      const { data } = await apiClient.get('/auth/integrations')
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

  const handleConnect = async () => {
    setConnecting(true)
    setSteamError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/steam')
      window.location.href = data.authUrl
    } catch (err) {
      setConnecting(false)
      setSteamError(extractIntegrationMessage(err))
    }
  }

  const handlePlexConnect = async () => {
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/integrations/plex')
      window.location.href = data.authUrl
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
      await apiClient.delete('/auth/integrations/plex')
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
      const { data } = await apiClient.post('/auth/integrations/tmdb')
      window.location.href = data.authUrl
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
      await apiClient.delete('/auth/integrations/tmdb')
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
      const { data } = await apiClient.post('/auth/integrations/spotify')
      window.location.href = data.authUrl
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
      await apiClient.delete('/auth/integrations/spotify')
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
      const { data } = await apiClient.post('/auth/integrations/google')
      window.location.href = data.authUrl
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
      await apiClient.delete('/auth/integrations/google')
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
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/youtube/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/youtube/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseYouTubeSseEvents(response)) {
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
              total: event.total,
              musicVideos: event.musicVideos,
              matched: event.matched,
              channelLinks: event.channelLinks,
            })
            setYoutubeMessage(
              `Synced ${event.total} liked videos: ${event.musicVideos} music videos, ${event.matched} matched to catalog, ${event.channelLinks} channels linked.`,
            )
            setYoutubeProgress(null)
            break
          case 'error':
            setYoutubeError(event.message)
            setYoutubeProgress(null)
            break
        }
      }
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
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/spotify/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/spotify/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseSpotifySseEvents(response)) {
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
            setSpotifySyncResult({ likedTotal: event.likedTotal, likedMatched: event.likedMatched, likedSeeded: event.likedSeeded })
            setSpotifyMessage(
              `Synced ${event.likedTotal} liked tracks: ${event.likedMatched} matched in catalog, ${event.likedSeeded} new albums seeded.`,
            )
            setSpotifyProgress(null)
            break
          case 'error':
            setSpotifyError(event.message)
            setSpotifyProgress(null)
            break
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setSpotifyError(extractIntegrationMessage(err))
      setSpotifyProgress(null)
    } finally {
      setSpotifySyncing(false)
    }
  }

  const tmdbSyncDirections = [
    { value: 'disabled', label: 'Off' },
    { value: 'import', label: 'TMDb → Otix' },
    { value: 'export', label: 'Otix → TMDb' },
    { value: 'bidirectional', label: 'Both ways' },
  ]

  const handleTmdbRatingSync = async () => {
    setTmdbSyncing(true)
    setTmdbError('')
    setTmdbSyncResult(null)
    try {
      const { data } = await apiClient.post('/auth/integrations/tmdb/rating-sync', { direction: tmdbSyncDirection })
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
      const { data } = await apiClient.post('/auth/integrations/tmdb/watchlist-import')
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
    setPlexProgress({ phase: 'Starting sync...' })

    try {
      const { data } = await apiClient.post<{ taskId: string }>('/auth/integrations/plex/sync')
      const token = localStorage.getItem('otix-access-token')

      const response = await fetch(
        `${API_BASE_URL}/auth/integrations/plex/sync/${data.taskId}/stream`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal: abortController.signal,
        },
      )

      if (!response.ok) {
        throw new Error(`SSE connection failed: ${response.status}`)
      }

      for await (const event of parseSseEvents(response)) {
        switch (event.type) {
          case 'server_found':
            setPlexProgress({ phase: `Found server: ${event.serverName}` })
            break
          case 'library_found':
            setPlexProgress({ phase: `Found library: ${event.libraryName}` })
            break
          case 'syncing_library':
            setPlexProgress({
              phase: `Syncing ${event.libraryName}...`,
              libraryName: event.libraryName,
              itemsTotal: event.itemsTotal,
              itemsProcessed: 0,
            })
            break
          case 'library_progress':
            setPlexProgress((prev) => prev ? {
              ...prev,
              itemsProcessed: event.itemsProcessed,
              itemsTotal: event.itemsTotal,
            } : null)
            break
          case 'library_complete':
            setPlexProgress({
              phase: `Synced ${event.libraryName}: ${event.total} items (${event.matched} matched, ${event.seeded} seeded)`,
            })
            break
          case 'sync_complete':
            setPlexSyncResult(event)
            setPlexMessage(
              `Synced ${event.total} Plex items from ${event.libraries} libraries on ${event.servers} server(s). Seeded ${event.seeded} new catalog items.`,
            )
            setPlexProgress(null)
            break
          case 'error':
            setPlexError(event.message)
            setPlexProgress(null)
            break
        }
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setPlexError(extractIntegrationMessage(err))
      setPlexProgress(null)
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
        '/auth/integrations/plex/watchlist/sync',
      )
      setPlexWatchlistSyncResult(data)
      setPlexMessage(`Found ${data.matched} matches out of ${data.total} watchlist items. Seeded ${data.seeded} items.`)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexWatchlistSyncing(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setSteamError('')
    setSteamMessage('')
    try {
      await apiClient.delete('/auth/integrations/steam')
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
        '/auth/integrations/steam/scan',
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
        '/auth/integrations/steam/wishlist/scan',
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
        '/auth/integrations/steam/resolve-unmatched',
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
      <div className="space-y-4 rounded-2xl bg-[var(--dk-surface-base)] p-12 text-center shadow-[var(--dk-shadow-sm)]">
        <Link2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="text-sm font-medium">Sign in required</p>
          <p className="text-xs text-muted-foreground mt-1">Sign in to manage integrations.</p>
        </div>
        <Link
          to="/auth/login"
          search={{ redirect: location.href }}
          className="inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--dk-ring-color)] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 active:scale-[0.97] rounded-xl px-5 py-2.5 text-sm bg-primary text-primary-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.15)] hover:bg-primary/90"
        >
          Sign In
        </Link>
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
    {
      id: 'sabnzbd',
      name: 'SABnzbd',
      keywords: 'sabnzbd usenet download client nzb',
      description: isSabnzbdConnected ? `${sabnzbdForm.host}:${sabnzbdForm.port}` : 'Configure your SABnzbd download client for game ISOs.',
      isConnected: isSabnzbdConnected,
      brandColor: BRAND_COLORS.sabnzbd,
      brandBg: BRAND_BG.sabnzbd,
      icon: Server,
      onConnect: undefined, // handled in expanded content
      connecting: false,
      onDisconnect: undefined, // handled in expanded content
      disconnecting: false,
    },
    {
      id: 'nzbplanet',
      name: 'NZBPlanet',
      keywords: 'nzbplanet usenet indexer search nzb',
      description: isNzbplanetConnected ? 'API key configured' : 'Configure NZBPlanet to search for game NZBs.',
      isConnected: isNzbplanetConnected,
      brandColor: BRAND_COLORS.nzbplanet,
      brandBg: BRAND_BG.nzbplanet,
      icon: Search,
      onConnect: undefined,
      connecting: false,
      onDisconnect: undefined,
      disconnecting: false,
    },
  ]

  const filteredIntegrations = (query
    ? integrationDefs.filter((i) =>
        i.name.toLowerCase().includes(query) ||
        i.keywords.includes(query) ||
        i.description.toLowerCase().includes(query)
      )
    : integrationDefs).filter(i => i.id !== 'sabnzbd' && i.id !== 'nzbplanet')

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-[-0.01em]">Integrations</h2>
        <p className="text-sm text-muted-foreground mt-1">Connect your Otix account to other platforms.</p>
      </div>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search integrations..."
          className="w-full h-9 rounded-xl bg-[var(--dk-surface-raised)] pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 outline-none ring-1 ring-border/30 focus:ring-primary/40 transition-all"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integrations...
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="rounded-2xl bg-[var(--dk-surface-base)] p-8 text-center shadow-[var(--dk-shadow-md)]">
          <p className="text-sm text-muted-foreground">No integrations match "{searchQuery}"</p>
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
                      <a href={steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors shrink-0">
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
                  {steamMessage && <p className="px-5 py-2 text-xs text-green-500">{steamMessage}</p>}
                  {steamError && <p className="px-5 py-2 text-xs text-destructive">{steamError}</p>}
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
                  <IntegrationAction label="Library Sync" description="Plex Library" result={plexSyncResult ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded` : null} buttonLabel={plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync' : 'Sync Now'} buttonIcon={RefreshCw} onPress={handlePlexSync} loading={plexSyncing} progress={plexProgress && <span className="text-xs text-primary">{plexProgress.phase}</span>} />
                  <IntegrationAction label="Watchlist Sync" description="Plex Watchlist" result={plexWatchlistSyncResult ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items` : null} buttonLabel={plexWatchlistSyncing ? 'Syncing...' : plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'} buttonIcon={RefreshCw} onPress={handlePlexWatchlistSync} loading={plexWatchlistSyncing} muted />
                  <div className="flex items-center justify-between gap-4 px-5 py-3 border-t border-border/20">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Watch History Sync</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
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
                  {plexProgress && plexProgress.itemsTotal !== undefined && plexProgress.itemsTotal > 0 && (
                    <div className="px-5 py-3 space-y-1 border-t border-border/20">
                      <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>{plexProgress.itemsProcessed ?? 0} / {plexProgress.itemsTotal} items</span>
                        <span>{plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal ? `${Math.round((plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100)}%` : ''}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted/30">
                        <div className="h-full rounded-full bg-primary transition-all duration-300" style={{ width: `${plexProgress.itemsProcessed !== undefined && plexProgress.itemsTotal ? (plexProgress.itemsProcessed / plexProgress.itemsTotal) * 100 : 0}%` }} />
                      </div>
                    </div>
                  )}
                  {plexMessage && <p className="px-5 py-2 text-xs text-green-500">{plexMessage}</p>}
                  {plexError && <p className="px-5 py-2 text-xs text-destructive">{plexError}</p>}
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
                  {spotifyMessage && <p className="px-5 py-2 text-xs text-green-500">{spotifyMessage}</p>}
                  {spotifyError && <p className="px-5 py-2 text-xs text-destructive">{spotifyError}</p>}
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
                  {googleMessage && <p className="px-5 py-2 text-xs text-green-500">{googleMessage}</p>}
                  {googleError && <p className="px-5 py-2 text-xs text-destructive">{googleError}</p>}
                  {youtubeMessage && <p className="px-5 py-2 text-xs text-green-500">{youtubeMessage}</p>}
                  {youtubeError && <p className="px-5 py-2 text-xs text-destructive">{youtubeError}</p>}
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
                  {tmdbMessage && <p className="px-5 py-2 text-xs text-green-500">{tmdbMessage}</p>}
                  {tmdbError && <p className="px-5 py-2 text-xs text-destructive">{tmdbError}</p>}
                </>
              )}
            </IntegrationCard>
          ))}
        </div>
      )}

      {/* ── SABnzbd / NZBPlanet config cards — admin + experiment gated ── */}
      {showDownloads && (<>
      <div className="space-y-2 pt-2">
        {integrationDefs.filter(i => i.id === 'sabnzbd' || i.id === 'nzbplanet').map((i) => {
          const isSab = i.id === 'sabnzbd'
          return (
            <div key={i.id} className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(i.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(i.id); } }}
                className={cn(
                  'flex w-full items-center gap-4 px-5 py-4 text-left transition-colors cursor-pointer select-none',
                  'hover:bg-[var(--dk-surface-glass)] active:bg-[var(--dk-surface-glass)]',
                )}
                style={{ borderLeft: `3px solid ${i.brandColor}` }}
              >
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', i.brandBg)} style={{ color: i.brandColor }}>
                  <i.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{i.name}</p>
                    {i.isConnected && <span className="h-1.5 w-1.5 rounded-full bg-green-500 shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{i.description}</p>
                </div>
                <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', expandedId === i.id && 'rotate-180')} />
              </div>

              {expandedId === i.id && (
                <div className="border-t border-border/20">
                  {isSab ? (
                    <>
                      <div className="px-5 py-4 space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="col-span-2">
                            <label className="text-xs font-medium text-muted-foreground">Host</label>
                            <input type="text" value={sabnzbdForm.host}
                              onChange={e => setSabnzbdForm(p => ({ ...p, host: e.target.value }))}
                              placeholder="192.168.1.58"
                              className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                          </div>
                          <div>
                            <label className="text-xs font-medium text-muted-foreground">Port</label>
                            <input type="number" value={sabnzbdForm.port}
                              onChange={e => setSabnzbdForm(p => ({ ...p, port: parseInt(e.target.value) || 8080 }))}
                              className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">API Key</label>
                          <input type="password" value={sabnzbdForm.apiKey}
                            onChange={e => setSabnzbdForm(p => ({ ...p, apiKey: e.target.value }))}
                            placeholder="SABnzbd API key"
                            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                        </div>
                        <div className="flex items-center gap-2">
                          <DkSwitch checked={sabnzbdForm.useSsl} onCheckedChange={v => setSabnzbdForm(p => ({ ...p, useSsl: v }))} />
                          <span className="text-xs text-muted-foreground">Use SSL</span>
                        </div>
                      </div>
                      <div className="border-t border-border/20 px-5 py-3 space-y-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">Path Mapping</p>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">Completed Download Folder</label>
                          <input type="text" value={sabnzbdCompletePath}
                            onChange={e => setSabnzbdCompletePath(e.target.value)}
                            placeholder="e.g. /mnt/user/downloads/completed"
                            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                          <p className="text-xs text-muted-foreground mt-1">SABnzbd → Config → Folders → Completed Download Folder</p>
                        </div>
                        <div>
                          <label className="text-xs font-medium text-muted-foreground">ISO Library Path</label>
                          <input type="text" value={downloadPath}
                            onChange={e => setDownloadPath(e.target.value)}
                            placeholder="e.g. D:\\Games\\ISOs"
                            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                          <p className="text-xs text-muted-foreground mt-1">Where Otix moves completed ISO files.</p>
                        </div>
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium">Post-process after download</p>
                            <p className="text-xs text-muted-foreground">Automatically find and move ISOs to library</p>
                          </div>
                          <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="px-5 py-4 space-y-3">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">API Key</label>
                        <input type="password" value={nzbplanetForm.apiKey}
                          onChange={e => setNzbplanetForm(p => ({ ...p, apiKey: e.target.value }))}
                          placeholder="NZBPlanet API key"
                          className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Preferred Repackers</label>
                        <input type="text" value={preferredRepackers}
                          onChange={e => setPreferredRepackers(e.target.value)}
                          placeholder="e.g. ElAmigos, DODI, FitGirl"
                          className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
                        <p className="text-xs text-muted-foreground mt-1">Comma-separated repacker names. Results matching these are picked first.</p>
                      </div>
                    </div>
                  )}
                  <div className="border-t border-border/20 px-5 py-3 flex items-center gap-2">
                    {isSab ? (
                      <DkButton size="sm" variant="ghost"
                        onClick={async () => {
                          const ok = await testSabnzbd(sabnzbdForm.host, sabnzbdForm.port, sabnzbdForm.apiKey, sabnzbdForm.useSsl)
                          setSabnzbdStatus(ok ? 'ok' : 'fail')
                        }}
                        loading={testingSabnzbd}
                        className="shadow-none"
                      >
                        {sabnzbdStatus === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-400" /> :
                         sabnzbdStatus === 'fail' ? <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-400" /> :
                         null}
                        Test Connection
                      </DkButton>
                    ) : (
                      <DkButton size="sm" variant="ghost"
                        onClick={async () => {
                          console.log('[integrations] NZBPlanet Test API Key clicked, apiKey length:', nzbplanetForm.apiKey?.length ?? 0)
                          const ok = await testNzbplanet(nzbplanetForm.apiKey)
                          console.log('[integrations] testNzbplanet returned:', ok)
                          setNzbplanetStatus(ok ? 'ok' : 'fail')
                        }}
                        loading={testingNzbplanet}
                        className="shadow-none"
                      >
                        {nzbplanetStatus === 'ok' ? <CheckCircle2 className="h-3.5 w-3.5 mr-1.5 text-green-400" /> :
                         nzbplanetStatus === 'fail' ? <XCircle className="h-3.5 w-3.5 mr-1.5 text-red-400" /> :
                         null}
                        Test API Key
                      </DkButton>
                    )}
                    <div className="flex-1" />
                    <DkButton size="sm" variant="primary"
                      onClick={async () => {
                        if (!user) return
                        await saveConfig({
                          userId: user.id,
                          sabnzbdHost: sabnzbdForm.host || null,
                          sabnzbdPort: sabnzbdForm.port || null,
                          sabnzbdApiKey: sabnzbdForm.apiKey || null,
                          sabnzbdUseSsl: sabnzbdForm.useSsl,
                          nzbplanetApiKey: nzbplanetForm.apiKey || null,
                          sabnzbdCompletePath: sabnzbdCompletePath || null,
                          downloadPath: downloadPath || null,
                          postProcessEnabled,
                          autoSearchWishlist: autoSearch,
                          wishlistIntervalHours: intervalHours,
                          preferredRepackers: preferredRepackers || null,
                        })
                      }}
                      className="shadow-none"
                    >
                      Save
                    </DkButton>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Path mapping + auto-search ── */}
      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <h3 className="text-sm font-semibold">Path Mapping</h3>
        <p className="text-xs text-muted-foreground -mt-1">SABnzbd downloads to one folder. Otix moves completed ISOs to your game library.</p>
        <div>
          <label className="text-xs font-medium text-muted-foreground">SABnzbd Completed Folder</label>
          <input type="text" value={sabnzbdCompletePath}
            onChange={e => setSabnzbdCompletePath(e.target.value)}
            placeholder="e.g. /mnt/user/downloads/completed"
            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
          <p className="text-xs text-muted-foreground mt-1">SABnzbd → Config → Folders → Completed Download Folder</p>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">ISO Library Path</label>
          <input type="text" value={downloadPath}
            onChange={e => setDownloadPath(e.target.value)}
            placeholder="e.g. D:\\Games\\ISOs"
            className="mt-1 w-full h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
          <p className="text-xs text-muted-foreground mt-1">Where Otix moves ISO files after download completes.</p>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Post-process after download</p>
            <p className="text-xs text-muted-foreground">Automatically find and move ISOs to library</p>
          </div>
          <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
        </div>
      </div>

      <div className="rounded-2xl bg-[var(--dk-surface-base)] shadow-[var(--dk-shadow-md)] p-5 space-y-3">
        <h3 className="text-sm font-semibold">Auto-Search</h3>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-search wishlist</p>
            <p className="text-xs text-muted-foreground">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="text-xs font-medium text-muted-foreground">Interval (hours)</label>
            <input type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="mt-1 w-24 h-9 rounded-lg bg-[var(--dk-surface-raised)] px-3 text-sm outline-none ring-1 ring-border/30 focus:ring-primary/40" />
          </div>
        )}
      </div>
      </>)}
    </div>
  )
}
