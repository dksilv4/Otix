import { useEffect, useState, useCallback } from 'react'
import { Shuffle, Loader2, RefreshCw, Gamepad2 } from 'lucide-react'
import { GameMatchingSection } from './settings-game-matching'
import { PluginSlot } from '../components/organisms/settings-plugin-slot'
import { getPluginAPI } from '../components/organisms/settings-plugin-settings'

// ── MatchingScanSection types ────────────────────────────────────────────

interface ScanPlugin {
  pluginId: string
  label: string
  data: {
    type: string
    platform: string
    label: string
    description?: string
  }
}

interface ScanStatus {
  connected: boolean
  label?: string
  lastScanAt?: number
  lastScanTotal?: number
}

interface ScanProgress {
  pluginId: string
  queryId: string
  status: string
  queryTitle?: string
}

// ── MatchingScanSection ─────────────────────────────────────────────────

export function MatchingScanSection() {
  const [plugins, setPlugins] = useState<ScanPlugin[]>([])
  const [statuses, setStatuses] = useState<Record<string, ScanStatus>>({})
  const [progress, setProgress] = useState<Record<string, ScanProgress>>({})
  const [scanning, setScanning] = useState<Record<string, boolean>>({})
  const api = window.desktopAPI

  // Load matching:scan slot plugins
  useEffect(() => {
    api?.plugin?.getSlotData?.('matching:scan').then((slots: ScanPlugin[]) => {
      setPlugins(slots || [])
    })
  }, [api])

  // Subscribe to per-game progress events
  useEffect(() => {
    if (!api?.onMatchingProgress) return
    const unsub = api.onMatchingProgress((event: ScanProgress) => {
      setProgress(prev => ({ ...prev, [event.queryId]: event }))
    })
    return () => unsub?.()
  }, [api])

  // Subscribe to scan completion — clear progress indicators
  useEffect(() => {
    if (!api?.onMatchingComplete) return
    const unsub = api.onMatchingComplete(() => {
      setProgress({})
    })
    return () => unsub?.()
  }, [api])

  const handleScan = useCallback(async (pluginId: string) => {
    setScanning(prev => ({ ...prev, [pluginId]: true }))
    try {
      await api?.scanPlugin?.(pluginId)
    } finally {
      setScanning(prev => ({ ...prev, [pluginId]: false }))
    }
  }, [api])

  // Fetch plugin statuses
  useEffect(() => {
    for (const p of plugins) {
      api?.plugin?.getStatus?.(p.pluginId).then((s: Record<string, unknown> | null) => {
        if (s) setStatuses(prev => ({ ...prev, [p.pluginId]: s }))
      })
    }
  }, [api, plugins])

  if (!api?.plugin) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <Gamepad2 className="h-10 w-10 text-muted-foreground/40" />
        <p className="text-sm font-medium text-foreground">Desktop Only</p>
        <p className="text-xs text-muted-foreground mt-1">Game library scanning is only available in the desktop app.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-foreground">Game Libraries</h3>

      {plugins.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No game library plugins installed. Install plugins from the Plugin Store.
        </p>
      )}

      {plugins.map((plugin) => {
        const status = statuses[plugin.pluginId]
        const isScanning = scanning[plugin.pluginId]

        return (
          <div key={plugin.pluginId} className="border rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-medium text-foreground">{plugin.label}</h4>
                <p className="text-sm text-muted-foreground">
                  {status?.connected
                    ? `Connected as ${status.label || status.connected}`
                    : 'Not connected'}
                </p>
                {status?.lastScanAt && (
                  <p className="text-xs text-muted-foreground">
                    Last scan: {new Date(status.lastScanAt).toLocaleDateString()}
                    {status.lastScanTotal != null && ` — ${status.lastScanTotal} games`}
                  </p>
                )}
              </div>
              <button
                onClick={() => handleScan(plugin.pluginId)}
                disabled={isScanning || !status?.connected}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50 text-sm font-medium"
              >
                {isScanning ? (
                  <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Scanning...</span>
                ) : (
                  <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4" /> Scan Library</span>
                )}
              </button>
            </div>
          </div>
        )
      })}

      {/* In-progress match events */}
      {Object.entries(progress).length > 0 && (
        <div className="mt-4">
          <h4 className="font-medium text-foreground mb-2">Match Progress</h4>
          <div className="space-y-1 max-h-40 overflow-y-auto text-sm">
            {Object.entries(progress).map(([queryId, event]) => (
              <div key={queryId} className="flex items-center gap-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${
                  event.status === 'matched' ? 'bg-green-500' :
                  event.status === 'candidates' ? 'bg-yellow-500' :
                  event.status === 'failed' ? 'bg-red-500' : 'bg-blue-500 animate-pulse'
                }`} />
                <span className="text-foreground">{event.queryTitle || queryId}</span>
                <span className="text-xs text-muted-foreground ml-auto">{event.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ── MatchingSection (page-level composition) ────────────────────────────

export function MatchingSection() {
  return (
    <div className="space-y-6 min-h-full">
      <div className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)', color: 'var(--primary)' }}>
          <Shuffle className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Game Matching</h2>
          <p className="text-sm text-white/50 mt-0.5">
            Match scanned games to the Otix catalog
          </p>
        </div>
      </div>

      <PluginSlot location="matching:scan" pluginApi={getPluginAPI()!} />

      <GameMatchingSection />
    </div>
  )
}
