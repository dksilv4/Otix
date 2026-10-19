import { useState } from 'react'
import { Globe, Key, Shield, Hash, Wifi, Check, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { useToast } from '@ui/molecules/toast'
import { gameServersApi } from '../api/gameservers-api'
import { useCreateGameServer } from '../queries/gameservers-queries'
import { GameServersFeatureTags } from './game-servers-feature-tags'
import type { GameServerType, VerifyServerResult } from '../types'

interface CreateGameServerModalProps {
  isOpen: boolean
  onClose: () => void
  initialMediaId?: string | null
  initialGameTitle?: string
}

export const CreateGameServerModal = ({
  isOpen,
  onClose,
  initialMediaId,
  initialGameTitle = '',
}: CreateGameServerModalProps) => {
  const { toast } = useToast()
  const createMutation = useCreateGameServer()

  const [name, setName] = useState('')
  const [gameTitle, setGameTitle] = useState(initialGameTitle)
  const effectivePlaceholder = gameTitle.trim()
    ? `${gameTitle.trim()} Server`
    : initialGameTitle
      ? `${initialGameTitle} Server`
      : 'Dedicated Game Server'
  const [serverType, setServerType] = useState<GameServerType>('steam_source')
  const [host, setHost] = useState('')
  const [port, setPort] = useState<number>(27015)
  const [queryPort, setQueryPort] = useState<string>('')
  const [password, setPassword] = useState('')
  const [description, setDescription] = useState('')
  const [isPublicLink, setIsPublicLink] = useState(false)

  // Verification state
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyServerResult | null>(null)

  const resetVerification = () => {
    if (isVerified || verifyResult) {
      setIsVerified(false)
      setVerifyResult(null)
    }
  }

  const handleServerTypeChange = (type: GameServerType) => {
    setServerType(type)
    resetVerification()
    if (type === 'minecraft') {
      setPort(25565)
    } else if (type === 'steam_source') {
      setPort(27015)
    }
  }

  const handleVerify = async () => {
    if (!host.trim() || !port) {
      toast({
        title: 'Missing connection details',
        description: 'Host and port are required to verify the server.',
        variant: 'error',
      })
      return
    }

    setIsVerifying(true)
    try {
      const result = await gameServersApi.verify({
        host: host.trim(),
        port: Number(port),
        queryPort: queryPort ? Number(queryPort) : undefined,
        serverType,
      })

      setVerifyResult(result)
      if (result.status === 'online') {
        setIsVerified(true)
        toast({
          title: 'Server Reachable',
          description: result.queryWarning
            ? result.queryWarning
            : `Connected successfully (${result.pingMs ?? 0}ms latency). You can now add the server.`,
          variant: result.queryWarning ? 'warning' : 'success',
        })
      } else {
        setIsVerified(false)
        toast({
          title: 'Server Unreachable',
          description: result.error || 'Could not connect to server. Check your host and port.',
          variant: 'error',
        })
      }
    } catch (err: unknown) {
      setIsVerified(false)
      toast({
        title: 'Verification Failed',
        description: (err as { message?: string })?.message || 'Could not verify server connection.',
        variant: 'error',
      })
    } finally {
      setIsVerifying(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // If not verified yet, verify first
    if (!isVerified) {
      await handleVerify()
      return
    }

    if (!host.trim() || !port) {
      toast({
        title: 'Missing information',
        description: 'Server host and port are required.',
        variant: 'error',
      })
      return
    }

    const finalName = name.trim() || verifyResult?.name?.trim() || effectivePlaceholder

    try {
      await createMutation.mutateAsync({
        name: finalName,
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
        description: `Successfully added ${finalName}.`,
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
      <div className="mb-1">
        <GameServersFeatureTags />
      </div>
      <form onSubmit={handleSubmit} className="space-y-4 pt-2">
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-semibold text-foreground">Server Name</label>
            <span className="text-[11px] text-muted-foreground">Optional</span>
          </div>
          <DkInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={effectivePlaceholder}
            autoFocus
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Server Protocol</label>
            <select
              value={serverType}
              onChange={(e) => handleServerTypeChange(e.target.value as GameServerType)}
              className="w-full h-10 px-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="steam_source" className="bg-[var(--dk-surface-overlay)] text-foreground">Steam / Source (A2S)</option>
              <option value="minecraft" className="bg-[var(--dk-surface-overlay)] text-foreground">Minecraft (Java / Bedrock)</option>
              <option value="generic" className="bg-[var(--dk-surface-overlay)] text-foreground">Generic TCP Ping</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Game</label>
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
            <label className="text-xs font-semibold text-foreground block mb-1 flex items-center gap-1.5">
              <Globe size={13} className="text-primary" /> Host / Address
            </label>
            <DkInput
              value={host}
              onChange={(e) => {
                setHost(e.target.value)
                resetVerification()
              }}
              placeholder="e.g. 192.168.1.100 or mc.domain.com"
              required
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1 flex items-center gap-1.5">
              <Hash size={13} className="text-primary" /> Port
            </label>
            <DkInput
              type="number"
              value={port}
              onChange={(e) => {
                setPort(Number(e.target.value))
                resetVerification()
              }}
              required
              min={1}
              max={65535}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Query Port (Optional)</label>
            <DkInput
              type="number"
              value={queryPort}
              onChange={(e) => {
                setQueryPort(e.target.value)
                resetVerification()
              }}
              placeholder={String(port)}
              min={1}
              max={65535}
            />
            {serverType === 'steam_source' && (
              <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
                Steam / Palworld often use a different UDP query port than the game port.
              </p>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-foreground block mb-1 flex items-center gap-1.5">
              <Key size={13} className="text-amber-500 dark:text-amber-400" /> Password (Optional)
            </label>
            <DkInput
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Join password"
            />
          </div>
        </div>

        {/* Live Verification Status Feedback */}
        {verifyResult && (
          <div
            className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
              verifyResult.status === 'online'
                ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {verifyResult.status === 'online' ? (
                <CheckCircle2 size={16} className="text-emerald-500 dark:text-emerald-400 shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-destructive shrink-0" />
              )}
              <div className="truncate">
                <span className="font-semibold">
                  {verifyResult.status === 'online' ? 'Connection Verified' : 'Connection Unreachable'}
                </span>
                {verifyResult.pingMs != null && (
                  <span className="ml-1.5 text-muted-foreground">• {verifyResult.pingMs}ms</span>
                )}
                {verifyResult.currentPlayers != null && (
                  <span className="ml-1.5 text-muted-foreground">
                    • {verifyResult.currentPlayers}/{verifyResult.maxPlayers ?? '?'} players
                  </span>
                )}
                {verifyResult.error && (
                  <p className="text-[11px] opacity-80 mt-0.5 truncate">{verifyResult.error}</p>
                )}
                {verifyResult.queryWarning && (
                  <p className="text-[11px] opacity-80 mt-0.5 line-clamp-2">{verifyResult.queryWarning}</p>
                )}
              </div>
            </div>
            {verifyResult.status === 'online' && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shrink-0">
                Online
              </span>
            )}
          </div>
        )}

        <div>
          <label className="text-xs font-semibold text-foreground block mb-1">Description / Notes</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Rules, modpack links, or server details..."
            rows={2}
            className="w-full px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] text-sm text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)]">
          <div className="space-y-0.5">
            <div className="text-sm font-medium text-foreground flex items-center gap-1.5">
              <Shield size={14} className="text-primary" />
              <span>Allow Anyone with the Link</span>
            </div>
            <p className="text-xs text-muted-foreground">
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

        <div className="flex flex-col items-end gap-1.5 pt-3 border-t border-[var(--dk-separator)]">
          <div className="flex items-center justify-end gap-3 w-full">
          <DkButton type="button" variant="ghost" onClick={onClose}>
            Cancel
          </DkButton>
          <DkButton
            type="submit"
            variant={isVerified ? 'primary' : 'secondary'}
            disabled={isVerifying || createMutation.isPending}
            className="min-w-[140px]"
          >
            {isVerifying ? (
              <span className="flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" />
                <span>Verifying...</span>
              </span>
            ) : isVerified ? (
              <span className="flex items-center gap-1.5">
                <Check size={14} />
                <span>{createMutation.isPending ? 'Adding Server...' : 'Add Server'}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Wifi size={14} />
                <span>Verify Server</span>
              </span>
            )}
          </DkButton>
          </div>
          <p className="text-[10px] text-muted-foreground text-right max-w-sm leading-snug">
            Connectivity is checked from Otix servers (not your browser).
            The host must be reachable over the internet with the correct query port open for UDP.
          </p>
        </div>
      </form>
    </DkDialog>
  )
};
