import { useState } from 'react'
import { Copy, Check, Play, Key, Users, Wifi } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useToast } from '@ui/molecules/toast'
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

  const isOnline = server.status === 'online'
  const isSteam = server.serverType === 'steam_source'
  const steamConnectUrl = `steam://connect/${server.connectionAddress}${
    server.password ? `/${encodeURIComponent(server.password)}` : ''
  }`

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

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title={`Connect to ${server.name}`}
      description={server.description || 'Connection details and direct join link.'}
      className="max-w-md"
    >
      <div className="space-y-5 pt-2">
        {/* Status card */}
        <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`w-3 h-3 rounded-full ${
                isOnline ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-red-500'
              }`}
            />
            <div>
              <div className="text-sm font-semibold text-white capitalize">{server.status}</div>
              <div className="text-xs text-white/50">
                {server.currentMap ? `Map: ${server.currentMap}` : server.serverType}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 text-right">
            {server.pingMs != null && (
              <div className="flex items-center gap-1 text-xs text-white/60">
                <Wifi size={13} className="text-primary" />
                <span>{server.pingMs}ms</span>
              </div>
            )}
            <div className="flex items-center gap-1 text-xs font-semibold text-white/80">
              <Users size={13} className="text-primary" />
              <span>
                {server.currentPlayers} / {server.maxPlayers || '—'}
              </span>
            </div>
          </div>
        </div>

        {/* Server Address */}
        <div>
          <label className="text-xs font-semibold text-white/70 block mb-1.5">Server Address (IP:Port)</label>
          <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
            <span className="flex-1 px-2 font-mono text-sm text-white select-all">
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

        {/* Server Password (if any) */}
        {server.password && (
          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1.5 flex items-center gap-1">
              <Key size={13} className="text-amber-400" />
              <span>Server Password</span>
            </label>
            <div className="flex items-center gap-2 p-2 rounded-xl bg-white/5 border border-white/10">
              <span className="flex-1 px-2 font-mono text-sm text-white select-all">
                {server.password}
              </span>
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
          </div>
        )}

        {/* Player List (if any) */}
        {server.playerList && server.playerList.length > 0 && (
          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1.5">
              Online Players ({server.playerList.length})
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 rounded-xl bg-white/5 border border-white/10">
              {server.playerList.map((player, idx) => (
                <span
                  key={idx}
                  className="px-2 py-0.5 rounded-md bg-white/10 text-xs font-medium text-white/80"
                >
                  {player}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <DkButton type="button" variant="ghost" onClick={onClose}>
            Close
          </DkButton>

          {isSteam && (
            <a
              href={steamConnectUrl}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary/90 text-white text-xs font-bold transition-all shadow-md active:scale-95"
            >
              <Play size={14} fill="white" />
              <span>1-Click Steam Join</span>
            </a>
          )}
        </div>
      </div>
    </DkDialog>
  )
};
