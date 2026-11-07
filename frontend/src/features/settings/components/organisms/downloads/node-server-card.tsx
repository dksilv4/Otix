import { Link } from '@tanstack/react-router'
import {
  Server,
  Star,
  Globe,
  HardDrive,
  Radio,
  Trash2,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { cn, formatBytes } from '@/lib/utils'
import type { ServerProbeResult } from '@/features/downloads/use-server-downloads'
import { isLocalDesktopNode, isVirtualDesktopNode } from '../../../local-desktop-node'
import { nodeSettingsNavigateOptions } from '../../../node-settings'

export interface NodeServerCardProps {
  server: any
  probeResult?: ServerProbeResult
  isProbing: boolean
  onSetPrimary: (id: number) => void
  onProbeServer: (id: number, name: string) => void
  onOpenExplorer: (server: { id: number; name: string }) => void
  onPingServer: (id: number) => void
  onSelectDelete: (server: { id: number; name: string }) => void
}

export const NodeServerCard = ({
  server,
  probeResult,
  isProbing,
  onSetPrimary,
  onProbeServer,
  onOpenExplorer,
  onPingServer,
  onSelectDelete,
}: NodeServerCardProps) => {
  const local = isLocalDesktopNode(server)
  const reserved = isVirtualDesktopNode(server)
  const isRemoteAccessible = Boolean(
    probeResult?.remote_accessible ||
    probeResult?.remoteAccessible ||
    probeResult?.reachable,
  )

  return (
    <div className="relative group p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-ghost-hover)] transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer">
      <Link
        {...nodeSettingsNavigateOptions(server.id)}
        className="absolute inset-0 z-[1] rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={`Open ${server.name}`}
      >
        <span className="sr-only">Open {server.name}</span>
      </Link>
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-10 h-10 rounded-xl bg-[var(--dk-surface-field)] flex items-center justify-center shrink-0">
          <Server size={18} className="text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-foreground">{server.name}</span>
            {local && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-status-online/10 text-status-online">
                Otix app
              </span>
            )}
            {server.isActive && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-primary/15 text-primary">
                <Star size={10} />
                Primary
              </span>
            )}
            <span
              className={cn(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                server.isOnline
                  ? 'bg-status-online/10 text-status-online'
                  : 'bg-status-offline/10 text-status-offline',
              )}
            >
              <span
                className={cn(
                  'w-1.5 h-1.5 rounded-full',
                  server.isOnline ? 'bg-status-online animate-pulse' : 'bg-status-offline',
                )}
              />
              {server.isOnline ? 'Online' : 'Offline'}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
            <span
              className={cn(
                'truncate inline-flex items-center gap-1',
                reserved ? 'text-muted-foreground' : 'font-mono text-muted-foreground',
              )}
            >
              {local ? 'Otix app on this computer' : server.primaryUrl}
              {isRemoteAccessible && (
                <span className="inline-flex items-center text-status-online" title="Accessible from the Internet">
                  <Globe size={11} />
                </span>
              )}
            </span>
            {server.totalFiles > 0 && <span>· {server.totalFiles} games</span>}
            {server.storageFreeBytes > 0 && (
              <span>· {formatBytes(server.storageFreeBytes)} free</span>
            )}
          </div>
        </div>
      </div>

      <div className="relative z-[2] flex items-center gap-2 self-end sm:self-center flex-wrap pointer-events-none">
        {!reserved && (
          <>
            {!server.isActive && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onSetPrimary(server.id)
                }}
                className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
                title="Set as primary"
              >
                <Star size={12} />
                <span>Set primary</span>
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onProbeServer(server.id, server.name)
              }}
              disabled={isProbing}
              className={cn(
                'pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer',
                isRemoteAccessible
                  ? 'bg-status-online/10 text-status-online hover:bg-status-online/20'
                  : probeResult && !isRemoteAccessible
                    ? 'bg-status-warning/10 text-status-warning hover:bg-status-warning/20'
                    : 'bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground',
              )}
              title="Test Remote Access (Internet Reachability)"
            >
              <Globe size={12} className={isProbing ? 'animate-spin' : ''} />
              <span>
                {isProbing
                  ? 'Probing WAN...'
                  : isRemoteAccessible
                    ? `Remote OK (${probeResult?.latency_ms ?? probeResult?.latencyMs}ms)`
                    : probeResult && !isRemoteAccessible
                      ? 'Local Only'
                      : 'Remote Access'}
              </span>
            </button>
            {server.localUrl && (
              <a
                href={server.localUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
                title="Open Node WebUI"
              >
                <ExternalLink size={12} />
                <span>WebUI</span>
              </a>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onOpenExplorer(server)
              }}
              className="pointer-events-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
              title="Explore Node Storage"
            >
              <HardDrive size={12} />
              <span>Explore</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                e.preventDefault()
                onPingServer(server.id)
              }}
              className="pointer-events-auto flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-medium transition-colors cursor-pointer"
              title="Test Connection"
            >
              <Radio size={12} />
              <span>Ping</span>
            </button>
            {!local && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  e.preventDefault()
                  onSelectDelete({ id: server.id, name: server.name })
                }}
                className="pointer-events-auto p-1.5 rounded-lg bg-[var(--dk-surface-field)] hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition-colors cursor-pointer"
                title="Disconnect Node"
              >
                <Trash2 size={13} />
              </button>
            )}
          </>
        )}
        <span
          aria-hidden
          className="flex items-center gap-0.5 text-xs font-medium text-muted-foreground group-hover:text-foreground transition-colors"
        >
          Open
          <ChevronRight size={14} className="transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  )
}
