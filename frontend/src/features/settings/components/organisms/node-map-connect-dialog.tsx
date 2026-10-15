import { useState } from 'react'
import { Server, Network, Home as HomeIcon, Cpu, ArrowRight, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import type { NodeMapConnectPrompt } from '../../types/node-map'

interface NodeMapConnectDialogProps {
  prompt: NodeMapConnectPrompt | null
  onClose: () => void
  onConnect: (connectionType: 'home' | 'host' | 'smb') => Promise<void> | void
  isPending?: boolean
}

export const NodeMapConnectDialog = ({
  prompt,
  onClose,
  onConnect,
  isPending = false,
}: NodeMapConnectDialogProps) => {
  const [selectedType, setSelectedType] = useState<'home' | 'host' | 'smb'>('host')

  if (!prompt) return null

  const { source, target, allowedTypes } = prompt

  const handleConfirm = async () => {
    const typeToUse = allowedTypes.length === 1 ? allowedTypes[0] : selectedType
    await onConnect(typeToUse)
  }

  return (
    <DkDialog
      open={Boolean(prompt)}
      onOpenChange={(open) => !open && onClose()}
      title="Connect Homelab Nodes"
      description={`Choose how to link "${source.name}" and "${target.name}".`}
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {/* Source -> Target Visual preview */}
        <div className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.04]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              {source.type === 'home' && <HomeIcon size={16} />}
              {source.type === 'server' && <Server size={16} />}
              {source.type === 'node' && <Cpu size={16} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{source.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{source.type}</p>
            </div>
          </div>

          <ArrowRight size={14} className="text-muted-foreground shrink-0 mx-2" />

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
              {target.type === 'home' && <HomeIcon size={16} />}
              {target.type === 'server' && <Server size={16} />}
              {target.type === 'node' && <Cpu size={16} />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground truncate">{target.name}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{target.type}</p>
            </div>
          </div>
        </div>

        {/* Choice between connection types */}
        {allowedTypes.includes('home') ? (
          <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.04] space-y-1">
            <p className="text-xs font-semibold text-foreground">Home Assignment</p>
            <p className="text-[11px] text-muted-foreground">
              Assigns this instance to the home network environment. Nodes and server machines in the same home can automatically discover each other and organize shared storage.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-foreground">Connection Mode</p>

            {allowedTypes.includes('host') && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedType('host')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedType('host')}
                className={`p-3.5 rounded-xl cursor-pointer text-left transition-all border ${
                  selectedType === 'host'
                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                    : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Server size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Run Node on this Server (Hosted)</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Specifies that the worker node daemon runs natively inside or as a container on this server machine.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {allowedTypes.includes('smb') && (
              <div
                role="button"
                tabIndex={0}
                onClick={() => setSelectedType('smb')}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setSelectedType('smb')}
                className={`p-3.5 rounded-xl cursor-pointer text-left transition-all border ${
                  selectedType === 'smb'
                    ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/20'
                    : 'bg-white/[0.02] border-white/[0.04] hover:bg-white/[0.04]'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                    <Network size={15} />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">Connect via SMB Network Storage</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Allows this worker node to access and store downloads directly on this server machine's SMB share.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <DkButton type="button" variant="secondary" size="sm" onClick={onClose} disabled={isPending}>
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={handleConfirm}
            loading={isPending}
            disabled={isPending}
            className="gap-1.5"
          >
            {isPending && <Loader2 size={13} className="animate-spin" />}
            <span>Connect Nodes</span>
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
