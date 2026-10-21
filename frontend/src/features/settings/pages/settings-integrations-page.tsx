import { useState, useEffect } from 'react'
import { Link } from '@tanstack/react-router'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { connectTaskSseStream, type SseEvent } from '@/lib/api/sse-client'
import { libraryKeys } from '@library/library-keys'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import GOGIcon from '@/assets/provider-logos/gog.svg?react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import { isDesktop } from '@/lib/desktop/api'
import { openExternal } from '@/lib/utils/open-external'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import {
  Loader2,
  RefreshCw,
  Download,
  Link2,
  Film,
  Tv,
  Music,
  FolderOpen,
  Search,
  Check,
  HardDrive,
  Sparkles,
  ShieldCheck,
} from 'lucide-react'
import { EpicCodeModal } from '../components/organisms/epic-code-modal'
import { GOGCodeModal } from '../components/organisms/gog-code-modal'
import { PlexStorageOptimizerModal } from '@/features/integrations/plex-storage'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  IntegrationAction,
  IntegrationCard,
  IntegrationProfile,
  IntegrationStats,
} from '../components/organisms/settings-integration-card'
import { usePlexLibraries, streamPlexLibrarySync } from '@library/library-queries'
import type { PlexLibraryInfo } from '@library/library-queries'
import { useModal } from '@/lib/modals'

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

import {
  type YouTubeProgressState,
  formatAccountAge,
  personaStateLabel,
  extractIntegrationMessage,
  openBoundModal,
  formatDaysAgo,
} from '../utils/integrations'

const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  epic: '#ffffff',
  gog: '#a855f7',
  plex: '#e5a00d',
  tmdb: '#01b4e4',
  google: '#4285F4',
  youtube: '#FF0000',
}

const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  epic: 'bg-foreground/10',
  gog: 'bg-[#a855f7]/10',
  plex: 'bg-[#e5a00d]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
  youtube: 'bg-[#FF0000]/10',
}

let activeIntegrationAbortController: AbortController | null = null

export const SettingsIntegrationsPage = () => {
  const { openModal } = useModal()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  useSettingsHashScroll()
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [plexConnecting, setPlexConnecting] = useState(false)
  const [plexDisconnecting, setPlexDisconnecting] = useState(false)
  const [plexSyncing, setPlexSyncing] = useState(false)
  const [plexSyncResult, setPlexSyncResult] = useState<PlexSyncResult | null>(null)
  const [discoveringPlex, setDiscoveringPlex] = useState(false)
  const [plexLibraryProgress, setPlexLibraryProgress] = useState<Record<string, PlexLibraryProgress>>({})
  const [plexLibraryErrors, setPlexLibraryErrors] = useState<Record<string, string>>({})
  const [syncingLibraryIds, setSyncingLibraryIds] = useState<Set<string>>(new Set())
  // Sync user state once auth profile hydrates
  useEffect(() => {
    if (user?.plexId !== undefined) {
      setPlexConnected(Boolean(user.plexId))
    }
    if (user?.plexWatchHistoryEnabled !== undefined) {
      setPlexWatchHistoryEnabled(Boolean(user.plexWatchHistoryEnabled))
    }
  }, [user?.plexId, user?.plexWatchHistoryEnabled])

  useEffect(() => {
    if (user?.epicAccountId !== undefined) {
      setEpicConnected(Boolean(user.epicAccountId))
      setEpicAccountId(user.epicAccountId ?? null)
    }
    if (user?.epicDisplayName !== undefined) {
      setEpicDisplayName(user.epicDisplayName ?? null)
    }
  }, [user?.epicAccountId, user?.epicDisplayName])

  useEffect(() => {
    if (user?.gogAccountId !== undefined) {
      setGOGConnected(Boolean(user.gogAccountId))
      setGOGAccountId(user.gogAccountId ?? null)
    }
    if (user?.gogDisplayName !== undefined) {
      setGOGDisplayName(user.gogDisplayName ?? null)
    }
  }, [user?.gogAccountId, user?.gogDisplayName])

  const [epicConnected, setEpicConnected] = useState(Boolean(user?.epicAccountId))
  const [epicDisplayName, setEpicDisplayName] = useState<string | null>(user?.epicDisplayName ?? null)
  const [epicAccountId, setEpicAccountId] = useState<string | null>(user?.epicAccountId ?? null)
  const [epicConnecting, setEpicConnecting] = useState(false)
  const [epicDisconnecting, setEpicDisconnecting] = useState(false)
  const [epicScanning, setEpicScanning] = useState(false)
  const [epicScanResult, setEpicScanResult] = useState<{
    totalInEpic: number
    matchedInOtix: number
    failed: number
    source?: string
  } | null>(null)
  const [epicResolvingSteamGrid, setEpicResolvingSteamGrid] = useState(false)
  const [epicSteamGridResult, setEpicSteamGridResult] = useState<{
    total: number
    matched: number
    failed: number
  } | null>(null)
  const [epicMessage, setEpicMessage] = useState('')
  const [epicError, setEpicError] = useState('')
  const isEpicConnected = epicConnected

  const [gogConnected, setGOGConnected] = useState(Boolean(user?.gogAccountId))
  const [gogDisplayName, setGOGDisplayName] = useState<string | null>(user?.gogDisplayName ?? null)
  const [gogAccountId, setGOGAccountId] = useState<string | null>(user?.gogAccountId ?? null)
  const [gogConnecting, setGOGConnecting] = useState(false)
  const [gogDisconnecting, setGOGDisconnecting] = useState(false)
  const [gogScanning, setGOGScanning] = useState(false)
  const [gogScanResult, setGOGScanResult] = useState<{
    totalInGOG: number
    matchedInOtix: number
    failed: number
    source?: string
  } | null>(null)
  const [gogResolvingSteamGrid, setGOGResolvingSteamGrid] = useState(false)
  const [gogSteamGridResult, setGOGSteamGridResult] = useState<{
    total: number
    matched: number
    failed: number
  } | null>(null)
  const [gogMessage, setGOGMessage] = useState('')
  const [gogError, setGOGError] = useState('')
  const isGOGConnected = gogConnected

  const [steamMessage, setSteamMessage] = useState('')
  const [steamError, setSteamError] = useState('')
  const [plexMessage, setPlexMessage] = useState('')
  const [plexError, setPlexError] = useState('')
  const [plexWatchlistSyncing, setPlexWatchlistSyncing] = useState(false)
  const [plexWatchlistSyncResult, setPlexWatchlistSyncResult] = useState<{
    total: number
    matched: number
    seeded: number
  } | null>(null)
  const [steamConnected, setSteamConnected] = useState(Boolean(user?.steamId))
  const [steamId, setSteamId] = useState<string | null>(user?.steamId ?? null)
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null)
  const [plexConnected, setPlexConnected] = useState(Boolean(user?.plexId))
  const [plex, setPlex] = useState<PlexIntegration | null>(null)
  const [plexWatchHistoryEnabled, setPlexWatchHistoryEnabled] = useState(user?.plexWatchHistoryEnabled ?? false)
  const [plexStorageModalOpen, setPlexStorageModalOpen] = useState(false)

  const [tmdbConnected, setTmdbConnected] = useState(Boolean(user?.tmdbUsername))
  const [tmdbUsername, setTmdbUsername] = useState<string | null>(user?.tmdbUsername ?? null)
  const [tmdbAvatarUrl, setTmdbAvatarUrl] = useState<string | null>(user?.tmdbAvatarUrl ?? null)
  const [tmdbStats, setTmdbStats] = useState<Record<string, number> | null>(null)
  const [tmdbSyncDirection, setTmdbSyncDirection] = useState(user?.tmdbRatingSyncDirection ?? 'disabled')
  const [tmdbSyncing, setTmdbSyncing] = useState(false)
  const [tmdbWatchlistImporting, setTmdbWatchlistImporting] = useState(false)
  const [tmdbSyncResult, setTmdbSyncResult] = useState<{
    imported: number
    exported: number
    skipped: number
  } | null>(null)
  const [tmdbWatchlistResult, setTmdbWatchlistResult] = useState<{ imported: number; skipped: number } | null>(null)
  const [tmdbConnecting, setTmdbConnecting] = useState(false)
  const [tmdbDisconnecting, setTmdbDisconnecting] = useState(false)
  const [tmdbMessage, setTmdbMessage] = useState('')
  const [tmdbError, setTmdbError] = useState('')
  const [googleConnected, setGoogleConnected] = useState(Boolean(user?.googleId))
  const [googleName, setGoogleName] = useState<string | null>(user?.googleName ?? null)
  const [googleEmail, setGoogleEmail] = useState<string | null>(user?.googleEmail ?? null)
  const [googleAvatarUrl, setGoogleAvatarUrl] = useState<string | null>(user?.googleAvatarUrl ?? null)
  const [googleConnecting, setGoogleConnecting] = useState(false)
  const [googleDisconnecting, setGoogleDisconnecting] = useState(false)
  const [googleMessage, setGoogleMessage] = useState('')
  const [googleError, setGoogleError] = useState('')
  const [driveConnected, setDriveConnected] = useState(Boolean(user?.driveConnected))
  const [driveConnecting, setDriveConnecting] = useState(false)
  const [driveDisconnecting, setDriveDisconnecting] = useState(false)
  const [driveMessage, setDriveMessage] = useState('')
  const [driveError, setDriveError] = useState('')
  const [youtubeSyncing, setYoutubeSyncing] = useState(false)
  const [youtubeSyncResult, setYoutubeSyncResult] = useState<{
    total: number
    musicVideos: number
    matched: number
    channelLinks: number
  } | null>(null)
  const [youtubeProgress, setYoutubeProgress] = useState<YouTubeProgressState | null>(null)
  const [youtubeError, setYoutubeError] = useState('')
  const [youtubeMessage, setYoutubeMessage] = useState('')
  const isGoogleConnected = googleConnected
  const isSteamConnected = steamConnected
  const displayedSteamId = steamId ?? user?.steamId ?? null
  const isPlexConnected = plexConnected
  const isTmdbConnected = tmdbConnected
  const { data: plexLibraries, isLoading: plexLibrariesLoading, refetch: refetchLibraries } =
    usePlexLibraries({ enabled: isPlexConnected })



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
      } else {
        setPlexConnected(false)
        setPlex(null)
      }
      setPlexConnecting(false)
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
      const googleDriveProvider = (data.providers as Array<{
        name: string
        connected: boolean
      }>).find((p) => p.name === 'google_drive')
      if (googleDriveProvider) {
        setDriveConnected(googleDriveProvider.connected)
      }
      const epicProvider = (data.providers as Array<{
        name: string
        connected: boolean
        epicAccountId?: string | null
        epicDisplayName?: string | null
      }>).find((p) => p.name === 'epic')
      if (epicProvider) {
        setEpicConnected(epicProvider.connected)
        setEpicAccountId(epicProvider.epicAccountId ?? null)
        setEpicDisplayName(epicProvider.epicDisplayName ?? null)
      } else {
        await fetchEpicStatus()
      }
      const gogProvider = (data.providers as Array<{
        name: string
        connected: boolean
        gogAccountId?: string | null
        gogDisplayName?: string | null
      }>).find((p) => p.name === 'gog')
      if (gogProvider) {
        setGOGConnected(gogProvider.connected)
        setGOGAccountId(gogProvider.gogAccountId ?? null)
        setGOGDisplayName(gogProvider.gogDisplayName ?? null)
      } else {
        await fetchGOGStatus()
      }
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setLoading(false)
    }
  }

  const fetchEpicStatus = async () => {
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string | null
        accountId?: string | null
      }>('/integrations/epic/status')
      setEpicConnected(Boolean(data.connected))
      setEpicDisplayName(data.displayName ?? null)
      setEpicAccountId(data.accountId ?? null)
    } catch {
      setEpicConnected(false)
    }
  }

  const fetchGOGStatus = async () => {
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string | null
        accountId?: string | null
      }>('/integrations/gog/status')
      setGOGConnected(Boolean(data.connected))
      setGOGDisplayName(data.displayName ?? null)
      setGOGAccountId(data.accountId ?? null)
    } catch {
      setGOGConnected(false)
    }
  }

  useEffect(() => {
    if (authLoading) return
    queueMicrotask(() => {
      if (isAuthenticated) {
        fetchIntegrations()
      }
      else setLoading(false)
    })
    // fetchIntegrations is stable enough for mount + auth changes
     
  }, [isAuthenticated, authLoading])

  // Re-fetch integrations when the window regains visibility — this catches
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
    const onRefresh = () => {
      fetchIntegrations()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('otix:integrations:refresh', onRefresh)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('otix:integrations:refresh', onRefresh)
    }
     
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

  const handleEpicConnect = async () => {
    setEpicConnecting(true)
    setEpicError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/epic')
      const authUrl = data.authUrl || data.auth_url
      const state = data.state
      const openOAuthWindow = window.desktopAPI?.plugin?.openOAuthWindow
      if (isDesktop() && openOAuthWindow) {
        const win = await openOAuthWindow(authUrl, 'id/api/redirect') as {
          success?: boolean
          code?: string
          error?: string
        }
        if (!win?.success || !win.code) {
          setEpicError((win?.error as string | undefined) || 'Login cancelled')
          return
        }
        await apiClient.post('/auth/oauth/epic/callback', { code: win.code, state })
        await fetchEpicStatus()
        return
      }
      openBoundModal(openModal, (onClose) => (
        <EpicCodeModal
          authUrl={authUrl}
          state={state}
          onClose={onClose}
          onLinked={() => { void fetchEpicStatus() }}
        />
      ))
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicConnecting(false)
    }
  }

  const handleEpicDisconnect = async () => {
    setEpicDisconnecting(true)
    setEpicError('')
    setEpicMessage('')
    try {
      await apiClient.delete('/auth/oauth/epic/disconnect')
      setEpicConnected(false)
      setEpicDisplayName(null)
      setEpicAccountId(null)
      setEpicMessage('Epic Games account unlinked.')
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicDisconnecting(false)
    }
  }

  const handleEpicScan = async () => {
    setEpicScanning(true)
    setEpicError('')
    setEpicScanResult(null)
    try {
      const { data } = await apiClient.post<{
        totalInEpic: number
        matchedInOtix: number
        failed: number
        source?: string
      }>('/integrations/epic/scan')
      setEpicScanResult(data)
      let msg = `Found ${data.matchedInOtix} matches out of ${data.totalInEpic} Epic games.`
      if (data.source) {
        msg += data.source === 'node' ? ' (via node scan)' : ' (via web scan)'
      }
      if (data.failed > 0) msg += ` ${data.failed} could not be matched.`
      setEpicMessage(msg)
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicScanning(false)
    }
  }

  const handleEpicResolveSteamGrid = async () => {
    setEpicResolvingSteamGrid(true)
    setEpicError('')
    try {
      const { data } = await apiClient.post<{
        total: number
        matched: number
        failed: number
      }>('/integrations/epic/resolve-steamgrid')
      setEpicSteamGridResult(data)
      let msg = `Matched ${data.matched} out of ${data.total} Epic games with SteamGridDB.`
      if (data.failed > 0) msg += ` ${data.failed} could not be matched.`
      setEpicMessage(msg)
    } catch (err) {
      setEpicError(extractIntegrationMessage(err))
    } finally {
      setEpicResolvingSteamGrid(false)
    }
  }

  const handleGOGConnect = async () => {
    setGOGConnecting(true)
    setGOGError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/gog')
      const authUrl = data.authUrl || data.auth_url
      const state = data.state
      const openOAuthWindow = window.desktopAPI?.plugin?.openOAuthWindow
      if (isDesktop() && openOAuthWindow) {
        const win = await openOAuthWindow(authUrl, 'on_login_success') as {
          success?: boolean
          code?: string
          error?: string
        }
        if (!win?.success || !win.code) {
          setGOGError((win?.error as string | undefined) || 'Login cancelled')
          return
        }
        await apiClient.post('/auth/oauth/gog/callback', { code: win.code, state })
        await fetchGOGStatus()
        return
      }
      openBoundModal(openModal, (onClose) => (
        <GOGCodeModal
          authUrl={authUrl}
          state={state}
          onClose={onClose}
          onLinked={() => { void fetchGOGStatus() }}
        />
      ))
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGConnecting(false)
    }
  }

  const handleGOGDisconnect = async () => {
    setGOGDisconnecting(true)
    setGOGError('')
    setGOGMessage('')
    try {
      await apiClient.delete('/auth/oauth/gog/disconnect')
      setGOGConnected(false)
      setGOGDisplayName(null)
      setGOGAccountId(null)
      setGOGMessage('GOG account unlinked.')
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGDisconnecting(false)
    }
  }

  const handleGOGScan = async () => {
    setGOGScanning(true)
    setGOGError('')
    setGOGScanResult(null)
    try {
      const { data } = await apiClient.post<{
        totalInGOG?: number
        total_in_gog?: number
        matchedInOtix?: number
        matched_in_otix?: number
        failed?: number
        source?: string
      }>('/integrations/gog/scan')
      const rawData = data as Record<string, any>
      const total =
        rawData.totalInGog ??
        rawData.totalInGOG ??
        rawData.total_in_gog ??
        0
      const matched =
        rawData.matchedInOtix ??
        rawData.matched_in_otix ??
        0
      const failed = rawData.failed ?? 0
      setGOGScanResult({
        totalInGOG: total,
        matchedInOtix: matched,
        failed,
        source: rawData.source,
      })
      let msg = `Found ${matched} matches out of ${total} GOG games.`
      if (data.source) {
        msg += data.source === 'node' ? ' (via node scan)' : ' (via web scan)'
      }
      if (failed > 0) {
        msg += ` Resolving ${failed} unmatched games with SteamGridDB...`
        setGOGMessage(msg)
        await handleGOGResolveSteamGrid()
      } else {
        setGOGMessage(msg)
      }
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGScanning(false)
    }
  }

  const handleGOGResolveSteamGrid = async () => {
    setGOGResolvingSteamGrid(true)
    setGOGError('')
    try {
      const { data } = await apiClient.post<{
        total: number
        matched: number
        failed: number
      }>('/integrations/gog/resolve-steamgrid')
      setGOGSteamGridResult(data)
      let msg = `Matched ${data.matched} out of ${data.total} GOG games with SteamGridDB.`
      if (data.failed > 0) msg += ` ${data.failed} could not be matched.`
      setGOGMessage(msg)
    } catch (err) {
      setGOGError(extractIntegrationMessage(err))
    } finally {
      setGOGResolvingSteamGrid(false)
    }
  }

  const handlePlexConnect = async () => {
    if (plexConnecting) return
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/plex', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl || data.auth_url)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setPlexConnecting(false)
    }
  }

  const handlePlexDisconnect = async () => {
    if (plexDisconnecting) return
    activeIntegrationAbortController?.abort()
    setPlexDisconnecting(true)
    setPlexError('')
    setPlexMessage('')
    try {
      await apiClient.delete('/auth/oauth/plex/disconnect')
      setPlexConnected(false)
      setPlex(null)
      setPlexLibraryProgress({})
      setPlexLibraryErrors({})
      setPlexSyncResult(null)
      setPlexWatchlistSyncResult(null)
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
      const { data } = await apiClient.post('/auth/oauth/tmdb', isDesktop() ? { source: 'desktop' } : undefined)
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

  const handleGoogleConnect = async () => {
    setGoogleConnecting(true)
    setGoogleError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/google', isDesktop() ? { source: 'desktop' } : undefined)
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

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setDriveError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/google-drive', isDesktop() ? { source: 'desktop' } : undefined)
      openExternal(data.authUrl)
    } catch (err) {
      setDriveConnecting(false)
      setDriveError(extractIntegrationMessage(err))
    }
  }

  const handleDriveDisconnect = async () => {
    setDriveDisconnecting(true)
    setDriveError('')
    setDriveMessage('')
    try {
      await apiClient.delete('/auth/oauth/google-drive/disconnect')
      setDriveConnected(false)
      setDriveMessage('Google Drive unlinked.')
    } catch (err) {
      setDriveError(extractIntegrationMessage(err))
    } finally {
      setDriveDisconnecting(false)
    }
  }

  const handleYouTubeSync = async () => {
    activeIntegrationAbortController?.abort()
    const abortController = new AbortController()
    activeIntegrationAbortController = abortController

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

      // Stream ended without a terminal event — nothing to do
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      setYoutubeError(extractIntegrationMessage(err))
      setYoutubeProgress(null)
    } finally {
      setYoutubeSyncing(false)
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
    if (plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex) return
    activeIntegrationAbortController?.abort()
    const abortController = new AbortController()
    activeIntegrationAbortController = abortController

    setPlexSyncing(true)
    setPlexError('')
    setPlexMessage('')
    setPlexLibraryErrors({})
    setPlexSyncResult(null)
    setPlexLibraryProgress({})

    const progressKey = (server: string, library: string) => {
      const match = plexLibraries?.find((l) => l.serverName === server && l.title === library)
      return match ? String(match.id) : `${server}:${library}`
    }

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
                  itemsTotal: (event.itemsTotal as number) || 0,
                  phase: 'syncing',
                },
              }))
              break
            }
            case 'library_progress': {
              const key = progressKey(event.serverName as string, event.libraryName as string)
              const realValue = (event.itemsProcessed as number) || 0
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    serverName: event.serverName as string,
                    libraryName: event.libraryName as string,
                    itemsProcessed: realValue,
                    itemsTotal: (event.itemsTotal as number) || lib?.itemsTotal || realValue,
                    phase: 'syncing',
                  },
                }
              })
              break
            }
            case 'library_complete': {
              const serverName = event.serverName as string
              const libraryName = event.libraryName as string
              const key = progressKey(serverName, libraryName)
              const total = (event.total as number) || (event.itemCount as number) || 0
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    serverName,
                    libraryName,
                    itemsProcessed: total,
                    itemsTotal: total,
                    phase: 'complete' as const,
                  },
                }
              })
              const eventLibId = event.libraryId ? String(event.libraryId) : undefined
              queryClient.setQueryData<PlexLibraryInfo[]>([...libraryKeys.tab('plex'), 'libraries'], (old) => {
                if (!old) return old
                return old.map((l) => {
                  const isMatch = eventLibId
                    ? String(l.id) === eventLibId
                    : (l.serverName === serverName && l.title === libraryName)
                  return isMatch
                    ? { ...l, itemCount: total, lastSyncedAt: new Date().toISOString() }
                    : l
                })
              })
              break
            }
            case 'sync_complete':
              setPlexSyncResult(event as unknown as PlexSyncResult)
              setPlexMessage(
                `Synced ${event.total} Plex items from ${event.libraries} libraries on ${event.servers} server(s). Seeded ${event.seeded} new catalog items.`,
              )
              void refetchLibraries()
              void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
              setTimeout(() => {
                setPlexLibraryProgress({})
              }, 1500)
              break
            case 'error':
              setPlexError((event.message as string) || 'Plex sync encountered an error.')
              setPlexLibraryProgress((prev) => {
                const next = { ...prev }
                for (const k of Object.keys(next)) {
                  if (next[k].phase === 'syncing') {
                    next[k] = { ...next[k], phase: 'failed' }
                  }
                }
                return next
              })
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
      activeIntegrationAbortController?.abort()
    }
  }, [])

  const handlePlexWatchlistSync = async () => {
    if (plexWatchlistSyncing || plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex) return
    setPlexWatchlistSyncing(true)
    setPlexError('')
    setPlexMessage('')
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
    if (discoveringPlex || plexSyncing || syncingLibraryIds.size > 0) return
    setDiscoveringPlex(true)
    setPlexError('')
    setPlexMessage('')
    try {
      const { data } = await apiClient.get<{ servers?: unknown[]; libraries?: unknown[]; unreachableServers?: string[] }>(
        '/integrations/plex/servers',
      )
      await refetchLibraries()
      const libCount = data?.libraries?.length ?? 0
      const serverCount = data?.servers?.length ?? 0
      let msg = `Discovered ${libCount} librar${libCount === 1 ? 'y' : 'ies'} on ${serverCount} server(s).`
      if (data?.unreachableServers?.length) {
        msg += ` (${data.unreachableServers.join(', ')} unreachable)`
      }
      setPlexMessage(msg)
    } catch (err) {
      setPlexError(extractIntegrationMessage(err))
    } finally {
      setDiscoveringPlex(false)
    }
  }

  const handleSyncLibrary = async (library: PlexLibraryInfo) => {
    const libIdStr = String(library.id)
    if (syncingLibraryIds.has(library.id) || syncingLibraryIds.size > 0 || plexSyncing || discoveringPlex) return
    setSyncingLibraryIds((prev) => new Set(prev).add(library.id))
    setPlexLibraryErrors((prev) => {
      const next = { ...prev }
      delete next[libIdStr]
      return next
    })
    setPlexMessage('')
    setPlexLibraryProgress((prev) => ({
      ...prev,
      [libIdStr]: {
        serverName: library.serverName,
        libraryName: library.title,
        itemsProcessed: 0,
        itemsTotal: library.itemCount || 0,
        phase: 'syncing',
      },
    }))

    try {
      const result = await streamPlexLibrarySync(library.id, (event) => {
        switch (event.type) {
          case 'syncing_library': {
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                phase: 'syncing',
                itemsProcessed: prev[libIdStr]?.itemsProcessed ?? 0,
                itemsTotal: (event.itemsTotal as number) || (prev[libIdStr]?.itemsTotal ?? 0),
              },
            }))
            break
          }
          case 'library_progress': {
            const realValue = event.itemsProcessed as number
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                phase: 'syncing',
                itemsProcessed: realValue,
                itemsTotal: (event.itemsTotal as number) || (prev[libIdStr]?.itemsTotal ?? realValue),
              },
            }))
            break
          }
          case 'library_complete': {
            const total = event.total as number
            setPlexLibraryProgress((prev) => ({
              ...prev,
              [libIdStr]: {
                serverName: library.serverName,
                libraryName: library.title,
                itemsProcessed: total,
                itemsTotal: total,
                phase: 'complete',
              },
            }))
            break
          }
        }
      })
      setPlexMessage(`Synced ${library.title}: ${result.matched} matched, ${result.seeded} seeded out of ${result.total} items.`)
      queryClient.setQueryData<PlexLibraryInfo[]>([...libraryKeys.tab('plex'), 'libraries'], (old) => {
        if (!old) return old
        return old.map((l) =>
          String(l.id) === libIdStr
            ? { ...l, itemCount: result.total, lastSyncedAt: new Date().toISOString() }
            : l,
        )
      })
      void queryClient.invalidateQueries({ queryKey: libraryKeys.all() })
      await refetchLibraries()
    } catch (err) {
      const msg = extractIntegrationMessage(err)
      setPlexLibraryErrors((prev) => ({
        ...prev,
        [libIdStr]: msg,
      }))
      setPlexLibraryProgress((prev) => {
        const next = { ...prev }
        delete next[libIdStr]
        return next
      })
    } finally {
      setSyncingLibraryIds((prev) => {
        const next = new Set(prev)
        next.delete(library.id)
        return next
      })
      setTimeout(() => {
        setPlexLibraryProgress((prev) => {
          const next = { ...prev }
          delete next[libIdStr]
          return next
        })
      }, 1500)
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

  if (!isAuthenticated) {
    return (
      <SettingsLockedState
        title="Sign in to manage connections"
        description="Connect Steam, Plex, TMDb, YouTube, and download clients after you sign in."
        icon={Link2}
      />
    )
  }

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const query = searchQuery.toLowerCase().trim()

  type IntegrationCategory = 'account' | 'service'

  interface IntegrationDef {
    id: string
    name: string
    category: IntegrationCategory
    keywords: string
    description: string
    isConnected: boolean
    brandColor: string
    brandBg: string
    icon: any
    onConnect?: () => void
    connecting?: boolean
    connectDisabled?: boolean
    onDisconnect?: () => void
    disconnecting?: boolean
    error?: string
  }

  const integrationDefs: IntegrationDef[] = [
    {
      id: 'steam',
      name: 'Steam',
      category: 'account',
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
      error: steamError,
    },
    {
      id: 'epic',
      name: 'Epic Games',
      category: 'account',
      keywords: 'epic games store egs library launcher',
      description: isEpicConnected && epicDisplayName
        ? `Linked as ${epicDisplayName}`
        : 'Sign in with Epic Games to sync your game library.',
      isConnected: isEpicConnected,
      brandColor: BRAND_COLORS.epic,
      brandBg: BRAND_BG.epic,
      icon: EpicIcon,
      onConnect: handleEpicConnect,
      connecting: epicConnecting,
      onDisconnect: handleEpicDisconnect,
      disconnecting: epicDisconnecting,
      error: epicError,
    },
    {
      id: 'gog',
      name: 'GOG',
      category: 'account',
      keywords: 'gog galaxy games store cd projekt cdpr drm free library launcher',
      description: isGOGConnected && gogDisplayName
        ? `Linked as ${gogDisplayName}`
        : 'Sign in with GOG to sync your game library.',
      isConnected: isGOGConnected,
      brandColor: BRAND_COLORS.gog,
      brandBg: BRAND_BG.gog,
      icon: GOGIcon,
      onConnect: handleGOGConnect,
      connecting: gogConnecting,
      onDisconnect: handleGOGDisconnect,
      disconnecting: gogDisconnecting,
      error: gogError,
    },
    {
      id: 'plex',
      name: 'Plex',
      category: 'account',
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
      error: plexError,
    },
    {
      id: 'google',
      name: 'Google',
      category: 'account',
      keywords: 'google account oauth login identity',
      description: isGoogleConnected && googleEmail ? `Linked as ${googleEmail}` : 'Link your Google account for authentication and identity.',
      isConnected: isGoogleConnected,
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      onConnect: handleGoogleConnect,
      connecting: googleConnecting,
      onDisconnect: handleGoogleDisconnect,
      disconnecting: googleDisconnecting,
      error: googleError,
    },
    {
      id: 'youtube',
      name: 'YouTube',
      category: 'service',
      keywords: 'youtube music liked videos sync play',
      description: isGoogleConnected && googleEmail ? `Syncing with ${googleEmail}` : 'Connect YouTube for YouTube Music and liked videos sync.',
      isConnected: isGoogleConnected,
      brandColor: BRAND_COLORS.youtube,
      brandBg: BRAND_BG.youtube,
      icon: (props: any) => (
        <svg className={props?.className ?? "h-5 w-5"} viewBox="0 0 24 24" fill="#FF0000">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
      onConnect: handleGoogleConnect,
      connecting: googleConnecting,
      onDisconnect: handleGoogleDisconnect,
      disconnecting: googleDisconnecting,
      error: googleError,
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
      category: 'service',
      keywords: 'google drive cloud backup saves game',
      description: driveConnected ? 'Linked for game save cloud backup' : 'Link Google Drive to back up your game saves to the cloud.',
      isConnected: driveConnected,
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      onConnect: handleDriveConnect,
      connecting: driveConnecting,
      onDisconnect: handleDriveDisconnect,
      disconnecting: driveDisconnecting,
      error: driveError,
    },
    {
      id: 'tmdb',
      name: 'TMDb',
      category: 'account',
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
      error: tmdbError,
    },
  ]

  const filteredIntegrations = (query
    ? integrationDefs.filter((i) =>
        i.name.toLowerCase().includes(query) ||
        i.keywords.includes(query) ||
        i.description.toLowerCase().includes(query)
      )
    : integrationDefs)

  const accountIntegrations = filteredIntegrations
    .filter((i) => i.category === 'account')
    .slice()
    .sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  const serviceIntegrations = filteredIntegrations
    .filter((i) => i.category === 'service')
    .slice()
    .sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  const renderIntegrationItem = (i: IntegrationDef) => (
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
      connectDisabled={(i as any).connectDisabled}
      onDisconnect={i.onDisconnect}
      disconnecting={i.disconnecting}
      error={i.error}
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
              <a href={steamProfile.profileurl} target="_blank" rel="noopener noreferrer" className="text-xs text-muted-foreground hover:text-primary transition-colors duration-150 shrink-0">
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
          <div className="mx-5 my-3 p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <FolderOpen className="h-4 w-4 text-sky-500 shrink-0" />
              <span>
                Game scanning, wishlist syncing, and auto-matching are managed under
                {' '}<strong>Library Settings</strong> as a Provider.
              </span>
            </div>
            <Link
              to="/settings/library"
              className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-500 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
            >
              Go to Library Settings &rarr;
            </Link>
          </div>
          {steamMessage && <p className="px-5 py-2 text-xs text-green-400">{steamMessage}</p>}
          {steamError && <p className="px-5 py-2 text-xs text-red-400">{steamError}</p>}
        </>
      )}

      {/* Epic content */}
      {i.id === 'epic' && (
        <>
          <IntegrationProfile
            avatarAlt={epicDisplayName ?? 'Epic Games avatar'}
            name={epicDisplayName ?? 'Epic Games User'}
            detail={epicAccountId ? `Account ID: ${epicAccountId}` : 'Epic Games account linked'}
            brandBg={BRAND_BG.epic}
            icon={EpicIcon}
            brandColor={BRAND_COLORS.epic}
          />
          <div className="mx-5 my-3 p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <FolderOpen className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              <span>
                Game scanning and matching are also managed under
                {' '}<strong>Library Settings</strong> as a Provider.
              </span>
            </div>
            <Link
              to="/settings/library"
              className="px-3 py-1.5 rounded-xl bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
            >
              Go to Library Settings &rarr;
            </Link>
          </div>
          {isEpicConnected && (
            <IntegrationAction
              label="Library Scanning"
              description="Epic Games library"
              result={epicScanResult ? `${epicScanResult.matchedInOtix} matched out of ${epicScanResult.totalInEpic} games${epicScanResult.failed ? ` (${epicScanResult.failed} failed)` : ''}` : null}
              buttonLabel={epicScanning ? 'Scanning...' : epicScanResult ? 'Re-scan' : 'Scan Library'}
              buttonIcon={RefreshCw}
              onPress={handleEpicScan}
              loading={epicScanning}
              disabled={epicScanning || epicResolvingSteamGrid}
              muted
            />
          )}
          {isEpicConnected && (
            <IntegrationAction
              label="SteamGridDB Artwork"
              description="Find covers, banners, icons, and hero artwork from SteamGridDB"
              result={epicSteamGridResult ? `${epicSteamGridResult.matched} of ${epicSteamGridResult.total} games updated${epicSteamGridResult.failed ? ` (${epicSteamGridResult.failed} not found)` : ''}` : null}
              buttonLabel={epicResolvingSteamGrid ? 'Resolving...' : epicSteamGridResult ? 'Re-resolve' : 'Resolve with SteamGrid'}
              buttonIcon={Sparkles}
              onPress={handleEpicResolveSteamGrid}
              loading={epicResolvingSteamGrid}
              disabled={epicResolvingSteamGrid || epicScanning}
              muted
            />
          )}
          {epicMessage && <p className="px-5 py-2 text-xs text-green-400">{epicMessage}</p>}
          {epicError && <p className="px-5 py-2 text-xs text-red-400">{epicError}</p>}
        </>
      )}

      {/* GOG content */}
      {i.id === 'gog' && (
        <>
          <IntegrationProfile
            avatarAlt={gogDisplayName ?? 'GOG avatar'}
            name={gogDisplayName ?? 'GOG User'}
            detail={gogAccountId ? `Account ID: ${gogAccountId}` : 'GOG account linked'}
            brandBg={BRAND_BG.gog}
            icon={GOGIcon}
            brandColor={BRAND_COLORS.gog}
          />
          <div className="mx-5 my-3 p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 text-xs text-muted-foreground">
              <FolderOpen className="h-4 w-4 text-muted-foreground/60 shrink-0" />
              <span>
                Game scanning and matching are also managed under
                {' '}<strong>Library Settings</strong> as a Provider.
              </span>
            </div>
            <Link
              to="/settings/library"
              className="px-3 py-1.5 rounded-xl bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-foreground text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
            >
              Go to Library Settings &rarr;
            </Link>
          </div>
          {isGOGConnected && (
            <IntegrationAction
              label="Library Scanning"
              description="GOG library"
              result={gogScanResult ? `${gogScanResult.matchedInOtix} matched out of ${gogScanResult.totalInGOG} games${gogScanResult.failed ? ` (${gogScanResult.failed} failed)` : ''}` : null}
              buttonLabel={gogScanning ? 'Scanning...' : gogScanResult ? 'Re-scan' : 'Scan Library'}
              buttonIcon={RefreshCw}
              onPress={handleGOGScan}
              loading={gogScanning}
              disabled={gogScanning || gogResolvingSteamGrid}
              muted
            />
          )}
          {isGOGConnected && (
            <IntegrationAction
              label="SteamGridDB Artwork"
              description="Find covers, banners, icons, and hero artwork from SteamGridDB"
              result={gogSteamGridResult ? `${gogSteamGridResult.matched} of ${gogSteamGridResult.total} games updated${gogSteamGridResult.failed ? ` (${gogSteamGridResult.failed} not found)` : ''}` : null}
              buttonLabel={gogResolvingSteamGrid ? 'Resolving...' : gogSteamGridResult ? 'Re-resolve' : 'Resolve with SteamGrid'}
              buttonIcon={Sparkles}
              onPress={handleGOGResolveSteamGrid}
              loading={gogResolvingSteamGrid}
              disabled={gogResolvingSteamGrid || gogScanning}
              muted
            />
          )}
          {gogMessage && <p className="px-5 py-2 text-xs text-green-400">{gogMessage}</p>}
          {gogError && <p className="px-5 py-2 text-xs text-red-400">{gogError}</p>}
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
              <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider">Plex Libraries</p>
              <p className="mt-1 text-sm font-medium text-foreground">
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
              disabled={discoveringPlex || plexSyncing || syncingLibraryIds.size > 0}
              leftIcon={RefreshCw}
              className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
            >
              {plexLibraries && plexLibraries.length > 0 ? 'Refresh' : 'Discover'}
            </DkButton>
          </div>

          {plexLibraries && plexLibraries.length > 0 && (
            <div className="px-5 py-2 space-y-2">
              {plexLibraries.map((lib) => {
                const TypeIcon =
                  lib.libraryType === 'movie' ? Film :
                  lib.libraryType === 'show' ? Tv :
                  lib.libraryType === 'artist' ? Music :
                  FolderOpen
                const typeLabel =
                  lib.libraryType === 'artist' ? 'Music' :
                  lib.libraryType === 'movie' ? 'Movies' :
                  lib.libraryType === 'show' ? 'TV Shows' :
                  lib.libraryType === 'photo' ? 'Photos' : lib.libraryType
                const libIdStr = String(lib.id)
                const libProgress = plexLibraryProgress[libIdStr]
                const isSyncing = syncingLibraryIds.has(lib.id) || (plexSyncing && libProgress?.phase === 'syncing')
                const isComplete = libProgress?.phase === 'complete'
                const libError = plexLibraryErrors[libIdStr]
                const displayCount =
                  isComplete && typeof libProgress?.itemsTotal === 'number'
                    ? libProgress.itemsTotal
                    : (lib.itemCount ?? 0)

                return (
                  <div key={lib.id} className="flex flex-col gap-2 rounded-xl p-3 bg-[var(--dk-surface-ghost)]">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-foreground truncate">{lib.title}</span>
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0 bg-[var(--dk-surface-field)] rounded-md px-1.5 py-0.5">
                            <TypeIcon className="h-3 w-3" />
                            {typeLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                          <span className="font-medium text-foreground">{lib.serverName}</span>
                          <span className="text-muted-foreground/30">·</span>
                          <span>{displayCount} items</span>
                          {lib.lastSyncedAt && (
                            <>
                              <span className="text-muted-foreground/30">·</span>
                              <span>last synced {formatDaysAgo(Math.floor(new Date(lib.lastSyncedAt).getTime() / 1000))}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <DkButton
                        size="sm"
                        variant="ghost"
                        onClick={() => handleSyncLibrary(lib)}
                        loading={isSyncing}
                        disabled={isSyncing || plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex}
                        leftIcon={RefreshCw}
                        loadingText="Syncing"
                        className="shrink-0 self-start sm:self-center bg-primary/10 text-primary shadow-none hover:bg-primary/15"
                      >
                        Sync
                      </DkButton>
                    </div>

                    {/* Progress bar: visible when actively syncing this library */}
                    {isSyncing && libProgress && (
                      <div className="space-y-1">
                        {libProgress.itemsTotal > 0 ? (
                          <>
                            <div className="overflow-hidden rounded-full h-1.5 w-full bg-[var(--dk-surface-field)]">
                              <div
                                className="rounded-full h-full bg-primary transition-all duration-150"
                                style={{ width: `${Math.min(100, Math.round((libProgress.itemsProcessed / libProgress.itemsTotal) * 100))}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[11px] text-muted-foreground">
                              <span>Syncing items...</span>
                              <span>{libProgress.itemsProcessed} / {libProgress.itemsTotal}</span>
                            </div>
                          </>
                        ) : (
                          <div className="flex justify-between text-[11px] text-muted-foreground">
                            <span>Preparing sync...</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Success state */}
                    {isComplete && (
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-500">
                        <Check className="h-3 w-3" />
                        <span>Sync complete</span>
                      </div>
                    )}

                    {/* Individual library scan error */}
                    {libError && (
                      <div className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-400">
                        {libError}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Sync All */}
          <IntegrationAction
            label="Sync All Libraries"
            description="Sync all selected Plex libraries at once"
            result={plexSyncResult ? `${plexSyncResult.total} items, ${plexSyncResult.seeded} seeded` : null}
            buttonLabel={plexSyncing ? 'Syncing...' : plexSyncResult ? 'Re-sync All' : 'Sync All'}
            buttonIcon={RefreshCw}
            onPress={handlePlexSync}
            loading={plexSyncing}
            disabled={plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex}
            progress={plexSyncing && Object.values(plexLibraryProgress).filter(l => l.phase === 'syncing').length > 0 && <span className="text-xs text-primary">{Object.values(plexLibraryProgress).filter(l => l.phase === 'syncing').length} libraries syncing</span>}
            muted
          />

          <IntegrationAction
            label="Watchlist Sync"
            description="Plex Watchlist"
            result={plexWatchlistSyncResult ? `${plexWatchlistSyncResult.matched} matches out of ${plexWatchlistSyncResult.total} watchlist items` : null}
            buttonLabel={plexWatchlistSyncing ? 'Syncing...' : plexWatchlistSyncResult ? 'Re-sync' : 'Sync Watchlist'}
            buttonIcon={RefreshCw}
            onPress={handlePlexWatchlistSync}
            loading={plexWatchlistSyncing}
            disabled={plexWatchlistSyncing || plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex}
            muted
          />

          <IntegrationAction
            label="Storage Optimizer"
            description="Analyze server disk space and discover opportunities to save storage from duplicates, legacy codecs, and unwatched items"
            buttonLabel="Open Optimizer"
            buttonIcon={HardDrive}
            onPress={() => setPlexStorageModalOpen(true)}
          />
          <div className="flex items-center justify-between gap-4 px-5 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Watch History Sync</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Sync episode-level watch history from Plex to your Otix library.
              </p>
            </div>
            <DkSwitch
              checked={plexWatchHistoryEnabled}
              onCheckedChange={async (checked) => {
                setPlexWatchHistoryEnabled(checked)
                setPlexError('')
                try {
                  await apiClient.patch('/auth/me', { plex_watch_history_enabled: checked })
                } catch (err) {
                  setPlexWatchHistoryEnabled(!checked)
                  setPlexError(extractIntegrationMessage(err))
                }
              }}
            />
          </div>
          {plexMessage && <p className="px-5 py-2 text-xs text-green-400">{plexMessage}</p>}
          {plexError && <p className="px-5 py-2 text-xs text-red-400">{plexError}</p>}
        </>
      )}

      {/* Google Drive content */}
      {i.id === 'google_drive' && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-[var(--dk-surface-ghost)] text-xs text-muted-foreground">
            <span>
              {googleEmail ? (
                <>Connected account: <span className="text-foreground font-medium">{googleEmail}</span></>
              ) : (
                'Backs up your game saves to a dedicated folder in your Google Drive.'
              )}
            </span>
          </div>
          {driveMessage && <p className="px-5 py-2 text-xs text-green-400">{driveMessage}</p>}
          {driveError && <p className="px-5 py-2 text-xs text-red-400">{driveError}</p>}
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
          {googleMessage && <p className="px-5 py-2 text-xs text-green-400">{googleMessage}</p>}
          {googleError && <p className="px-5 py-2 text-xs text-red-400">{googleError}</p>}
        </>
      )}

      {/* YouTube content */}
      {i.id === 'youtube' && (
        <>
          <IntegrationProfile
            avatarUrl={googleAvatarUrl}
            avatarAlt={googleName ?? 'YouTube avatar'}
            name={googleName ?? 'YouTube User'}
            detail={googleEmail ? `YouTube account (${googleEmail})` : 'Link YouTube account'}
            brandBg={BRAND_BG.youtube}
            icon={i.icon}
            brandColor={BRAND_COLORS.youtube}
          />
          <IntegrationAction label="YouTube Sync" description="YouTube Liked Videos" result={youtubeSyncResult ? `${youtubeSyncResult.total} videos (${youtubeSyncResult.matched} matched, ${youtubeSyncResult.musicVideos} music)` : null} buttonLabel={youtubeSyncing ? 'Syncing...' : youtubeSyncResult ? 'Re-sync' : 'Sync Liked Videos'} buttonIcon={RefreshCw} onPress={handleYouTubeSync} loading={youtubeSyncing} disabled={youtubeSyncing} progress={youtubeProgress && <span className="text-xs text-primary">{youtubeProgress.phase}{youtubeProgress.detail ? ` (${youtubeProgress.detail})` : ''}</span>} />
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
  )

  return (
    <div id="settings-connections-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Link2}
        title="Connections"
      />
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search integrations..."
          className="w-full h-10 rounded-xl bg-[var(--dk-surface-field)] pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Loading integrations...
        </div>
      ) : filteredIntegrations.length === 0 ? (
        <div className="rounded-2xl p-8 text-center bg-[var(--dk-surface-ghost)]">
          <p className="text-sm text-muted-foreground">No integrations match &quot;{searchQuery}&quot;</p>
        </div>
      ) : (
        <>
          {accountIntegrations.length > 0 && (
            <div id="accounts" className="scroll-mt-28">
              <SettingsCard className="space-y-2">
                <SectionHeader
                  icon={Link2}
                  title="Accounts"
                  description="Sign in with Steam, Plex, TMDb, Google, and more."
                />
                {accountIntegrations.map(renderIntegrationItem)}
              </SettingsCard>
            </div>
          )}

          {serviceIntegrations.length > 0 && (
            <div id="services" className="scroll-mt-28">
              <SettingsCard className="space-y-2">
                <SectionHeader
                  icon={Sparkles}
                  title="Services &amp; Storage"
                  description="Manage media sync and cloud storage connections (YouTube, Google Drive)."
                />
                {serviceIntegrations.map(renderIntegrationItem)}
              </SettingsCard>
            </div>
          )}
        </>
      )}

      {/* Privacy & Legal Compliance Disclosure */}
      <div className="mt-8 rounded-2xl bg-[var(--dk-surface-ghost)] p-4 sm:p-5 flex items-start gap-3.5 text-xs text-muted-foreground">
        <ShieldCheck className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-foreground">Personal Media &amp; Streaming Privacy</p>
          <p className="leading-relaxed">
            Otix is a personal media management client. Otix does not host, store, or distribute copyrighted video or audio. Media streaming connections are established directly between your browser and your linked personal servers (Plex, Jellyfin) for private domestic viewing. Read our full{' '}
            <Link to="/terms" className="text-primary hover:underline underline-offset-2">Terms of Service</Link>{' '}and{' '}<Link to="/privacy" className="text-primary hover:underline underline-offset-2">Privacy Policy</Link>
            .
          </p>
        </div>
      </div>

      {plexStorageModalOpen && (
        <PlexStorageOptimizerModal
          open={plexStorageModalOpen}
          onOpenChange={setPlexStorageModalOpen}
        />
      )}
    </div>
  )
};

