import { useEffect, useState, useCallback } from 'react'
import { Server, Play, Square, RotateCw, ExternalLink } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { isDesktop, getDesktopAPI, type NodeDaemonStatus } from '@/lib/desktop/api'

export const EmbeddedNodeCard = () => {
  const isDesk = isDesktop()
  const { toast } = useToast()
  const [status, setStatus] = useState<NodeDaemonStatus | null>(null)
  const [isBusy, setIsBusy] = useState(false)

  const refreshStatus = useCallback(async () => {
    const api = getDesktopAPI()
    if (!api?.nodeDaemon?.getStatus) return
    try {
      const s = await api.nodeDaemon.getStatus()
      setStatus(s)
    } catch {
      // ignore
    }
  }, [])

  useEffect(() => {
    if (!isDesk) return
    void refreshStatus()

    const api = getDesktopAPI()
    if (api?.nodeDaemon?.onStatusChanged) {
      const unsub = api.nodeDaemon.onStatusChanged((newStatus) => {
        setStatus(newStatus)
      })
      return unsub
    }
  }, [isDesk, refreshStatus])

  if (!isDesk) return null

  const handleStart = async () => {
    const api = getDesktopAPI()
    if (!api?.nodeDaemon?.start) return
    setIsBusy(true)
    try {
      const res = await api.nodeDaemon.start()
      setStatus(res)
      toast({
        title: 'Embedded Node Started',
        description: `Companion daemon is live on port ${res.port}.`,
        variant: 'success',
      })
    } catch (err: unknown) {
      toast({
        title: 'Failed to Start Node',
        description: (err as { message?: string }).message || 'Unknown error',
        variant: 'error',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleStop = async () => {
    const api = getDesktopAPI()
    if (!api?.nodeDaemon?.stop) return
    setIsBusy(true)
    try {
      const res = await api.nodeDaemon.stop()
      setStatus(res)
      toast({
        title: 'Embedded Node Stopped',
        description: 'Companion daemon has been shut down.',
        variant: 'default',
      })
    } catch (err: unknown) {
      toast({
        title: 'Failed to Stop Node',
        description: (err as { message?: string }).message || 'Unknown error',
        variant: 'error',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleRestart = async () => {
    const api = getDesktopAPI()
    if (!api?.nodeDaemon?.restart) return
    setIsBusy(true)
    try {
      const res = await api.nodeDaemon.restart()
      setStatus(res)
      toast({
        title: 'Embedded Node Restarted',
        description: `Companion daemon restarted on port ${res.port}.`,
        variant: 'success',
      })
    } catch (err: unknown) {
      toast({
        title: 'Failed to Restart Node',
        description: (err as { message?: string }).message || 'Unknown error',
        variant: 'error',
      })
    } finally {
      setIsBusy(false)
    }
  }

  const handleOpenDashboard = () => {
    const api = getDesktopAPI()
    const targetUrl = status?.url || 'http://127.0.0.1:8090'
    if (api?.openExternal) {
      void api.openExternal(targetUrl)
    } else {
      window.open(targetUrl, '_blank')
    }
  }

  const isRunning = Boolean(status?.running)

  return (
    <div className="rounded-2xl glass-inset p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div className="flex items-start sm:items-center gap-3.5 min-w-0">
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
            isRunning
              ? 'bg-primary/20 text-primary'
              : 'glass-inset text-muted-foreground'
          }`}
        >
          <Server className="h-5 w-5" />
        </div>

        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-foreground">
              Embedded Node Companion
            </span>
            <span
              className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                isRunning
                  ? 'bg-primary/20 text-primary'
                  : 'glass-inset text-muted-foreground'
              }`}
            >
              {isRunning
                ? `Active (Port ${status?.port || 8090})`
                : 'Stopped'}
            </span>
            {status?.version && (
              <span className="rounded-md bg-white/[0.04] px-1.5 py-0.5 text-[10px] text-muted-foreground font-mono">
                v{status.version}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Modular local daemon for background file streaming, game hosting, and cloud save snapshots.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
        {isRunning ? (
          <>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleRestart()}
              loading={isBusy}
              leftIcon={RotateCw}
              className="text-xs"
            >
              Restart
            </DkButton>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void handleStop()}
              loading={isBusy}
              leftIcon={Square}
              className="text-xs"
            >
              Stop
            </DkButton>
            <DkButton
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleOpenDashboard}
              leftIcon={ExternalLink}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Dashboard
            </DkButton>
          </>
        ) : (
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => void handleStart()}
            loading={isBusy}
            leftIcon={Play}
            className="text-xs font-semibold"
          >
            Start Daemon
          </DkButton>
        )}
      </div>
    </div>
  )
}
