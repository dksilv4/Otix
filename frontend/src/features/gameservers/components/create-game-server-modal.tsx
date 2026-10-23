import { useState } from 'react'
import {
  Globe,
  Key,
  Shield,
  Hash,
  Wifi,
  Check,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Info,
  RotateCcw,
  Eye,
  EyeOff,
  HardDrive,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { DkInput } from '@ui/atoms/input'
import { useToast } from '@ui/molecules/toast'
import { gameServersApi } from '../api/gameservers-api'
import { useCreateGameServer } from '../queries/gameservers-queries'
import { useServerMachines } from '@/features/settings/hooks/use-server-machines'
import { GameServersFeatureTags } from './game-servers-feature-tags'
import { OtixGameLinker } from './otix-game-linker'
import {
  findPresetsForGame,
  calculateQueryPort,
  getPresetIconUrl,
} from '../utils/presets'
import type { GameServerPreset, GameServerType, VerifyServerResult } from '../types'

interface CreateGameServerModalProps {
  isOpen: boolean
  onClose: () => void
  initialMediaId?: string | null
  initialGameTitle?: string
  initialServerMachineId?: number | null
}

export const CreateGameServerModal = ({
  isOpen,
  onClose,
  initialMediaId,
  initialGameTitle = '',
  initialServerMachineId = null,
}: CreateGameServerModalProps) => {
  const { toast } = useToast()
  const createMutation = useCreateGameServer()
  const { data: serverMachines = [] } = useServerMachines()

  const [serverMachineId, setServerMachineId] = useState<number | null>(initialServerMachineId ?? null)

  // Track whether linked to an Otix game
  const [mediaItemId, setMediaItemId] = useState<string | null>(initialMediaId ?? null)
  const [gameTitle, setGameTitle] = useState(initialGameTitle ?? '')

  // Find presets ONLY if linked to an Otix game (either via initialMediaId or explicit linking)
  const linkedPresets = mediaItemId ? findPresetsForGame(mediaItemId || gameTitle) : []
  const defaultPreset = linkedPresets[0]

  const [selectedPresetId, setSelectedPresetId] = useState<string>(defaultPreset?.id ?? 'custom')
  const [name, setName] = useState('')
  const effectivePlaceholder = gameTitle.trim()
    ? `${gameTitle.trim()} Server`
    : initialGameTitle
      ? `${initialGameTitle} Server`
      : 'Dedicated Game Server'

  const [serverType, setServerType] = useState<GameServerType>(defaultPreset?.serverType ?? 'steam_source')

  const initialHostFromMachine = initialServerMachineId
    ? serverMachines.find((m) => m.id === initialServerMachineId)?.ipAddress ||
      serverMachines.find((m) => m.id === initialServerMachineId)?.host ||
      ''
    : ''
  const [host, setHost] = useState(initialHostFromMachine)
  const [port, setPort] = useState<number>(defaultPreset?.defaultPort ?? 27015)
  const [queryPort, setQueryPort] = useState<string>(
    defaultPreset?.defaultQueryPort != null ? String(defaultPreset.defaultQueryPort) : '',
  )
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [description, setDescription] = useState('')
  const [isPublicLink, setIsPublicLink] = useState(false)

  // Verification state
  const [isVerified, setIsVerified] = useState(false)
  const [isVerifying, setIsVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState<VerifyServerResult | null>(null)

  const activePreset =
    linkedPresets.find((p) => p.id === selectedPresetId) ?? (linkedPresets.length === 1 ? linkedPresets[0] : undefined)

  const resetVerification = () => {
    if (isVerified || verifyResult) {
      setIsVerified(false)
      setVerifyResult(null)
    }
  }

  const applyPreset = (preset: GameServerPreset) => {
    setSelectedPresetId(preset.id)
    setServerType(preset.serverType)
    setPort(preset.defaultPort)
    setQueryPort(preset.defaultQueryPort != null ? String(preset.defaultQueryPort) : '')
    resetVerification()
  }

  const handleLinkGame = (otixGameId: string, title: string) => {
    setMediaItemId(otixGameId)
    setGameTitle(title)
    resetVerification()

    const presets = findPresetsForGame(otixGameId || title)
    if (presets.length > 0) {
      applyPreset(presets[0])
    }
  }

  const handleUnlinkGame = () => {
    setMediaItemId(null)
    setSelectedPresetId('custom')
    resetVerification()
  }

  const handlePortChange = (newPort: number) => {
    setPort(newPort)
    resetVerification()
    if (activePreset?.queryPortOffset != null) {
      setQueryPort(calculateQueryPort(activePreset, newPort))
    }
  }

  const handleServerTypeChange = (type: GameServerType) => {
    setServerType(type)
    resetVerification()
    if (type === 'minecraft') {
      setPort(25565)
      setQueryPort('')
    } else if (type === 'steam_source') {
      setPort(27015)
      setQueryPort('')
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
      if (result.suggestedQueryPort && !queryPort) {
        setQueryPort(String(result.suggestedQueryPort))
      }

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
        mediaItemId: mediaItemId || null,
        serverMachineId: serverMachineId ?? undefined,
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
        {/* Otix Game Linker */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles size={13} className="text-primary" /> Otix Game Integration
            </label>
            {mediaItemId && (
              <span className="text-[11px] text-primary font-medium">Full Support Active</span>
            )}
          </div>
          <OtixGameLinker
            linkedMediaId={mediaItemId}
            linkedGameTitle={gameTitle}
            isInitialLinked={Boolean(initialMediaId)}
            onLinkGame={handleLinkGame}
            onUnlinkGame={handleUnlinkGame}
          />
        </div>

        {/* Full Support Preset Options (ONLY SHOWN WHEN LINKED TO AN OTIX GAME) */}
        {linkedPresets.length > 0 && (
          <div className="space-y-3">
            {/* If multiple editions/variants exist for this game (e.g. Minecraft Java vs Bedrock) */}
            {linkedPresets.length > 1 && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground block">
                  Edition / Variant
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {linkedPresets.map((preset) => {
                    const isSelected = (activePreset?.id ?? defaultPreset?.id) === preset.id
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyPreset(preset)}
                        className={cn(
                          'flex items-center justify-between p-2.5 rounded-xl border text-left transition-all cursor-pointer',
                          isSelected
                            ? 'bg-primary/10 border-primary/30 text-foreground'
                            : 'bg-[var(--dk-surface-ghost)] border-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]',
                        )}
                      >
                        <span className="text-xs font-medium truncate">{preset.name}</span>
                        <span className="text-[11px] font-mono text-muted-foreground shrink-0 ml-2">
                          :{preset.defaultPort}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Active Preset Details Banner */}
            {activePreset && (
              <div className="p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-foreground flex items-center gap-2 min-w-0">
                    {getPresetIconUrl(activePreset) ? (
                      <img
                        src={getPresetIconUrl(activePreset)!}
                        alt={activePreset.name}
                        className="w-5 h-5 rounded-md object-cover bg-[var(--dk-surface-overlay)] shrink-0"
                      />
                    ) : (
                      <Info size={14} className="text-primary shrink-0" />
                    )}
                    <span className="truncate">{activePreset.name} Preset</span>
                  </span>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-muted-foreground font-mono">
                      Forward: {activePreset.forwardRange}
                    </span>
                    {(port !== activePreset.defaultPort ||
                      (activePreset.defaultQueryPort != null &&
                        queryPort !== String(activePreset.defaultQueryPort))) && (
                      <button
                        type="button"
                        onClick={() => applyPreset(activePreset)}
                        title="Reset ports to preset defaults"
                        className="text-muted-foreground hover:text-primary transition-colors p-0.5 rounded cursor-pointer"
                      >
                        <RotateCcw size={12} />
                      </button>
                    )}
                  </div>
                </div>
                {activePreset.notes && (
                  <p className="text-[11px] text-muted-foreground leading-relaxed pl-7">
                    {activePreset.notes}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Server Name */}
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

        {/* Server Protocol & Game Title */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-foreground block mb-1">Server Protocol</label>
            <select
              value={serverType}
              onChange={(e) => handleServerTypeChange(e.target.value as GameServerType)}
              className="w-full h-10 px-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-sm text-foreground focus:outline-none focus:border-primary cursor-pointer"
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
              disabled={Boolean(mediaItemId)}
            />
          </div>
        </div>

        {/* Optional Host Machine Selection */}
        {serverMachines.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <HardDrive size={13} className="text-primary" /> Host Machine (Optional)
              </label>
              <span className="text-[11px] text-muted-foreground">Homelab topology</span>
            </div>
            <select
              value={serverMachineId ?? ''}
              onChange={(e) => {
                const val = e.target.value ? Number(e.target.value) : null
                setServerMachineId(val)
                if (val) {
                  const m = serverMachines.find((sm) => sm.id === val)
                  if (m && (!host.trim() || host === 'localhost' || host === '127.0.0.1')) {
                    const candidateIp = m.ipAddress || m.host || ''
                    if (candidateIp) {
                      setHost(candidateIp)
                      resetVerification()
                    }
                  }
                }
              }}
              className="w-full h-10 px-3 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-xs text-foreground focus:outline-none focus:border-primary cursor-pointer"
            >
              <option value="" className="bg-[var(--dk-surface-overlay)] text-foreground">
                Standalone / External (No specific machine)
              </option>
              {serverMachines.map((m) => (
                <option key={m.id} value={m.id} className="bg-[var(--dk-surface-overlay)] text-foreground">
                  {m.name} {m.ipAddress || m.host ? `(${m.ipAddress || m.host})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Host & Port */}
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
              placeholder="e.g. 192.168.1.100 or play.domain.com"
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
              onChange={(e) => handlePortChange(Number(e.target.value))}
              required
              min={1}
              max={65535}
            />
          </div>
        </div>

        {/* Query Port & Password */}
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
              placeholder={activePreset?.defaultQueryPort != null ? String(activePreset.defaultQueryPort) : String(port)}
              min={1}
              max={65535}
            />
            {serverType === 'steam_source' && (
              <p className="mt-1 text-[10px] text-muted-foreground leading-snug">
                {activePreset?.queryPortOffset != null
                  ? `${activePreset.name} uses port + ${activePreset.queryPortOffset} for Steam A2S queries.`
                  : 'Steam / Source games often use a separate UDP query port for status verification.'}
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Key size={13} className="text-primary" /> Password (Optional)
              </label>
              {password && (
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer transition-colors"
                >
                  {showPassword ? <EyeOff size={12} /> : <Eye size={12} />}
                  <span>{showPassword ? 'Hide' : 'Show'}</span>
                </button>
              )}
            </div>
            <div className="relative">
              <DkInput
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Join password"
                className={password ? 'pr-9' : ''}
              />
              {password && (
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                  title={showPassword ? 'Hide password' : 'Show password'}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Live Verification Status Feedback */}
        {verifyResult && (
          <div
            className={`p-3 rounded-2xl border text-xs flex items-center justify-between transition-all ${
              verifyResult.status === 'online'
                ? 'bg-[var(--dk-surface-ghost)] border-white/[0.04] text-foreground'
                : 'bg-destructive/10 border-destructive/20 text-destructive'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {verifyResult.status === 'online' ? (
                <CheckCircle2 size={16} className="text-primary shrink-0" />
              ) : (
                <AlertCircle size={16} className="text-destructive shrink-0" />
              )}
              <div className="truncate">
                <span className="font-semibold">
                  {verifyResult.status === 'online' ? 'Connection Verified' : 'Connection Unreachable'}
                </span>
                {verifyResult.pingMs != null && (
                  <span className="ml-1.5 text-muted-foreground">{verifyResult.pingMs}ms</span>
                )}
                {verifyResult.currentPlayers != null && (
                  <span className="ml-1.5 text-muted-foreground">
                    {verifyResult.currentPlayers}/{verifyResult.maxPlayers ?? '?'} players
                  </span>
                )}
                {verifyResult.error && (
                  <p className="text-[11px] opacity-80 mt-0.5 truncate">{verifyResult.error}</p>
                )}
                {verifyResult.queryWarning && (
                  <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{verifyResult.queryWarning}</p>
                )}
              </div>
            </div>
            {verifyResult.status === 'online' && (
              <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-primary/20 text-primary shrink-0">
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
            className="w-full px-3 py-2 rounded-xl bg-[var(--dk-surface-ghost)] border border-white/[0.04] text-sm text-foreground focus:outline-none focus:border-primary resize-none placeholder:text-muted-foreground"
          />
        </div>

        <div className="flex items-center justify-between p-3 rounded-2xl bg-[var(--dk-surface-ghost)] border border-white/[0.04]">
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

        <div className="flex flex-col items-end gap-1.5 pt-3 border-t border-white/[0.04]">
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
}
