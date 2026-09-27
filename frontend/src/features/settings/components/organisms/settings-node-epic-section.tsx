import { useState, useEffect, useCallback } from 'react'
import {
  FolderOpen,
  Loader2,
  RefreshCw,
  Sparkles,
  WifiOff,
} from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { apiClient } from '@/lib/api/client'
import { openExternal } from '@/lib/utils/open-external'
import { isDesktop } from '@/lib/desktop/api'
import { useModal } from '@/lib/modals'
import { useToast } from '@ui/molecules/toast'
import { DkButton } from '@ui/atoms/button'
import EpicIcon from '@/assets/provider-logos/epic.svg?react'
import type { GameServer } from '@/features/downloads/types'
import { SectionHeader } from '../molecules/settings-section-header'
import { SettingsCard } from '../molecules/settings-card'
import { IntegrationAction } from './settings-integration-card'
import { EpicCodeModal } from './epic-code-modal'

interface SettingsNodeEpicSectionProps {
  server: GameServer
}

function extractErrorMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'response' in err) {
    const resp = (err as { response?: { data?: { detail?: string } } }).response
    if (resp?.data?.detail) return resp.data.detail
  }
  if (err instanceof Error) return err.message
  return 'Something went wrong. Please try again.'
}

export function SettingsNodeEpicSection({ server }: SettingsNodeEpicSectionProps) {
  const { openModal } = useModal()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [epicConnected, setEpicConnected] = useState(false)
  const [epicDisplayName, setEpicDisplayName] = useState<string | null>(null)
  const [epicAccountId, setEpicAccountId] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [disconnecting, setDisconnecting] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<{
    totalInEpic: number
    matchedInOtix: number
    failed: number
  } | null>(null)
  const [resolvingSteamGrid, setResolvingSteamGrid] = useState(false)
  const [steamGridResult, setSteamGridResult] = useState<{
    total: number
    matched: number
    failed: number
  } | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const isOnline = server.isOnline

  const fetchStatus = useCallback(async () => {
    if (!isOnline) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const { data } = await apiClient.get<{
        connected?: boolean
        displayName?: string | null
        accountId?: string | null
      }>('/integrations/epic/status', {
        params: { node_id: server.id },
      })
      setEpicConnected(Boolean(data.connected))
      setEpicDisplayName(data.displayName ?? null)
      setEpicAccountId(data.accountId ?? null)
    } catch (err: unknown) {
      setEpicConnected(false)
      setError(extractErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }, [server.id, isOnline])

  useEffect(() => {
    void fetchStatus()
  }, [fetchStatus])

  const handleConnect = async () => {
    setConnecting(true)
    setError('')
    setMessage('')
    try {
      const { data } = await apiClient.post('/auth/oauth/epic', { node_id: server.id })
      const authUrl = data.authUrl || data.auth_url
      const state = data.state
      const openOAuthWindow = window.desktopAPI?.plugin?.openOAuthWindow
      if (isDesktop() && openOAuthWindow) {
        const win = (await openOAuthWindow(authUrl, 'id/api/redirect')) as {
          success?: boolean
          code?: string
          error?: string
        }
        if (!win?.success || !win.code) {
          setError((win?.error as string | undefined) || 'Login cancelled')
          return
        }
        await apiClient.post('/auth/oauth/epic/callback', {
          code: win.code,
          state,
          node_id: server.id,
        })
        await fetchStatus()
        toast({
          title: 'Epic Games Linked',
          description: `Successfully connected Epic Games on ${server.name}.`,
          variant: 'success',
        })
        return
      }

      openExternal(authUrl, { newTab: true })
      const closeRef = { current: () => {} }
      closeRef.current = openModal(
        <EpicCodeModal
          authUrl={authUrl}
          state={state}
          nodeId={server.id}
          onClose={() => closeRef.current()}
          onLinked={() => {
            void fetchStatus()
            toast({
              title: 'Epic Games Linked',
              description: `Successfully connected Epic Games on ${server.name}.`,
              variant: 'success',
            })
          }}
        />,
      )
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    setDisconnecting(true)
    setError('')
    setMessage('')
    try {
      await apiClient.delete('/auth/oauth/epic/disconnect', {
        data: { node_id: server.id },
      })
      setEpicConnected(false)
      setEpicDisplayName(null)
      setEpicAccountId(null)
      setMessage('Epic Games account unlinked.')
      toast({
        title: 'Epic Games Unlinked',
        description: `Unlinked Epic Games on ${server.name}.`,
        variant: 'default',
      })
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setDisconnecting(false)
    }
  }

  const handleScan = async () => {
    setScanning(true)
    setError('')
    setScanResult(null)
    try {
      const { data } = await apiClient.post<{
        totalInEpic: number
        matchedInOtix: number
        failed: number
      }>('/integrations/epic/scan', { node_id: server.id })
      setScanResult(data)
      let msg = `Found ${data.matchedInOtix} matches out of ${data.totalInEpic} Epic games.`
      if (data.failed > 0) msg += ` ${data.failed} could not be matched.`
      setMessage(msg)
      toast({
        title: 'Library Scan Complete',
        description: msg,
        variant: 'success',
      })
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setScanning(false)
    }
  }

  const handleResolveSteamGrid = async () => {
    setResolvingSteamGrid(true)
    setError('')
    try {
      const { data } = await apiClient.post<{
        total: number
        matched: number
        failed: number
      }>('/integrations/epic/resolve-steamgrid')
      setSteamGridResult(data)
      let msg = `Matched ${data.matched} out of ${data.total} Epic games with SteamGridDB.`
      if (data.failed > 0) msg += ` ${data.failed} could not be matched.`
      setMessage(msg)
      toast({
        title: 'SteamGridDB Matching Complete',
        description: msg,
        variant: 'success',
      })
    } catch (err: unknown) {
      setError(extractErrorMessage(err))
    } finally {
      setResolvingSteamGrid(false)
    }
  }

  if (!isOnline) {
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Epic Games"
          description={`Epic Games Store integration on ${server.name}.`}
        />
        <SettingsCard className="p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-400 mx-auto flex items-center justify-center">
            <WifiOff className="h-6 w-6" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h4 className="text-sm font-semibold text-white">Node is Offline</h4>
            <p className="text-xs text-white/60 leading-relaxed">
              <strong>{server.name}</strong> is currently offline. Connect and start this node to link,
              sync, and manage your Epic Games library.
            </p>
          </div>
        </SettingsCard>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Epic Games"
        description={`Sync and manage your Epic Games library on ${server.name}.`}
      />

      <SettingsCard className="divide-y divide-white/[0.06] overflow-hidden">
        {/* Status & Connection Banner */}
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-white shrink-0">
              <EpicIcon className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-white">Epic Games Store</h4>
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    epicConnected
                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20'
                      : 'bg-white/10 text-white/50'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      epicConnected
                        ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                        : 'bg-white/40'
                    }`}
                  />
                  {epicConnected ? 'Linked' : 'Not Linked'}
                </span>
              </div>
              <p className="text-xs text-white/60 mt-0.5">
                {epicConnected && epicDisplayName
                  ? `Linked as ${epicDisplayName}${epicAccountId ? ` (${epicAccountId})` : ''}`
                  : 'Link your Epic Games account on this node to sync your games.'}
              </p>
            </div>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-white/40 px-3 py-1.5">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Checking...</span>
              </div>
            ) : epicConnected ? (
              <DkButton
                size="sm"
                variant="destructive"
                onClick={handleDisconnect}
                loading={disconnecting}
                className="text-xs"
              >
                Disconnect
              </DkButton>
            ) : (
              <DkButton
                size="sm"
                variant="primary"
                onClick={handleConnect}
                loading={connecting}
                className="text-xs gap-1.5"
              >
                <EpicIcon className="h-3.5 w-3.5" />
                <span>Connect Epic Games</span>
              </DkButton>
            )}
          </div>
        </div>

        {/* Feedback messages */}
        {message && (
          <p className="px-5 py-2.5 text-xs text-emerald-400 bg-emerald-500/5">{message}</p>
        )}
        {error && (
          <p className="px-5 py-2.5 text-xs text-rose-400 bg-rose-500/5">{error}</p>
        )}

        {/* Library Actions (available when connected) */}
        {epicConnected && (
          <>
            <div className="mx-5 my-3 p-3.5 rounded-xl bg-white/5 border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-white/70">
                <FolderOpen className="h-4 w-4 text-white/50 shrink-0" />
                <span>
                  Matched games, proposals, and metadata resolution can also be viewed under{' '}
                  <strong>Library Settings</strong>.
                </span>
              </div>
              <Link
                to="/settings/library"
                className="px-3 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-white/80 text-xs font-semibold whitespace-nowrap transition-colors self-start sm:self-auto shrink-0"
              >
                Library Settings &rarr;
              </Link>
            </div>

            <IntegrationAction
              label="Library Scan"
              description="Scan your Epic Games library on this node to detect and link owned games."
              result={
                scanResult
                  ? `${scanResult.matchedInOtix} matches out of ${scanResult.totalInEpic} Epic games`
                  : null
              }
              buttonLabel={scanning ? 'Scanning...' : scanResult ? 'Re-scan Library' : 'Scan Library'}
              buttonIcon={RefreshCw}
              onPress={handleScan}
              loading={scanning}
            />

            <IntegrationAction
              label="SteamGridDB Matching"
              description="Match artwork and metadata from SteamGridDB for unmatched Epic games on this node."
              result={
                steamGridResult
                  ? `${steamGridResult.matched} matched out of ${steamGridResult.total} games`
                  : null
              }
              buttonLabel={resolvingSteamGrid ? 'Matching...' : 'Resolve with SteamGrid'}
              buttonIcon={Sparkles}
              onPress={handleResolveSteamGrid}
              loading={resolvingSteamGrid}
            />
          </>
        )}
      </SettingsCard>
    </div>
  )
}
