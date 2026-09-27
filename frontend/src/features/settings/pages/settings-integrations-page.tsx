import { useState, useEffect, type ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import { useAuth } from '@/lib/providers/auth'
import { apiClient } from '@/lib/api/client'
import { connectTaskSseStream, type SseEvent } from '@/lib/api/sse-client'
import { DkButton } from '@ui/atoms/button'
import { DkDropdown } from '@ui/atoms/dropdown'
import { DkSwitch } from '@ui/atoms/switch'
import SteamIcon from '@/assets/provider-logos/steam.svg?react'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
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
  DownloadCloud,
  Link2,
  Film,
  Tv,
  Music,
  FolderOpen,
  Search,
  Pause,
  Play,
  Check,
  HardDrive,
  Server,
  ChevronDown,
} from 'lucide-react'
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
import type { GameServer } from '@/features/downloads/use-server-downloads'
import {
  remoteConnectionNodes,
} from '@/features/downloads/molecules/use-integration-target-server'
import { useSettingsNode } from '../context/settings-node-context'
import { useModal } from '@/lib/modals'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { ProwlarrIndexersPanel } from '@/features/downloads/molecules/prowlarr-indexers-panel'
import { ServerRadarrSettingsModal } from '@/features/downloads/molecules/server-radarr-settings-modal'
import { ServerSonarrSettingsModal } from '@/features/downloads/molecules/server-sonarr-settings-modal'
import {
  useServerRadarrConfig,
  useServerRadarrMovies,
  useServerRadarrQueue,
  useServerSonarrConfig,
  useServerSonarrSeries,
  useServerSonarrQueue,
} from '@/features/downloads/use-server-arr'
import {
  useServerUsenetConfig,
  useServerUsenetQueue,
  usePauseSabnzbdQueue,
  useResumeSabnzbdQueue,
  useProwlarrIndexers,
  useSyncProwlarrIndexers,
} from '@/features/downloads/use-server-usenet'
import { normalizeProwlarrIndexers } from '@/features/downloads/usenet-utils'
import type { ProwlarrIndexerItem } from '@/features/downloads/usenet-types'
import { cn } from '@/lib/utils'

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

function openBoundModal(
  openModal: (component: ReactNode) => () => void,
  render: (onClose: () => void) => ReactNode,
) {
  const closeRef = { current: () => {} }
  closeRef.current = openModal(render(() => closeRef.current()))
}

function formatDaysAgo(unixTimestamp: number): string {
  const seconds = Math.floor(Date.now() / 1000 - unixTimestamp)
  if (isNaN(seconds) || seconds < 0) return 'today'
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  const days = Math.floor(seconds / 86400)
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days}d ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

const BRAND_COLORS: Record<string, string> = {
  steam: '#1a6bcc',
  epic: '#ffffff',
  plex: '#e5a00d',
  tmdb: '#01b4e4',
  google: '#4285F4',
  sabnzbd: '#f59e0b',
  prowlarr: '#e05338',
  radarr: '#ffc107',
  sonarr: '#00c4df',
}

const BRAND_BG: Record<string, string> = {
  steam: 'bg-[#1a6bcc]/10',
  epic: 'bg-white/10',
  plex: 'bg-[#e5a00d]/10',
  tmdb: 'bg-[#01b4e4]/10',
  google: 'bg-[#4285F4]/10',
  sabnzbd: 'bg-[#f59e0b]/10',
  prowlarr: 'bg-[#e05338]/10',
  radarr: 'bg-[#ffc107]/10',
  sonarr: 'bg-[#00c4df]/10',
}

const NODE_KEYWORDS = 'sabnzbd prowlarr radarr sonarr usenet torrent arr downloader server node'

/** Renders SABnzbd, Prowlarr, Radarr, and Sonarr cards scoped to a single Otix worker node. */
function NodeConnectionsGroup({
  server,
  searchQuery,
}: {
  server: GameServer
  searchQuery: string
}) {
  const { openModal } = useModal()
  const [nodeOpen, setNodeOpen] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [prowlarrSyncProtocol, setProwlarrSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all')
  const [prowlarrSyncMessage, setProwlarrSyncMessage] = useState<string | null>(null)
  const [syncedProwlarrIndexers, setSyncedProwlarrIndexers] = useState<ProwlarrIndexerItem[]>([])

  const sabnzbdLiveId = expandedId === 'sabnzbd' ? server.id : undefined
  const prowlarrLiveId = expandedId === 'prowlarr' ? server.id : undefined
  const radarrLiveId = expandedId === 'radarr' ? server.id : undefined
  const sonarrLiveId = expandedId === 'sonarr' ? server.id : undefined

  const { data: usenetConfig } = useServerUsenetConfig(server.id)
  const { data: radarrConfig } = useServerRadarrConfig(server.id)
  const { data: sonarrConfig } = useServerSonarrConfig(server.id)
  const { data: radarrMovies = [] } = useServerRadarrMovies(radarrLiveId)
  const { data: sonarrSeries = [] } = useServerSonarrSeries(sonarrLiveId)
  const { data: radarrQueue } = useServerRadarrQueue(radarrLiveId, 1, 50, 4000)
  const { data: sonarrQueue } = useServerSonarrQueue(sonarrLiveId, 1, 50, 4000)
  const { data: sabnzbdQueue, refetch: refetchQueue } = useServerUsenetQueue(sabnzbdLiveId, 3000)
  const pauseSabnzbdMutation = usePauseSabnzbdQueue(server.id)
  const resumeSabnzbdMutation = useResumeSabnzbdQueue(server.id)
  const isQueuePaused = Boolean(sabnzbdQueue?.status?.toLowerCase().includes('paused'))
  const { data: fetchedProwlarrIndexers = [], refetch: refetchProwlarrIndexers } = useProwlarrIndexers(prowlarrLiveId)
  const syncProwlarrMutation = useSyncProwlarrIndexers(server.id)
  const prowlarrIndexers = fetchedProwlarrIndexers.length > 0 ? fetchedProwlarrIndexers : syncedProwlarrIndexers

  const isSabnzbdConfigured = Boolean(
    usenetConfig?.sabnzbd?.host &&
    Boolean(usenetConfig?.sabnzbd?.api_key || usenetConfig?.sabnzbd?.configured)
  )
  const isProwlarrConfigured = Boolean(
    usenetConfig?.prowlarr?.host &&
    Boolean(usenetConfig?.prowlarr?.api_key || usenetConfig?.prowlarr?.configured)
  )
  const isRadarrConfigured = Boolean(
    radarrConfig?.host &&
    Boolean(radarrConfig?.apiKey || radarrConfig?.api_key || radarrConfig?.configured)
  )
  const isSonarrConfigured = Boolean(
    sonarrConfig?.host &&
    Boolean(sonarrConfig?.apiKey || sonarrConfig?.api_key || sonarrConfig?.configured)
  )

  const openSabnzbdModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerSabnzbdSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openProwlarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerProwlarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openRadarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerRadarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openSonarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerSonarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }

  const handleToggleQueuePause = async () => {
    try {
      if (isQueuePaused) {
        await resumeSabnzbdMutation.mutateAsync()
      } else {
        await pauseSabnzbdMutation.mutateAsync()
      }
      refetchQueue()
    } catch (err) {
      console.error('Failed to toggle queue pause:', err)
    }
  }

  const handleProwlarrSync = async () => {
    try {
      const res = await syncProwlarrMutation.mutateAsync(prowlarrSyncProtocol)
      setSyncedProwlarrIndexers(normalizeProwlarrIndexers(res))
      setProwlarrSyncMessage(res.message)
      await refetchProwlarrIndexers()
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setProwlarrSyncMessage(`Sync failed: ${message}`)
    }
  }

  const toggleExpand = (id: string) => setExpandedId(expandedId === id ? null : id)

  const query = searchQuery.toLowerCase().trim()

  const nodeDefs = [
    {
      id: 'sabnzbd',
      name: 'SABnzbd',
      keywords: 'sabnzbd usenet nzb download downloader queue client',
      isConnected: isSabnzbdConfigured,
      description: isSabnzbdConfigured
        ? `Configured on ${server.name}`
        : 'Connect SABnzbd to automate Usenet downloads on this node.',
      brandColor: BRAND_COLORS.sabnzbd,
      brandBg: BRAND_BG.sabnzbd,
      icon: DownloadCloud,
      onConnect: openSabnzbdModal,
    },
    {
      id: 'prowlarr',
      name: 'Prowlarr',
      keywords: 'prowlarr indexer search usenet torrent sync tracker',
      isConnected: isProwlarrConfigured,
      description: isProwlarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Prowlarr to index game releases across Usenet and Torrent trackers.',
      brandColor: BRAND_COLORS.prowlarr,
      brandBg: BRAND_BG.prowlarr,
      icon: Search,
      onConnect: openProwlarrModal,
    },
    {
      id: 'radarr',
      name: 'Radarr',
      keywords: 'radarr movie movies watchlist automated download arr',
      isConnected: isRadarrConfigured,
      description: isRadarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Radarr to manage movie libraries and automate movie downloads.',
      brandColor: BRAND_COLORS.radarr,
      brandBg: BRAND_BG.radarr,
      icon: Film,
      onConnect: openRadarrModal,
    },
    {
      id: 'sonarr',
      name: 'Sonarr',
      keywords: 'sonarr tv shows series automated download arr',
      isConnected: isSonarrConfigured,
      description: isSonarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Sonarr to manage TV series and automate episode downloads.',
      brandColor: BRAND_COLORS.sonarr,
      brandBg: BRAND_BG.sonarr,
      icon: Tv,
      onConnect: openSonarrModal,
    },
  ]

  const filteredDefs = query
    ? nodeDefs.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.keywords.includes(query) ||
          server.name.toLowerCase().includes(query) ||
          NODE_KEYWORDS.includes(query)
      )
    : nodeDefs

  if (filteredDefs.length === 0) return null

  return (
    <SettingsCard className="overflow-hidden !p-0">
      {/* Collapsible node header */}
      <button
        type="button"
        onClick={() => setNodeOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-white/[0.03] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
      >
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="flex shrink-0 items-center justify-center h-7 w-7 rounded-lg bg-primary/10 text-primary">
            <Server className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold truncate">{server.name}</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider shrink-0',
              server.isOnline ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400',
            )}
          >
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                server.isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400',
              )}
            />
            {server.isOnline ? 'Online' : 'Offline'}
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <Link
            to="/settings/nodes/$nodeId"
            params={{ nodeId: String(server.id) }}
            className="text-xs text-white/40 hover:text-white/70 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            Node settings →
          </Link>
          <ChevronDown
            className={cn(
              'h-4 w-4 text-white/40 transition-transform duration-200',
              nodeOpen ? 'rotate-0' : '-rotate-90',
            )}
          />
        </div>
      </button>

      {/* Per-node integration cards */}
      {nodeOpen && (
        <div className="border-t border-white/[0.06] space-y-px">
          {filteredDefs.map((i) => (

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
          connecting={false}
          onDisconnect={undefined}
          disconnecting={false}
        >
          {/* SABnzbd content */}
          {i.id === 'sabnzbd' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-white/[0.03] text-xs">
                <span className="text-white/60">
                  Managed by <span className="text-white/90 font-medium">{server.name}</span>{server.primaryUrl ? ` (${server.primaryUrl})` : ''}
                </span>
                <Link
                  to="/downloads"
                  className="text-amber-400 hover:text-amber-300 font-medium transition-colors duration-150 inline-flex items-center gap-1"
                >
                  View Downloads Queue &rarr;
                </Link>
              </div>
              {sabnzbdQueue && (
                <IntegrationStats items={[
                  { label: 'queue status', value: sabnzbdQueue.status || 'Idle' },
                  { label: 'download speed', value: sabnzbdQueue.speed || '0 B/s' },
                  { label: 'queued items', value: String(sabnzbdQueue.items?.length ?? 0) },
                  ...(sabnzbdQueue.time_left ? [{ label: 'time left', value: sabnzbdQueue.time_left }] : []),
                ]} />
              )}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 bg-white/[0.03]">
                <div>
                  <p className="text-xs font-semibold uppercase text-white/40 tracking-wider">Queue Controls</p>
                  <p className="text-xs text-white/70 mt-0.5">
                    {isQueuePaused ? 'Download queue is paused.' : 'Download queue is currently active.'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <DkButton
                    size="sm"
                    variant="ghost"
                    onClick={handleToggleQueuePause}
                    loading={pauseSabnzbdMutation.isPending || resumeSabnzbdMutation.isPending}
                    leftIcon={isQueuePaused ? Play : Pause}
                    className="bg-amber-500/10 text-amber-400 hover:bg-amber-500/20"
                  >
                    {isQueuePaused ? 'Resume Queue' : 'Pause Queue'}
                  </DkButton>
                </div>
              </div>
              <IntegrationAction
                label="SABnzbd Settings"
                description="Configure host, port, API key, and download category"
                buttonLabel="Configure SABnzbd"
                buttonIcon={DownloadCloud}
                onPress={openSabnzbdModal}
              />
            </>
          )}

          {/* Prowlarr content */}
          {i.id === 'prowlarr' && (
            <>
              <div className="flex items-center justify-between px-5 py-2.5 bg-white/[0.03] text-xs text-white/60">
                <span>
                  Managed by <span className="text-white/90 font-medium">{server.name}</span>{server.primaryUrl ? ` (${server.primaryUrl})` : ''}
                </span>
              </div>
              <div className="px-5 py-4 space-y-3">
                <ProwlarrIndexersPanel
                  protocol={prowlarrSyncProtocol}
                  onProtocolChange={setProwlarrSyncProtocol}
                  onSync={() => void handleProwlarrSync()}
                  isSyncing={syncProwlarrMutation.isPending}
                  indexers={prowlarrIndexers}
                  syncMessage={prowlarrSyncMessage}
                />
              </div>
              <IntegrationAction
                label="Prowlarr Settings"
                description="Configure host, port, API key, and search categories"
                buttonLabel="Configure Prowlarr"
                buttonIcon={Search}
                onPress={openProwlarrModal}
              />
            </>
          )}

          {/* Radarr content */}
          {i.id === 'radarr' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-white/[0.03] text-xs text-white/60">
                <span>
                  Managed by <span className="text-white/90 font-medium">{server.name}</span>{server.primaryUrl ? ` (${server.primaryUrl})` : ''}
                </span>
              </div>
              {isRadarrConfigured && (
                <IntegrationStats items={[
                  { label: 'indexed movies', value: String(radarrMovies.length) },
                  { label: 'monitored', value: String(radarrMovies.filter((m) => m.monitored).length) },
                  { label: 'queued downloads', value: String(radarrQueue?.totalRecords ?? radarrQueue?.records?.length ?? 0) },
                ]} />
              )}
              <IntegrationAction
                label="Radarr Settings"
                description="Configure host, port, API key, quality profile, and root folder"
                buttonLabel="Configure Radarr"
                buttonIcon={Film}
                onPress={openRadarrModal}
              />
            </>
          )}

          {/* Sonarr content */}
          {i.id === 'sonarr' && (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 bg-white/[0.03] text-xs text-white/60">
                <span>
                  Managed by <span className="text-white/90 font-medium">{server.name}</span>{server.primaryUrl ? ` (${server.primaryUrl})` : ''}
                </span>
              </div>
              {isSonarrConfigured && (
                <IntegrationStats items={[
                  { label: 'indexed series', value: String(sonarrSeries.length) },
                  { label: 'monitored', value: String(sonarrSeries.filter((s) => s.monitored).length) },
                  { label: 'queued downloads', value: String(sonarrQueue?.totalRecords ?? sonarrQueue?.records?.length ?? 0) },
                ]} />
              )}
              <IntegrationAction
                label="Sonarr Settings"
                description="Configure host, port, API key, quality profile, and series options"
                buttonLabel="Configure Sonarr"
                buttonIcon={Tv}
                onPress={openSonarrModal}
              />
            </>
          )}
        </IntegrationCard>
        ))}
      </div>
      )}
    </SettingsCard>
  )
}

let activeIntegrationAbortController: AbortController | null = null

export function SettingsIntegrationsPage() {

  const { user, isAuthenticated, isLoading: authLoading } = useAuth()
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

  const { servers: allNodes } = useSettingsNode()
  // Remote connection nodes include real Otix worker nodes + the Otix backend node
  const workerNodes = remoteConnectionNodes(allNodes)

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
    } catch (err) {
      setSteamError(extractIntegrationMessage(err))
    } finally {
      setLoading(false)
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
    if (plexConnecting) return
    setPlexConnecting(true)
    setPlexError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/plex')
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

  const handleDriveConnect = async () => {
    setDriveConnecting(true)
    setDriveError('')
    try {
      const { data } = await apiClient.post('/auth/oauth/google-drive')
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
              const key = progressKey(event.serverName as string, event.libraryName as string)
              const total = (event.total as number) || 0
              setPlexLibraryProgress((prev) => {
                const lib = prev[key]
                return {
                  ...prev,
                  [key]: {
                    ...lib,
                    serverName: event.serverName as string,
                    libraryName: event.libraryName as string,
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
              refetchLibraries()
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
  const isEpicSearch = Boolean(query && ('epic games store'.includes(query) || query.includes('epic')))

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
      error: steamError,
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
      error: plexError,
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
      error: googleError,
    },
    {
      id: 'google_drive',
      name: 'Google Drive',
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

  const nodesVisible = !query ||
    NODE_KEYWORDS.includes(query) ||
    workerNodes.some((n) => n.name.toLowerCase().includes(query))

  return (
    <div id="settings-connections-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Link2}
        title="Connections"
        description="Connect Steam, Plex, TMDb, YouTube, and download clients."
      />
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
      ) : filteredIntegrations.length === 0 && !nodesVisible && !isEpicSearch ? (
        <div className="rounded-2xl p-8 text-center bg-white/5">
          <p className="text-sm text-white/60">No integrations match &quot;{searchQuery}&quot;</p>
        </div>
      ) : (
        <>
          {(filteredIntegrations.length > 0 || isEpicSearch) && (
            <div id="accounts" className="scroll-mt-28">
              <SettingsCard className="space-y-2">
                <SectionHeader
                  icon={Link2}
                  title="Accounts"
                  description="Sign in with Steam, Plex, TMDb, Google, and more."
                />
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
                        <div className="mx-5 my-3 p-3.5 rounded-xl bg-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="flex items-center gap-2.5 text-xs text-white/70">
                            <FolderOpen className="h-4 w-4 text-sky-400 shrink-0" />
                            <span>
                              Game scanning, wishlist syncing, and auto-matching are managed under
                              {' '}<strong>Library Settings</strong> as a Provider.
                            </span>
                          </div>
                          <Link
                            to="/settings/library"
                            className="px-3.5 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-400 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
                          >
                            Go to Library Settings &rarr;
                          </Link>
                        </div>
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

                              return (
                                <div key={lib.id} className="flex flex-col gap-2 rounded-xl p-3 bg-white/[0.03]">
                                  <div className="flex items-center gap-3">
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
                                        <span className="text-white/20">·</span>
                                        <span>{lib.itemCount} items</span>
                                        {lib.lastSyncedAt && (
                                          <>
                                            <span className="text-white/20">·</span>
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
                                          <div className="overflow-hidden rounded-full h-1.5 w-full bg-white/10">
                                            <div
                                              className="rounded-full h-full bg-primary transition-all duration-150"
                                              style={{ width: `${Math.min(100, Math.round((libProgress.itemsProcessed / libProgress.itemsTotal) * 100))}%` }}
                                            />
                                          </div>
                                          <div className="flex justify-between text-[11px] text-white/40">
                                            <span>Syncing items...</span>
                                            <span>{libProgress.itemsProcessed} / {libProgress.itemsTotal}</span>
                                          </div>
                                        </>
                                      ) : (
                                        <div className="flex justify-between text-[11px] text-white/40">
                                          <span>Preparing sync...</span>
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {/* Success state */}
                                  {isComplete && (
                                    <div className="flex items-center gap-1.5 text-[11px] text-emerald-400">
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
                          disabled={plexSyncing || syncingLibraryIds.size > 0 || discoveringPlex || !plexLibraries || plexLibraries.length === 0}
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
                            <p className="text-sm font-medium">Watch History Sync</p>
                            <p className="mt-0.5 text-xs text-white/60">
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
                        <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 bg-white/[0.03] text-xs text-white/60">
                          <span>
                            {googleEmail ? (
                              <>Connected account: <span className="text-white/90 font-medium">{googleEmail}</span></>
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

                {/* Epic Games Node Settings Notice */}
                {(!query || isEpicSearch) && (
                  <div className="mx-5 my-2 p-3.5 rounded-xl bg-white/[0.03] border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white shrink-0">
                        <EpicIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-white">Epic Games</p>
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">
                            Node Setting
                          </span>
                        </div>
                        <p className="text-[11px] text-white/60 mt-0.5">
                          Epic Games requires a connected Otix Node and is configured in Node Settings.
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/settings/nodes"
                      className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/15 text-white/90 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
                    >
                      Open Node Settings &rarr;
                    </Link>
                  </div>
                )}
              </SettingsCard>
            </div>
          )}

          {nodesVisible && (
            <div id="nodes" className="scroll-mt-28 space-y-3">
              <SectionHeader
                icon={Server}
                title="Otix nodes"
                description="Manage SABnzbd, Prowlarr, Radarr, and Sonarr instances per node."
              />
              {workerNodes.length > 0 ? (
                workerNodes.map((node) => (
                  <NodeConnectionsGroup key={node.id} server={node} searchQuery={searchQuery} />
                ))
              ) : (
                <SettingsCard>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/80">No nodes connected</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        Connect an Otix node to configure SABnzbd, Prowlarr, Radarr, and Sonarr.
                      </p>
                    </div>
                    <Link
                      to="/settings/nodes"
                      className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
                    >
                      Go to Nodes →
                    </Link>
                  </div>
                </SettingsCard>
              )}
            </div>
          )}
        </>
      )}

      {plexStorageModalOpen && (
        <PlexStorageOptimizerModal
          open={plexStorageModalOpen}
          onOpenChange={setPlexStorageModalOpen}
        />
      )}
    </div>
  )
}

