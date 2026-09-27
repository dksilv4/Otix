import { useState } from 'react'
import { Server, Plus, RefreshCw, Share2, Users, Wifi, Play, Globe } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useGameServersByGame, useQueryGameServer } from '../queries/gameservers-queries'
import { CreateGameServerModal } from './create-game-server-modal'
import { ShareGameServerModal } from './share-game-server-modal'
import { JoinGameServerModal } from './join-game-server-modal'
import type { DedicatedGameServer } from '../types'

interface MediaGameServersSectionProps {
  mediaId: string
  gameTitle: string
  className?: string
}

export function MediaGameServersSection({
  mediaId,
  gameTitle,
  className = '',
}: MediaGameServersSectionProps) {
  const { data: servers = [], isLoading } = useGameServersByGame(mediaId)
  const queryMutation = useQueryGameServer()

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedShareServer, setSelectedShareServer] = useState<DedicatedGameServer | null>(null)
  const [selectedJoinServer, setSelectedJoinServer] = useState<DedicatedGameServer | null>(null)

  const handleRefresh = (serverId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    void queryMutation.mutateAsync(serverId)
  }

  return (
    <div id="media-game-servers-section" className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Server size={18} className="text-primary" />
          <h3 className="text-base font-bold text-white tracking-tight">Dedicated Game Servers</h3>
          <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-xs font-semibold">
            {servers.length}
          </span>
        </div>

        <DkButton
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setCreateModalOpen(true)}
          className="gap-1.5"
        >
          <Plus size={14} />
          <span>Add Server</span>
        </DkButton>
      </div>

      {isLoading ? (
        <div className="p-8 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-center text-xs text-white/40">
          Loading game servers...
        </div>
      ) : servers.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex flex-col items-center justify-center text-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50">
            <Server size={20} />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-white">No game servers tracked yet</h4>
            <p className="text-xs text-white/50 max-w-sm">
              Add your private or community multiplayer server to monitor live status and share access with friends.
            </p>
          </div>
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="gap-1.5 mt-1"
          >
            <Plus size={14} />
            <span>Add Server</span>
          </DkButton>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {servers.map((server) => {
            const isOnline = server.status === 'online'
            return (
              <div
                key={server.id}
                className="p-4 rounded-2xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.08] transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isOnline
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                            : 'bg-red-500/80'
                        }`}
                      />
                      <h4 className="text-sm font-bold text-white truncate" title={server.name}>
                        {server.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRefresh(server.id, e)}
                        title="Query live server status"
                        disabled={queryMutation.isPending}
                        className="p-1.5 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          size={13}
                          className={
                            queryMutation.isPending && queryMutation.variables === server.id
                              ? 'animate-spin text-primary'
                              : ''
                          }
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedShareServer(server)}
                        title="Share with friends or get invite link"
                        className="p-1.5 rounded-lg text-white/40 hover:text-primary hover:bg-white/10 transition-colors cursor-pointer"
                      >
                        <Share2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-white/60">
                    <div className="flex items-center gap-1 font-mono">
                      <Globe size={12} className="text-primary" />
                      <span>{server.connectionAddress}</span>
                    </div>

                    {server.pingMs != null && (
                      <div className="flex items-center gap-1">
                        <Wifi size={12} className="text-emerald-400" />
                        <span>{server.pingMs}ms</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 font-semibold text-white/80">
                      <Users size={12} className="text-primary" />
                      <span>
                        {server.currentPlayers} / {server.maxPlayers || '—'}
                      </span>
                    </div>
                  </div>

                  {server.description && (
                    <p className="text-xs text-white/50 line-clamp-1">{server.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                  <span className="text-[11px] text-white/40">
                    {server.isOwner ? 'Hosted by you' : `Shared by @${server.ownerUsername}`}
                  </span>

                  <DkButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedJoinServer(server)}
                    className="gap-1.5 h-8 px-3 text-xs"
                  >
                    <Play size={12} fill="white" />
                    <span>Join</span>
                  </DkButton>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modals */}
      {createModalOpen && (
        <CreateGameServerModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          initialMediaId={mediaId}
          initialGameTitle={gameTitle}
        />
      )}

      {selectedShareServer && (
        <ShareGameServerModal
          server={selectedShareServer}
          isOpen={Boolean(selectedShareServer)}
          onClose={() => setSelectedShareServer(null)}
        />
      )}

      {selectedJoinServer && (
        <JoinGameServerModal
          server={selectedJoinServer}
          isOpen={Boolean(selectedJoinServer)}
          onClose={() => setSelectedJoinServer(null)}
        />
      )}
    </div>
  )
}
