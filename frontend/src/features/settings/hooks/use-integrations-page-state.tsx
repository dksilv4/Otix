import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { connectTaskSseStream, type SseEvent } from '@/lib/api/sse-client'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import GOGIcon from '@/assets/provider-logos/gog.svg?react'
import PlexIcon from '@/assets/provider-logos/plex.svg?react'
import GoogleIcon from '@/assets/provider-logos/google.svg?react'
import TmdbIcon from '@/assets/provider-logos/tmdb.svg?react'
import { isDesktop } from '@/lib/desktop/api'
import { openExternal } from '@/lib/utils/open-external'
import { ACCESS_TOKEN_KEY } from '@/lib/config'
import { useSettingsNode } from '../context/settings-node-context'
import { filterConnectedNodes } from '../utils/node-connections'
import { useModal } from '@/lib/modals'
import { useSettingsHashScroll } from './use-settings-hash-scroll'
import { useEpicIntegration } from './use-epic-integration'
import { useGogIntegration } from './use-gog-integration'
import { useTmdbIntegration } from './use-tmdb-integration'
import { useGoogleIntegration } from './use-google-integration'
import { usePlexIntegration } from './use-plex-integration'
import {
  BRAND_COLORS,
  BRAND_BG,
  extractIntegrationMessage,
} from '../utils/integrations'
import type {
  SteamProfile,
  IntegrationDef,
  PlexIntegration,
} from '../types'

export const useIntegrationsPageState = () => {
  const { openModal } = useModal()
  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
  const queryClient = useQueryClient()
  const { servers, setSelectedNodeId } = useSettingsNode()
  useSettingsHashScroll()

  const activeAbortControllerRef = useRef<AbortController | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)

  // Steam State
  const [steamConnected, setSteamConnected] = useState(Boolean(user?.steamId))
  const [steamId, setSteamId] = useState<string | null>(user?.steamId ?? null)
  const [steamProfile, setSteamProfile] = useState<SteamProfile | null>(null)
  const [steamMessage, setSteamMessage] = useState('')
  const [steamError, setSteamError] = useState('')

  // OAuth Connect Generic
  const handleConnect = (provider: string) => {
    const rawBase = import.meta.env.VITE_API_URL ?? ''
    const apiBase = rawBase.endsWith('/') ? rawBase.slice(0, -1) : rawBase
    const token = localStorage.getItem(ACCESS_TOKEN_KEY)
    const tokenQuery = token ? `?token=${encodeURIComponent(token)}` : ''
    const url = `${apiBase}/integrations/${provider}/connect${tokenQuery}`

    if (isDesktop()) {
      void openExternal(url)
    } else {
      const width = 600
      const height = 700
      const left = window.screenX + (window.outerWidth - width) / 2
      const top = window.screenY + (window.outerHeight - height) / 2
      window.open(url, `connect-${provider}`, `width=${width},height=${height},left=${left},top=${top}`)
    }
  }

  // Domain integrations
  const epic = useEpicIntegration(user, openModal)
  const gog = useGogIntegration(user, openModal)
  const tmdb = useTmdbIntegration(user, handleConnect)
  const google = useGoogleIntegration(user, handleConnect)
  const plex = usePlexIntegration(user, queryClient, handleConnect, activeAbortControllerRef)

  useEffect(() => {
    if (user?.steamId) {
      setSteamConnected(true)
      setSteamId(user.steamId)
    }
  }, [user?.steamId])

  const fetchIntegrations = async () => {
    try {
      const { data } = await apiClient.get('/auth/oauth')
      const steam = (data?.providers as Array<{
        name: string
        connected: boolean
        steamId: string | null
        steamProfile: SteamProfile | null
      }>)?.find((p) => p.name === 'steam')
      if (steam) {
        setSteamConnected(steam.connected)
        setSteamId(steam.steamId ?? null)
        setSteamProfile(steam.steamProfile ?? null)
      }
      const plexProvider = (data?.providers as PlexIntegration[])?.find((p) => p.name === 'plex')
      if (plexProvider) {
        plex.setPlexConnected(plexProvider.connected)
        plex.setPlex(plexProvider)
      } else {
        plex.setPlexConnected(false)
        plex.setPlex(null)
      }
      plex.setPlexConnecting(false)
      const tmdbProvider = (data?.providers as Array<{
        name: string
        connected: boolean
        tmdbUsername: string | null
        tmdbAvatarUrl: string | null
        tmdbStats: Record<string, number> | null
        tmdbRatingSyncDirection: string | null
      }>)?.find((p) => p.name === 'tmdb')
      if (tmdbProvider) {
        tmdb.setTmdbConnected(tmdbProvider.connected)
        tmdb.setTmdbUsername(tmdbProvider.tmdbUsername ?? null)
        tmdb.setTmdbAvatarUrl(tmdbProvider.tmdbAvatarUrl ?? null)
        tmdb.setTmdbStats(tmdbProvider.tmdbStats ?? null)
        tmdb.setTmdbSyncDirection(tmdbProvider.tmdbRatingSyncDirection ?? 'disabled')
      }
      const googleProvider = (data?.providers as Array<{
        name: string
        connected: boolean
        googleName: string | null
        googleEmail: string | null
        googleAvatarUrl: string | null
      }>)?.find((p) => p.name === 'google')
      if (googleProvider) {
        google.setGoogleConnected(googleProvider.connected)
        google.setGoogleName(googleProvider.googleName ?? null)
        google.setGoogleEmail(googleProvider.googleEmail ?? null)
        google.setGoogleAvatarUrl(googleProvider.googleAvatarUrl ?? null)
      }
      const googleDriveProvider = (data?.providers as Array<{
        name: string
        connected: boolean
      }>)?.find((p) => p.name === 'google_drive')
      if (googleDriveProvider) {
        google.setDriveConnected(googleDriveProvider.connected)
      }
      const epicProvider = (data?.providers as Array<{
        name: string
        connected: boolean
        epicAccountId?: string | null
        epicDisplayName?: string | null
      }>)?.find((p) => p.name === 'epic')
      if (epicProvider) {
        epic.setEpicConnected(epicProvider.connected)
        epic.setEpicAccountId(epicProvider.epicAccountId ?? null)
        epic.setEpicDisplayName(epicProvider.epicDisplayName ?? null)
      } else {
        await epic.fetchEpicStatus()
      }
      const gogProvider = (data?.providers as Array<{
        name: string
        connected: boolean
        gogAccountId?: string | null
        gogDisplayName?: string | null
      }>)?.find((p) => p.name === 'gog')
      if (gogProvider) {
        gog.setGOGConnected(gogProvider.connected)
        gog.setGOGAccountId(gogProvider.gogAccountId ?? null)
        gog.setGOGDisplayName(gogProvider.gogDisplayName ?? null)
      } else {
        await gog.fetchGOGStatus()
      }
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    if (!authLoading && isAuthenticated) {
      void fetchIntegrations()
    }
  }, [authLoading, isAuthenticated])

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'oauth-complete') {
        setLoading(true)
        void fetchIntegrations().finally(() => setLoading(false))
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [])

  const handleSteamConnect = async () => {
    setConnecting(true)
    setSteamError('')
    try {
      handleConnect('steam')
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setConnecting(false)
    }
  }

  const handleSteamDisconnect = async () => {
    setDisconnecting(true)
    setSteamError('')
    try {
      await apiClient.delete('/integrations/steam/disconnect')
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

  const toggleExpand = (id: string) => {
    setExpandedId(expandedId === id ? null : id)
  }

  const query = searchQuery.toLowerCase().trim()
  const filteredNodes = filterConnectedNodes(servers, query)
  const isSteamConnected = steamConnected
  const displayedSteamId = steamId ?? user?.steamId ?? steamProfile?.steamid ?? null

  const integrationDefs: IntegrationDef[] = [
    {
      id: 'steam',
      name: 'Steam',
      category: 'account',
      keywords: ['valve', 'games', 'gaming'],
      description: isSteamConnected && steamProfile?.personaname
        ? `Linked as ${steamProfile.personaname}`
        : 'Link your Steam account to sync game libraries and play stats.',
      brandColor: BRAND_COLORS.steam,
      brandBg: BRAND_BG.steam,
      icon: SteamIcon,
      isConnected: isSteamConnected,
      onConnect: handleSteamConnect,
      connecting,
      onDisconnect: handleSteamDisconnect,
      disconnecting,
      error: steamError,
    },
    {
      id: 'epic',
      name: 'Epic Games',
      category: 'account',
      keywords: ['epic', 'games', 'fortnite', 'unreal'],
      description: epic.isEpicConnected && epic.epicDisplayName
        ? `Linked as ${epic.epicDisplayName}`
        : 'Sign in with Epic Games to sync your game library.',
      brandColor: BRAND_COLORS.epic,
      brandBg: BRAND_BG.epic,
      icon: EpicIcon,
      isConnected: epic.isEpicConnected,
      onConnect: epic.handleEpicConnect,
      connecting: epic.epicConnecting,
      onDisconnect: epic.handleEpicDisconnect,
      disconnecting: epic.epicDisconnecting,
      error: epic.epicError,
    },
    {
      id: 'gog',
      name: 'GOG Galaxy',
      category: 'account',
      keywords: ['gog', 'galaxy', 'cd projekt', 'games'],
      description: gog.isGOGConnected && gog.gogDisplayName
        ? `Linked as ${gog.gogDisplayName}`
        : 'Sign in with GOG Galaxy to sync DRM-free games.',
      brandColor: BRAND_COLORS.gog,
      brandBg: BRAND_BG.gog,
      icon: GOGIcon,
      isConnected: gog.isGOGConnected,
      onConnect: gog.handleGOGConnect,
      connecting: gog.gogConnecting,
      onDisconnect: gog.handleGOGDisconnect,
      disconnecting: gog.gogDisconnecting,
      error: gog.gogError,
    },
    {
      id: 'plex',
      name: 'Plex',
      category: 'account',
      keywords: ['media', 'movies', 'tv', 'streaming'],
      description: plex.isPlexConnected && plex.plex?.plexUsername
        ? `Linked as ${plex.plex.plexUsername}`
        : 'Link your Plex account to discover and stream your libraries.',
      brandColor: BRAND_COLORS.plex,
      brandBg: BRAND_BG.plex,
      icon: PlexIcon,
      isConnected: plex.isPlexConnected,
      onConnect: plex.handlePlexConnect,
      connecting: plex.plexConnecting,
      onDisconnect: plex.handlePlexDisconnect,
      disconnecting: plex.plexDisconnecting,
      error: plex.plexError,
    },
    {
      id: 'google',
      name: 'Google',
      category: 'account',
      keywords: ['gmail', 'drive', 'youtube', 'oauth'],
      description: google.isGoogleConnected && google.googleEmail
        ? `Linked as ${google.googleEmail}`
        : 'Link your Google account to enable Drive and YouTube integrations.',
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      isConnected: google.isGoogleConnected,
      onConnect: google.handleGoogleConnect,
      connecting: google.googleConnecting,
      onDisconnect: google.handleGoogleDisconnect,
      disconnecting: google.googleDisconnecting,
      error: google.googleError,
    },
    {
      id: 'youtube',
      name: 'YouTube',
      category: 'service',
      keywords: ['google', 'video', 'music'],
      description: google.isGoogleConnected ? 'Sync subscriptions and liked music from YouTube.' : 'Connect Google account to enable.',
      isConnected: google.isGoogleConnected,
      brandColor: BRAND_COLORS.youtube,
      brandBg: BRAND_BG.youtube,
      icon: (props: any) => (
        <svg className={props?.className ?? "h-5 w-5"} viewBox="0 0 24 24" fill="#FF0000">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      ),
      onConnect: google.handleGoogleConnect,
      connecting: google.googleConnecting,
      onDisconnect: google.handleGoogleDisconnect,
      disconnecting: google.googleDisconnecting,
      error: google.googleError,
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
      category: 'service',
      keywords: ['google', 'cloud', 'backup', 'storage'],
      description: google.isGoogleConnected ? 'Sync media items directly with Google Drive.' : 'Connect Google account to enable.',
      isConnected: google.isGoogleConnected,
      brandColor: BRAND_COLORS.google,
      brandBg: BRAND_BG.google,
      icon: GoogleIcon,
      onConnect: google.handleDriveConnect,
      connecting: google.driveConnecting,
      onDisconnect: google.handleDriveDisconnect,
      disconnecting: google.driveDisconnecting,
      error: google.driveError,
    },
    {
      id: 'tmdb',
      name: 'TMDb',
      category: 'service',
      keywords: ['themoviedb', 'ratings', 'watchlist'],
      description: tmdb.isTmdbConnected && tmdb.tmdbUsername
        ? `Linked as ${tmdb.tmdbUsername}`
        : 'Link your TMDb account to sync ratings and import watchlists.',
      brandColor: BRAND_COLORS.tmdb,
      brandBg: BRAND_BG.tmdb,
      icon: TmdbIcon,
      isConnected: tmdb.isTmdbConnected,
      onConnect: tmdb.handleTmdbConnect,
      connecting: tmdb.tmdbConnecting,
      onDisconnect: tmdb.handleTmdbDisconnect,
      disconnecting: tmdb.tmdbDisconnecting,
      error: tmdb.tmdbError,
    },
  ]

  const filteredIntegrations = query
    ? integrationDefs.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.keywords.includes(query) ||
          i.description.toLowerCase().includes(query),
      )
    : integrationDefs

  const accountIntegrations = filteredIntegrations
    .filter((i) => i.category === 'account')
    .slice()
    .sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  const serviceIntegrations = filteredIntegrations
    .filter((i) => i.category === 'service')
    .slice()
    .sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  return {
    user,
    isAuthenticated,
    loading,
    expandedId,
    toggleExpand,
    searchQuery,
    setSearchQuery,
    query,
    servers,
    filteredNodes,
    integrationDefs,
    filteredIntegrations,
    accountIntegrations,
    serviceIntegrations,
    // Steam
    steamProfile,
    displayedSteamId,
    steamMessage,
    steamError,
    isSteamConnected,
    handleSteamConnect,
    handleSteamDisconnect,
    // Epic
    ...epic,
    // GOG
    ...gog,
    // Plex
    ...plex,
    // Google & YouTube & Drive
    ...google,
    // TMDb
    ...tmdb,
  }
}
