import { useState } from 'react'
import { Server, Copy, ExternalLink, Globe } from 'lucide-react'
import { Link } from '@tanstack/react-router'
import { DkButton } from '@ui/atoms/button'
import type { GameServer } from '@/features/downloads/types'
import type { DownloadConfig } from '@/features/downloads/types'
import {
  buildNodeSwitcherOptions,
  getActiveNodeInfo,
} from '../../utils/node-switcher'
import { CopyNodeSettingsModal } from '../organisms/copy-node-settings-modal'
import { cn } from '@/lib/utils'

export interface SettingsNodeSwitcherBarProps {
  activeNodeId: number | null | undefined
  onSelectNodeId: (nodeId: number) => void
  servers: GameServer[]
  dlConfig?: DownloadConfig | null
  className?: string
  onSettingsReplicated?: () => void
}

export const SettingsNodeSwitcherBar = ({
  activeNodeId,
  onSelectNodeId,
  servers,
  dlConfig,
  className,
  onSettingsReplicated,
}: SettingsNodeSwitcherBarProps) => {
  const [copyModalOpen, setCopyModalOpen] = useState(false)

  const nodeOptions = buildNodeSwitcherOptions(servers)
  const activeInfo = getActiveNodeInfo(activeNodeId, servers)

  return (
    <>
      <div
        className={cn(
          'flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-4',
          className,
        )}
      >
        {/* Nodes as Clean Tabs without Outer Container */}
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 max-w-full scrollbar-none"
          role="tablist"
          aria-label="Nodes"
        >
          {nodeOptions.map((opt) => {
            const isSelected = String(activeInfo.id) === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                role="tab"
                aria-selected={isSelected}
                onClick={() => onSelectNodeId(Number(opt.value))}
                className={cn(
                  'flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0',
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                )}
              >
                {opt.isGlobal ? (
                  <Globe className="h-3.5 w-3.5" />
                ) : (
                  <Server className="h-3.5 w-3.5" />
                )}
                <span>{opt.label}</span>
                {!opt.isGlobal && (
                  <span
                    className={cn(
                      'w-1.5 h-1.5 rounded-full shrink-0',
                      opt.isOnline
                        ? isSelected
                          ? 'bg-primary-foreground/80'
                          : 'bg-status-online'
                        : isSelected
                          ? 'bg-primary-foreground/40'
                          : 'bg-status-offline',
                    )}
                  />
                )}
              </button>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-auto">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Copy to another node"
            title="Copy to another node"
            onClick={() => setCopyModalOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] cursor-pointer gap-1.5 h-8 px-2.5"
          >
            <Copy className="h-3.5 w-3.5" />
            <span>Copy to node...</span>
          </DkButton>

          <Link
            to="/settings/nodes"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)] transition-colors cursor-pointer h-8"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            <span>Topology</span>
          </Link>
        </div>
      </div>

      {copyModalOpen && (
        <CopyNodeSettingsModal
          open={copyModalOpen}
          onOpenChange={setCopyModalOpen}
          sourceNodeId={activeInfo.id}
          sourceNodeName={activeInfo.name}
          servers={servers}
          dlConfig={dlConfig}
          onSuccess={onSettingsReplicated}
        />
      )}
    </>
  )
}
