import { useMemo } from 'react'
import {
  Server,
  Home as HomeIcon,
  Cpu,
  FolderTree,
  Sparkles,
  Link,
  Unlink,
  ArrowRight,
  Plus,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import type { NodeMapEdge, NodeMapItem } from '../../types/node-map'
import type { UserServerMachine } from '../../types/server-machines'
import { findCompatibleTargets, getCompatibleCreationOptions } from '../../utils/node-map'

export interface ConnectNodePickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  sourceItem: NodeMapItem | null
  allItems: NodeMapItem[]
  edges: NodeMapEdge[]
  onConnect: (source: NodeMapItem, target: NodeMapItem, type: 'home' | 'host' | 'smb') => void
  onDisconnect: (edge: NodeMapEdge) => void
  onAddSamba?: (sourceServer?: UserServerMachine) => void
  onAddServer?: (homeId?: number) => void
  onAddNode?: () => void
  onAddHome?: () => void
}

export const ConnectNodePickerModal = ({
  open,
  onOpenChange,
  sourceItem,
  allItems,
  edges,
  onConnect,
  onDisconnect,
  onAddSamba,
  onAddServer,
  onAddNode,
  onAddHome,
}: ConnectNodePickerModalProps) => {
  const compatibleOptions = useMemo(() => {
    if (!sourceItem) return []
    return findCompatibleTargets(sourceItem, allItems)
  }, [sourceItem, allItems])

  const creationOptions = useMemo(() => {
    if (!sourceItem) return []
    return getCompatibleCreationOptions(sourceItem.type, sourceItem.name)
  }, [sourceItem])

  const existingEdges = useMemo(() => {
    if (!sourceItem) return []
    return edges.filter((e) => e.sourceId === sourceItem.id || e.targetId === sourceItem.id)
  }, [sourceItem, edges])

  if (!sourceItem) return null

  const handleConnectOption = (target: NodeMapItem, type: 'home' | 'host' | 'smb') => {
    onOpenChange(false)
    onConnect(sourceItem, target, type)
  }

  const handleDisconnectEdge = (edge: NodeMapEdge) => {
    onDisconnect(edge)
  }

  const handleAddNewOption = (type: 'server' | 'node' | 'home' | 'samba') => {
    onOpenChange(false)
    if (type === 'samba') {
      const machine = sourceItem.data.type === 'server' ? sourceItem.data.machine : undefined
      onAddSamba?.(machine)
    } else if (type === 'server') {
      const homeId = sourceItem.data.type === 'home' ? Number(sourceItem.entityId) : undefined
      onAddServer?.(homeId)
    } else if (type === 'node') {
      onAddNode?.()
    } else if (type === 'home') {
      onAddHome?.()
    }
  }

  return (
    <DkDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Connect ${sourceItem.name}`}
      description="Link this node with another machine, home environment, or storage share in your homelab."
      className="max-w-lg"
    >
      <div className="space-y-4 pt-2">
        {/* Existing Active Connections */}
        {existingEdges.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
              Active Connections ({existingEdges.length})
            </p>
            <div className="space-y-1.5">
              {existingEdges.map((edge) => {
                const isSource = edge.sourceId === sourceItem.id
                const otherId = isSource ? edge.targetId : edge.sourceId
                const otherItem = allItems.find((i) => i.id === otherId)
                const otherName = otherItem?.name || edge.label || 'Connected Node'

                return (
                  <div
                    key={edge.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.04] border border-white/[0.06] gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0">
                        <Link size={13} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{otherName}</p>
                        <p className="text-[10px] text-muted-foreground">{edge.label || edge.relation}</p>
                      </div>
                    </div>

                    <DkButton
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDisconnectEdge(edge)}
                      className="h-7 px-2.5 text-[11px] text-muted-foreground hover:text-destructive gap-1"
                    >
                      <Unlink size={11} />
                      <span>Disconnect</span>
                    </DkButton>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Available Nodes to Connect */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
            Available Targets to Link
          </p>

          {compatibleOptions.length === 0 ? (
            <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] text-center space-y-1">
              <p className="text-xs text-muted-foreground">No compatible nodes available to connect right now.</p>
              <p className="text-[11px] text-muted-foreground/80">
                Add a Home Environment, Server Machine, or Samba share first.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto pr-0.5">
              {compatibleOptions.map(({ item: targetItem, connectionTypes, label }) => {
                const targetType = targetItem.type

                return (
                  <div
                    key={targetItem.id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] gap-3 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="h-8 w-8 rounded-lg bg-white/[0.04] text-primary flex items-center justify-center shrink-0">
                        {targetType === 'home' && <HomeIcon size={15} />}
                        {targetType === 'server' && <Server size={15} />}
                        {targetType === 'node' && <Cpu size={15} />}
                        {targetType === 'samba' && <FolderTree size={15} />}
                        {targetType === 'unclaimed_node' && <Sparkles size={15} />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{targetItem.name}</p>
                        <p className="text-[10px] text-muted-foreground capitalize">
                          {label} • {targetType === 'node' ? 'Worker Node' : targetType === 'server' ? 'Machine' : targetType === 'samba' ? 'Samba Share' : targetType === 'home' ? 'Home Environment' : targetType}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {connectionTypes.length === 1 ? (
                        <DkButton
                          type="button"
                          size="sm"
                          variant="primary"
                          onClick={() => handleConnectOption(targetItem, connectionTypes[0])}
                          className="h-7 px-3 text-[11px] font-semibold gap-1"
                        >
                          <span>Connect</span>
                          <ArrowRight size={11} />
                        </DkButton>
                      ) : (
                        <div className="flex items-center gap-1">
                          {connectionTypes.map((t) => (
                            <DkButton
                              key={t}
                              type="button"
                              size="sm"
                              variant={t === 'host' ? 'primary' : 'secondary'}
                              onClick={() => handleConnectOption(targetItem, t)}
                              className="h-7 px-2 text-[10px] font-semibold"
                            >
                              {t === 'host' ? 'Host Node' : 'SMB Storage'}
                            </DkButton>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Add & Connect New Node */}
        {creationOptions.length > 0 && (
          <div className="space-y-2 pt-1 border-t border-white/[0.06]">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-0.5">
              Add &amp; Connect New Node
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {creationOptions.map((opt) => (
                <div
                  key={opt.type}
                  className="flex flex-col justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] border border-white/[0.05] gap-2 transition-colors"
                >
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="h-7 w-7 rounded-lg bg-primary/15 text-primary flex items-center justify-center shrink-0 mt-0.5">
                      {opt.type === 'home' && <HomeIcon size={14} />}
                      {opt.type === 'server' && <Server size={14} />}
                      {opt.type === 'node' && <Cpu size={14} />}
                      {opt.type === 'samba' && <FolderTree size={14} />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-foreground truncate">{opt.title}</p>
                      <p className="text-[11px] text-muted-foreground leading-snug">{opt.description}</p>
                    </div>
                  </div>

                  <DkButton
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleAddNewOption(opt.type)}
                    className="h-7 w-full text-[11px] font-medium gap-1 justify-center"
                  >
                    <Plus size={11} className="text-primary" />
                    <span>{opt.actionLabel}</span>
                  </DkButton>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-end pt-2">
          <DkButton
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => onOpenChange(false)}
          >
            Close
          </DkButton>
        </div>
      </div>
    </DkDialog>
  )
}
