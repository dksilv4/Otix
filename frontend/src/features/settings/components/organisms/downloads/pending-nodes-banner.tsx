import { AlertCircle, Sparkles, KeyRound, RotateCcw } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { PendingNode } from '@/features/downloads/pending-nodes'

export interface PendingNodesBannerProps {
  orphanedNodes: PendingNode[]
  unclaimedNodes: PendingNode[]
  isUnclaimingQuick: boolean
  onUnclaimQuickNode: (node: PendingNode) => void
  onClaimQuickNode: (node: PendingNode) => void
  onOpenManualClaim: (url?: string) => void
}

export const PendingNodesBanner = ({
  orphanedNodes,
  unclaimedNodes,
  isUnclaimingQuick,
  onUnclaimQuickNode,
  onClaimQuickNode,
  onOpenManualClaim,
}: PendingNodesBannerProps) => {
  return (
    <>
      {orphanedNodes.length > 0 && (
        <div className="p-3.5 rounded-xl bg-destructive/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-destructive/20 flex items-center justify-center shrink-0">
              <AlertCircle className="w-4 h-4 text-destructive" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-foreground">
                  Node Needs Re-linking: <span className="text-destructive font-bold">{orphanedNodes[0].serverName}</span>
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Running at {orphanedNodes[0].localUrl}, but linked to a deleted or different account. Reset to generate a new PIN and link to this account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <DkButton
              size="sm"
              variant="primary"
              onClick={() => onUnclaimQuickNode(orphanedNodes[0])}
              loading={isUnclaimingQuick}
              className="text-xs font-bold"
            >
              <RotateCcw className="w-3.5 h-3.5 mr-1" />
              Reset &amp; Claim Node
            </DkButton>
          </div>
        </div>
      )}

      {unclaimedNodes.length > 0 && (
        <div className="p-3.5 rounded-xl bg-primary/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-xs font-bold text-foreground">
                  Unclaimed Otix Node Detected: <span className="text-primary">{unclaimedNodes[0].serverName}</span>
                </p>
                {unclaimedNodes[0].claimCode && (
                  <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-[var(--dk-surface-field)] text-foreground">
                    PIN: {unclaimedNodes[0].claimCode}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Available at {unclaimedNodes[0].localUrl}. Claim this node to link it to your account.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            {unclaimedNodes[0].claimCode ? (
              <DkButton
                size="sm"
                variant="primary"
                onClick={() => onClaimQuickNode(unclaimedNodes[0])}
                className="text-xs font-bold"
              >
                <KeyRound className="w-3.5 h-3.5 mr-1" />
                Claim Node
              </DkButton>
            ) : (
              <DkButton
                size="sm"
                variant="primary"
                onClick={() => onOpenManualClaim(unclaimedNodes[0].localUrl)}
                className="text-xs font-bold"
              >
                Claim with PIN
              </DkButton>
            )}
          </div>
        </div>
      )}
    </>
  )
}
