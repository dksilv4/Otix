import { useState, useEffect } from 'react'
import { Loader2, Film, List, Download, ChevronDown, CheckCircle2, XCircle, Clock, ArchiveX } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ListsTabContent } from '@/old-features/library/molecules/lists-tab-content'
import { isDesktop } from '@/lib/desktop/api'

type Tab = { id: string; label: string; icon: React.ComponentType<{ className?: string }> }

const TABS: Tab[] = [
  { id: 'lists', label: 'My Lists', icon: List },
  { id: 'radarr', label: 'Radarr', icon: Film },
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

export function LibraryPage() {
  const [activeTab, setActiveTab] = useState('lists')

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-white mb-6">Library</h1>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-6 p-1 rounded-xl bg-white/5 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === tab.id
                ? 'bg-white/10 text-white'
                : 'text-white/40 hover:text-white/70',
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
      {activeTab === 'downloads' && <DownloadsTab />}
    </div>
  )
}

function ListsTab() {
  return (
    <div>
      <ListsTabContent />
    </div>
  )
}

// ── Radarr tab (slot-driven from plugin) ──

interface Movie {
  id: number
  title: string
  year?: number
  images?: Array<{ coverType: string; remoteUrl: string }>
}

interface RadarrLibrary {
  name: string
  url: string
  count: number
  movies?: Movie[]
  error?: string
}

function RadarrTab() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [libraries, setLibraries] = useState<RadarrLibrary[]>([])
  const [expandedInstance, setExpandedInstance] = useState<string | null>(null)

  async function loadLibraries() {
    setLoading(true)
    setError(null)
    try {
      const api = (window as any).desktopAPI?.plugin
      if (!api?.callData) {
        setError('Radarr libraries are only available in the desktop app.')
        setLoading(false)
        return
      }
      const data = await api.callData('otix-radarr', 'getAllLibraries') as RadarrLibrary[]
      setLibraries(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Radarr libraries')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadLibraries() }, [])

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-white/40">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading Radarr libraries...
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6 rounded-2xl bg-red-500/5 border border-red-500/10 text-center">
        <p className="text-red-400 text-sm mb-3">{error}</p>
        <button onClick={loadLibraries} className="text-sm text-white/60 hover:text-white">Retry</button>
      </div>
    )
  }

  if (libraries.length === 0) {
    return (
      <div className="p-12 rounded-2xl bg-white/5 border border-white/5 text-center">
        <Film className="h-10 w-10 text-white/10 mx-auto mb-3" />
        <h3 className="text-white/60 font-medium mb-1">No Radarr instances configured</h3>
        <p className="text-white/30 text-sm">Configure a Radarr plugin instance to see your movie library here.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {libraries.map((lib, idx) => (
        <div key={idx} className="rounded-2xl overflow-hidden" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
          <button
            onClick={() => setExpandedInstance(expandedInstance === lib.name ? null : lib.name)}
            className="w-full flex items-center justify-between p-4 hover:bg-white/[0.02] transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
                <Film className="h-5 w-5" style={{ color: 'var(--primary)' }} />
              </div>
              <div className="text-left">
                <h3 className="text-sm font-medium text-white">{lib.name}</h3>
                <p className="text-xs text-white/30">{lib.url} &middot; {lib.count} movies</p>
              </div>
            </div>
            {lib.error && <span className="text-xs text-red-400">{lib.error}</span>}
            <ChevronDown className={cn('h-4 w-4 text-white/30 transition-transform', expandedInstance === lib.name && 'rotate-180')} />
          </button>

          {expandedInstance === lib.name && !lib.error && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {lib.movies?.map((movie) => (
                  <div key={movie.id} className="rounded-xl overflow-hidden bg-white/5 hover:bg-white/10 transition-colors">
                    {movie.images?.[0]?.remoteUrl ? (
                      <img src={movie.images[0].remoteUrl} alt={movie.title} className="w-full aspect-[2/3] object-cover" loading="lazy" />
                    ) : (
                      <div className="w-full aspect-[2/3] flex items-center justify-center bg-white/5">
                        <Film className="h-8 w-8 text-white/10" />
                      </div>
                    )}
                    <div className="p-2">
                      <p className="text-xs text-white/80 font-medium truncate">{movie.title}</p>
                      {movie.year && <p className="text-[0.625rem] text-white/30">{movie.year}</p>}
                    </div>
                  </div>
                ))}
              </div>
              {(!lib.movies || lib.movies.length === 0) && (
                <p className="text-sm text-white/30 text-center py-8">No movies in this library.</p>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

// ── Downloads tab (slot-driven from plugin) ──

function formatBytes(bytes: number): string {
  if (!bytes) return ''
  const gb = bytes / 1073741824
  return gb.toFixed(1) + ' GB'
}

function DownloadsTab() {
  const [loading, setLoading] = useState(true)
  const [downloads, setDownloads] = useState<DownloadItem[]>([])
  const desktop = isDesktop()

  async function loadDownloads() {
    setLoading(true)
    try {
      const api = (window as any).desktopAPI?.plugin
      if (!api?.callData) {
        setLoading(false)
        return
      }
      const data = await api.callData('downloads', 'get-downloads') as DownloadItem[]
      setDownloads(data || [])
    } catch {
      setDownloads([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (desktop) loadDownloads() }, [desktop])

  if (!desktop) {
    return (
      <div className="p-12 rounded-2xl bg-white/5 border border-white/5 text-center">
        <Download className="h-10 w-10 text-white/10 mx-auto mb-3" />
        <p className="text-white/30 text-sm">Downloads are only available in the desktop app.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center gap-3 text-white/40">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading downloads...
      </div>
    )
  }

  if (downloads.length === 0) {
    return (
      <div className="p-12 rounded-2xl bg-white/5 border border-white/5 text-center">
        <Download className="h-10 w-10 text-white/10 mx-auto mb-3" />
        <h3 className="text-white/60 font-medium mb-1">No downloads yet</h3>
        <p className="text-white/30 text-sm">Your downloaded games will appear here.</p>
      </div>
    )
  }

  return (
    <div className="grid gap-3">
      {downloads.map((dl) => (
        <div key={dl.id} className="flex items-center gap-4 p-4 rounded-2xl" style={{ backgroundColor: 'var(--dk-surface-base)' }}>
          {/* Status icon */}
          <div className="shrink-0">
            {dl.status === 'downloading' ? (
              <Loader2 className="h-5 w-5 animate-spin text-blue-400" />
            ) : dl.status === 'completed' ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : dl.status === 'failed' ? (
              <XCircle className="h-5 w-5 text-rose-400" />
            ) : dl.status === 'deleted' ? (
              <ArchiveX className="h-5 w-5 text-white/30" />
            ) : (
              <Clock className="h-5 w-5 text-amber-400" />
            )}
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-white truncate">
              {dl.mediaItemTitle || dl.nzbName || 'Unknown'}
            </p>
            <p className="text-xs text-white/40 mt-0.5">
              {dl.status}
              {dl.nzbSize != null && ` · ${formatBytes(dl.nzbSize)}`}
              {dl.percentage != null && dl.status === 'downloading' && ` · ${dl.percentage}%`}
            </p>
            {dl.status === 'failed' && dl.errorMessage && (
              <p className="text-xs text-rose-400/80 mt-1">{dl.errorMessage}</p>
            )}
          </div>

          {/* Progress bar for active */}
          {(dl.status === 'downloading' || dl.status === 'processing') && dl.percentage != null && (
            <div className="w-24">
              <div className="h-1.5 rounded-full overflow-hidden bg-white/[0.06]">
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
}
