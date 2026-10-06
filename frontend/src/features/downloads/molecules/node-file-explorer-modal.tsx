import { HardDrive } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { NodeFileExplorer } from './node-file-explorer'

export interface NodeFileExplorerModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
  initialNodeId?: number
  initialServerId?: number
  initialPath?: string
  nodeName?: string
  serverName?: string
}

export type ServerFileExplorerModalProps = NodeFileExplorerModalProps

export const NodeFileExplorerModal = ({
  isOpen,
  isExiting,
  onClose,
  initialNodeId,
  initialServerId,
  initialPath,
  nodeName,
  serverName,
}: NodeFileExplorerModalProps) => {
  const effectiveName = nodeName || serverName
  const effectiveId = initialNodeId ?? initialServerId

  return (
    <DkDialog
      open={isOpen !== false && !isExiting}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      className="flex max-h-[min(92vh,860px)] w-[calc(100vw-1.25rem)] max-w-3xl flex-col overflow-hidden !p-0 sm:w-full"
    >
      <div className="relative z-10 flex min-h-0 flex-1 flex-col" role="document">
        <div className="flex shrink-0 items-start gap-3 px-4 pb-2 pt-5 pr-14 sm:px-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
            <HardDrive className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <h2 className="text-lg font-bold tracking-tight text-white">Node storage</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-white/55">
              {effectiveName
                ? `Browse and download files from ${effectiveName}.`
                : 'Browse and download files from your connected nodes.'}
            </p>
          </div>
        </div>

        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
          <NodeFileExplorer
            variant="modal"
            initialNodeId={effectiveId}
            initialPath={initialPath}
            onClose={onClose}
            className="min-h-[min(62vh,560px)]"
          />
        </div>
      </div>
    </DkDialog>
  )
};

export const ServerFileExplorerModal = NodeFileExplorerModal
