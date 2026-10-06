import { useEffect, useState, useRef, useCallback } from 'react'
import {
  RefreshCw, Download, Info, AlertTriangle, XCircle, CheckCircle2,
} from 'lucide-react'
import { ActivityModuleSection } from './activity-module-section'

// ── Types ──────────────────────────────────────────────────────────────

interface PluginActivityItem {
  id: string
  type: 'scan' | 'download' | 'sync' | 'info' | 'warning' | 'error' | 'notification'
  title: string
  subtitle?: string
  progress?: number
  status?: 'active' | 'completed' | 'error' | 'pending'
  icon?: string
  timestamp?: number
  action?: {
    label: string
    method: string
  }
}

interface ActivityPollResult {
  activities: PluginActivityItem[]
  label?: string
}

interface ActivitySlotEntry {
  pluginId: string
  label: string
}

interface ActivityStoreEntry {
  pluginId: string
  label: string
  activities: PluginActivityItem[]
}

// ── Poll interval ──────────────────────────────────────────────────────

const SLOW_POLL = 15_000  // idle: 15 seconds
const FAST_POLL = 2_000   // active scan: 2 seconds

// ── Icon mapping ───────────────────────────────────────────────────────

const TYPE_ICON: Record<string, typeof RefreshCw> = {
  scan: RefreshCw,
  download: Download,
  sync: RefreshCw,
  info: Info,
  warning: AlertTriangle,
  error: XCircle,
  notification: Info,
}

const STATUS_COLOR: Record<string, string> = {
  active: 'text-blue-400',
  completed: 'text-emerald-400',
  error: 'text-rose-400',
  pending: 'text-white/30',
}

// ── Component ──────────────────────────────────────────────────────────

export const ActivityModulePlugins = () => {
  const [activities, setActivities] = useState<Record<string, PluginActivityItem[]>>({})
  const [labels, setLabels] = useState<Record<string, string>>({})
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const api = (window as any).desktopAPI

  const poll = useCallback(async () => {
    if (!api?.plugin?.callData) return

    const nextActivities: Record<string, PluginActivityItem[]> = {}
    const nextLabels: Record<string, string> = {}

    // Framework store — plugins publishing via ctx.activity. Authoritative.
    try {
      const storeEntries: ActivityStoreEntry[] = (await api.plugin.getActivity?.()) || []
      for (const entry of storeEntries) {
        if (!entry?.activities?.length) continue
        nextActivities[entry.pluginId] = entry.activities
        nextLabels[entry.pluginId] = entry.label || entry.pluginId
      }
    } catch {
      // Framework store unavailable — fall through to activity.poll polling
    }

    // Legacy activity.poll polling for slot plugins not publishing to the store.
    const storeIds = new Set(Object.keys(nextActivities))
    const currentSlots: ActivitySlotEntry[] =
      await api.plugin.getSlotData?.('activity:panel') || []
    for (const slot of currentSlots) {
      if (storeIds.has(slot.pluginId)) continue
      try {
        const result: ActivityPollResult | null =
          await api.plugin.callData(slot.pluginId, 'activity.poll')
        if (result) {
          nextActivities[slot.pluginId] = result.activities || []
          nextLabels[slot.pluginId] = result.label || slot.label
        }
      } catch {
        // Plugin may not implement activity.poll yet — skip silently
      }
    }

    setActivities(nextActivities)
    setLabels(nextLabels)
  }, [api])

  // Dynamic polling: fast during active scans, slow when idle
  const hasActive = Object.values(activities).some(items =>
    items.some(item => item.status === 'active')
  )
  const pollInterval = hasActive ? FAST_POLL : SLOW_POLL

  // Initial load + periodic poll
  useEffect(() => {
    if (!api?.plugin) return
    poll()
    if (timerRef.current) clearInterval(timerRef.current)
    timerRef.current = setInterval(poll, pollInterval)
    return () => {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [api, poll, pollInterval])

  const allActivities = Object.entries(activities)
  const totalCount = allActivities.reduce((sum, [, items]) => sum + items.length, 0)

  if (totalCount === 0) return null

  return (
    <>
      {allActivities.map(([pluginId, items]) => {
        if (items.length === 0) return null
        const label = labels[pluginId] || pluginId
        return (
          <ActivityModuleSection key={pluginId} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <RefreshCw className="h-3.5 w-3.5 text-white/40" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-white/50">
                {label}
              </span>
            </div>

            <div className="space-y-2">
              {items.map((item) => {
                const IconComp = TYPE_ICON[item.type] || Info
                const statusColor = item.status ? STATUS_COLOR[item.status] : 'text-white/40'
                const isActive = item.status === 'active'

                return (
                  <div key={item.id} className="flex items-start gap-2.5">
                    <div className={`shrink-0 mt-0.5 ${statusColor}`}>
                      {isActive ? (
                        <IconComp className="h-3.5 w-3.5 animate-spin" />
                      ) : item.status === 'completed' ? (
                        <CheckCircle2 className="h-3.5 w-3.5" />
                      ) : (
                        <IconComp className="h-3.5 w-3.5" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-white/80 truncate">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="text-[10px] text-white/40 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      )}
                      {/* Progress bar */}
                      {item.progress !== undefined && (
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1 rounded-full bg-white/[0.06] overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-blue-500 to-indigo-500"
                              style={{ width: `${Math.min(item.progress, 100)}%` }}
                            />
                          </div>
                          <span className="text-[9px] text-white/30 tabular-nums font-medium">{item.progress}%</span>
                        </div>
                      )}
                    </div>

                    {/* Action button */}
                    {item.action && (
                      <button
                        onClick={() => api?.plugin?.callData(pluginId, item.action!.method, item.id)}
                        className="shrink-0 text-[10px] px-2 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white/50 hover:text-white/70 transition-colors font-medium"
                      >
                        {item.action.label}
                      </button>
                    )}

                    {/* Timestamp */}
                    {item.timestamp && (
                      <span className="text-[9px] text-white/20 shrink-0 mt-0.5 tabular-nums">
                        {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          </ActivityModuleSection>
        )
      })}
    </>
  )
};
