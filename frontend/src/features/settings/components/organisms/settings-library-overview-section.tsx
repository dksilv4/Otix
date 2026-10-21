import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import {
  ArrowRight,
  CheckCircle2,
  FolderOpen,
  Gamepad2,
  HardDrive,
  Server,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { useOptionalAuth } from '@/lib/providers/auth'
import { useDownloadConfig } from '@/features/downloads/use-downloads'
import { getDesktopAPI, isDesktop } from '@/lib/desktop/api'
import { apiClient } from '@/lib/api/client'
import { cn } from '@/lib/utils'
import { useSettingsNode } from '../../context/settings-node-context'
import { isLocalDesktopNodeId } from '../../local-desktop-node'
import { nodeSettingsNavigateOptions, type NodeSettingsTab } from '../../node-settings'
import { SettingsCard } from '../molecules/settings-card'
import { SectionHeader } from '../molecules/settings-section-header'
import type { LibrarySettingsTab } from './settings-library-tabs'

export interface LibraryOverviewStats {
  total: number
  matched: number
  candidates: number
  unmatched: number
  loading?: boolean
}

export interface SettingsLibraryOverviewSectionProps {
  stats: LibraryOverviewStats
  onNavigate: (tab: Exclude<LibrarySettingsTab, 'overview'>) => void
}

const Metric = ({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'default',
}: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: ReactNode
  hint?: string
  tone?: 'default' | 'success' | 'warn' | 'muted'
}) => {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-500 dark:text-emerald-400'
      : tone === 'warn'
        ? 'text-sky-500 dark:text-sky-400'
        : tone === 'muted'
          ? 'text-muted-foreground'
          : 'text-primary'

  return (
    <div className="flex items-start gap-2.5 min-w-0">
      <div className={cn('mt-0.5 shrink-0', toneClass)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</p>
        <p className="text-sm font-semibold text-foreground truncate">{value}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{hint}</p>}
      </div>
    </div>
  )
};

const OverviewNavCard = ({
  title,
  description,
  icon: Icon,
  onClick,
  to,
  params,
  hash,
  children,
}: {
  title: string
  description: string
  icon: ComponentType<{ className?: string }>
  onClick?: () => void
  to?: string
  params?: Record<string, string>
  hash?: string
  children: ReactNode
}) => {
  const className =
    'group text-left w-full rounded-2xl sm:rounded-3xl p-5 sm:p-6 backdrop-blur-xl transition-all duration-200 hover:bg-[var(--dk-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40'
  const style = {
    backgroundColor: 'var(--dk-surface-base)',
    boxShadow: 'var(--dk-shadow-card)',
  }
  const body = (
    <>
      <div className="flex items-start justify-between gap-3 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-foreground tracking-tight">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{description}</p>
          </div>
        </div>
        <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0 mt-1" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">{children}</div>
    </>
  )

  if (to) {
    return (
      <Link
        to={to}
        params={params}
        hash={hash}
        aria-label={`Go to ${title}`}
        className={className}
        style={style}
      >
        {body}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${title}`}
      className={className}
      style={style}
    >
      {body}
    </button>
  )
};

type OverviewOrganize = {
  autoSearchWishlist?: boolean
  postProcessEnabled?: boolean
  autoOrganizeEnabled?: boolean
  preferredRepackers?: string | null
  downloadPath?: string | null
  isoDownloadPath?: string | null
}

export const SettingsLibraryOverviewSection = ({
  stats,
  onNavigate,
}: SettingsLibraryOverviewSectionProps) => {
  const desktop = isDesktop()
  const auth = useOptionalAuth()
  const user = auth?.user ?? null

  const { config: dlConfig, loading: configLoading } = useDownloadConfig(user?.id)
  const { servers: gameServers = [], selectedNode, isLoading: serversLoading } = useSettingsNode()
  const nodePage = (tab?: NodeSettingsTab) =>
    selectedNode
      ? nodeSettingsNavigateOptions(selectedNode.id, tab)
      : { to: '/settings/nodes' as const }

  const [scanPathCount, setScanPathCount] = useState(0)
  const [gamesDownloadPath, setGamesDownloadPath] = useState('')
  const [isoDownloadPath, setIsoDownloadPath] = useState('')
  const [nodeOrganize, setNodeOrganize] = useState<OverviewOrganize | null>(null)
  const [pathsLoading, setPathsLoading] = useState(true)

  const nodeId = selectedNode?.id ?? null
  const remoteNodeId = isLocalDesktopNodeId(nodeId) ? null : nodeId

  useEffect(() => {
    let cancelled = false

    const loadLocal = async () => {
      const api = getDesktopAPI() ?? (typeof window !== 'undefined' ? (window as any).desktopAPI : null)

      let paths: Array<{ path?: string; type?: string }> = []
      if (api?.getScanPaths) {
        try {
          const raw = await api.getScanPaths()
          if (Array.isArray(raw)) paths = raw
        } catch {
          // fall through to localStorage
        }
      }

      if (paths.length === 0) {
        try {
          const games = JSON.parse(localStorage.getItem('otix:scan-paths') || '[]')
          const isos = JSON.parse(localStorage.getItem('otix:iso-scan-paths') || '[]')
          paths = [
            ...(Array.isArray(games) ? games.map((p: string) => ({ path: p, type: 'game' })) : []),
            ...(Array.isArray(isos) ? isos.map((p: string) => ({ path: p, type: 'iso' })) : []),
          ]
        } catch {
          paths = []
        }
      }

      let downloadPath = ''
      if (api?.getDesktopSettings) {
        try {
          const ds = await api.getDesktopSettings()
          downloadPath = ds?.gamesDownloadPath || ''
        } catch {
          // ignore
        }
      }
      if (!downloadPath) {
        try {
          downloadPath = localStorage.getItem('otix:games-download-dir') || ''
        } catch {
          downloadPath = ''
        }
      }

      if (!cancelled) {
        setScanPathCount(paths.filter((p) => p.path).length)
        setGamesDownloadPath(downloadPath)
        setIsoDownloadPath('')
        setNodeOrganize(null)
        setPathsLoading(false)
      }
    }

    const load = async () => {
      setPathsLoading(true)
      if (remoteNodeId) {
        try {
          const [libRes, desktopRes, organizeRes] = await Promise.all([
            apiClient.get<any>(`/library/servers/${remoteNodeId}/libraries`),
            apiClient.get<any>(`/library/servers/${remoteNodeId}/desktop`),
            apiClient.get<any>(`/library/servers/${remoteNodeId}/organize`),
          ])
          if (cancelled) return
          const rows = Array.isArray(libRes?.data) ? libRes.data : libRes?.data?.libraries || []
          const gamesPath =
            desktopRes?.data?.gamesDownloadPath ||
            desktopRes?.data?.games_download_path ||
            organizeRes?.data?.gamesDownloadPath ||
            organizeRes?.data?.games_download_path ||
            ''
          const isoPath =
            organizeRes?.data?.isoDownloadPath || organizeRes?.data?.iso_download_path || ''
          setScanPathCount(rows.filter((row: { path?: string }) => row?.path).length)
          setGamesDownloadPath(gamesPath)
          setIsoDownloadPath(isoPath)
          setNodeOrganize({
            autoSearchWishlist: Boolean(
              organizeRes?.data?.autoSearchWishlist ?? organizeRes?.data?.auto_search_wishlist,
            ),
            postProcessEnabled:
              organizeRes?.data?.postProcessEnabled ?? organizeRes?.data?.post_process_enabled ?? true,
            autoOrganizeEnabled: Boolean(
              organizeRes?.data?.autoOrganizeEnabled ?? organizeRes?.data?.auto_organize_enabled,
            ),
            preferredRepackers:
              organizeRes?.data?.preferredRepackers ?? organizeRes?.data?.preferred_repackers ?? null,
            isoDownloadPath: isoPath,
          })
          setPathsLoading(false)
          return
        } catch {
          // fall through to this device
        }
      }
      await loadLocal()
    }

    void load()
    return () => {
      cancelled = true
    }
  }, [remoteNodeId])

  const onlineServers = gameServers.filter((s: any) => s.isOnline).length
  const primaryServer = gameServers.find((s: any) => s.isActive)
  const organizeSource: OverviewOrganize | null = nodeOrganize || dlConfig
  const organizeLoading = remoteNodeId ? pathsLoading : configLoading

  const organizeFlags = [
    organizeSource?.autoSearchWishlist && 'Wishlist search',
    organizeSource?.postProcessEnabled && 'Post-process',
    organizeSource?.autoOrganizeEnabled && 'Auto-organize',
  ].filter(Boolean) as string[]
  const isoHint = isoDownloadPath || organizeSource?.isoDownloadPath || dlConfig?.downloadPath

  return (
    <div id="overview" className="space-y-6 scroll-mt-28">
      <SettingsCard className="space-y-3">
        <SectionHeader
          title="Overview"
          description="A quick look at your library, folders, Otix nodes, and automation."
        />
        <p className="text-xs text-muted-foreground leading-relaxed max-w-2xl">
          Jump into matching, or open a node to configure folders, downloaders, and automation for that machine.
        </p>
      </SettingsCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <OverviewNavCard
          title="Library"
          description="Match titles, review candidates, and manage providers."
          icon={Gamepad2}
          onClick={() => onNavigate('catalog')}
        >
          <Metric
            icon={HardDrive}
            label="Items"
            value={stats.loading ? '…' : stats.total}
            hint={stats.loading ? 'Loading catalog' : 'In your library'}
          />
          <Metric
            icon={CheckCircle2}
            label="Matched"
            value={stats.loading ? '…' : stats.matched}
            tone="success"
            hint={
              stats.loading
                ? undefined
                : stats.candidates > 0
                  ? `${stats.candidates} need review`
                  : `${stats.unmatched} unmatched`
            }
          />
          {stats.candidates > 0 && !stats.loading && (
            <Metric
              icon={Sparkles}
              label="Need review"
              value={stats.candidates}
              tone="warn"
              hint="Open Library to resolve"
            />
          )}
        </OverviewNavCard>

        <OverviewNavCard
          title="Paths"
          description="Download destinations and folders Otix scans. Configure them on a node."
          icon={FolderOpen}
          {...nodePage('paths')}
        >
          <Metric
            icon={FolderOpen}
            label="Scan folders"
            value={pathsLoading ? '…' : scanPathCount}
            hint={pathsLoading ? 'Loading' : scanPathCount === 0 ? 'None configured yet' : 'Monitored folders'}
          />
          <Metric
            icon={HardDrive}
            label="Games folder"
            value={
              pathsLoading
                ? '…'
                : gamesDownloadPath
                  ? gamesDownloadPath
                  : desktop
                    ? 'System default'
                    : 'Not set'
            }
            tone={gamesDownloadPath ? 'success' : 'muted'}
            hint={isoHint ? `ISOs: ${isoHint}` : 'ISO destination optional'}
          />
        </OverviewNavCard>

        <OverviewNavCard
          title="Downloads"
          description="Otix nodes and download clients. Open a node to manage its instances."
          icon={Server}
          {...nodePage('paths')}
        >
          <Metric
            icon={Server}
            label="Nodes"
            value={serversLoading ? '…' : gameServers.length}
            hint={
              serversLoading
                ? 'Loading'
                : gameServers.length === 0
                  ? 'None linked'
                  : `${onlineServers} online`
            }
            tone={onlineServers > 0 ? 'success' : gameServers.length > 0 ? 'warn' : 'muted'}
          />
          <Metric
            icon={CheckCircle2}
            label="Primary"
            value={primaryServer?.name || selectedNode?.name || (gameServers.length ? 'Not set' : '—')}
            tone={primaryServer || selectedNode ? 'success' : 'muted'}
            hint={primaryServer ? 'Used for remote downloads' : selectedNode ? selectedNode.name : 'Used for remote downloads'}
          />
        </OverviewNavCard>

        <OverviewNavCard
          title="Organize"
          description="Wishlist scanning, post-processing, and naming on each node."
          icon={Wand2}
          {...nodePage('organize')}
        >
          <Metric
            icon={Wand2}
            label="Automation"
            value={
              organizeLoading
                ? '…'
                : organizeFlags.length > 0
                  ? `${organizeFlags.length} enabled`
                  : 'All off'
            }
            tone={organizeFlags.length > 0 ? 'success' : 'muted'}
            hint={organizeFlags.length > 0 ? organizeFlags.join(' · ') : 'Turn on from Organize'}
          />
          <Metric
            icon={Sparkles}
            label="Naming"
            value={
              organizeLoading
                ? '…'
                : organizeSource?.autoOrganizeEnabled
                  ? 'Auto-organize on'
                  : 'Manual'
            }
            tone={organizeSource?.autoOrganizeEnabled ? 'success' : 'muted'}
            hint={organizeSource?.preferredRepackers ? `Prefer ${organizeSource.preferredRepackers}` : 'Repackers optional'}
          />
        </OverviewNavCard>
      </div>
    </div>
  )
};
