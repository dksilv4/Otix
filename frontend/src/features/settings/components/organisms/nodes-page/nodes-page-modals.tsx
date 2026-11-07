import React from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkDialog } from '@ui/molecules/dialog'
import type { GameServer } from '@/features/downloads/types'
import type { PendingNode } from '@/features/downloads/pending-nodes'
import type { UserHome, UserServerMachine } from '../../types/server-machines'
import type { SambaShareConfig } from '../../types/node-map'
import { CreateWorkerNodeModal } from '../create-worker-node-modal'
import { DuplicateWorkerNodeModal } from '../duplicate-worker-node-modal'
import { EditWorkerNodeModal } from '../edit-worker-node-modal'
import { CreateServerMachineModal } from '../create-server-machine-modal'
import { EditServerMachineModal } from '../edit-server-machine-modal'
import { CreateHomeModal } from '../create-home-modal'
import { EditHomeModal } from '../edit-home-modal'
import { CreateSambaShareModal } from '../create-samba-share-modal'
import { EditSambaShareModal } from '../edit-samba-share-modal'
import { AddNodeModal } from '../add-node-modal'
import { GameServersDrawer } from '../game-servers-drawer'
import {
  CreateGameServerModal,
  EditGameServerModal,
  type DedicatedGameServer,
} from '@/features/gameservers'

export interface NodesPageModalsProps {
  nodeToDelete: GameServer | null
  setNodeToDelete: (node: GameServer | null) => void
  onDeleteConfirm: () => void
  deleteServerPending: boolean
  nodeToRename: GameServer | null
  setNodeToRename: (node: GameServer | null) => void
  renameInput: string
  setRenameInput: (name: string) => void
  onRenameConfirm: (e: React.FormEvent) => void
  isSavingRename: boolean
  createWorkerNodeOpen: boolean
  setCreateWorkerNodeOpen: (open: boolean) => void
  connectInitialUrl: string
  setConnectInitialUrl: (url: string) => void
  unclaimedNodes: PendingNode[]
  defaultAutoName: string
  homes: UserHome[]
  serverMachines: UserServerMachine[]
  gameServers: GameServer[]
  editingWorkerNode: GameServer | null
  setEditingWorkerNode: (node: GameServer | null) => void
  handleOpenNodeSettings: (node: GameServer) => void
  duplicateWorkerNodeOpen: boolean
  setDuplicateWorkerNodeOpen: (open: boolean) => void
  nodeToDuplicate: GameServer | null
  setNodeToDuplicate: (node: GameServer | null) => void
  createServerMachineOpen: boolean
  setCreateServerMachineOpen: (open: boolean) => void
  createServerHomeId: number | null
  editingServerMachine: UserServerMachine | null
  setEditingServerMachine: (server: UserServerMachine | null) => void
  createHomeOpen: boolean
  setCreateHomeOpen: (open: boolean) => void
  editingHome: UserHome | null
  setEditingHome: (home: UserHome | null) => void
  createSambaOpen: boolean
  setCreateSambaOpen: (open: boolean) => void
  createSambaPreset: Partial<SambaShareConfig> | null
  editingSamba: SambaShareConfig | null
  setEditingSamba: (samba: SambaShareConfig | null) => void
  onSaveCustomSamba: (config: SambaShareConfig) => void
  onDeleteCustomSamba: (id: string) => void
  addNodeModalOpen: boolean
  setAddNodeModalOpen: (open: boolean) => void
  addModalOpen: boolean
  setAddModalOpen: (open: boolean) => void
  onSelectNodeType: (type: 'worker' | 'server' | 'home' | 'samba' | 'game_server') => void
  onClaimQuickNode: (node: PendingNode) => void
  gameServersDrawerOpen: boolean
  setGameServersDrawerOpen: (open: boolean) => void
  focusedGameServerId: number | null
  createGameServerOpen: boolean
  setCreateGameServerOpen: (open: boolean) => void
  createGameServerMachineId: number | null
  setCreateGameServerMachineId: (id: number | null) => void
  editingGameServer: DedicatedGameServer | null
  setEditingGameServer: (server: DedicatedGameServer | null) => void
}

export const NodesPageModals = ({
  nodeToDelete,
  setNodeToDelete,
  onDeleteConfirm,
  deleteServerPending,
  nodeToRename,
  setNodeToRename,
  renameInput,
  setRenameInput,
  onRenameConfirm,
  isSavingRename,
  createWorkerNodeOpen,
  setCreateWorkerNodeOpen,
  connectInitialUrl,
  setConnectInitialUrl,
  unclaimedNodes,
  defaultAutoName,
  homes,
  serverMachines,
  gameServers,
  editingWorkerNode,
  setEditingWorkerNode,
  handleOpenNodeSettings,
  duplicateWorkerNodeOpen,
  setDuplicateWorkerNodeOpen,
  nodeToDuplicate,
  setNodeToDuplicate,
  createServerMachineOpen,
  setCreateServerMachineOpen,
  createServerHomeId,
  editingServerMachine,
  setEditingServerMachine,
  createHomeOpen,
  setCreateHomeOpen,
  editingHome,
  setEditingHome,
  createSambaOpen,
  setCreateSambaOpen,
  createSambaPreset,
  editingSamba,
  setEditingSamba,
  onSaveCustomSamba,
  onDeleteCustomSamba,
  addNodeModalOpen,
  setAddNodeModalOpen,
  addModalOpen,
  setAddModalOpen,
  onSelectNodeType,
  onClaimQuickNode,
  gameServersDrawerOpen,
  setGameServersDrawerOpen,
  focusedGameServerId,
  createGameServerOpen,
  setCreateGameServerOpen,
  createGameServerMachineId,
  setCreateGameServerMachineId,
  editingGameServer,
  setEditingGameServer,
}: NodesPageModalsProps) => {
  return (
    <>
      {nodeToDelete && (
        <DkDialog
          open={Boolean(nodeToDelete)}
          onOpenChange={(open) => !open && setNodeToDelete(null)}
          title="Disconnect Node"
          description="Are you sure you want to disconnect this Otix node?"
          className="max-w-md"
        >
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl bg-destructive/10 text-xs text-foreground/90 flex items-start gap-2.5">
              <AlertTriangle size={16} className="text-destructive shrink-0 mt-0.5" />
              <span>
                Disconnecting <strong>{nodeToDelete.name}</strong> removes it from your account. Active
                downloads on this node will stop.
              </span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setNodeToDelete(null)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="button"
                variant="destructive"
                size="sm"
                onClick={onDeleteConfirm}
                disabled={deleteServerPending}
                className="gap-1.5"
              >
                <Trash2 size={13} />
                <span>{deleteServerPending ? 'Disconnecting...' : 'Disconnect Node'}</span>
              </DkButton>
            </div>
          </div>
        </DkDialog>
      )}

      {nodeToRename && (
        <DkDialog
          open={!!nodeToRename}
          onOpenChange={(openRename) => {
            if (!openRename) setNodeToRename(null)
          }}
          title="Rename Node"
          description={`Change the display name for ${nodeToRename.name}.`}
          className="max-w-md"
        >
          <form onSubmit={onRenameConfirm} className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <label htmlFor="rename-node-input" className="text-xs font-semibold text-muted-foreground">
                Node Name
              </label>
              <input
                id="rename-node-input"
                type="text"
                value={renameInput}
                onChange={(e) => setRenameInput(e.target.value)}
                placeholder="Enter node name..."
                autoFocus
                className="w-full h-10 px-3 rounded-xl bg-[var(--dk-surface-field)] text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors"
                disabled={isSavingRename}
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                disabled={isSavingRename}
                onClick={() => setNodeToRename(null)}
              >
                Cancel
              </DkButton>
              <DkButton
                type="submit"
                variant="primary"
                size="sm"
                loading={isSavingRename}
                disabled={isSavingRename || !renameInput.trim() || renameInput.trim() === nodeToRename.name}
              >
                Save Name
              </DkButton>
            </div>
          </form>
        </DkDialog>
      )}

      {createWorkerNodeOpen && (
        <CreateWorkerNodeModal
          open={createWorkerNodeOpen}
          onOpenChange={(open) => {
            setCreateWorkerNodeOpen(open)
            if (!open) setConnectInitialUrl('')
          }}
          defaultName={
            unclaimedNodes[0]?.serverName &&
            unclaimedNodes[0].serverName !== 'Otix Game Server' &&
            unclaimedNodes[0].serverName !== 'Otix Node'
              ? unclaimedNodes[0].serverName
              : defaultAutoName
          }
          initialNodeUrl={connectInitialUrl}
          homes={homes}
          defaultHomeId={homes.find((h) => h.isDefault)?.id || homes[0]?.id}
        />
      )}

      {editingWorkerNode && (
        <EditWorkerNodeModal
          open={Boolean(editingWorkerNode)}
          onOpenChange={(open) => {
            if (!open) setEditingWorkerNode(null)
          }}
          node={editingWorkerNode}
          homes={homes}
          serverMachines={serverMachines}
          onOpenFullSettings={handleOpenNodeSettings}
        />
      )}

      {duplicateWorkerNodeOpen && (
        <DuplicateWorkerNodeModal
          open={duplicateWorkerNodeOpen}
          onOpenChange={(open) => {
            setDuplicateWorkerNodeOpen(open)
            if (!open) setNodeToDuplicate(null)
          }}
          sourceNode={nodeToDuplicate}
          homes={homes}
        />
      )}

      <CreateServerMachineModal
        open={createServerMachineOpen}
        onOpenChange={setCreateServerMachineOpen}
        homes={homes}
        nodes={gameServers}
        defaultHomeId={createServerHomeId ?? homes.find((h) => h.isDefault)?.id ?? homes[0]?.id}
      />

      <EditServerMachineModal
        open={Boolean(editingServerMachine)}
        onOpenChange={(open) => {
          if (!open) setEditingServerMachine(null)
        }}
        server={editingServerMachine}
        homes={homes}
        nodes={gameServers}
      />

      <CreateHomeModal
        open={createHomeOpen}
        onOpenChange={setCreateHomeOpen}
      />

      <EditHomeModal
        open={Boolean(editingHome)}
        onOpenChange={(open) => {
          if (!open) setEditingHome(null)
        }}
        home={editingHome}
      />

      <CreateSambaShareModal
        open={createSambaOpen}
        onOpenChange={setCreateSambaOpen}
        serverMachines={serverMachines}
        preset={createSambaPreset}
        onSaveCustom={onSaveCustomSamba}
      />

      <EditSambaShareModal
        open={Boolean(editingSamba)}
        onOpenChange={(open) => {
          if (!open) setEditingSamba(null)
        }}
        samba={editingSamba}
        serverMachines={serverMachines}
        onSaveCustom={onSaveCustomSamba}
        onDeleteCustom={onDeleteCustomSamba}
      />

      <AddNodeModal
        open={addNodeModalOpen || addModalOpen}
        onOpenChange={(open) => {
          setAddNodeModalOpen(open)
          setAddModalOpen(open)
        }}
        unclaimedNodes={unclaimedNodes}
        onSelectType={onSelectNodeType}
        onClaimNode={onClaimQuickNode}
      />

      <GameServersDrawer
        open={gameServersDrawerOpen}
        onClose={() => setGameServersDrawerOpen(false)}
        focusedServerId={focusedGameServerId}
        onOpenCreateServer={() => {
          setCreateGameServerMachineId(null)
          setCreateGameServerOpen(true)
        }}
      />

      <CreateGameServerModal
        isOpen={createGameServerOpen}
        onClose={() => setCreateGameServerOpen(false)}
        initialServerMachineId={createGameServerMachineId}
      />

      {editingGameServer && (
        <EditGameServerModal
          server={editingGameServer}
          isOpen={Boolean(editingGameServer)}
          onClose={() => setEditingGameServer(null)}
        />
      )}
    </>
  )
}
