import { useState } from 'react'
import {
  DownloadCloud,
  Film,
  Gamepad2,
  Search,
  Tv,
} from 'lucide-react'
import { useToast } from '@ui/molecules/toast'
import { useModal } from '@/lib/modals'
import type { GameServer } from '@/features/downloads/use-server-downloads'
import { ServerSabnzbdSettingsModal } from '@/features/downloads/molecules/server-sabnzbd-settings-modal'
import { ServerProwlarrSettingsModal } from '@/features/downloads/molecules/server-prowlarr-settings-modal'
import { ServerG4USettingsModal } from '@/features/downloads/molecules/server-g4u-settings-modal'
import { ServerJDownloaderSettingsModal } from '@/features/downloads/molecules/server-jdownloader-settings-modal'
import { ServerRadarrSettingsModal } from '@/features/downloads/molecules/server-radarr-settings-modal'
import { ServerSonarrSettingsModal } from '@/features/downloads/molecules/server-sonarr-settings-modal'
import {
  useServerRadarrConfig,
  useServerRadarrMovies,
  useServerRadarrQueue,
  useServerSonarrConfig,
  useServerSonarrSeries,
  useServerSonarrQueue,
  useSaveServerRadarrConfig,
  useSaveServerSonarrConfig,
} from '@/features/downloads/use-server-arr'
import {
  useServerUsenetConfig,
  useServerUsenetQueue,
  usePauseSabnzbdQueue,
  useResumeSabnzbdQueue,
  useProwlarrIndexers,
  useSyncProwlarrIndexers,
} from '@/features/downloads/use-server-usenet'
import { useNodeJDownloaderConfig } from '@/features/downloads/hooks/use-node-jdownloader'
import {
  normalizeProwlarrIndexers,
  isProwlarrConfigured as checkProwlarrConfigured,
  isSabnzbdConfigured as checkSabnzbdConfigured,
  isG4UConfigured as checkG4UConfigured,
} from '@/features/downloads/usenet-utils'
import { useServerProviders } from '@/features/downloads/use-server-providers'
import type { ProwlarrIndexerItem } from '@/features/downloads/usenet-types'
import { openBoundModal } from '../utils/integrations'
import {
  NODE_SERVICE_BG,
  NODE_SERVICE_COLORS,
} from '../utils/node-connections'

export interface NodeDefItem {
  id: string
  name: string
  keywords: string
  isConnected: boolean
  description: string
  brandColor: string
  brandBg: string
  icon: any
  onConnect: () => void
}

export interface UseNodeConnectionsGroupOptions {
  server: GameServer
  searchQuery?: string
  defaultExpanded?: boolean
  hideNodeHeader?: boolean
}

export const useNodeConnectionsGroup = ({
  server,
  searchQuery = '',
  defaultExpanded = true,
  hideNodeHeader = false,
}: UseNodeConnectionsGroupOptions) => {
  const { openModal } = useModal()
  const { toast } = useToast()
  const hasQuery = Boolean(searchQuery && searchQuery.trim().length > 0)
  const [nodeOpen, setNodeOpen] = useState(defaultExpanded || hasQuery || hideNodeHeader)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [prowlarrSyncProtocol, setProwlarrSyncProtocol] = useState<'all' | 'torrent' | 'usenet'>('all')
  const [prowlarrSyncMessage, setProwlarrSyncMessage] = useState<string | null>(null)
  const [syncedProwlarrIndexers, setSyncedProwlarrIndexers] = useState<ProwlarrIndexerItem[]>([])

  const sabnzbdLiveId = expandedId === 'sabnzbd' ? server.id : undefined
  const prowlarrLiveId = expandedId === 'prowlarr' ? server.id : undefined
  const radarrLiveId = expandedId === 'radarr' ? server.id : undefined
  const sonarrLiveId = expandedId === 'sonarr' ? server.id : undefined

  const { data: usenetConfig } = useServerUsenetConfig(server.id)
  const { data: providers } = useServerProviders(server.id)
  const { data: jdConfig } = useNodeJDownloaderConfig(server.id)
  const { data: radarrConfig } = useServerRadarrConfig(server.id)
  const { data: sonarrConfig } = useServerSonarrConfig(server.id)
  const saveRadarrMutation = useSaveServerRadarrConfig(server.id)
  const saveSonarrMutation = useSaveServerSonarrConfig(server.id)
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

  const handleToggleRadarrAutoRequest = async (checked: boolean) => {
    if (!radarrConfig) return
    const instances = (radarrConfig.instances || []).map((inst) => ({
      ...inst,
      autoRequestWatchlist: checked,
      auto_request_watchlist: checked,
    }))
    try {
      await saveRadarrMutation.mutateAsync({
        ...radarrConfig,
        autoRequestWatchlist: checked,
        auto_request_watchlist: checked,
        instances: instances.length > 0 ? instances : undefined,
      })
      toast({
        title: checked ? 'Watchlist auto-request enabled' : 'Watchlist auto-request disabled',
        description: checked
          ? 'Movies added to your watchlist will be automatically requested in Radarr.'
          : 'Movies added to your watchlist will no longer be automatically requested.',
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Failed to update auto-request',
        description: err instanceof Error ? err.message : 'Could not save setting',
        variant: 'error',
      })
    }
  }

  const handleToggleSonarrAutoRequest = async (checked: boolean) => {
    if (!sonarrConfig) return
    const instances = (sonarrConfig.instances || []).map((inst) => ({
      ...inst,
      autoRequestWatchlist: checked,
      auto_request_watchlist: checked,
    }))
    try {
      await saveSonarrMutation.mutateAsync({
        ...sonarrConfig,
        autoRequestWatchlist: checked,
        auto_request_watchlist: checked,
        instances: instances.length > 0 ? instances : undefined,
      })
      toast({
        title: checked ? 'Watchlist auto-request enabled' : 'Watchlist auto-request disabled',
        description: checked
          ? 'TV series added to your watchlist will be automatically requested in Sonarr.'
          : 'TV series added to your watchlist will no longer be automatically requested.',
        variant: 'success',
      })
    } catch (err) {
      toast({
        title: 'Failed to update auto-request',
        description: err instanceof Error ? err.message : 'Could not save setting',
        variant: 'error',
      })
    }
  }

  const isSabnzbdConfigured =
    Boolean(
      providers?.downloaders?.some(
        (p) => p.name?.toLowerCase() === 'sabnzbd' && ((p as any).connected || p.configured),
      ),
    ) || checkSabnzbdConfigured(usenetConfig?.sabnzbd)

  const isProwlarrConfigured =
    Boolean(
      providers?.indexers?.some(
        (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured),
      ) ||
        providers?.indexer_providers?.some(
          (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured),
        ) ||
        providers?.search_providers?.some(
          (p) => p.name?.toLowerCase() === 'prowlarr' && ((p as any).connected || p.configured),
        ),
    ) || checkProwlarrConfigured(usenetConfig?.prowlarr)

  const isG4UConfigured = Boolean(
    providers?.indexers?.some(
      (p) => p.name?.toLowerCase() === 'g4u' && ((p as any).connected || p.configured),
    ) ||
      providers?.indexer_providers?.some(
        (p) => p.name?.toLowerCase() === 'g4u' && ((p as any).connected || p.configured),
      ) ||
      providers?.search_providers?.some(
        (p) => p.name?.toLowerCase() === 'g4u' && ((p as any).connected || p.configured),
      ) ||
      checkG4UConfigured(usenetConfig?.g4u),
  )

  const isJDownloaderConfigured = Boolean(
    providers?.downloaders?.some(
      (p) => p.name?.toLowerCase() === 'jdownloader' && ((p as any).connected || p.configured),
    ) ||
      jdConfig?.enabled ||
      jdConfig?.email ||
      (jdConfig?.directHost && jdConfig?.directPort),
  )

  const isRadarrConfigured = Boolean(
    radarrConfig?.host &&
      Boolean(radarrConfig?.apiKey || radarrConfig?.api_key || radarrConfig?.configured),
  )

  const isSonarrConfigured = Boolean(
    sonarrConfig?.host &&
      Boolean(sonarrConfig?.apiKey || sonarrConfig?.api_key || sonarrConfig?.configured),
  )

  const openSabnzbdModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerSabnzbdSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openJDownloaderModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerJDownloaderSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openProwlarrModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerProwlarrSettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
    ))
  }
  const openG4UModal = () => {
    openBoundModal(openModal, (onClose) => (
      <ServerG4USettingsModal serverId={server.id} serverName={server.name} onClose={onClose} />
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

  const nodeDefs: NodeDefItem[] = [
    {
      id: 'sabnzbd',
      name: 'SABnzbd',
      keywords: 'sabnzbd usenet nzb download downloader provider queue client',
      isConnected: isSabnzbdConfigured,
      description: isSabnzbdConfigured
        ? `Configured on ${server.name} (Downloader Provider)`
        : 'Connect SABnzbd as your downloader provider to automate Usenet downloads on this node.',
      brandColor: NODE_SERVICE_COLORS.sabnzbd,
      brandBg: NODE_SERVICE_BG.sabnzbd,
      icon: DownloadCloud,
      onConnect: openSabnzbdModal,
    },
    {
      id: 'jdownloader',
      name: 'JDownloader 2',
      keywords: 'jdownloader jd2 direct download ddl cyberlocker rapidgator mega cloud',
      isConnected: isJDownloaderConfigured,
      description: isJDownloaderConfigured
        ? `Configured on ${server.name} (Direct / Cyberlocker Downloader)`
        : 'Connect JDownloader 2 via MyJDownloader cloud or local loopback for direct downloads.',
      brandColor: NODE_SERVICE_COLORS.jdownloader,
      brandBg: NODE_SERVICE_BG.jdownloader,
      icon: DownloadCloud,
      onConnect: openJDownloaderModal,
    },
    {
      id: 'prowlarr',
      name: 'Prowlarr',
      keywords: 'prowlarr indexer provider search usenet torrent sync tracker',
      isConnected: isProwlarrConfigured,
      description: isProwlarrConfigured
        ? `Configured on ${server.name} (Indexer Provider)`
        : 'Connect Prowlarr as your indexer provider for Usenet and Torrent game releases.',
      brandColor: NODE_SERVICE_COLORS.prowlarr,
      brandBg: NODE_SERVICE_BG.prowlarr,
      icon: Search,
      onConnect: openProwlarrModal,
    },
    {
      id: 'g4u',
      name: 'g4u.to',
      keywords: 'g4u g4u.to games4you indexer usenet pc games releases updates newznab',
      isConnected: isG4UConfigured,
      description: isG4UConfigured
        ? `Configured on ${server.name} (PC Games Indexer)`
        : 'Connect g4u.to for direct PC games Usenet searching and updates.',
      brandColor: NODE_SERVICE_COLORS.g4u,
      brandBg: NODE_SERVICE_BG.g4u,
      icon: Gamepad2,
      onConnect: openG4UModal,
    },
    {
      id: 'radarr',
      name: 'Radarr',
      keywords: 'radarr movie movies watchlist automated download arr',
      isConnected: isRadarrConfigured,
      description: isRadarrConfigured
        ? `Configured on ${server.name}`
        : 'Connect Radarr to manage movie libraries and automate movie downloads.',
      brandColor: NODE_SERVICE_COLORS.radarr,
      brandBg: NODE_SERVICE_BG.radarr,
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
      brandColor: NODE_SERVICE_COLORS.sonarr,
      brandBg: NODE_SERVICE_BG.sonarr,
      icon: Tv,
      onConnect: openSonarrModal,
    },
  ]

  const filteredDefs = (query
    ? nodeDefs.filter(
        (i) =>
          i.name.toLowerCase().includes(query) ||
          i.keywords.toLowerCase().includes(query),
      )
    : nodeDefs).slice().sort((a, b) => (b.isConnected ? 1 : 0) - (a.isConnected ? 1 : 0))

  return {
    nodeOpen,
    setNodeOpen,
    expandedId,
    toggleExpand,
    nodeDefs,
    filteredDefs,
    isSabnzbdConfigured,
    sabnzbdQueue,
    isQueuePaused,
    handleToggleQueuePause,
    openSabnzbdModal,
    isJDownloaderConfigured,
    jdConfig,
    openJDownloaderModal,
    isProwlarrConfigured,
    prowlarrIndexers,
    prowlarrSyncProtocol,
    setProwlarrSyncProtocol,
    prowlarrSyncMessage,
    handleProwlarrSync,
    isSyncingProwlarr: syncProwlarrMutation.isPending,
    openProwlarrModal,
    isG4UConfigured,
    usenetConfig,
    openG4UModal,
    isRadarrConfigured,
    radarrMovies,
    radarrQueue,
    radarrConfig,
    handleToggleRadarrAutoRequest,
    isSavingRadarr: saveRadarrMutation.isPending,
    openRadarrModal,
    isSonarrConfigured,
    sonarrSeries,
    sonarrQueue,
    sonarrConfig,
    handleToggleSonarrAutoRequest,
    isSavingSonarr: saveSonarrMutation.isPending,
    openSonarrModal,
  }
}
