import { useState, useMemo, useEffect, useRef } from 'react'
import {
  Gamepad2,
  Plus,
  RefreshCw,
  Share2,
  Users,
  Wifi,
  Play,
  Globe,
  Trash2,
  Search,
  Copy,
  Check,
  AlertTriangle,
  Pencil,
  X,
  HardDrive,
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { cn } from '@/lib/utils'
import {
  useGameServers,
  useDeleteGameServer,
  useQueryGameServer,
  CreateGameServerModal,
  EditGameServerModal,
  ShareGameServerModal,
  JoinGameServerModal,
  type DedicatedGameServer,
} from '@/features/gameservers'

export interface GameServersDrawerProps {
  open: boolean
  onClose: () => void
  focusedServerId?: number | null
  onOpenCreateServer?: () => void
}

export const GameServersDrawer = ({
  open,
  onClose,
  focusedServerId,
  onOpenCreateServer,
}: GameServersDrawerProps) => {
  const { toast } = useToast()
  const { data: servers = [], isLoading } = useGameServers()
  const queryMutation = useQueryGameServer()
  const deleteMutation = useDeleteGameServer()

  const [search, setSearch] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedShareServer, setSelectedShareServer] = useState<DedicatedGameServer | null>(null)
  const [selectedJoinServer, setSelectedJoinServer] = useState<DedicatedGameServer | null>(null)
  const [selectedEditServer, setSelectedEditServer] = useState<DedicatedGameServer | null>(null)
  const [serverToDelete, setServerToDelete] = useState<DedicatedGameServer | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)
  const [refreshingServerIds, setRefreshingServerIds] = useState<Set<number>>(new Set())

  const itemRefs = useRef<Map<number, HTMLDivElement>>(new Map())

  useEffect(() => {
    if (focusedServerId && open) {
      const el = itemRefs.current.get(focusedServerId)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [focusedServerId, open])

  const handleCopyAddress = (server: DedicatedGameServer, e: React.MouseEvent) => {
    e.stopPropagation()
    void navigator.clipboard.writeText(server.connectionAddress)
    setCopiedId(server.id)
    toast({
      title: 'Address Copied',
      description: `${server.connectionAddress} copied to clipboard.`,
      variant: 'success',
    })
    setTimeout(() => setCopiedId(null), 2000)
  }

  const handleRefresh = async (serverId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    setRefreshingServerIds((prev) => new Set(prev).add(serverId))
    try {
      await queryMutation.mutateAsync(serverId)
    } finally {
      setRefreshingServerIds((prev) => {
        const next = new Set(prev)
        next.delete(serverId)
        return next
      })
    }
  }

  const handleDeleteConfirm = async () => {
    if (!serverToDelete) return
    try {
      await deleteMutation.mutateAsync(serverToDelete.id)
      toast({
        title: 'Server Deleted',
        description: `Successfully removed ${serverToDelete.name}.`,
        variant: 'success',
      })
      setServerToDelete(null)
    } catch (err: unknown) {
      toast({
        title: 'Failed to delete server',
        description: (err as { message?: string })?.message || 'Could not delete server.',
        variant: 'error',
      })
    }
  }

  const filteredServers = useMemo(() => {
    if (!search.trim()) return servers
    const q = search.toLowerCase().trim()
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.gameTitle.toLowerCase().includes(q) ||
        s.connectionAddress.toLowerCase().includes(q) ||
        s.serverType.toLowerCase().includes(q) ||
        (s.serverMachineName && s.serverMachineName.toLowerCase().includes(q)),
    )
  }, [servers, search])

  const handleOpenAdd = () => {
    if (onOpenCreateServer) {
      onOpenCreateServer()
    } else {
      setCreateModalOpen(true)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-xs z-40 sm:hidden"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Slide-over Right Panel */}
      <aside
        role="dialog"
        aria-label="Dedicated Game Servers"
        className={cn(
          'fixed inset-y-0 right-0 w-full sm:w-[480px] z-50 flex flex-col',
          'bg-[var(--dk-surface-base)]/95 backdrop-blur-2xl border-l border-white/[0.05] shadow-2xl',
          'animate-in slide-in-from-right duration-200 ease-out select-none',
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/[0.05]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-2xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
              <Gamepad2 size={18} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-foreground truncate">Game Servers</h3>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-primary/15 text-primary shrink-0">
                  {servers.length}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate">
                Multiplayer dedicated server manager
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={handleOpenAdd}
              className="gap-1.5 h-8 px-3 text-xs font-semibold"
            >
              <Plus size={13} />
              <span>Add Server</span>
            </DkButton>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close game servers drawer"
              className="h-8 w-8 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X size={15} />
            </button>
          </div>
        </div>

        {/* Search bar */}
        {servers.length > 0 && (
          <div className="px-5 py-3 border-b border-white/[0.04]">
            <div className="relative">
              <Search
                size={13}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by server name, game, address, host machine..."
                className="w-full h-8 pl-8 pr-3 rounded-xl bg-[var(--dk-surface-ghost)] text-xs text-foreground placeholder:text-muted-foreground focus:outline-none transition-colors border border-white/[0.04]"
              />
            </div>
          </div>
        )}

        {/* Server List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {isLoading ? (
            <div className="p-8 text-center text-xs text-muted-foreground">
              Loading dedicated game servers...
            </div>
          ) : servers.length === 0 ? (
            <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary">
                <Gamepad2 size={24} />
              </div>
              <div className="space-y-1 max-w-xs">
                <h4 className="text-sm font-bold text-foreground">No game servers registered</h4>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Add Minecraft, Steam/Source, Palworld, Valheim, or CS2 dedicated servers to monitor live status and invite friends.
                </p>
              </div>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleOpenAdd}
                className="gap-1.5 mt-1"
              >
                <Plus size={13} />
                <span>Add First Server</span>
              </DkButton>
            </div>
          ) : filteredServers.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              No game servers matched &quot;{search}&quot;.
            </div>
          ) : (
            filteredServers.map((server) => {
              const isOnline = server.status === 'online'
              const isCopied = copiedId === server.id
              const isFocused = focusedServerId === server.id
              const isRefreshing = refreshingServerIds.has(server.id)
              const protocolLabel =
                server.serverType === 'minecraft'
                  ? 'Minecraft'
                  : server.serverType === 'steam_source'
                    ? 'Steam / Source'
                    : 'Generic TCP'

              return (
                <div
                  key={server.id}
                  ref={(el) => {
                    if (el) itemRefs.current.set(server.id, el)
                    else itemRefs.current.delete(server.id)
                  }}
                  className={cn(
                    'p-4 rounded-2xl bg-[var(--dk-surface-field)] border border-white/[0.04]',
                    'hover:bg-[var(--dk-surface-field)]/80 transition-all space-y-3',
                    isFocused && 'ring-2 ring-primary/60 bg-primary/[0.04] shadow-md shadow-primary/10',
                  )}
                >
                  {/* Top Bar: Status, Name, Protocol, Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={cn(
                          'w-2.5 h-2.5 rounded-full shrink-0',
                          isOnline
                            ? 'bg-primary shadow-[0_0_8px_var(--primary)]'
                            : 'bg-destructive/80',
                        )}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-foreground truncate" title={server.name}>
                          {server.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[11px] font-semibold text-primary truncate">
                            {server.gameTitle || server.mediaItemTitle || 'Multiplayer Game'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-[var(--dk-surface-ghost)] text-muted-foreground">
                            {protocolLabel}
                          </span>
                          {server.serverMachineName && (
                            <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.2 rounded-md bg-primary/10 text-primary">
                              <HardDrive size={9} />
                              <span className="truncate max-w-[120px]">{server.serverMachineName}</span>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleRefresh(server.id, e)}
                        title="Query live server status"
                        disabled={isRefreshing}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                      >
                        <RefreshCw
                          size={12}
                          className={isRefreshing ? 'animate-spin text-primary' : ''}
                        />
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedShareServer(server)}
                        title="Share with friends or get invite link"
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                      >
                        <Share2 size={12} />
                      </button>
                      {(server.isOwner || server.userPermission === 'admin') && (
                        <button
                          type="button"
                          onClick={() => setSelectedEditServer(server)}
                          title="Edit server settings"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                      {server.isOwner && (
                        <button
                          type="button"
                          onClick={() => setServerToDelete(server)}
                          title="Delete server"
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-[var(--dk-surface-hover)] transition-colors cursor-pointer"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Address, Ping, and Players */}
                  <div className="flex flex-wrap items-center gap-2.5 text-xs text-muted-foreground">
                    <button
                      type="button"
                      onClick={(e) => handleCopyAddress(server, e)}
                      title="Click to copy connection address"
                      className="flex items-center gap-1 font-mono text-[10px] px-2 py-0.5 rounded-md bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-hover)] text-foreground transition-colors cursor-pointer border border-white/[0.04]"
                    >
                      <Globe size={10} className="text-primary" />
                      <span>{server.connectionAddress}</span>
                      {isCopied ? (
                        <Check size={10} className="text-primary ml-1" />
                      ) : (
                        <Copy size={10} className="text-muted-foreground ml-1" />
                      )}
                    </button>

                    {server.pingMs != null && (
                      <div className="flex items-center gap-1 text-[11px]">
                        <Wifi size={11} className="text-primary" />
                        <span>{server.pingMs}ms</span>
                      </div>
                    )}

                    <div className="flex items-center gap-1 text-[11px] font-semibold text-foreground">
                      <Users size={11} className="text-primary" />
                      <span>
                        {server.currentPlayers} / {server.maxPlayers || '—'}
                      </span>
                    </div>

                    {server.currentMap && (
                      <span className="text-[10px] text-muted-foreground truncate max-w-[110px]" title={server.currentMap}>
                        Map: {server.currentMap}
                      </span>
                    )}
                  </div>

                  {/* Player list tags if active */}
                  {server.playerList && server.playerList.length > 0 && (
                    <div className="flex items-center gap-1 flex-wrap pt-0.5">
                      {server.playerList.slice(0, 5).map((player, idx) => (
                        <span
                          key={idx}
                          className="px-1.5 py-0.2 rounded text-[10px] font-medium bg-[var(--dk-surface-raised)] text-foreground/80 border border-white/[0.04]"
                        >
                          {player}
                        </span>
                      ))}
                      {server.playerList.length > 5 && (
                        <span className="text-[10px] text-muted-foreground font-medium">
                          +{server.playerList.length - 5} more
                        </span>
                      )}
                    </div>
                  )}

                  {/* Bottom Footer: Host info and Join button */}
                  <div className="flex items-center justify-between pt-1 border-t border-white/[0.04]">
                    <span className="text-[10px] text-muted-foreground">
                      {server.isOwner ? 'Hosted by you' : `@${server.ownerUsername}`}
                    </span>

                    <DkButton
                      type="button"
                      variant="primary"
                      size="sm"
                      onClick={() => setSelectedJoinServer(server)}
                      className="gap-1 h-7 px-2.5 text-[11px] font-bold"
                    >
                      <Play size={11} fill="currentColor" />
                      <span>Join</span>
                    </DkButton>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </aside>

      {/* Delete Confirmation Modal */}
      {serverToDelete && (
        <DkDialog
          open={Boolean(serverToDelete)}
          onOpenChange={(open) => !open && setServerToDelete(null)}
          title="Delete Game Server"
          description="Are you sure you want to remove this dedicated game server?"
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-destructive/10 text-xs text-destructive flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
              <span>
                Removing <strong>{serverToDelete.name}</strong> will revoke all friend shares and active invite links.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setServerToDelete(null)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="gap-1.5"
              >
                <Trash2 size={13} />
                <span>{deleteMutation.isPending ? 'Deleting...' : 'Delete Server'}</span>
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}

      {/* Create Modal */}
      {createModalOpen && (
        <CreateGameServerModal
          isOpen={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
        />
      )}

      {/* Share Modal */}
      {selectedShareServer && (
        <ShareGameServerModal
          server={selectedShareServer}
          isOpen={Boolean(selectedShareServer)}
          onClose={() => setSelectedShareServer(null)}
        />
      )}

      {/* Join Modal */}
      {selectedJoinServer && (
        <JoinGameServerModal
          server={selectedJoinServer}
          isOpen={Boolean(selectedJoinServer)}
          onClose={() => setSelectedJoinServer(null)}
        />
      )}

      {/* Edit Modal */}
      {selectedEditServer && (
        <EditGameServerModal
          server={selectedEditServer}
          isOpen={Boolean(selectedEditServer)}
          onClose={() => setSelectedEditServer(null)}
        />
      )}
    </>
  )
}
