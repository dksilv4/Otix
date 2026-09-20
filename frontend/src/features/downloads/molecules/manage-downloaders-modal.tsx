import React, { useState } from 'react'
import {
  DownloadCloud,
  Sliders,
  RefreshCw,
  Link2,
  CheckCircle2,
  AlertCircle,
  Server,
} from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useModal } from '@/lib/modals'
import { cn } from '@/lib/utils'
import { useGameServers } from '../use-server-downloads'
import { useServerUsenetConfig, useTestSabnzbd } from '../use-server-usenet'
import { ServerSabnzbdSettingsModal } from './server-sabnzbd-settings-modal'

export interface ManageDownloadersModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
}

export function ManageDownloadersModal({
  isOpen,
  isExiting,
  onClose,
}: ManageDownloadersModalProps) {
  const navigate = useNavigate()
  const { openModal } = useModal()
  const { data: gameServers = [] } = useGameServers()

  const onlineServer = gameServers.find((s) => s.isOnline) || gameServers[0]
  const [selectedServerId, setSelectedServerId] = useState<number | undefined>(onlineServer?.id)

  const activeServerId = selectedServerId ?? onlineServer?.id
  const targetServer = gameServers.find((s) => s.id === activeServerId) || onlineServer

  const { data: usenetConfig, isLoading: configLoading } = useServerUsenetConfig(targetServer?.id)
  const testSabMutation = useTestSabnzbd(targetServer?.id)

  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sab = usenetConfig?.sabnzbd
  const isConfigured = Boolean(
    sab?.host && Boolean(sab?.apiKey || sab?.api_key || sab?.has_api_key || sab?.configured),
  )
  const sabHost = sab?.host || '127.0.0.1'
  const sabPort = sab?.port || 8080
  const sabCategory = sab?.category || 'games'

  const handleGoToConnections = () => {
    onClose()
    navigate({ to: '/settings/connections' })
  }

  const handleOpenSabnzbdModal = () => {
    onClose()
    const closeSub = openModal(
      <ServerSabnzbdSettingsModal
        serverId={targetServer?.id}
        serverName={targetServer?.name}
        onClose={() => closeSub()}
      />,
    )
  }

  const handleTestConnection = async () => {
    if (!targetServer?.id) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await testSabMutation.mutateAsync()
      setTestResult(res)
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: err?.response?.data?.detail || err?.message || 'Connection test failed',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <DkDialog
      open={isOpen !== false && !isExiting}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Manage Downloaders"
      description="Configure download clients and server package automation."
      className="max-w-4xl"
    >
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
        {/* Informational Callout */}
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-primary mt-0.5 sm:mt-0">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white">Downloader client management</h4>
              <p className="text-xs text-white/70 mt-0.5 leading-relaxed">
                Downloaders run directly on your Otix Server node to process Usenet packages and auto-extract releases. You can test and configure SABnzbd below or view all linked services under <strong>Connections</strong>.
              </p>
            </div>
          </div>
          <DkButton size="sm" className="shrink-0 self-start sm:self-center" onClick={handleGoToConnections}>
            Go to Connections &rarr;
          </DkButton>
        </div>

        {/* Server Selection (if multiple servers exist) */}
        {gameServers.length > 1 && (
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-white/[0.03] border border-white/10 text-xs">
            <div className="flex items-center gap-2 text-white/70">
              <Server className="h-4 w-4 text-primary" />
              <span>Target Server Node:</span>
            </div>
            <select
              value={targetServer?.id ?? ''}
              onChange={(e) => {
                setSelectedServerId(Number(e.target.value))
                setTestResult(null)
              }}
              className="h-8 rounded-xl bg-white/5 px-3 text-xs text-white outline-none border border-white/10"
            >
              {gameServers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} {s.isOnline ? '(Online)' : '(Offline)'}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* SABnzbd Downloader Row Card - standardized row layout */}
        <div className="rounded-2xl p-4 bg-white/5 border border-white/10 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 text-amber-400">
                <DownloadCloud className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-white">SABnzbd Downloader</h4>
                  {isConfigured ? (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[10px] font-medium text-white/50 bg-white/5 px-2 py-0.5 rounded-full border border-white/10">
                      Not Configured
                    </span>
                  )}
                </div>
                <p className="text-xs text-white/50 mt-1">
                  {configLoading
                    ? 'Loading configuration...'
                    : isConfigured
                    ? `Linked on ${targetServer?.name || 'Otix Server'} (${sabHost}:${sabPort}) · Category: ${sabCategory}`
                    : targetServer
                    ? `Available on ${targetServer.name}. Configure SABnzbd to automate Usenet game downloads.`
                    : 'Connect an Otix Server node to configure SABnzbd for automated downloads.'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <DkButton
                size="sm"
                variant={isConfigured ? 'ghost' : 'primary'}
                className="h-8 w-8 p-0"
                onClick={handleOpenSabnzbdModal}
                title="Configure Client"
                aria-label="Configure Client"
              >
                <Sliders className="h-4 w-4 text-amber-400" />
              </DkButton>

              <DkButton
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleTestConnection}
                disabled={testing || !isConfigured || !targetServer?.id}
                title="Test Connection"
                aria-label="Test Connection"
              >
                <RefreshCw className={cn('h-4 w-4 text-sky-400', testing && 'animate-spin')} />
              </DkButton>

              <DkButton
                size="sm"
                variant="ghost"
                className="h-8 w-8 p-0"
                onClick={handleGoToConnections}
                title="Connections Page"
                aria-label="Connections Page"
              >
                <Link2 className="h-4 w-4 text-emerald-400" />
              </DkButton>
            </div>
          </div>

          {testResult && testResult.ok && (
            <div className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{testResult.message || 'SABnzbd is connected and responding.'}</span>
            </div>
          )}

          {testResult && !testResult.ok && (
            <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-400 flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{testResult.message || 'Could not connect to SABnzbd.'}</span>
            </div>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
