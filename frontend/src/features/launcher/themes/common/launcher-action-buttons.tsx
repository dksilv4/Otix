import { useState } from "react"
import { Play, FolderOpen, Sliders, Info, CheckCircle2, AlertCircle, Loader2, Server } from "lucide-react"
import { getDesktopAPI, hasDesktopAPI } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"
import { useInstallProgress } from "@/features/launcher/data/install-store"
import { useServerGames, useRemoteDownloads } from "@/features/downloads/use-server-downloads"
import { matchServerGameFile } from "@/features/downloads/server-availability"
import { PREVIEW_INCOMPATIBLE_AS_AVAILABLE } from "@/features/downloads/os-compatibility"
import { formatBytes, osName } from "@/lib/utils"
import type { LocalGame, DisplayGame } from "@/features/launcher/types"

interface LauncherActionButtonsProps {
  game: LocalGame | DisplayGame
  size?: "sm" | "md" | "lg"
  onOpenDetails?: () => void
  onOpenMatch?: () => void
  className?: string
}

export function LauncherActionButtons({
  game,
  size = "md",
  onOpenDetails,
  _onOpenMatch,
  className = "",
}: LauncherActionButtonsProps) {
  const { toast } = useToast()
  const isDesktop = hasDesktopAPI()
  const { activeInstalls, startInstall, cancelInstall } = useInstallProgress()
  const { data: serverGamesData } = useServerGames()
  const { startDownload } = useRemoteDownloads()
  const [isLaunching, setIsLaunching] = useState(false)

  const raw = ("rawGame" in game && game.rawGame ? game.rawGame : game) as LocalGame
  const isInstalled = !!raw.exePath && raw.platform !== "iso"
  const isIso = raw.platform === "iso"
  const isIncompatible = isIso && osName !== "Windows" && !PREVIEW_INCOMPATIBLE_AS_AVAILABLE
  const mediaId = raw.otixMediaId || raw.data?.id
  const matchingServerFile = matchServerGameFile(serverGamesData?.files, mediaId, raw.title)

  const activeInstall = activeInstalls.find(
    (i) => i.isoPath?.toLowerCase() === raw.exePath?.toLowerCase()
  )

  const handlePlay = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const api = getDesktopAPI()
    if (!api?.launchGame) {
      toast({
        title: "Desktop App Required",
        description: "Download the Otix desktop client to launch local games natively.",
        variant: "default",
      })
      return
    }

    try {
      setIsLaunching(true)
      await api.launchGame(raw)
      toast({
        title: "Launching Game",
        description: `Starting ${game.title}...`,
        variant: "success",
      })
    } catch (err) {
      console.error(err)
      toast({
        title: "Launch Failed",
        description: (err as Error)?.message || "Failed to launch executable.",
        variant: "error",
      })
    } finally {
      setTimeout(() => setIsLaunching(false), 2000)
    }
  }

  const handleOpenFolder = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const api = getDesktopAPI()
    if (api?.showItemInFolder && raw.exePath) {
      await api.showItemInFolder(raw.exePath)
    }
  }

  const handlePickExe = async (e?: React.MouseEvent) => {
    e?.stopPropagation()
    const api = getDesktopAPI()
    if (api?.pickExecutable && api?.updateGamePath && raw.id) {
      const newExe = await api.pickExecutable(raw.installDir || undefined)
      if (newExe) {
        await api.updateGamePath(raw.id, newExe)
        toast({
          title: "Executable Updated",
          description: `Updated launch target for ${game.title}.`,
          variant: "success",
        })
      }
    }
  }

  const paddingClass =
    size === "lg"
      ? "px-8 py-3.5 text-xs font-black tracking-wider"
      : size === "sm"
      ? "px-3.5 py-1.5 text-[10px] font-bold"
      : "px-5 py-2.5 text-xs font-extrabold"

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {/* Primary Action Button */}
      {isInstalled ? (
        <button
          onClick={handlePlay}
          disabled={isLaunching}
          className={`flex items-center justify-center gap-2 rounded-xl uppercase transition-all duration-200 cursor-pointer active:scale-95 shadow-lg bg-[oklch(0.705_0.213_47.604)] hover:brightness-110 text-white shadow-[0_0_24px_oklch(0.705_0.213_47.604/0.4)] ${paddingClass}`}
        >
          {isLaunching ? (
            <Loader2 size={size === "lg" ? 16 : 14} className="animate-spin" />
          ) : (
            <Play size={size === "lg" ? 16 : 14} fill="white" />
          )}
          <span>{isLaunching ? "Starting..." : "Play Now"}</span>
        </button>
      ) : isIso ? (
        isIncompatible ? (
          <div className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-300 text-xs font-medium">
            <AlertCircle size={14} />
            <span>Windows ISO Only</span>
          </div>
        ) : activeInstall ? (
          <button
            onClick={(e) => {
              e.stopPropagation()
              cancelInstall(activeInstall.installId)
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-bold hover:bg-amber-500/30 transition-all cursor-pointer"
          >
            <Loader2 size={14} className="animate-spin" />
            <span>Installing ({activeInstall.progress}%)</span>
          </button>
        ) : (
          <button
            onClick={(e) => {
              e.stopPropagation()
              if (raw.exePath) {
                startInstall(raw.exePath, raw.installDir || "", raw.title)
              }
            }}
            className={`flex items-center justify-center gap-2 rounded-xl uppercase transition-all duration-200 cursor-pointer active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] ${paddingClass}`}
          >
            <CheckCircle2 size={size === "lg" ? 16 : 14} />
            <span>Install Game</span>
          </button>
        )
      ) : matchingServerFile ? (
        <button
          onClick={async (e) => {
            e.stopPropagation()
            try {
              await startDownload(matchingServerFile, mediaId)
              toast({
                title: "Installing from Server",
                description: `Streaming ${raw.title} from ${matchingServerFile.serverName}.`,
                variant: "success",
              })
            } catch (err) {
              toast({
                title: "Install Failed",
                description: (err as Error)?.message || "Could not start the server download.",
                variant: "error",
              })
            }
          }}
          className={`flex items-center justify-center gap-2 rounded-xl uppercase transition-all duration-200 cursor-pointer active:scale-95 bg-emerald-600 hover:bg-emerald-500 text-white shadow-[0_0_20px_rgba(16,185,129,0.3)] ${paddingClass}`}
          title={
            matchingServerFile.isShared && matchingServerFile.sharedBy
              ? `Shared by @${matchingServerFile.sharedBy.username} on ${matchingServerFile.serverName} (${formatBytes(matchingServerFile.filesize)})`
              : `On ${matchingServerFile.serverName}, not installed on this device (${formatBytes(matchingServerFile.filesize)})`
          }
        >
          <Server size={size === "lg" ? 16 : 14} />
          <span>Install</span>
        </button>
      ) : (
        <button
          onClick={onOpenDetails || handlePlay}
          className={`flex items-center justify-center gap-2 rounded-xl uppercase transition-all duration-200 cursor-pointer active:scale-95 bg-white/10 hover:bg-white/20 text-white border border-white/15 ${paddingClass}`}
        >
          <Info size={size === "lg" ? 16 : 14} />
          <span>View Details</span>
        </button>
      )}

      {/* Secondary Actions */}
      {isDesktop && raw.exePath && !isIso && (
        <>
          <button
            onClick={handleOpenFolder}
            title="Open Game Folder"
            className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer active:scale-95"
          >
            <FolderOpen size={size === "lg" ? 18 : 15} />
          </button>
          <button
            onClick={handlePickExe}
            title="Configure Executable Target"
            className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer active:scale-95"
          >
            <Sliders size={size === "lg" ? 18 : 15} />
          </button>
        </>
      )}

      {onOpenDetails && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpenDetails()
          }}
          title="Game Overview & Media"
          className="p-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] text-white/70 hover:text-white border border-white/10 transition-colors cursor-pointer active:scale-95"
        >
          <Info size={size === "lg" ? 18 : 15} />
        </button>
      )}
    </div>
  )
}
