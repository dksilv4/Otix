import { useState } from 'react'
import { Copy, Check, Play, Key, Users, Wifi, Eye, EyeOff, Globe } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
import { openExternal } from '@/lib/utils/open-external'
import { getSteamConnectionInfo } from '../utils/connection'
import type { DedicatedGameServer } from '../types'

interface JoinGameServerModalProps {
  server: DedicatedGameServer
  isOpen: boolean
  onClose: () => void
}

export const JoinGameServerModal = ({ server, isOpen, onClose }: JoinGameServerModalProps) => {
  const { toast } = useToast()
  const [copiedAddress, setCopiedAddress] = useState(false)
  const [copiedPassword, setCopiedPassword] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const isOnline = server.status === 'online'
  const isSteam = server.serverType === 'steam_source'

  const { steamAppId, steamConnectAddress, steamJoinUrl } = getSteamConnectionInfo(server)

  const handleCopyAddress = () => {
    void navigator.clipboard.writeText(server.connectionAddress)
    setCopiedAddress(true)
    toast({
      title: 'Address Copied',
      description: `${server.connectionAddress} copied to clipboard.`,
      variant: 'success',
    })
    setTimeout(() => setCopiedAddress(false), 2000)
  }

  const handleCopyPassword = () => {
    if (!server.password) return
    void navigator.clipboard.writeText(server.password)
    setCopiedPassword(true)
    toast({
      title: 'Password Copied',
      description: 'Server password copied to clipboard.',
      variant: 'success',
    })
    setTimeout(() => setCopiedPassword(false), 2000)
  }

  const handleSteamJoin = (e: React.MouseEvent) => {
    e.preventDefault()
    if (server.password) {
      void navigator.clipboard.writeText(server.password)
      toast({
        title: 'Launching Game via Steam',
        description: `Server password copied to clipboard. Press Ctrl+V when prompted in-game!`,
        variant: 'success',
      })
    }
    openExternal(steamJoinUrl)
  }

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={`Connect to ${server.name}`}
      description={server.description || 'Connection details and direct join link.'}
      className="max-w-md"
    >
      <div className="space-y-4 pt-2">
        {/* Status card */}
        <div className="p-3.5 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                isOnline ? 'bg-primary shadow-[0_0_8px_var(--primary)]' : 'bg-destructive/80'
              }`}
            />
            <div>
              <div className="text-sm font-semibold text-foreground capitalize">{server.status}</div>
              <div className="text-xs text-muted-foreground">
                {server.currentMap ? `Map: ${server.currentMap}` : server.gameTitle || server.serverType}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            {server.pingMs != null && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Wifi size={13} className="text-primary" />
                <span>{server.pingMs}ms</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs font-semibold text-foreground">
              <Users size={13} className="text-primary" />
              <span>
                {server.currentPlayers} / {server.maxPlayers || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Server Address for In-Game Connect */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Globe size={13} className="text-primary" />
              <span>In-Game Direct Connect (IP:Port)</span>
            </label>
            <span className="text-[11px] text-muted-foreground">For in-game &ldquo;Join by IP&rdquo;</span>
          </div>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
            <span className="flex-1 px-2 font-mono text-sm text-foreground select-all">
              {server.connectionAddress}
            </span>
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopyAddress}
              className="h-8 gap-1.5 shrink-0"
            >
              {copiedAddress ? <Check size={13} /> : <Copy size={13} />}
              <span>{copiedAddress ? 'Copied' : 'Copy'}</span>
            </DkButton>
          </div>
        </div>

        {/* Server Password (if any) with show/hide toggle */}
        {server.password && (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Key size={13} className="text-primary" />
                <span>Server Password</span>
              </label>
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
              >
                {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                <span>{showPassword ? 'Hide' : 'Show'}</span>
              </button>
            </div>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              <input
                type={showPassword ? 'text' : 'password'}
                readOnly
                value={server.password}
                className="flex-1 px-2 font-mono text-sm text-foreground bg-transparent border-0 focus:outline-none select-all"
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                title={showPassword ? 'Hide password' : 'Show password'}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer shrink-0"
              >
                {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyPassword}
                className="h-8 gap-1.5 shrink-0"
              >
                {copiedPassword ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedPassword ? 'Copied' : 'Copy'}</span>
              </DkButton>
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">
              Password is copied automatically on 1-Click Join. Since game clients prompt for passwords in-game for security, just press <kbd className="px-1 py-0.5 rounded bg-[var(--dk-surface-raised)] border border-white/[0.06] text-foreground font-mono text-[10px]">Ctrl+V</kbd> when prompted.
            </p>
          </div>
        )}

        {/* Player List (if any) */}
        {server.playerList && server.playerList.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1.5">
              Online Players ({server.playerList.length})
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
              {server.playerList.map((player, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-[var(--dk-surface-raised)] text-xs font-medium text-foreground border border-white/[0.04]"
                >
                  {player}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col items-end gap-1.5 pt-3 border-t border-white/[0.04]">
          <div className="flex items-center justify-end gap-3 w-full">
            <DkButton type="button" variant="ghost" onClick={onClose}>
              Close
            </DkButton>

            {isSteam && (
              <a
                href={steamJoinUrl}
                onClick={handleSteamJoin}
                title={steamAppId ? `Launch ${server.gameTitle || 'game'} via Steam` : 'Join via Steam'}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold transition-all shadow-md active:scale-95"
              >
                <Play size={14} fill="currentColor" />
                <span>1-Click Steam Join</span>
              </a>
            )}
          </div>
          {isSteam && (
            <span className="text-[10px] text-muted-foreground font-mono">
              {steamAppId
                ? `Launches ${server.gameTitle || 'Game'} (+connect ${server.connectionAddress})`
                : `Steam A2S Query: ${steamConnectAddress}`}
            </span>
          )}
        </div>
      </div>
    </DkDialog>
  )
}
