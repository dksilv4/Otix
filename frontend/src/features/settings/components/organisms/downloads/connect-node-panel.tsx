import React from 'react'
import { Server, KeyRound, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface ConnectNodePanelProps {
  connectTab: 'claim' | 'manual'
  setConnectTab: (tab: 'claim' | 'manual') => void
  claimPin: string
  setClaimPin: (pin: string) => void
  claimNodeUrl: string
  setClaimNodeUrl: (url: string) => void
  claimServerName: string
  setClaimServerName: (name: string) => void
  claimIsLocal: boolean
  setClaimIsLocal: (local: boolean) => void
  claimingPin: boolean
  handleClaimByPin: (e: React.FormEvent) => void
  serverName: string
  setServerName: (name: string) => void
  serverUrl: string
  setServerUrl: (url: string) => void
  serverRemoteUrl: string
  setServerRemoteUrl: (url: string) => void
  serverToken: string
  setServerToken: (token: string) => void
  manualIsLocal: boolean
  setManualIsLocal: (local: boolean) => void
  serverSubmitting: boolean
  handleAddServer: (e: React.FormEvent) => void
  defaultAutoName: string
  onCancel: () => void
}

export const ConnectNodePanel = ({
  connectTab,
  setConnectTab,
  claimPin,
  setClaimPin,
  claimNodeUrl,
  setClaimNodeUrl,
  claimServerName,
  setClaimServerName,
  claimIsLocal,
  setClaimIsLocal,
  claimingPin,
  handleClaimByPin,
  serverName,
  setServerName,
  serverUrl,
  setServerUrl,
  serverRemoteUrl,
  setServerRemoteUrl,
  serverToken,
  setServerToken,
  manualIsLocal,
  setManualIsLocal,
  serverSubmitting,
  handleAddServer,
  defaultAutoName,
  onCancel,
}: ConnectNodePanelProps) => {
  return (
    <div className="p-4 rounded-xl bg-[var(--dk-surface-ghost)] space-y-4">
      <div className="flex items-center gap-1 pb-3">
        <button
          type="button"
          onClick={() => setConnectTab('claim')}
          className={cn(
            'px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer',
            connectTab === 'claim'
              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
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
              ? 'bg-primary text-primary-foreground font-bold shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
          )}
        >
          <Server size={13} />
          Manual URL &amp; Token
        </button>
      </div>

      {connectTab === 'claim' ? (
        <form onSubmit={handleClaimByPin} className="space-y-3">
          {/* Local vs Remote toggle */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Node Location
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <button
                type="button"
                onClick={() => setClaimIsLocal(true)}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer',
                  claimIsLocal
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                )}
              >
                <span className="block font-bold">Local</span>
                <span className="text-[10px] text-muted-foreground block">This computer or LAN</span>
              </button>
              <button
                type="button"
                onClick={() => setClaimIsLocal(false)}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer',
                  !claimIsLocal
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
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
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <input
                type="text"
                required
                maxLength={8}
                placeholder="OTX-XXXX"
                value={claimPin}
                onChange={(e) => setClaimPin(e.target.value.toUpperCase())}
                className="w-full sm:w-44 px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-base font-mono tracking-widest font-bold text-primary placeholder:text-muted-foreground/30 focus:outline-none focus:ring-2 focus:ring-primary/40 uppercase"
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Run <span className="font-mono text-foreground font-medium">otix-node</span> on Mac, Windows, Linux, or Docker and open its web dashboard at{' '}
                <span className="font-mono text-foreground font-medium">http://&lt;node-ip&gt;:8090</span> to view your claim PIN.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Node URL <span className="normal-case font-normal text-muted-foreground/70">({claimIsLocal ? 'defaults to http://127.0.0.1:8090' : 'required for remote'})</span>
              </label>
              <input
                type="url"
                placeholder={claimIsLocal ? 'http://127.0.0.1:8090' : 'https://node.example.com:8090'}
                value={claimNodeUrl}
                onChange={(e) => setClaimNodeUrl(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">
                Node Name <span className="normal-case font-normal text-muted-foreground/70">(defaults to {defaultAutoName})</span>
              </label>
              <input
                type="text"
                placeholder={defaultAutoName}
                value={claimServerName}
                onChange={(e) => setClaimServerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={claimingPin || !claimPin.trim()}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              <KeyRound size={13} />
              {claimingPin ? 'Connecting & Verifying...' : 'Claim & Link Node'}
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleAddServer} className="space-y-3">
          {/* Local vs Remote toggle */}
          <div>
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1.5">
              Node Location
            </label>
            <div className="grid grid-cols-2 gap-2 max-w-sm">
              <button
                type="button"
                onClick={() => {
                  setManualIsLocal(true)
                  if (!serverUrl) setServerUrl('http://127.0.0.1:8090')
                }}
                className={cn(
                  'px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer',
                  manualIsLocal
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
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
                  'px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors cursor-pointer',
                  !manualIsLocal
                    ? 'bg-primary/10 text-foreground font-semibold'
                    : 'bg-[var(--dk-surface-field)] text-muted-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
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
                Node Name <span className="normal-case font-normal text-muted-foreground/70">(defaults to {defaultAutoName})</span>
              </label>
              <input
                type="text"
                placeholder={defaultAutoName}
                value={serverName}
                onChange={(e) => setServerName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
                className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
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
              className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              Used when opening Otix away from home.
            </p>
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
              className="w-full px-3 py-2 rounded-lg bg-[var(--dk-surface-field)] text-xs text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              Open the node in a browser, copy its access token, then paste it here.
              {serverUrl.trim() ? (
                <>
                  {' '}
                  <a
                    href={serverUrl.trim()}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    Open node <ExternalLink size={11} />
                  </a>
                </>
              ) : null}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 rounded-lg bg-[var(--dk-surface-field)] hover:bg-[var(--dk-surface-ghost-hover)] text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={serverSubmitting}
              className="px-4 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 cursor-pointer"
            >
              {serverSubmitting ? 'Verifying & Linking...' : 'Connect & Link Node'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
