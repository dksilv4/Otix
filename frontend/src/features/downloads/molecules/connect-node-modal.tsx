import { useState } from 'react'
import { ExternalLink, KeyRound, Server } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import { useClaimGameServer, useCreateGameServer } from '@/features/downloads/use-server-downloads'
import { NodesFeatureTags } from '@/features/settings/components/nodes-feature-tags'

interface ConnectNodeModalProps {
  isOpen: boolean
  onClose: () => void
  defaultName?: string
  initialNodeUrl?: string
  initialTab?: 'claim' | 'manual'
}

export function ConnectNodeModal({
  isOpen,
  onClose,
  defaultName = 'Node',
  initialNodeUrl = '',
  initialTab = 'claim',
}: ConnectNodeModalProps) {
  const { toast } = useToast()
  const claimServerMutation = useClaimGameServer()
  const createServerMutation = useCreateGameServer()

  const [connectTab, setConnectTab] = useState<'claim' | 'manual'>(initialTab)
  const [claimPin, setClaimPin] = useState('')
  const [claimNodeUrl, setClaimNodeUrl] = useState(initialNodeUrl)
  const [claimServerName, setClaimServerName] = useState('')
  const [claimIsLocal, setClaimIsLocal] = useState(true)
  const [claimingPin, setClaimingPin] = useState(false)

  const [serverName, setServerName] = useState('')
  const [serverUrl, setServerUrl] = useState(initialNodeUrl || 'http://127.0.0.1:8090')
  const [serverRemoteUrl, setServerRemoteUrl] = useState('')
  const [serverToken, setServerToken] = useState('')
  const [manualIsLocal, setManualIsLocal] = useState(true)
  const [serverSubmitting, setServerSubmitting] = useState(false)

  const resetAndClose = () => {
    setClaimPin('')
    setClaimNodeUrl('')
    setClaimServerName('')
    setServerName('')
    setServerUrl('http://127.0.0.1:8090')
    setServerRemoteUrl('')
    setServerToken('')
    setConnectTab('claim')
    onClose()
  }

  const handleClaimByPin = async (e: React.FormEvent) => {
    e.preventDefault()
    const pin = claimPin.trim().toUpperCase()
    if (!pin) return
    const effectiveName = claimServerName.trim() || defaultName
    const targetUrl = claimNodeUrl.trim() || (claimIsLocal ? 'http://127.0.0.1:8090' : undefined)
    setClaimingPin(true)
    try {
      const server = await claimServerMutation.mutateAsync({
        claim_code: pin,
        node_url: targetUrl,
        server_name: effectiveName,
        is_local: claimIsLocal,
      })
      toast({
        title: 'Node claimed successfully',
        description: `Connected ${server.name || effectiveName} to your Otix account.`,
        variant: 'success',
      })
      resetAndClose()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Claim Failed',
        description:
          error.response?.data?.error ||
          error.message ||
          'Invalid or expired claim PIN. Check your node dashboard.',
        variant: 'error',
      })
    } finally {
      setClaimingPin(false)
    }
  }

  const handleAddServer = async (e: React.FormEvent) => {
    e.preventDefault()
    const targetUrl = serverUrl.trim() || (manualIsLocal ? 'http://127.0.0.1:8090' : '')
    if (!targetUrl || !serverToken.trim()) return
    const effectiveName = serverName.trim() || defaultName
    setServerSubmitting(true)
    try {
      const server = await createServerMutation.mutateAsync({
        name: effectiveName,
        local_url: targetUrl,
        remote_url: serverRemoteUrl.trim() || undefined,
        auth_token: serverToken.trim() || undefined,
        is_local: manualIsLocal,
      })
      if (server.isOnline) {
        toast({
          title: 'Node connected',
          description: `Successfully linked ${server.name || effectiveName}.`,
          variant: 'success',
        })
      } else {
        toast({
          title: 'Saved, but marked offline',
          description:
            server.connectError ||
            'Otix could not reach this URL from the API. Check that the node is running and ping again.',
          variant: 'error',
        })
      }
      resetAndClose()
    } catch (err: unknown) {
      const error = err as { response?: { data?: { error?: string } }; message?: string }
      toast({
        title: 'Failed to connect node',
        description:
          error.response?.data?.error ||
          error.message ||
          'Check URL, token, and network connection.',
        variant: 'error',
      })
    } finally {
      setServerSubmitting(false)
    }
  }

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => !open && resetAndClose()}
      title="Connect Otix Node"
      description="Claim a running node with its PIN, or link one manually with a URL and access token."
      className="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        <NodesFeatureTags />

        <div className="flex items-center gap-1 border-b border-white/10 pb-3">
          <button
            type="button"
            onClick={() => setConnectTab('claim')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              connectTab === 'claim'
                ? 'bg-primary text-primary-foreground font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
            )}
          >
            <KeyRound size={13} />
            Claim with PIN (Recommended)
          </button>
          <button
            type="button"
            onClick={() => setConnectTab('manual')}
            className={cn(
              'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
              connectTab === 'manual'
                ? 'bg-primary text-primary-foreground font-bold'
                : 'text-muted-foreground hover:text-foreground hover:bg-white/5',
            )}
          >
            <Server size={13} />
            Manual URL &amp; Token
          </button>
        </div>

        {connectTab === 'claim' ? (
          <form onSubmit={handleClaimByPin} className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Node Location
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setClaimIsLocal(true)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    claimIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08]',
                  )}
                >
                  <span className="block font-bold">Local</span>
                  <span className="text-[10px] text-muted-foreground block">This computer or LAN</span>
                </button>
                <button
                  type="button"
                  onClick={() => setClaimIsLocal(false)}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    !claimIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08]',
                  )}
                >
                  <span className="block font-bold">Remote</span>
                  <span className="text-[10px] text-muted-foreground block">WAN / Cloud / VPS</span>
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                6-Character Claim PIN
              </label>
              <input
                type="text"
                required
                maxLength={8}
                placeholder="OTX-XXXX"
                value={claimPin}
                onChange={(e) => setClaimPin(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-lg bg-black/40 text-base font-mono tracking-widest font-bold text-primary placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
              />
              <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
                Run <span className="font-mono text-foreground/80">otix-node</span> and open its dashboard at{' '}
                <span className="font-mono text-foreground/80">http://&lt;node-ip&gt;:8090</span> to view your claim PIN.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Node URL{' '}
                  <span className="normal-case font-normal text-white/30">
                    ({claimIsLocal ? 'defaults to localhost' : 'required for remote'})
                  </span>
                </label>
                <input
                  type="url"
                  placeholder={claimIsLocal ? 'http://127.0.0.1:8090' : 'https://node.example.com:8090'}
                  value={claimNodeUrl}
                  onChange={(e) => setClaimNodeUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Node Name{' '}
                  <span className="normal-case font-normal text-white/30">(defaults to {defaultName})</span>
                </label>
                <input
                  type="text"
                  placeholder={defaultName}
                  value={claimServerName}
                  onChange={(e) => setClaimServerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <DkButton type="button" variant="secondary" size="sm" onClick={resetAndClose}>
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={claimingPin || !claimPin.trim()}
                className="gap-1.5"
              >
                <KeyRound size={13} />
                {claimingPin ? 'Connecting...' : 'Claim & Link Node'}
              </DkButton>
            </div>
          </form>
        ) : (
          <form onSubmit={handleAddServer} className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
                Node Location
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setManualIsLocal(true)
                    if (!serverUrl) setServerUrl('http://127.0.0.1:8090')
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    manualIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08]',
                  )}
                >
                  <span className="block font-bold">Local</span>
                  <span className="text-[10px] text-muted-foreground block">This computer or LAN</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setManualIsLocal(false)
                    if (serverUrl === 'http://127.0.0.1:8090') setServerUrl('')
                  }}
                  className={cn(
                    'px-3 py-2 rounded-lg text-xs font-medium border text-left transition-colors cursor-pointer',
                    !manualIsLocal
                      ? 'border-primary/50 bg-primary/10 text-foreground font-semibold'
                      : 'border-white/10 bg-white/5 text-muted-foreground hover:bg-white/[0.08]',
                  )}
                >
                  <span className="block font-bold">Remote</span>
                  <span className="text-[10px] text-muted-foreground block">WAN / Cloud / VPS</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  Node Name{' '}
                  <span className="normal-case font-normal text-white/30">(defaults to {defaultName})</span>
                </label>
                <input
                  type="text"
                  placeholder={defaultName}
                  value={serverName}
                  onChange={(e) => setServerName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                  {manualIsLocal ? 'Local URL' : 'Remote URL'}
                </label>
                <input
                  type="url"
                  required
                  placeholder={manualIsLocal ? 'http://127.0.0.1:8090' : 'https://node.example.com:8090'}
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                {manualIsLocal ? 'WAN / Remote URL (optional)' : 'Fallback Local URL (optional)'}
              </label>
              <input
                type="url"
                placeholder={manualIsLocal ? 'e.g. https://node.example.com:8090' : 'e.g. http://192.168.1.50:8090'}
                value={serverRemoteUrl}
                onChange={(e) => setServerRemoteUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Access Token
              </label>
              <input
                type="password"
                required
                placeholder="Paste the token from the node's dashboard"
                value={serverToken}
                onChange={(e) => setServerToken(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-black/40 text-xs text-foreground placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {serverUrl.trim() ? (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  <a
                    href={serverUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open node <ExternalLink size={11} />
                  </a>
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <DkButton type="button" variant="secondary" size="sm" onClick={resetAndClose}>
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                disabled={serverSubmitting}
              >
                {serverSubmitting ? 'Verifying & Linking...' : 'Connect & Link Node'}
              </DkButton>
            </div>
          </form>
        )}
      </div>
    </DkDialog>
  )
}
