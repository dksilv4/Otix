import { useNavigate } from '@tanstack/react-router'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { Link2 } from 'lucide-react'
import { useSettingsNode } from '@/features/settings/context/settings-node-context'
import { NodeDownloaderCard } from './node-downloader-card'
import { NodeJDownloaderCard } from './node-jdownloader-card'
import { ImportNodeInstancesButton } from './import-node-instances-modal'

export interface ManageDownloadersModalProps {
  open?: boolean
  isOpen?: boolean
  isExiting?: boolean
  onClose?: () => void
  onOpenChange?: (open: boolean) => void
}

export const ManageDownloadersModal = ({
  open,
  isOpen,
  isExiting,
  onClose,
  onOpenChange,
}: ManageDownloadersModalProps) => {
  const isModalOpen = (open ?? isOpen ?? true) && !isExiting
  const handleClose = () => {
    onClose?.()
    onOpenChange?.(false)
  }
  const navigate = useNavigate()
  const { servers } = useSettingsNode()
  const instances = servers.filter(
    (server) =>
      Number(server.id) > 0 &&
      !server.localUrl?.startsWith('otix://') &&
      !server.primaryUrl?.startsWith('otix://'),
  )

  const handleGoToConnections = () => {
    handleClose()
    navigate({ to: '/settings/connections' })
  }

  return (
    <DkDialog
      open={isModalOpen}
      onOpenChange={(next) => {
        if (!next) handleClose()
      }}
      title="Manage Downloaders"
      description="Configure download clients (SABnzbd & JDownloader) for each Otix node below."
      className="max-w-4xl"
    >
      <div className="space-y-4 max-h-[72vh] overflow-y-auto pr-1 pt-1 pb-1">
        <div className="p-4 rounded-2xl bg-primary/10 border border-primary/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0 text-primary mt-0.5 sm:mt-0">
              <Link2 className="h-5 w-5" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Downloader client management</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                Otix nodes support both <strong>SABnzbd</strong> (Usenet) and{' '}
                <strong>JDownloader 2</strong> (Direct / Cyberlockers). Open <strong>Connections</strong>{' '}
                for Prowlarr, Radarr, and Sonarr.
              </p>
            </div>
          </div>
          <DkButton size="sm" className="shrink-0 self-start sm:self-center" onClick={handleGoToConnections}>
            Go to Connections &rarr;
          </DkButton>
        </div>

        {instances.length > 0 ? (
          <div className="space-y-4">
            <div className="flex items-center justify-end px-1">
              <ImportNodeInstancesButton />
            </div>
            {instances.map((server) => (
              <div key={server.id} className="space-y-2">
                <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {server.name}
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <NodeDownloaderCard server={server} />
                  <NodeJDownloaderCard server={server} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-6">
            Connect an Otix node to configure downloaders.
          </p>
        )}
      </div>
    </DkDialog>
  )
};
