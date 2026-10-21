import { useState, useEffect, useCallback } from 'react'
import { Loader2, Film, List, Download, ChevronDown, CheckCircle2, XCircle, Clock, ArchiveX, Tv, Music } from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import { ListsTabContent } from '@library/molecules/lists-tab-content'
import { isDesktop } from '@/lib/desktop/api'
import { useGameServers } from '@/features/downloads/use-server-downloads'
import { apiClient } from '@/lib/api/client'

type Tab = { id: string; label: string; icon: React.ComponentType<{ className?: string }> }

const TABS: Tab[] = [
  { id: 'lists', label: 'My Lists', icon: List },
  { id: 'radarr', label: 'Radarr', icon: Film },
  { id: 'sonarr', label: 'Sonarr', icon: Tv },
  { id: 'lidarr', label: 'Lidarr', icon: Music },
  { id: 'downloads', label: 'Downloads', icon: Download },
]

interface DownloadItem {
  id: string
  mediaItemTitle: string | null
  nzbName: string | null
  nzbSize: number | null
  status: string
  percentage: number | null
  errorMessage: string | null
  completedAt: string | null
  createdAt: string
}

export const LibraryPage = () => {
  const [activeTab, setActiveTab] = useState('lists')

  return (
    <div id="library-page" className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">Library</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground font-semibold shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
            )}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'lists' && <ListsTab />}
      {activeTab === 'radarr' && <RadarrTab />}
      {activeTab === 'sonarr' && <SonarrTab />}
      {activeTab === 'lidarr' && <LidarrTab />}
      {activeTab === 'downloads' && <DownloadsTab />}
    </div>
  )
};

const ListsTab = () => {
  return (
    <div>
      <ListsTabContent />
    </div>
  )
};

// ── Arr tab helper (shares logic between Radarr, Sonarr, Lidarr) ──

interface ArrItem {
  id: number
  title: string
  year?: number
  images?: Array<{ coverType: string; remoteUrl: string }>
}

interface ArrLibrary {
  name: string
  url: string
  count: number
  movies?: ArrItem[]
  series?: ArrItem[]
  albums?: ArrItem[]
  items?: ArrItem[]
  error?: string
}

const ArrTab = ({
  pluginId,
  label,
  icon: Icon,
}: {
  pluginId: string
  label: string
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>
}) => {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraries, setLibraries] = useState<ArrLibrary[]>([])
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null)
  const { data: servers = [] } = useGameServers()
  const activeServer = servers[0]

  const loadLibraries = useCallback(async () => {
    try {
      const api = (window as Window & {
        desktopAPI?: {
          plugin?: {
            callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      }).desktopAPI?.plugin

      if (api?.callData) {
        const data = await api.callData(pluginId, 'getAllLibraries') as ArrLibrary[]
        setLibraries(data)
        return
      }

      if (activeServer) {
        if (pluginId.includes('radarr')) {
          const { data } = await apiClient.get<Array<{
            id: number
            title: string
            year?: number
            images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>
          }>>(`/library/servers/${activeServer.id}/radarr/movies`)
          const movies = data || []
          setLibraries([
            {
              name: `${activeServer.name} (Radarr)`,
              url: activeServer.primaryUrl || '',
              count: movies.length,
              movies: movies.map((m) => ({
                id: m.id,
                title: m.title,
                year: m.year,
                images: m.images?.map((img) => ({
                  coverType: img.coverType || 'poster',
                  remoteUrl: img.remoteUrl || img.url || '',
                })),
              })),
            },
          ])
          return
        }

        if (pluginId.includes('sonarr')) {
          const { data } = await apiClient.get<Array<{
            id: number
            title: string
            year?: number
            images?: Array<{ coverType?: string; remoteUrl?: string; url?: string }>
          }>>(`/library/servers/${activeServer.id}/sonarr/series`)
          const series = data || []
          setLibraries([
            {
              name: `${activeServer.name} (Sonarr)`,
              url: activeServer.primaryUrl || '',
              count: series.length,
              series: series.map((s) => ({
                id: s.id,
                title: s.title,
                year: s.year,
                images: s.images?.map((img) => ({
                  coverType: img.coverType || 'poster',
                  remoteUrl: img.remoteUrl || img.url || '',
                })),
              })),
            },
          ])
          return
        }
      }

      setError(`Configure ${label} on your connected Otix Server or desktop plugin to view library.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to load ${label} libraries`)
    } finally {
      setLoading(false)
    }
  }, [pluginId, label, activeServer])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadLibraries()
    })
  }, [loadLibraries])

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading {label} libraries...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-destructive/10 border border-destructive/20 text-center">
        <p className="text-destructive text-sm mb-3">{error}</p>
        <button onClick={loadLibraries} className="text-sm text-muted-foreground hover:text-foreground transition-colors">Retry</button>
      </div>
    )
  }

  if (libraries.length === 0) {
    return (
      <div className="p-12 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
        <Icon className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-foreground font-medium mb-1">No {label} instances configured</h3>
        <p className="text-muted-foreground text-sm">Configure a {label} plugin instance to see your library here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {libraries.map((lib, idx) => {
        const items = lib.movies || lib.series || lib.albums || lib.items || []
        return (
          <div key={idx} className="rounded-2xl overflow-hidden border border-[var(--dk-separator)]" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
            <button
              onClick={() => setExpandedInstance(expandedInstance === lib.name ? null : lib.name)}
              className="w-full flex items-center justify-between p-4 hover:bg-[var(--dk-surface-ghost-hover)] transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="text-left">
                  <h3 className="text-sm font-medium text-foreground">{lib.name}</h3>
                  <p className="text-xs text-muted-foreground">{lib.url} &middot; {lib.count} items</p>
                </div>
              </div>
              {lib.error && <span className="text-xs text-destructive">{lib.error}</span>}
              <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', expandedInstance === lib.name && 'rotate-180')} />
            </button>

            {expandedInstance === lib.name && !lib.error && (
              <div className="px-4 pb-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {items.map((item) => (
                    <div key={item.id} className="rounded-xl overflow-hidden bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors border border-[var(--dk-separator)]">
                      {item.images?.[0]?.remoteUrl ? (
                        <img src={item.images[0].remoteUrl} alt={item.title} className="w-full aspect-[2/3] object-cover" loading="lazy" />
                      ) : (
                        <div className="w-full aspect-[2/3] flex items-center justify-center bg-[var(--dk-surface-ghost)]">
                          <Icon className="h-8 w-8 text-muted-foreground/30" />
                        </div>
                      )}
                      <div className="p-2">
                        <p className="text-xs text-foreground font-medium truncate">{item.title}</p>
                        {item.year && <p className="text-[0.625rem] text-muted-foreground">{item.year}</p>}
                      </div>
                    </div>
                  ))}
                </div>
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No items in this library.</p>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
};

const RadarrTab = () => {
  return <ArrTab pluginId="otix-radarr" label="Radarr" icon={Film} />
};

const SonarrTab = () => {
  return <ArrTab pluginId="otix-sonarr" label="Sonarr" icon={Tv} />
};

const LidarrTab = () => {
  return <ArrTab pluginId="otix-lidarr" label="Lidarr" icon={Music} />
};

// ── Downloads tab (slot-driven from plugin) ──

const DownloadsTab = () => {
  const [loading, setLoading] = useState(true)
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const desktop = isDesktop()

  const loadDownloads = useCallback(async () => {
    try {
      const api = (window as Window & {
        desktopAPI?: {
          plugin?: {
            callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
          }
        }
      }).desktopAPI?.plugin

      if (!api?.callData) {
        Promise.resolve().then(() => {
          setLoading(false)
        })
        return
      }
      const data = await api.callData('downloads', 'get-downloads') as DownloadItem[]
      setDownloads(data || [])
    } catch {
      setDownloads([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (desktop) {
      Promise.resolve().then(() => {
        loadDownloads()
      })
    }
  }, [desktop, loadDownloads])

  if (!desktop) {
    return (
      <div className="p-12 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
        <Download className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-muted-foreground text-sm">Downloads are only available in the desktop app.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading downloads...
      </div>
    )
  }

  if (downloads.length === 0) {
    return (
      <div className="p-12 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-center">
        <Download className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
        <h3 className="text-foreground font-medium mb-1">No downloads yet</h3>
        <p className="text-muted-foreground text-sm">Your downloaded games will appear here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {downloads.map((dl) => (
        <div key={dl.id} className="flex items-center gap-4 p-4 rounded-2xl border border-[var(--dk-separator)]" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
          {/* Status icon */}
          <div className="shrink-0">
            {dl.status === 'downloading' ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            ) : dl.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : dl.status === 'failed' ? (
              <XCircle className="h-5 w-5 text-rose-400" />
            ) : dl.status === 'deleted' ? (
              <ArchiveX className="h-5 w-5 text-muted-foreground" />
            ) : (
              <Clock className="h-5 w-5 text-amber-400" />
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground truncate">
              {dl.mediaItemTitle || dl.nzbName || 'Unknown'}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {dl.status}
              {dl.nzbSize != null && ` · ${formatBytes(dl.nzbSize)}`}
              {dl.percentage != null && dl.status === 'downloading' && ` · ${dl.percentage}%`}
            </p>
            {dl.status === 'failed' && dl.errorMessage && (
              <p className="text-xs text-destructive mt-1">{dl.errorMessage}</p>
            )}
          </div>

          {/* Progress bar for active */}
          {(dl.status === 'downloading' || dl.status === 'processing') && dl.percentage != null && (
            <div className="w-24">
              <div className="h-1.5 rounded-full overflow-hidden bg-[var(--dk-surface-ghost)]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${Math.min(dl.percentage, 100)}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
};
