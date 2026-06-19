import { useState, useEffect, useCallback } from 'react'
import { Loader2, CheckCircle2, AlertCircle, LogOut, RefreshCw, Gamepad2 } from 'lucide-react'
import { useModal } from '@/lib/modals'
import { EpicMatchModal } from './EpicMatchModal'
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

export function EpicPluginLogin({ pluginId, api }: Props) {
  const [auth, setAuth] = useState<AuthState>({ status: 'loading' })
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{ total?: number } | null>(null)
  const [loggingIn, setLoggingIn] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const { openModal } = useModal()

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

  function openMatchModal(games: any[]) {
    const close = openModal(
      <EpicMatchModal
        games={games}
        pluginId={pluginId}
        api={api}
        onClose={() => close()}
      />,
    )
  }

  const handleLogin = async () => {
    setLoggingIn(true)
    try {
      const res = await api.callData(pluginId, 'auth.login') as any
      if (res?.code) {
        const cbRes = await api.callData(pluginId, 'auth.handleCallback', res.code) as any
        if (cbRes?.success) {
          setAuth({ status: 'connected', displayName: cbRes.displayName || 'Connected' })
          if (cbRes.scanResult) {
            setScanResult({ total: cbRes.scanResult.total })
            openMatchModal(cbRes.scanResult.games)
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

  const handleScan = async () => {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await api.callData(pluginId, 'scan') as any
      if (res?.success) {
        setScanResult({ total: res.total })
        openMatchModal(res.games)
      }
    } catch (err) {
      setAuth({ status: 'error', message: err instanceof Error ? err.message : 'Scan failed' })
    } finally {
      setScanning(false)
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
                  {scanResult.total} items — <button onClick={handleScan} className="text-primary/80 hover:text-primary">re-scan</button>
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
