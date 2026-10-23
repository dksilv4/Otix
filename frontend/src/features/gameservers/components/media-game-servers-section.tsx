import { useState } from 'react'
import { Server, Plus, RefreshCw, Share2, Users, Wifi, Play, Globe, Pencil } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { useGameServersByGame } from '../queries/gameservers-queries'
import { useGameServersRefresh } from '../hooks/use-game-servers-refresh'
import { CreateGameServerModal } from './create-game-server-modal'
import { EditGameServerModal } from './edit-game-server-modal'
import { ShareGameServerModal } from './share-game-server-modal'
import { JoinGameServerModal } from './join-game-server-modal'
import { GameServersFeatureTags } from './game-servers-feature-tags'
import type { DedicatedGameServer } from '../types'

interface MediaGameServersSectionProps {
  mediaId: string
  gameTitle: string
  className?: string
}

export const MediaGameServersSection = ({
  mediaId,
  gameTitle,
  className = '',
}: MediaGameServersSectionProps) => {
  const { data: servers = [] } = useGameServersByGame(mediaId)
  const { refreshingServerIds, refreshServer } = useGameServersRefresh(servers)

  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedShareServer, setSelectedShareServer] = useState<DedicatedGameServer | null>(null)
  const [selectedJoinServer, setSelectedJoinServer] = useState<DedicatedGameServer | null>(null)
  const [selectedEditServer, setSelectedEditServer] = useState<DedicatedGameServer | null>(null)

  const handleRefresh = (serverId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    void refreshServer(serverId)
  }

  // Hide section completely if no servers exist for this game/user
  if (servers.length === 0) {
    return null
  }

  return (
    <div id="media-game-servers-section" className={`space-y-4 ${className}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <Server size={18} className="text-primary" />
          <h3 className="text-base font-bold text-foreground tracking-tight">Dedicated Game Servers</h3>
          <GameServersFeatureTags />
          <span className="px-2 py-0.5 rounded-full bg-[var(--dk-surface-ghost)] text-muted-foreground border border-[var(--dk-separator)] text-xs font-semibold">
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {servers.map((server) => {
            const isOnline = server.status === 'online'
            return (
              <div
                key={server.id}
                className="p-4 rounded-2xl bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] border border-[var(--dk-separator)] transition-all flex flex-col justify-between gap-4 group"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isOnline
                            ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                            : 'bg-destructive/80'
                        }`}
                      />
                      <h4 className="text-sm font-bold text-foreground truncate" title={server.name}>
                        {server.name}
                      </h4>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRefresh(server.id, e)}
                        title="Query live server status from your PC"
                        disabled={refreshingServerIds.has(server.id)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          size={13}
                          className={
                            refreshingServerIds.has(server.id)
                              ? 'animate-spin text-primary'
                              : ''
                          }
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedShareServer(server)}
                        title="Share with friends or get invite link"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                      >
                        <Share2 size={13} />
                      </button>
                      {(server.isOwner || server.userPermission === 'admin') && (
                        <button
                          type="button"
                          onClick={() => setSelectedEditServer(server)}
                          title="Edit server settings"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1 font-mono">
                      <Globe size={12} className="text-primary" />
                      <span>{server.connectionAddress}</span>
                    </div>

                    {server.pingMs != null && (
                      <div className="flex items-center gap-1">
                        <Wifi size={12} className="text-primary" />
                        <span>{server.pingMs}ms</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 font-semibold text-foreground">
                      <Users size={12} className="text-primary" />
                      <span>
                        {server.currentPlayers} / {server.maxPlayers || '—'}
                      </span>
                    </div>
                  </div>

                  {server.description && (
                    <p className="text-xs text-muted-foreground line-clamp-1">{server.description}</p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[var(--dk-separator)]">
                  <span className="text-[11px] text-muted-foreground">
                    {server.isOwner ? 'Hosted by you' : `Shared by @${server.ownerUsername}`}
                  </span>

                  <DkButton
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => setSelectedJoinServer(server)}
                    className="gap-1.5 h-8 px-3 text-xs"
                  >
                    <Play size={12} fill="currentColor" />
                    <span>Join</span>
                  </DkButton>
                </div>
              </div>
            )
          })}
        </div>

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

      {selectedEditServer && (
        <EditGameServerModal
          server={selectedEditServer}
          isOpen={Boolean(selectedEditServer)}
          onClose={() => setSelectedEditServer(null)}
        />
      )}
    </div>
  )
}

