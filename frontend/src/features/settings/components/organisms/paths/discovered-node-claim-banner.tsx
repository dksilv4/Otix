import { Sparkles } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'

export interface DiscoveredNodeClaimBannerProps {
  unclaimedNode: {
    serverName?: string
    claimCode?: string
    localUrl?: string
  }
  isClaiming: boolean
  onClaim: () => void
}

export const DiscoveredNodeClaimBanner = ({
  unclaimedNode,
  isClaiming,
  onClaim,
}: DiscoveredNodeClaimBannerProps) => {
  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-3.5 rounded-2xl bg-primary/[0.08] backdrop-blur-xl border border-white/[0.04] gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <Sparkles size={17} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground truncate">
              Discovered Otix Node: {unclaimedNode.serverName || 'Otix Node'}
            </span>
            {unclaimedNode.claimCode && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-primary/20 text-primary">
                PIN: {unclaimedNode.claimCode}
              </span>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground truncate">
            {unclaimedNode.localUrl} — Ready to pair and configure storage paths.
          </p>
        </div>
      </div>
      <DkButton
        type="button"
        size="sm"
        variant="primary"
        onClick={onClaim}
        loading={isClaiming}
        className="h-8 px-3.5 text-xs font-bold shrink-0"
      >
        Claim & Add Folders
      </DkButton>
    </div>
  )
}
