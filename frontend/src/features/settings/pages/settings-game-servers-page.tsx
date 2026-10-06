import { useState, useMemo } from 'react'
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
} from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import { useToast } from '@ui/molecules/toast'
import { useAuth } from '@/lib/providers/auth'
import { SectionHeader } from '../components/molecules/settings-section-header'
import { SettingsCard } from '../components/molecules/settings-card'
import { SettingsLockedState } from '../components/molecules/settings-locked-state'
import { useSettingsHashScroll } from '../hooks/use-settings-hash-scroll'
import {
  useGameServers,
  useDeleteGameServer,
  useQueryGameServer,
  CreateGameServerModal,
  ShareGameServerModal,
  JoinGameServerModal,
  GameServersFeatureTags,
  type DedicatedGameServer,
} from '@/features/gameservers'

export const SettingsGameServersPage = () => {
  useSettingsHashScroll()
  const { user } = useAuth()
  const { toast } = useToast()

  const { data: servers = [], isLoading } = useGameServers()
  const queryMutation = useQueryGameServer()
  const deleteMutation = useDeleteGameServer()

  const [search, setSearch] = useState('')
  const [createModalOpen, setCreateModalOpen] = useState(false)
  const [selectedShareServer, setSelectedShareServer] = useState<DedicatedGameServer | null>(null)
  const [selectedJoinServer, setSelectedJoinServer] = useState<DedicatedGameServer | null>(null)
  const [serverToDelete, setServerToDelete] = useState<DedicatedGameServer | null>(null)
  const [copiedId, setCopiedId] = useState<number | null>(null)

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

  const handleRefresh = (serverId: number, e: React.MouseEvent) => {
    e.stopPropagation()
    void queryMutation.mutateAsync(serverId)
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
        s.serverType.toLowerCase().includes(q),
    )
  }, [servers, search])

  if (!user) {
    return (
      <SettingsLockedState
        title="Authentication Required"
        description="Sign in to your Otix account to configure, monitor, and share dedicated multiplayer game servers."
      />
    )
  }

  return (
    <div id="settings-game-servers-section" className="space-y-6">
      <SectionHeader
        variant="page"
        icon={Gamepad2}
        title="Game Servers"
        badges={<GameServersFeatureTags />}
        description="Manage, monitor, and share dedicated multiplayer game servers for you and your friends."
        action={
          servers.length > 0 ? (
            <DkButton
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setCreateModalOpen(true)}
              className="gap-1.5"
            >
              <Plus size={14} />
              <span>Add Server</span>
            </DkButton>
          ) : undefined
        }
      />

      {/* Search and count filter */}
      {servers.length > 0 && (
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by server name, game, address..."
              className="w-full h-9 pl-9 pr-3 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/40 focus:outline-none focus:border-primary transition-colors"
            />
          </div>
          <div className="text-xs text-white/50 self-end sm:self-center font-medium">
            {filteredServers.length} {filteredServers.length === 1 ? 'server' : 'servers'}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {isLoading ? (
        <SettingsCard className="p-12 text-center text-xs text-white/40">
          Loading game servers...
        </SettingsCard>
      ) : servers.length === 0 ? (
        <SettingsCard className="p-8 sm:p-12 text-center flex flex-col items-center justify-center gap-4">
          <div className="w-14 h-14 rounded-3xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary">
            <Gamepad2 size={28} />
          </div>
          <div className="space-y-1.5 max-w-md">
            <h3 className="text-base font-bold text-white tracking-tight">No dedicated game servers</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Register your multiplayer dedicated servers (Minecraft, Steam/Source, Palworld, Valheim, CS2, etc.)
              to track live ping and player counts, and generate share links for friends.
            </p>
          </div>
          <DkButton
            type="button"
            variant="primary"
            size="sm"
            onClick={() => setCreateModalOpen(true)}
            className="gap-1.5 mt-2"
          >
            <Plus size={14} />
            <span>Add Game Server</span>
          </DkButton>
        </SettingsCard>
      ) : filteredServers.length === 0 ? (
        <SettingsCard className="p-8 text-center text-xs text-white/50">
          No game servers matched &quot;{search}&quot;.
        </SettingsCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredServers.map((server) => {
            const isOnline = server.status === 'online'
            const isCopied = copiedId === server.id
            const protocolLabel =
              server.serverType === 'minecraft'
                ? 'Minecraft'
                : server.serverType === 'steam_source'
                  ? 'Steam / Source'
                  : 'Generic TCP'

            return (
              <SettingsCard
                key={server.id}
                className="p-5 flex flex-col justify-between gap-4 border border-white/[0.08] hover:border-white/15 transition-all group"
              >
                <div className="space-y-3">
                  {/* Top Bar: Status, Name, Game Badge & Actions */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                          isOnline
                            ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]'
                            : 'bg-red-500/80'
                        }`}
                        title={isOnline ? 'Online' : 'Offline'}
                      />
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-white truncate" title={server.name}>
                          {server.name}
                        </h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[11px] font-semibold text-primary truncate">
                            {server.gameTitle || server.mediaItemTitle || 'Multiplayer Game'}
                          </span>
                          <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/10 text-white/60">
                            {protocolLabel}
                          </span>
                        </div>
                      </div>
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
                      {server.isOwner && (
                        <button
                          type="button"
                          onClick={() => setServerToDelete(server)}
                          title="Delete server"
                          className="p-1.5 rounded-lg text-white/40 hover:text-red-400 hover:bg-white/10 transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Address & Live Query Stats */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-white/60">
                    <button
                      type="button"
                      onClick={(e) => handleCopyAddress(server, e)}
                      title="Click to copy connection address"
                      className="flex items-center gap-1 font-mono text-[11px] px-2 py-0.5 rounded-md bg-white/5 hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
                    >
                      <Globe size={11} className="text-primary" />
                      <span>{server.connectionAddress}</span>
                      {isCopied ? (
                        <Check size={11} className="text-emerald-400 ml-1" />
                      ) : (
                        <Copy size={11} className="text-white/40 ml-1" />
                      )}
                    </button>

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

                    {server.currentMap && (
                      <span className="text-[11px] text-white/40 truncate max-w-[120px]" title={server.currentMap}>
                        Map: {server.currentMap}
                      </span>
                    )}
                  </div>

                  {server.description && (
                    <p className="text-xs text-white/50 line-clamp-2">{server.description}</p>
                  )}
                </div>

                {/* Card Footer: Host & Join Action */}
                <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
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
              </SettingsCard>
            )
          })}
        </div>
      )}

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
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-200 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-red-400 shrink-0 mt-0.5" />
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
                variant="danger"
                size="sm"
                onClick={handleDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="gap-1.5 bg-red-600 hover:bg-red-500 text-white"
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
    </div>
  )
};
