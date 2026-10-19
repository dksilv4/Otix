import { useState } from 'react'
import {
  DownloadCloud,
  Sliders,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useModal } from '@/lib/modals'
import { cn } from '@/lib/utils'
import type { GameServer } from '../types'
import { useServerUsenetConfig, useTestSabnzbd } from '../use-server-usenet'
import { isSabnzbdConfigured } from '../usenet-utils'
import { ServerSabnzbdSettingsModal } from './server-sabnzbd-settings-modal'

export const NodeDownloaderCard = ({ server }: { server: GameServer }) => {
  const { openModal } = useModal()
  const { data: usenetConfig, isLoading: configLoading } = useServerUsenetConfig(server.id)
  const testSabMutation = useTestSabnzbd(server.id)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const sab = usenetConfig?.sabnzbd
  const isConfigured = isSabnzbdConfigured(sab)
  const sabHost = sab?.host || '127.0.0.1'
  const sabPort = sab?.port || 8080
  const sabCategory = sab?.category || 'games'

  const handleOpenSabnzbdModal = () => {
    const closeSub = openModal(
      <ServerSabnzbdSettingsModal
        serverId={server.id}
        serverName={server.name}
        onClose={() => closeSub()}
      />,
    )
  }

  const handleTestConnection = async () => {
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
    <div className="rounded-2xl p-4 bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] space-y-3">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="h-11 w-11 rounded-2xl bg-amber-500/10 flex items-center justify-center shrink-0 border border-amber-500/20 text-amber-600 dark:text-amber-400">
            <DownloadCloud className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-bold text-foreground">SABnzbd Downloader</h4>
              {isConfigured ? (
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Connected
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground bg-[var(--dk-surface-ghost)] px-2 py-0.5 rounded-full border border-[var(--dk-separator)]">
                  Not Configured
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {configLoading
                ? 'Loading configuration...'
                : isConfigured
                  ? `On ${server.name} (${sabHost}:${sabPort}) · Category: ${sabCategory}`
                  : `Not configured on ${server.name}.`}
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
            disabled={testing || !isConfigured}
            title="Test Connection"
            aria-label="Test Connection"
          >
            <RefreshCw className={cn('h-4 w-4 text-sky-400', testing && 'animate-spin')} />
          </DkButton>
        </div>
      </div>

      {testResult?.ok && (
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
  )
};
