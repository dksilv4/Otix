import { useState, useEffect } from 'react'
import { Loader2, Gamepad2, CheckCircle2, AlertCircle, LogOut, RefreshCw } from 'lucide-react'
import type { PluginAPI } from './PluginSettings'

interface SlotPluginData {
  type: string
  label: string
  status?: Record<string, unknown>
  actions?: Record<string, string>
}

interface SlotEntry {
  pluginId: string
  label: string
  data: SlotPluginData | null
}

interface Props {
  location: string
  pluginApi: PluginAPI
}

export function PluginSlot({ location, pluginApi }: Props) {
  const [slotData, setSlotData] = useState<SlotEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const data = await pluginApi.getSlotData(location)
        if (!cancelled) setSlotData(data || [])
      } catch { /* no plugins for this slot */ }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [location, pluginApi])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-white/50 py-4"><Loader2 className="h-4 w-4 animate-spin" /> Loading...</div>
  }

  if (slotData.length === 0) return null

  return (
    <>
      {slotData.map(entry => {
        if (entry.data?.type === 'scan') {
          return <ScanSlotCard key={entry.pluginId} entry={entry} pluginApi={pluginApi} />
        }
        return null
      })}
    </>
  )
}

function ScanSlotCard({ entry, pluginApi }: { entry: SlotEntry; pluginApi: PluginAPI }) {
  const [status, setStatus] = useState<any>(entry.data?.status || {})
  const [loading, setLoading] = useState(false)

  // Refresh status
  const refreshStatus = async () => {
    if (entry.data?.actions?.status) {
      try {
        const res = await pluginApi.callData(entry.pluginId, entry.data.actions.status) as any
        if (res) setStatus(res)
      } catch {}
    }
  }

  useEffect(() => { refreshStatus() }, [entry.pluginId])

  const handleAction = async (action: string) => {
    if (!entry.data?.actions?.[action]) return
    setLoading(true)
    try {
      const actionMethod = entry.data.actions[action]  // "scan", "auth.login", etc
      const result = await pluginApi.callData(entry.pluginId, actionMethod)

      // Handle login — opens BrowserWindow, returns code
      if (action === 'login' && result?.code) {
        const cbRes = await pluginApi.callData(entry.pluginId, 'auth.handleCallback', result.code)
        if (cbRes?.success) {
          setStatus((prev: any) => ({ ...prev, connected: true, displayName: cbRes.displayName }))
          // Auto-scan after login
          if (entry.data?.actions?.scan) {
            const scanRes = await pluginApi.callData(entry.pluginId, entry.data.actions.scan)
            if (scanRes?.success) {
              setStatus((prev: any) => ({ ...prev, total: scanRes.total }))
            }
          }
        }
      }

      // Handle scan
      if (action === 'scan' && result?.success) {
        setStatus((prev: any) => ({ ...prev, total: result.total }))
        // Save to scanned games DB
        const desktopAPI = (window as any).desktopAPI
        if (desktopAPI?.saveScannedGames && result.games?.length) {
          const toSave = result.games.map((g: any) => ({
            id: 'epic_' + g.namespace + '_' + g.catalogItemId,
            title: g.title, exePath: g.exePath || g.installDir || '',
            installDir: g.installDir || '', platform: 'epic' as const,
            posterUrl: g.posterUrl || undefined, iconUrl: g.logoUrl || undefined,
            sources: [{ source: 'epic', appName: g.appName, namespace: g.namespace, catalogItemId: g.catalogItemId, developer: g.developer, contentType: g.contentType }],
          }))
          await desktopAPI.saveScannedGames(toSave)
          // Batch match
          try {
            const token = localStorage.getItem('otix-access-token')
            const apiBase = (window as any).desktopAPI?.getApiBaseUrl?.() || 'http://127.0.0.1:8000/api'
            const matchRes = await fetch(apiBase + '/media/match/batch', {
              method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
              body: JSON.stringify({ games: result.games.map((g: any) => ({ title: g.title, developer: g.developer || null, external_ids: [{ source: 'epic', id: g.appName || g.catalogItemId }], media_type: 'game' })) }),
            })
            if (matchRes.ok) {
              const matchData = await matchRes.json()
              const matches = matchData.matches || []
              for (let i = 0; i < Math.min(result.games.length, matches.length); i++) {
                const m = matches[i]
                if (m?.confidence > 0 && m?.media_item_id) {
                  await desktopAPI.acceptSuggestion('epic_' + result.games[i].namespace + '_' + result.games[i].catalogItemId, { id: m.media_item_id, title: m.title, slug: m.media_item_id || '' })
                }
              }
            }
          } catch {}
        }
      }
    } catch (err) {
      console.error('[PluginSlot] action failed:', action, err)
    } finally {
      setLoading(false)
    }
  }

  const connected = status?.authenticated || status?.connected

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <Gamepad2 className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white">{entry.data?.label || entry.label}</p>
            <span className={'inline-flex items-center gap-1 text-[0.625rem] rounded-full px-1.5 py-0.5 ' + (connected ? 'text-green-400 bg-green-500/10' : 'text-white/40 bg-white/5')}>
              <span className={"h-1.5 w-1.5 rounded-full " + (connected ? 'bg-green-500' : 'bg-white/20')} />
              {connected ? 'Connected' : 'Not connected'}
            </span>
          </div>
          {connected && status?.total != null && (
            <p className="text-xs text-white/40 mt-0.5">{status.total} items</p>
          )}
          {connected && status?.displayName && (
            <p className="text-xs text-white/40 mt-0.5">{status.displayName}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {connected ? (
            <>
              <button onClick={() => handleAction('scan')} disabled={loading}
                className="inline-flex items-center gap-1.5 h-7 rounded-lg px-2.5 text-[0.625rem] font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50">
                {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                Scan
              </button>
              {entry.data?.actions?.logout && (
                <button onClick={() => handleAction('logout')} disabled={loading}
                  className="inline-flex items-center justify-center h-7 w-7 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50">
                  <LogOut className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          ) : (
            entry.data?.actions?.login && (
              <button onClick={() => handleAction('login')} disabled={loading}
                className="inline-flex items-center gap-1.5 h-7 rounded-lg px-3 text-[0.625rem] font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50">
                Sign In
              </button>
            )
          )}
        </div>
      </div>
    </div>
  )
}
