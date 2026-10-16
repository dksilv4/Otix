import { Cpu, Server, Home as HomeIcon, FolderTree, Sparkles, KeyRound, ArrowRight } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import type { PendingNode } from '@/features/downloads/pending-nodes'

export interface AddNodeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unclaimedNodes?: PendingNode[]
  onSelectType: (type: 'worker' | 'server' | 'home' | 'samba') => void
  onClaimNode?: (node: PendingNode) => void
}

export const AddNodeModal = ({
  open,
  onOpenChange,
  unclaimedNodes = [],
  onSelectType,
  onClaimNode,
}: AddNodeModalProps) => {
  const handleSelect = (type: 'worker' | 'server' | 'home' | 'samba') => {
    onOpenChange(false)
    onSelectType(type)
  }

  const handleClaim = (node: PendingNode) => {
    onOpenChange(false)
    onClaimNode?.(node)
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add Node"
      description="Choose which node or resource to add to your homelab topology."
      className="max-w-xl"
    >
      <div className="space-y-4 pt-2">
        {/* If local nodes are discovered, allow selecting which one to add immediately */}
        {unclaimedNodes.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-primary/[0.08] backdrop-blur-xl border border-primary/20 space-y-2.5">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary shrink-0" />
              <p className="text-xs font-bold text-foreground">
                Discovered Local Nodes ({unclaimedNodes.length})
              </p>
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              The following Otix companion nodes were detected on your network. Select which node to add to your topology:
            </p>

            <div className="space-y-2 pt-1">
              {unclaimedNodes.map((pending, idx) => (
                <div
                  key={`${pending.localUrl || 'local'}-${idx}`}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                      <Cpu size={16} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {pending.serverName || 'Otix Node'}
                        </span>
                        {pending.claimCode && (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary">
                            PIN: {pending.claimCode}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground truncate">
                        {pending.localUrl || 'localhost'}
                      </p>
                    </div>
                  </div>

                  <DkButton
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={() => handleClaim(pending)}
                    className="h-7 px-3 text-[11px] font-bold shrink-0 gap-1"
                  >
                    <KeyRound size={11} />
                    <span>Add this Node</span>
                  </DkButton>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Node Type Choices */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
            Select Node Type
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* 1. Worker Node */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelect('worker')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect('worker')}
              className="group p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-primary/40 cursor-pointer transition-all duration-150 space-y-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Cpu size={18} />
                </div>
                <ArrowRight size={13} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Otix Worker Node</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Game library scanner, download worker, and metadata indexer.
                </p>
              </div>
            </div>

            {/* 2. Server Machine */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelect('server')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect('server')}
              className="group p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-primary/40 cursor-pointer transition-all duration-150 space-y-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <Server size={18} />
                </div>
                <ArrowRight size={13} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Machine</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Computer, NAS, or VM host (PC, Unraid, TrueNAS, Ubuntu, Windows).
                </p>
              </div>
            </div>

            {/* 3. Home Environment */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelect('home')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect('home')}
              className="group p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-primary/40 cursor-pointer transition-all duration-150 space-y-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <HomeIcon size={18} />
                </div>
                <ArrowRight size={13} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Home Environment</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Household network environment to organize peer instances.
                </p>
              </div>
            </div>

            {/* 4. Samba Share */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleSelect('samba')}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && handleSelect('samba')}
              className="group p-3.5 rounded-2xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-primary/40 cursor-pointer transition-all duration-150 space-y-2 text-left"
            >
              <div className="flex items-center justify-between">
                <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <FolderTree size={18} />
                </div>
                <ArrowRight size={13} className="text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
              <div>
                <p className="text-xs font-bold text-foreground">Samba Share (SMB)</p>
                <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
                  Network storage for game installs, ROMs, and ISO folders.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end pt-2">
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
