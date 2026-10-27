import { Server, RefreshCw, CheckCircle2, AlertCircle, ArrowRight, RotateCcw, ExternalLink } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import type { PendingNode } from '@/features/downloads/pending-nodes'

export interface SetupStepNodeProps {
  node: PendingNode | null
  isProbing: boolean
  onProbe: () => void
  isOrphaned?: boolean
  isUnclaiming?: boolean
  onUnclaim?: () => void
  claimPin: string
  onChangePin: (pin: string) => void
  claimStatus: 'idle' | 'claiming' | 'success' | 'error'
  claimError: string | null
  onClaim: () => Promise<boolean>
  onSkip: () => void
}

export const SetupStepNode = ({
  node,
  isProbing,
  onProbe,
  isOrphaned = false,
  isUnclaiming = false,
  onUnclaim,
  claimPin,
  onChangePin,
  claimStatus,
  claimError,
  onClaim,
  onSkip,
}: SetupStepNodeProps) => {
  const isOnline = Boolean(node)
  const isSuccess = claimStatus === 'success'

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center sm:text-left">
        <h3 className="text-xl font-bold tracking-tight text-foreground">
          Otix Node Auto-Discovery
        </h3>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Otix Node is the companion daemon that hosts your game files, cloud saves, and download orchestrators.
        </p>
      </div>

      {/* Live Probe Status Box */}
      <div className="rounded-2xl glass-inset p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                isOnline
                  ? 'bg-primary/20 text-primary'
                  : 'glass-inset text-muted-foreground'
              }`}
            >
              <Server className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-foreground">
                  {node ? node.serverName : 'Local Host Daemon'}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    isOnline
                      ? 'bg-primary/20 text-primary'
                      : 'bg-muted/30 text-muted-foreground'
                  }`}
                >
                  {isOnline ? 'Online (127.0.0.1:8090)' : 'Not Running'}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {isOnline
                  ? 'Companion daemon is live and listening on your local machine.'
                  : 'No active node detected on default port 8090.'}
              </p>
            </div>
          </div>

          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={onProbe}
            loading={isProbing}
            leftIcon={RefreshCw}
            className="text-xs shrink-0 self-start sm:self-center"
          >
            Check Again
          </DkButton>
        </div>

        {/* If node is detected: Claim form or Orphaned Reset */}
        {isOnline && !isSuccess && isOrphaned && (
          <div className="pt-3 space-y-3">
            <div className="rounded-xl p-3.5 bg-destructive/10 space-y-2">
              <div className="flex items-center gap-2 text-destructive font-semibold text-xs">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Node is linked to a deleted or different account</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                A running Otix Node was detected ({node?.serverName || 'GAMING PC'}), but its authorization token is associated with a different or removed account. Reset it below to generate a new PIN and link it to this account.
              </p>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={onUnclaim}
                loading={isUnclaiming}
                leftIcon={RotateCcw}
                className="text-xs font-semibold mt-1"
              >
                Reset &amp; Claim to This Account
              </DkButton>
            </div>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>Or sign in with your account credentials directly at</span>
              <a
                href={node?.localUrl || 'http://127.0.0.1:8090'}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-mono inline-flex items-center gap-0.5"
              >
                {node?.localUrl || 'http://127.0.0.1:8090'} <ExternalLink size={10} />
              </a>
            </p>
          </div>
        )}

        {isOnline && !isSuccess && !isOrphaned && (
          <div className="pt-3 space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                6-Digit Claim PIN
              </label>
              <div className="flex flex-col sm:flex-row gap-2.5">
                <DkInput
                  type="text"
                  value={claimPin}
                  onChange={(e) => onChangePin(e.target.value.toUpperCase())}
                  placeholder="e.g. 7X9K2P"
                  maxLength={10}
                  className="font-mono text-center tracking-widest uppercase text-sm sm:max-w-xs"
                />
                <DkButton
                  type="button"
                  variant="primary"
                  size="md"
                  onClick={() => void onClaim()}
                  loading={claimStatus === 'claiming'}
                  disabled={!claimPin.trim()}
                  className="text-xs font-semibold"
                >
                  Link Node
                </DkButton>
              </div>
            </div>

            {claimError && (
              <div className="flex items-center gap-2 text-xs text-destructive">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{claimError}</span>
              </div>
            )}

            <p className="text-[11px] text-muted-foreground flex items-center gap-1 flex-wrap">
              <span>You can find your claim PIN or log in with your account at</span>
              <a
                href={node?.localUrl || 'http://127.0.0.1:8090'}
                target="_blank"
                rel="noreferrer"
                className="text-primary hover:underline font-mono inline-flex items-center gap-0.5"
              >
                {node?.localUrl || 'http://127.0.0.1:8090'} <ExternalLink size={10} />
              </a>
            </p>
          </div>
        )}

        {/* If Claim Succeeded */}
        {isSuccess && (
          <div className="pt-3 flex items-center gap-2.5 text-xs text-primary font-semibold">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>Otix Node linked successfully to your account!</span>
          </div>
        )}

        {/* If Node is not running: Helpful instructions */}
        {!isOnline && (
          <div className="pt-3 space-y-3 text-xs text-muted-foreground">
            <p>
              The Otix Node companion runs automatically on Desktop, or can be deployed independently
              on your home server, NAS, or Docker.
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={onSkip}
                rightIcon={ArrowRight}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Skip Node Setup for Now
              </DkButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
