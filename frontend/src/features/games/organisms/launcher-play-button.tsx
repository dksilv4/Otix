import { useMemo } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { Play, Disc, Loader2, X } from 'lucide-react'
import { osName } from '@/lib/utils'
import { getDesktopAPI } from '@/lib/desktop-api'
import { useToast } from '@/features/dk-ui/molecules/toast'
import { useLocalGame, useRejectSuggestion } from '@/features/game-scanner/game-queries'
import { useMatchLocalGames, useSyncLocalGames } from '@/features/game-scanner/queries'
import { useInstallProgress } from '@/features/game-scanner/install-store'

interface LauncherPlayButtonProps {
  onOpenInstaller: () => void
}

export function LauncherPlayButton({ onOpenInstaller }: LauncherPlayButtonProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const p = useParams({ strict: false })
  const gameId = (p as Record<string, string>).gameId
  const { data: g } = useLocalGame(gameId)
  const matchMutation = useMatchLocalGames()
  const syncMutation = useSyncLocalGames()
  const rejectSuggestionMutation = useRejectSuggestion()
  const { activeInstalls, cancelInstall } = useInstallProgress()

  const isInstalled = !!g?.exePath && g?.platform !== 'iso'
  const isIncompatible = g?.platform === 'iso' && osName !== 'Windows'
  const mediaId = g?.data?.id

  const activeInstall = useMemo(() => {
    const activePath = g?.exePath?.toLowerCase()
    if (!activePath) return null
    return activeInstalls.find((i: { isoPath?: string }) => i.isoPath?.toLowerCase() === activePath)
  }, [activeInstalls, g])

  if (!g) return null

  // ── Play (installed) ──

  if (isInstalled) {
    return (
      <button onClick={() => {
        const api = getDesktopAPI()
        if (api?.launchGame) {
          api.launchGame(g).catch(console.error)
          toast({ title: 'Launching Game', description: `Running ${g.title}...`, variant: 'success' })
        } else {
          toast({ title: 'Launch Simulated', variant: 'info' })
        }
      }} className="px-5.5 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
        <Play size={14} fill="currentColor" /> Play
      </button>
    )
  }

  // ── Incompatible (ISO on non-Windows) ──

  if (isIncompatible) {
    return (
      <button className="px-5.5 py-2.5 bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 cursor-not-allowed flex items-center gap-1.5" disabled>
        <span className="text-red-400/70">⚠</span> Can't install on macOS
      </button>
    )
  }

  // ── ISO installing ──

  if (g.platform === 'iso' && activeInstall) {
    return (
      <div className="flex gap-2 items-stretch h-[38px]">
        <button onClick={onOpenInstaller} className="relative overflow-hidden px-4 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] text-white w-48 justify-start">
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-600/30 animate-pulse pointer-events-none" />
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0 relative z-10" />
          <div className="flex flex-col items-start relative z-10 text-left min-w-0 leading-tight">
            <span className="font-bold text-white truncate w-full text-[10px]">Installing...</span>
            <span className="text-[9px] text-white/50 truncate w-full">{activeInstall.progress?.message ?? 'Installing...'}</span>
          </div>
        </button>
        <button onClick={() => cancelInstall(activeInstall.isoPath)} className="px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center justify-center" title="Cancel Installation">
          <X size={14} />
        </button>
      </div>
    )
  }

  // ── ISO ready to install ──

  if (g.platform === 'iso') {
    return (
      <button onClick={onOpenInstaller} className="px-5.5 py-2.5 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-400 hover:to-indigo-500 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
        <Disc size={14} /> Install
      </button>
    )
  }

  // ── Default: match game or view details ──

  if (mediaId) {
    return (
      <button onClick={() => navigate({ to: '/media/$mediaType/$mediaId' as const, params: { mediaType: 'game', mediaId } })} className="px-5.5 py-2.5 bg-white hover:bg-white/90 text-black rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
        <Play size={14} fill="currentColor" /> Play
      </button>
    )
  }

  // ── Unmatched: match game ──

  return (
    <div className="flex gap-1.5">
      <button onClick={() => {
        matchMutation.mutateAsync([g]).then((matched) => {
          if (matched?.length) {
            syncMutation.mutate(matched)
            toast({ title: 'Game Matched', description: `"${matched[0]?.data?.title || matched[0]?.title}" found in catalog.`, variant: 'success' })
          }
        }).catch((err) => console.error('[Launcher] Match game failed:', err))
      }} className="px-5.5 py-2.5 bg-blue-500 hover:bg-blue-400 text-white rounded-xl text-[11px] font-black flex items-center gap-1.5 transition-all cursor-pointer shadow-lg active:scale-95">
        Play
      </button>
      {g.matchSuggestion && (
        <button onClick={() => {
          rejectSuggestionMutation.mutate({ gameId: g.id, suggestionMediaId: g.matchSuggestion!.id })
          toast({ title: 'Suggestion Dismissed', variant: 'default' })
        }} className="px-3 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[11px] font-semibold text-white/50 hover:text-white/80 transition-all cursor-pointer active:scale-95" title="Deny suggestion">
          <X size={13} />
        </button>
      )}
    </div>
  )
}
