import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkSelect } from '@ui/atoms/select'
import { useModal } from '@/lib/modals'
import { useToast } from '@ui/molecules/toast'
import { isLocalDesktopNode } from '@/features/settings/local-desktop-node'
import { useSettingsNode } from '@/features/settings/context/settings-node-context'
import type { GameServer } from '../types'
import { useImportNodeInstances } from '../use-import-node-instances'

export function importEligibleNodes(servers: GameServer[]): GameServer[] {
  return servers.filter((server) => !isLocalDesktopNode(server))
}

function pickDefaultPair(
  nodes: GameServer[],
  preferredDestId?: number,
): { fromId: number | null; toId: number | null } {
  if (nodes.length < 2) return { fromId: null, toId: null }
  const preferredDest = nodes.find((server) => server.id === preferredDestId) ?? null
  const to = preferredDest ?? nodes[0]
  const from = nodes.find((server) => server.id !== to.id) ?? null
  return { fromId: from?.id ?? null, toId: to.id }
}

export interface ImportNodeInstancesModalProps {
  dest?: GameServer
  isOpen?: boolean
  isExiting?: boolean
  onClose: () => void
}

export function ImportNodeInstancesModal({
  dest,
  isOpen,
  isExiting,
  onClose,
}: ImportNodeInstancesModalProps) {
  const { toast } = useToast()
  const { servers } = useSettingsNode()
  const importMutation = useImportNodeInstances()
  const nodes = useMemo(() => importEligibleNodes(servers), [servers])
  const defaults = useMemo(() => pickDefaultPair(nodes, dest?.id), [nodes, dest?.id])
  const [fromId, setFromId] = useState<number | null>(defaults.fromId)
  const [toId, setToId] = useState<number | null>(defaults.toId)
  const from = nodes.find((server) => server.id === fromId) ?? null
  const to = nodes.find((server) => server.id === toId) ?? null
  const sameNode = from != null && to != null && from.id === to.id
  const canImport = Boolean(from && to && !sameNode && !importMutation.isPending)

  const handleImport = async () => {
    if (!from || !to || sameNode) return
    try {
      const result = await importMutation.mutateAsync({
        fromServerId: from.id,
        toServerId: to.id,
      })
      const imported = result.imported || []
      const errors = result.errors || []
      if (imported.length) {
        toast({
          title: `Imported from ${from.name}`,
          description: `Copied ${imported.join(', ')} onto ${to.name}.`,
          variant: 'success',
        })
      } else if (!errors.length) {
        toast({
          title: 'Nothing to import',
          description: `${from.name} has no SABnzbd, Prowlarr, Radarr, or Sonarr instances yet.`,
          variant: 'default',
        })
      }
      if (errors.length) {
        toast({
          title: 'Some instances failed',
          description: errors.map((item) => item.error || item.kind).join(' · '),
          variant: 'error',
        })
      }
      if (imported.length || !errors.length) onClose()
    } catch (err: any) {
      toast({
        title: 'Import failed',
        description: err?.response?.data?.error || err?.message || 'Could not copy instances.',
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={isOpen !== false && !isExiting}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title="Import instances"
      description="Copy SABnzbd, Prowlarr, Radarr, and Sonarr from one Otix node onto another. API keys stay on the server during the copy."
    >
      {nodes.length < 2 ? (
        <p className="text-xs text-white/50">Connect another Otix node to import instances between them.</p>
      ) : (
        <div className="space-y-3">
          <DkSelect
            label="From"
            value={fromId != null ? String(fromId) : ''}
            onChange={(event) => setFromId(Number(event.target.value))}
          >
            {nodes.map((server) => (
              <option key={server.id} value={String(server.id)}>
                {server.name}
              </option>
            ))}
          </DkSelect>
          <DkSelect
            label="To"
            value={toId != null ? String(toId) : ''}
            onChange={(event) => setToId(Number(event.target.value))}
          >
            {nodes.map((server) => (
              <option key={server.id} value={String(server.id)}>
                {server.name}
              </option>
            ))}
          </DkSelect>
          {sameNode ? (
            <p className="pl-4 text-xs text-white/50">Pick two different nodes.</p>
          ) : from && to ? (
            <p className="pl-4 text-xs text-white/50">
              Copies instances from {from.name} onto {to.name}.
            </p>
          ) : null}
        </div>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        <DkButton type="button" variant="ghost" size="md" onClick={onClose}>
          Cancel
        </DkButton>
        <DkButton type="button" size="md" onClick={() => void handleImport()} disabled={!canImport}>
          {importMutation.isPending
            ? 'Importing…'
            : from && to && !sameNode
              ? `Import onto ${to.name}`
              : 'Import'}
        </DkButton>
      </div>
    </DkDialog>
  )
}

export function ImportNodeInstancesButton({ dest }: { dest?: GameServer } = {}) {
  const { openModal } = useModal()
  const { servers } = useSettingsNode()
  if (importEligibleNodes(servers).length < 2) return null

  const open = () => {
    const close = openModal(
      <ImportNodeInstancesModal dest={dest} onClose={() => close()} />,
    )
  }

  return (
    <DkButton size="sm" variant="ghost" onClick={open}>
      <Download className="h-3.5 w-3.5" />
      Import from another node
    </DkButton>
  )
}
