import { HardDrive } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { ServerFileExplorer } from './server-file-explorer'

export interface ServerFileExplorerModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
  initialServerId?: number
  initialPath?: string
  serverName?: string
}

export function ServerFileExplorerModal({
  isOpen,
  isExiting,
  onClose,
  initialServerId,
  initialPath,
  serverName,
}: ServerFileExplorerModalProps) {
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
            <h2 className="text-lg font-bold tracking-tight text-white">Server storage</h2>
            <p className="mt-0.5 text-xs leading-relaxed text-white/55">
              {serverName
                ? `Browse and download files from ${serverName}.`
                : 'Browse and download files from your connected game servers.'}
            </p>
          </div>
        </div>

        <div className="mt-1 flex min-h-0 flex-1 flex-col overflow-hidden">
          <ServerFileExplorer
            variant="modal"
            initialServerId={initialServerId}
            initialPath={initialPath}
            onClose={onClose}
            className="min-h-[min(62vh,560px)]"
          />
        </div>
      </div>
    </DkDialog>
  )
}
