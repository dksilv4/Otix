import { useState } from 'react'
import { Globe, Key, Shield, Hash } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { useToast } from '@ui/molecules/toast'
import { useCreateGameServer } from '../queries/gameservers-queries'
import type { GameServerType } from '../types'

interface CreateGameServerModalProps {
  isOpen: boolean
  onClose: () => void
  initialMediaId?: string | null
  initialGameTitle?: string
}

export function CreateGameServerModal({
  isOpen,
  onClose,
  initialMediaId,
  initialGameTitle = '',
}: CreateGameServerModalProps) {
  const { toast } = useToast()
  const createMutation = useCreateGameServer()

  const [name, setName] = useState('')
  const [gameTitle, setGameTitle] = useState(initialGameTitle)
  const [serverType, setServerType] = useState<GameServerType>('steam_source')
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number>(27015)
  const [queryPort, setQueryPort] = useState<string>('')
  const [password, setPassword] = useState('')
  const [description, setDescription] = useState('')
  const [isPublicLink, setIsPublicLink] = useState(false)

  const handleServerTypeChange = (type: GameServerType) => {
    setServerType(type)
    if (type === 'minecraft') {
      setPort(25565)
    } else if (type === 'steam_source') {
      setPort(27015)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !host.trim() || !port) {
      toast({
        title: 'Missing information',
        description: 'Server name, host, and port are required.',
        variant: 'error',
      })
      return
    }

    try {
      await createMutation.mutateAsync({
        name: name.trim(),
        gameTitle: gameTitle.trim() || initialGameTitle,
        mediaItemId: initialMediaId || null,
        serverType,
        host: host.trim(),
        port: Number(port),
        queryPort: queryPort ? Number(queryPort) : undefined,
        password: password.trim() || undefined,
        description: description.trim() || undefined,
        isPublicLink,
      })

      toast({
        title: 'Game Server Added',
        description: `Successfully added ${name}.`,
        variant: 'success',
      })
      onClose()
    } catch (err: unknown) {
      toast({
        title: 'Failed to add server',
        description: (err as { message?: string })?.message || 'Could not register game server.',
        variant: 'error',
      })
    }
  }

  return (
    <DkDialog
      open={isOpen}
      onOpenChange={(open) => !open && onClose()}
      title="Add Game Server"
      description="Register a dedicated multiplayer server for status monitoring and friend sharing."
      className="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <label className="text-xs font-semibold text-white/70 block mb-1">Server Name</label>
          <DkInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. DK's Survival World"
            required
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1">Server Protocol</label>
            <select
              value={serverType}
              onChange={(e) => handleServerTypeChange(e.target.value as GameServerType)}
              className="w-full h-10 px-3 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="steam_source" className="bg-neutral-900">Steam / Source (A2S)</option>
              <option value="minecraft" className="bg-neutral-900">Minecraft (Java / Bedrock)</option>
              <option value="generic" className="bg-neutral-900">Generic TCP Ping</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1">Game</label>
            <DkInput
              value={gameTitle}
              onChange={(e) => setGameTitle(e.target.value)}
              placeholder="Game Title"
              disabled={Boolean(initialMediaId)}
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2">
            <label className="text-xs font-semibold text-white/70 block mb-1 flex items-center gap-1.5">
              <Globe size={13} className="text-primary" /> Host / Address
            </label>
            <DkInput
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="e.g. 192.168.1.100 or mc.domain.com"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1 flex items-center gap-1.5">
              <Hash size={13} className="text-primary" /> Port
            </label>
            <DkInput
              type="number"
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              required
              min={1}
              max={65535}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1">Query Port (Optional)</label>
            <DkInput
              type="number"
              value={queryPort}
              onChange={(e) => setQueryPort(e.target.value)}
              placeholder={String(port)}
              min={1}
              max={65535}
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-white/70 block mb-1 flex items-center gap-1.5">
              <Key size={13} className="text-amber-400" /> Password (Optional)
            </label>
            <DkInput
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Join password"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-semibold text-white/70 block mb-1">Description / Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Rules, modpack links, or server details..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-primary resize-none placeholder:text-white/30"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-white/[0.04] border border-white/[0.08]">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-white flex items-center gap-1.5">
              <Shield size={14} className="text-primary" />
              <span>Allow Anyone with the Link</span>
            </div>
            <p className="text-xs text-white/50">
              Generate a shareable invite code so non-friends can also view and join this server.
            </p>
          </div>
          <input
            type="checkbox"
            checked={isPublicLink}
            onChange={(e) => setIsPublicLink(e.target.checked)}
            className="w-4 h-4 rounded text-primary focus:ring-primary cursor-pointer accent-primary"
          />
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
          <DkButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </DkButton>
          <DkButton type="submit" variant="primary" disabled={createMutation.isPending}>
            {createMutation.isPending ? 'Adding Server...' : 'Add Server'}
          </DkButton>
        </div>
      </form>
    </DkDialog>
  )
}
