// TODO: Review this file
import './integrations.scss'
import { useState, useRef, useEffect } from 'react'
import { Link, useLocation, useNavigate } from '@tanstack/react-router'
import { useAuth } from '@/features/auth/auth-provider'
import { apiClient } from '@/lib/api-client'
import { connectTaskSseStream, type SseEvent } from '@/lib/sse-client'
import { DkButton } from '@/features/dk-ui/atoms/button'
import { DkDropdown } from '@/features/dk-ui/atoms/dropdown'
import { DkSwitch } from '@/features/dk-ui/atoms/switch'
import { SteamIcon } from '@/features/dk-ui/atoms/steam-icon'
import { PlexIcon } from '@/features/dk-ui/atoms/plex-icon'
import { SpotifyIcon } from '@/features/dk-ui/atoms/spotify-icon'
import { GoogleIcon } from '@/features/dk-ui/atoms/google-icon'
import { TmdbIcon } from '@/features/dk-ui/atoms/tmdb-icon'
import { cn } from '@/lib/utils'
import { isDesktop } from '@/lib/desktop-api'
import { openExternal } from '@/lib/open-external'
import { useDownloadConfig, useConnectionTest } from '@/features/downloads/use-downloads'
import { useExperiment } from '@/features/experiments/experiments-provider'
import { Loader2, Plus, Unlink, RefreshCw, Download, ChevronDown, Link2, Server, Search, CheckCircle2, XCircle, ListMusic } from 'lucide-react'

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
    <div className="dk-settings-integrations__card">
      {/* Header */}
      <button
        type="button"
        onClick={isConnected ? onToggle : undefined}
        className={cn(
          'dk-settings-integrations__card-header',
          isConnected && 'dk-settings-integrations__card-header--connected',
        )}
        style={{ borderLeft: `3px solid ${brandColor}` }}
      >
        <div className={cn('dk-settings-integrations__card-icon', brandBg)} style={{ color: brandColor }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="dk-settings-integrations__card-info">
          <div className="dk-settings-integrations__card-name-row">
            <p className="dk-settings-integrations__card-name">{name}</p>
            {isConnected && <span className="dk-settings-integrations__card-dot" />}
          </div>
          <p className="dk-settings-integrations__card-desc">{description}</p>
        </div>
        {isConnected ? (
          <ChevronDown className={cn('dk-settings-integrations__card-chevron', expanded && 'dk-settings-integrations__card-chevron--rotated')} />
        ) : (
          <DkButton size="sm" variant="primary" onClick={onConnect} loading={connecting} className="shrink-0 shadow-none">
            <Plus className="h-3.5 w-3.5 mr-1.5" />
            Connect
          </DkButton>
        )}
      </button>

      {/* Expanded content */}
      {isConnected && expanded && (
        <div className="dk-settings-integrations__card-body">
          {children}
          {onDisconnect && (
            <div className="dk-settings-integrations__card-disconnect">
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
    <div className="dk-settings-integrations__profile">
      {avatarUrl ? (
        <img src={avatarUrl} alt={avatarAlt} className="dk-settings-integrations__profile-avatar" />
      ) : (
        <div className={cn('dk-settings-integrations__profile-icon', brandBg || 'dk-settings-integrations__profile-icon--fallback')} style={brandColor ? { color: brandColor } : undefined}>
          {Icon && <Icon className="h-5 w-5" />}
        </div>
      )}
      <div className="dk-settings-integrations__profile-info">
        <p className="dk-settings-integrations__profile-name">{name}</p>
        <p className="dk-settings-integrations__profile-detail">{detail}</p>
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
    <div className={cn('dk-settings-integrations__action', muted && 'dk-settings-integrations__action--muted')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="dk-settings-integrations__action-label">{label}</p>
          {progress}
        </div>
        <p className="dk-settings-integrations__action-desc">{description}</p>
        {result && <p className="dk-settings-integrations__action-result">{result}</p>}
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
    <div className="dk-settings-integrations__stats">
      {items.map((item) => (
        <span key={item.label}>
          <strong className="dk-settings-integrations__stats-value">{item.value}</strong> {item.label}
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
  const [plexLibraryProgress, setPlexLibraryProgress] = useState<Record<string, PlexLibraryProgress>>({})
  const abortRef = useRef<AbortController | null>(null)
  // Smooth progress animation — drives displayed count toward real server count at observed rate
  const animStateRef = useRef<Record<string, {
    displayed: number
    real: number
    rate: number
    lastItems: number
    lastTime: number
  }>>({})
  const [animTick, setAnimTick] = useState(0)

  // Smooth progress animation loop — moves displayed toward real at observed rate
  useEffect(() => {
    let rafId: number
    function tick() {
      const anim = animStateRef.current
      let anyChanged = false
      for (const key of Object.keys(anim)) {
        const s = anim[key]
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

  // Re-fetch integrations when the window regains focus — this catches
  // the case where an OAuth flow completed in the system browser and the
  // user has returned to the Electron app.
  useEffect(() => {
    if (!isAuthenticated) return
    const onFocus = () => fetchIntegrations()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
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
      const token = localStorage.getItem('otix-access-token') ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: '/integrations/youtube/sync',
          streamEndpoint: (taskId: string) => `/integrations/youtube/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event) => {
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

      // Stream ended without a terminal event — nothing to do
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
      const token = localStorage.getItem('otix-access-token') ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: '/integrations/spotify/sync',
          streamEndpoint: (taskId: string) => `/integrations/spotify/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event) => {
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
      const token = localStorage.getItem('otix-access-token') ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: '/integrations/spotify/recently-played/sync',
          streamEndpoint: (taskId: string) => `/integrations/spotify/recently-played/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event) => {
          // Progress events — not displayed inline for this sync
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
    { value: 'import', label: 'TMDb → Otix' },
    { value: 'export', label: 'Otix → TMDb' },
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
      const token = localStorage.getItem('otix-access-token') ?? ''
      const terminal = await connectTaskSseStream(
        {
          createEndpoint: '/integrations/plex/sync',
          streamEndpoint: (taskId: string) => `/integrations/plex/sync/${taskId}/stream`,
          terminalEvents: ['sync_complete', 'error'],
          token,
          signal: abortController.signal,
        },
        (event) => {
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
              setPlexSyncResult(event)
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
      <div className="dk-settings-integrations__signin-required">
        <Link2 className="h-8 w-8 mx-auto text-muted-foreground/40" />
        <div>
          <p className="dk-settings-integrations__signin-title">Sign in required</p>
          <p className="dk-settings-integrations__signin-desc">Sign in to manage integrations.</p>
        </div>
        <Link
          to="/auth/login"
          search={{ redirect: location.href }}
          className="dk-settings-integrations__signin-btn"
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
    <div className="dk-settings-integrations">
      <div>
        <h2 className="dk-settings-integrations__title">Integrations</h2>
        <p className="dk-settings-integrations__subtitle">Connect your Otix account to other platforms.</p>
      </div>
      <div className="relative">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search integrations..."
          className="dk-settings-integrations__search"
        />
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
      </div>

      {loading ? (
        <div className="dk-settings-integrations__loading">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading integrations...
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="dk-settings-integrations__empty">
          <p className="dk-settings-integrations__empty-text">No integrations match "{searchQuery}"</p>
        </div>
      ) : (
        <div className="dk-settings-integrations__list">
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
                      <a href={steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="dk-settings-integrations__profile-link">
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
                  {steamMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{steamMessage}</p>}
                  {steamError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{steamError}</p>}
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
                  <IntegrationAction label="Library Sync" description="Plex Library" result={plexSyncResult ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded` : null} buttonLabel={plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync' : 'Sync Now'} buttonIcon={RefreshCw} onPress={handlePlexSync} loading={plexSyncing} progress={Object.keys(plexLibraryProgress).length > 0 && <span className="text-xs text-primary">{Object.values(plexLibraryProgress).filter(l => l.phase === 'syncing').length} libraries syncing</span>} />
                  <IntegrationAction label="Watchlist Sync" description="Plex Watchlist" result={plexWatchlistSyncResult ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items` : null} buttonLabel={plexWatchlistSyncing ? 'Syncing...' : plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'} buttonIcon={RefreshCw} onPress={handlePlexWatchlistSync} loading={plexWatchlistSyncing} muted />
                  <div className="dk-settings-integrations__switch-row">
                    <div className="dk-settings-integrations__switch-info">
                      <p className="dk-settings-integrations__switch-title">Watch History Sync</p>
                      <p className="dk-settings-integrations__switch-desc">
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
                  {Object.keys(plexLibraryProgress).length > 0 && (
                    <div className="dk-settings-integrations__progress-section">
                      <p className="dk-settings-integrations__progress-section-label">
                        Library Sync Progress
                      </p>
                      {Object.entries(plexLibraryProgress).map(([key, lib]) => {
                        const anim = animStateRef.current[key]
                        const displayedCount = anim ? Math.round(anim.displayed) : lib.itemsProcessed
                        const barPercent = lib.itemsTotal > 0 ? (displayedCount / lib.itemsTotal) * 100 : 0
                        const showBar = (lib.phase === 'syncing' || displayedCount < lib.itemsTotal) && lib.itemsTotal > 0
                        return (
                          <div key={key} className="dk-settings-integrations__progress-item">
                            <div className="dk-settings-integrations__progress-row">
                              <span className="font-medium truncate flex-1">
                                {lib.phase === 'pending' && '(pending) '}
                                {lib.phase === 'syncing' && '> '}
                                {lib.phase === 'complete' && '> '}
                                {lib.phase === 'failed' && '(failed) '}
                                {' '}{lib.libraryName}
                                <span className="text-muted-foreground/60 ml-1.5">({lib.serverName})</span>
                              </span>
                              {lib.phase === 'syncing' && lib.itemsTotal > 0 && (
                                <span className="text-muted-foreground shrink-0 ml-2">
                                  {displayedCount}/{lib.itemsTotal}
                                  {' '}
                                  ({Math.round(barPercent)}%)
                                </span>
                              )}
                            </div>
                            {showBar && (
                              <div className="dk-settings-integrations__progress-bar">
                                <div
                                  className="dk-settings-integrations__progress-bar-fill"
                                  style={{ width: `${barPercent}%` }}
                                />
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                  {plexMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{plexMessage}</p>}
                  {plexError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{plexError}</p>}
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
                  {spotifyMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{spotifyMessage}</p>}
                  {spotifyRecentlyPlayedMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{spotifyRecentlyPlayedMessage}</p>}
                  {spotifyError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{spotifyError}</p>}
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
                  {googleMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{googleMessage}</p>}
                  {googleError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{googleError}</p>}
                  {youtubeMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{youtubeMessage}</p>}
                  {youtubeError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{youtubeError}</p>}
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
                  {tmdbMessage && <p className="dk-settings-integrations__message dk-settings-integrations__message--success">{tmdbMessage}</p>}
                  {tmdbError && <p className="dk-settings-integrations__message dk-settings-integrations__message--error">{tmdbError}</p>}
                </>
              )}
            </IntegrationCard>
          ))}
        </div>
      )}

      {/* ── SABnzbd / NZBPlanet config cards — admin + experiment gated ── */}
      {showDownloads && (<>
      <div className="dk-settings-integrations__downloads">
        {integrationDefs.filter(i => i.id === 'sabnzbd' || i.id === 'nzbplanet').map((i) => {
          const isSab = i.id === 'sabnzbd'
          return (
            <div key={i.id} className="dk-settings-integrations__download-card">
              <div
                role="button"
                tabIndex={0}
                onClick={() => toggleExpand(i.id)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleExpand(i.id); } }}
                className="dk-settings-integrations__download-card-header"
                style={{ borderLeft: `3px solid ${i.brandColor}` }}
              >
                <div className={cn('dk-settings-integrations__card-icon', i.brandBg)} style={{ color: i.brandColor }}>
                  <i.icon className="h-5 w-5" />
                </div>
                <div className="dk-settings-integrations__card-info">
                  <div className="dk-settings-integrations__card-name-row">
                    <p className="dk-settings-integrations__card-name">{i.name}</p>
                    {i.isConnected && <span className="dk-settings-integrations__card-dot" />}
                  </div>
                  <p className="dk-settings-integrations__card-desc">{i.description}</p>
                </div>
                <ChevronDown className={cn('dk-settings-integrations__card-chevron', expandedId === i.id && 'dk-settings-integrations__card-chevron--rotated')} />
              </div>

              {expandedId === i.id && (
                <div className="dk-settings-integrations__card-body">
                  {isSab ? (
                    <>
                      <div className="dk-settings-integrations__form-section">
                        <div className="dk-settings-integrations__form-grid">
                          <div className="dk-settings-integrations__form-grid-span2">
                            <label className="dk-settings-integrations__label">Host</label>
                            <input type="text" value={sabnzbdForm.host}
                              onChange={e => setSabnzbdForm(p => ({ ...p, host: e.target.value }))}
                              placeholder="192.168.1.58"
                              className="dk-settings-integrations__input" />
                          </div>
                          <div>
                            <label className="dk-settings-integrations__label">Port</label>
                            <input type="number" value={sabnzbdForm.port}
                              onChange={e => setSabnzbdForm(p => ({ ...p, port: parseInt(e.target.value) || 8080 }))}
                              className="dk-settings-integrations__input" />
                          </div>
                        </div>
                        <div>
                          <label className="dk-settings-integrations__label">API Key</label>
                          <input type="password" value={sabnzbdForm.apiKey}
                            onChange={e => setSabnzbdForm(p => ({ ...p, apiKey: e.target.value }))}
                            placeholder="SABnzbd API key"
                            className="dk-settings-integrations__input" />
                        </div>
                        <div className="dk-settings-integrations__switch-inline">
                          <DkSwitch checked={sabnzbdForm.useSsl} onCheckedChange={v => setSabnzbdForm(p => ({ ...p, useSsl: v }))} />
                          <span className="text-xs text-muted-foreground">Use SSL</span>
                        </div>
                      </div>
                      <div className="dk-settings-integrations__form-subsection">
                        <p className="dk-settings-integrations__form-subsection-label">Path Mapping</p>
                        <div>
                          <label className="dk-settings-integrations__label">Completed Download Folder</label>
                          <input type="text" value={sabnzbdCompletePath}
                            onChange={e => setSabnzbdCompletePath(e.target.value)}
                            placeholder="e.g. /mnt/user/downloads/completed"
                            className="dk-settings-integrations__input" />
                          <p className="dk-settings-integrations__input-hint">SABnzbd → Config → Folders → Completed Download Folder</p>
                        </div>
                        <div>
                          <label className="dk-settings-integrations__label">ISO Library Path</label>
                          <input type="text" value={downloadPath}
                            onChange={e => setDownloadPath(e.target.value)}
                            placeholder="e.g. D:\\Games\\ISOs"
                            className="dk-settings-integrations__input" />
                          <p className="dk-settings-integrations__input-hint">Where Otix moves completed ISO files.</p>
                        </div>
                        <div className="dk-settings-integrations__config-switch">
                          <div>
                            <p className="dk-settings-integrations__switch-title">Post-process after download</p>
                            <p className="dk-settings-integrations__switch-desc">Automatically find and move ISOs to library</p>
                          </div>
                          <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="dk-settings-integrations__form-section">
                      <div>
                        <label className="dk-settings-integrations__label">API Key</label>
                        <input type="password" value={nzbplanetForm.apiKey}
                          onChange={e => setNzbplanetForm(p => ({ ...p, apiKey: e.target.value }))}
                          placeholder="NZBPlanet API key"
                          className="dk-settings-integrations__input" />
                      </div>
                      <div>
                        <label className="dk-settings-integrations__label">Preferred Repackers</label>
                        <input type="text" value={preferredRepackers}
                          onChange={e => setPreferredRepackers(e.target.value)}
                          placeholder="e.g. ElAmigos, DODI, FitGirl"
                          className="dk-settings-integrations__input" />
                        <p className="dk-settings-integrations__input-hint">Comma-separated repacker names. Results matching these are picked first.</p>
                      </div>
                    </div>
                  )}
                  <div className="dk-settings-integrations__form-footer">
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
                    <div className="dk-settings-integrations__form-spacer" />
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
      <div className="dk-settings-integrations__section">
        <h3 className="dk-settings-integrations__section-title">Path Mapping</h3>
        <p className="dk-settings-integrations__section-desc -mt-1">SABnzbd downloads to one folder. Otix moves completed ISOs to your game library.</p>
        <div>
          <label className="dk-settings-integrations__label">SABnzbd Completed Folder</label>
          <input type="text" value={sabnzbdCompletePath}
            onChange={e => setSabnzbdCompletePath(e.target.value)}
            placeholder="e.g. /mnt/user/downloads/completed"
            className="dk-settings-integrations__input" />
          <p className="dk-settings-integrations__input-hint">SABnzbd → Config → Folders → Completed Download Folder</p>
        </div>
        <div>
          <label className="dk-settings-integrations__label">ISO Library Path</label>
          <input type="text" value={downloadPath}
            onChange={e => setDownloadPath(e.target.value)}
            placeholder="e.g. D:\\Games\\ISOs"
            className="dk-settings-integrations__input" />
          <p className="dk-settings-integrations__input-hint">Where Otix moves ISO files after download completes.</p>
        </div>
        <div className="dk-settings-integrations__config-switch">
          <div>
            <p className="dk-settings-integrations__switch-title">Post-process after download</p>
            <p className="dk-settings-integrations__switch-desc">Automatically find and move ISOs to library</p>
          </div>
          <DkSwitch checked={postProcessEnabled} onCheckedChange={setPostProcessEnabled} />
        </div>
      </div>

      <div className="dk-settings-integrations__section">
        <h3 className="dk-settings-integrations__section-title">Auto-Search</h3>
        <div className="dk-settings-integrations__config-switch">
          <div>
            <p className="dk-settings-integrations__switch-title">Auto-search wishlist</p>
            <p className="dk-settings-integrations__switch-desc">Scan wishlist every {intervalHours}h for new downloads</p>
          </div>
          <DkSwitch checked={autoSearch} onCheckedChange={setAutoSearch} />
        </div>
        {autoSearch && (
          <div>
            <label className="dk-settings-integrations__label">Interval (hours)</label>
            <input type="number" value={intervalHours}
              onChange={e => setIntervalHours(parseInt(e.target.value) || 12)}
              min={1} max={168}
              className="dk-settings-integrations__input w-24" />
          </div>
        )}
      </div>
      </>)}
    </div>
  )
}
