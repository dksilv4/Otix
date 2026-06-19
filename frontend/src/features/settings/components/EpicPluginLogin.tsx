import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, AlertCircle, LogOut, RefreshCw, Gamepad2 } from 'lucide-react'
import type { PluginAPI } from './PluginSettings'

interface Props {
  pluginId: string
  api: PluginAPI
}

type AuthState =
  | { status: 'loading' }
  | { status: 'disconnected' }
  | { status: 'connected'; displayName: string; expiresAt?: string }
  | { status: 'error'; message: string }

const API_BASE = (window as any).desktopAPI?.getApiBaseUrl?.() || 'http://127.0.0.1:8000/api'

export function EpicPluginLogin({ pluginId, api }: Props) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ total?: number; matched?: number } | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

  const checkStatus = useCallback(async () => {
    try {
      const res = await api.callData(pluginId, 'auth.status') as any
      if (res?.authenticated) {
        setAuth({ status: 'connected', displayName: res.displayName || 'Connected', expiresAt: res.expiresAt })
      } else {
        setAuth({ status: 'disconnected' })
      }
    } catch {
      setAuth({ status: 'disconnected' })
    }
  }, [api, pluginId])

  useEffect(() => { checkStatus() }, [checkStatus])

  async function matchAndSave(games: any[]) {
    const desktopAPI = (window as any).desktopAPI
    if (!desktopAPI?.saveScannedGames) return 0

    // Build batch match request
    const batchGames = games.map((g: any) => ({
      title: g.title,
      developer: g.developer || null,
      external_ids: [{ source: 'epic', id: g.appName || g.catalogItemId }],
      media_type: 'game',
    }))

    let matches: any[] = []
    try {
      const token = localStorage.getItem('otix-access-token')
      const res = await fetch(`${API_BASE}/media/match/batch`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: 'Bearer ' + token } : {}),
        },
        body: JSON.stringify({ games: batchGames }),
      })
      if (res.ok) {
        const data = await res.json()
        matches = data.matches || []
      }
    } catch (err) {
      console.error('[EpicPlugin] batch match failed:', err)
    }

    // Save to scanned games DB
    const toSave = []
    for (let i = 0; i < games.length; i++) {
      const g = games[i]
      const match = matches[i]
      const id = `epic_${g.namespace}_${g.catalogItemId}`
      toSave.push({
        id,
        title: g.title,
        exePath: g.exePath || g.installDir || '',
        installDir: g.installDir || '',
        platform: 'epic' as const,
        posterUrl: g.posterUrl || undefined,
        iconUrl: g.logoUrl || undefined,
        sources: [{
          source: 'epic',
          appName: g.appName,
          namespace: g.namespace,
          catalogItemId: g.catalogItemId,
          developer: g.developer,
          contentType: g.contentType,
          platforms: g.platforms,
        }],
      })
    }
    await desktopAPI.saveScannedGames(toSave)

    // Accept suggestions for matched games
    let matched = 0
    for (let i = 0; i < games.length; i++) {
      const match = matches[i]
      if (match && match.confidence > 0 && match.media_item_id) {
        const gameId = `epic_${games[i].namespace}_${games[i].catalogItemId}`
        await desktopAPI.acceptSuggestion(gameId, {
          id: match.media_item_id,
          title: match.title,
          slug: match.media_item_id || '',
        })
        matched++
      }
    }

    return matched
  }

  const handleLogin = async () => {
    setLoggingIn(true)
    try {
      const res = await api.callData(pluginId, 'auth.login') as any
      if (res?.code) {
        const cbRes = await api.callData(pluginId, 'auth.handleCallback', res.code) as any
        if (cbRes?.success) {
          setAuth({ status: 'connected', displayName: cbRes.displayName || 'Connected' })
          if (cbRes.scanResult?.games) {
            setScanResult({ total: cbRes.scanResult.total })
            const matched = await matchAndSave(cbRes.scanResult.games)
            setScanResult({ total: cbRes.scanResult.total, matched })
          }
        } else {
          setAuth({ status: 'error', message: cbRes?.error || 'Authorization failed' })
        }
      } else if (res?.error) {
        setAuth({ status: 'error', message: res.error })
      }
    } catch (err) {
      setAuth({ status: 'error', message: err instanceof Error ? err.message : 'Login failed' })
    } finally {
      setLoggingIn(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await api.callData(pluginId, 'scan') as any
      if (res?.success) {
        setScanResult({ total: res.total })
        const matched = await matchAndSave(res.games)
        setScanResult({ total: res.total, matched })
      }
    } catch (err) {
      setAuth({ status: 'error', message: err instanceof Error ? err.message : 'Scan failed' })
    } finally {
      setScanning(false)
    }
  }

  const handleLogout = async () => {
    setLoggingOut(true)
    try {
      await api.callData(pluginId, 'auth.logout')
      setAuth({ status: 'disconnected' })
      setScanResult(null)
    } catch {
      // ignore
    } finally {
      setLoggingOut(false)
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ backgroundColor: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)' }}>
          <Gamepad2 className="h-4 w-4" style={{ color: 'var(--primary)' }} />
        </div>

        {auth.status === 'loading' && (
          <div className="flex items-center gap-2 text-sm text-white/50">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Checking Epic connection...
          </div>
        )}

        {auth.status === 'disconnected' && (
          <>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white">Epic Games</p>
              <p className="text-xs text-white/40">Sign in to sync your game library</p>
            </div>
            <button
              onClick={handleLogin}
              disabled={loggingIn}
              className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-primary/15 text-primary hover:bg-primary/25 transition-colors disabled:opacity-50 shrink-0"
            >
              {loggingIn ? <Loader2 className="h-3 w-3 animate-spin" /> : <Gamepad2 className="h-3 w-3" />}
              {loggingIn ? 'Opening...' : 'Sign In'}
            </button>
          </>
        )}

        {auth.status === 'connected' && (
          <>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{auth.displayName}</p>
                <span className="inline-flex items-center gap-1 text-[0.625rem] text-green-400 bg-green-500/10 rounded-full px-1.5 py-0.5">
                  <CheckCircle2 className="h-2.5 w-2.5" /> Connected
                </span>
              </div>
              {scanResult && (
                <p className="text-xs text-white/40 mt-0.5">
                  {scanResult.total} items &middot; {scanResult.matched != null ? `${scanResult.matched} matched` : 'synced'}
                  {scanning ? '' : ' — '}
                  {!scanning && <button onClick={handleScan} className="text-primary/80 hover:text-primary">re-scan</button>}
                </p>
              )}
              {scanning && (
                <p className="text-xs text-white/40 mt-0.5">
                  <span className="inline-flex items-center gap-1">
                    <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    Scanning & matching...
                  </span>
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleScan}
                disabled={scanning}
                className="inline-flex items-center gap-1.5 h-8 rounded-lg px-3 text-xs font-medium bg-white/5 text-white/70 hover:bg-white/10 transition-colors disabled:opacity-50"
                title="Scan library"
              >
                {scanning ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                {scanning ? 'Scanning...' : 'Scan'}
              </button>
              <button
                onClick={handleLogout}
                disabled={loggingOut}
                className="inline-flex items-center justify-center h-8 w-8 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/5 transition-colors disabled:opacity-50"
                title="Disconnect"
              >
                {loggingOut ? <Loader2 className="h-3 w-3 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
              </button>
            </div>
          </>
        )}
      </div>

      {auth.status === 'error' && (
        <div className="flex items-start gap-2 px-4 pb-3">
          <AlertCircle className="h-3.5 w-3.5 text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300">{auth.message}</p>
        </div>
      )}
    </div>
  )
}
