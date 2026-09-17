import { useState, useEffect } from "react"
import { useNavigate } from "@tanstack/react-router"
import {
  Gamepad2,
  LayoutGrid,
  Search,
  RefreshCw,
  HardDrive,
  Settings,
  Sparkles,
  Square,
  Play,
  Check,
  ArrowLeft,
} from "lucide-react"
import { useRunningGame } from "@/features/launcher/hooks/use-running-game"
import { getDesktopAPI, hasDesktopAPI, type DiskInfo } from "@/lib/desktop/api"
import { useToast } from "@ui/molecules/toast"

interface ModernHeaderProps {
  activeTab: "dashboard" | "library"
  setActiveTab: (tab: "dashboard" | "library") => void
  searchQuery: string
  setSearchQuery: (query: string) => void
  onOpenScan?: () => void
}

function formatElapsed(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const minutes = Math.floor((totalSec % 3600) / 60)
  const seconds = totalSec % 60
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

export function ModernHeader({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  onOpenScan,
}: ModernHeaderProps) {
  const navigate = useNavigate()
  const isDesktop = hasDesktopAPI()
  const { runningGame, elapsedMs } = useRunningGame()
  const { toast } = useToast()
  const [isScanning, setIsScanning] = useState(false)
  const [diskInfo, setDiskInfo] = useState<DiskInfo | null>(null)

  useEffect(() => {
    if (!isDesktop) return
    const api = getDesktopAPI()
    api?.getDiskSpace?.().then((disks) => {
      if (disks && disks.length > 0) {
        setDiskInfo(disks[0])
      }
    }).catch(() => {})
  }, [isDesktop])

  const handleQuickScan = async () => {
    if (!isDesktop) {
      toast({
        title: "Scanning local games",
        description: "Desktop client scans local folders automatically.",
        variant: "default",
      })
      return
    }
    const api = getDesktopAPI()
    if (!api?.getScanPaths || !api?.scanPaths) return

    try {
      setIsScanning(true)
      const scanPaths = await api.getScanPaths()
      const gameDirs = scanPaths.filter((p) => p.type === "game").map((p) => p.path)
      const isoDirs = scanPaths.filter((p) => p.type === "iso").map((p) => p.path)
      await api.scanPaths(gameDirs, isoDirs)
      toast({
        title: "Scan Complete",
        description: "Library has been updated with newly detected games.",
        variant: "success",
      })
    } catch (err) {
      console.error(err)
      toast({
        title: "Scan Error",
        description: "Could not scan folders.",
        variant: "error",
      })
    } finally {
      setIsScanning(false)
    }
  }

  const freeGb = diskInfo ? Math.round(diskInfo.free / (1024 * 1024 * 1024)) : null

  return (
    <header className="sticky top-0 z-40 w-full h-16 px-6 bg-neutral-950/85 backdrop-blur-2xl border-b border-white/[0.08] flex items-center justify-between gap-4 select-none">
      {/* Brand & Tabs */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate({ to: "/" })}
          title="Exit Launcher (Back to Otix)"
          className="p-2 -ml-2 rounded-xl text-white/40 hover:text-white hover:bg-white/[0.08] transition-all cursor-pointer"
        >
          <ArrowLeft size={16} />
        </button>

        <div
          onClick={() => setActiveTab("dashboard")}
          className="flex items-center gap-2.5 cursor-pointer group"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[oklch(0.705_0.213_47.604)] to-amber-500 flex items-center justify-center shadow-[0_0_16px_oklch(0.705_0.213_47.604/0.4)] group-hover:scale-105 transition-transform">
            <Gamepad2 size={18} className="text-white" />
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-black tracking-wider text-white uppercase leading-none">
              Otix
            </span>
            <span className="text-[9px] font-bold tracking-widest text-[oklch(0.705_0.213_47.604)] uppercase">
              Launcher
            </span>
          </div>
        </div>

        {/* View mode switcher */}
        <div className="flex items-center p-1 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <button
            onClick={() => setActiveTab("dashboard")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "dashboard"
                ? "bg-[oklch(0.705_0.213_47.604)] text-white shadow-md"
                : "text-white/50 hover:text-white/90 hover:bg-white/[0.04]"
            }`}
          >
            <Sparkles size={13} />
            <span>Dashboard</span>
          </button>
          <button
            onClick={() => setActiveTab("library")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              activeTab === "library"
                ? "bg-[oklch(0.705_0.213_47.604)] text-white shadow-md"
                : "text-white/50 hover:text-white/90 hover:bg-white/[0.04]"
            }`}
          >
            <LayoutGrid size={13} />
            <span>Library</span>
          </button>
        </div>
      </div>

      {/* Middle: Live Running Game Pill (if active) */}
      {runningGame && (
        <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold shadow-[0_0_20px_rgba(16,185,129,0.15)] animate-pulse">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-white/90 max-w-[180px] truncate">
            {runningGame.title}
          </span>
          <span className="text-[11px] font-mono text-emerald-300/80 pl-1 border-l border-emerald-500/20">
            {formatElapsed(elapsedMs)}
          </span>
        </div>
      )}

      {/* Right Controls: Search, Scan, Disk, Settings */}
      <div className="flex items-center gap-3">
        {/* Search input */}
        <div className="relative w-56 lg:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
          <input
            type="text"
            placeholder="Search games..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-white/[0.05] hover:bg-white/[0.08] focus:bg-white/[0.1] rounded-xl pl-9 pr-7 py-1.5 text-xs text-white placeholder-white/30 outline-none transition-colors border border-white/[0.06] focus:border-white/20"
          />
          {searchQuery ? (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-white/40 hover:text-white"
            >
              ✕
            </button>
          ) : (
            <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-mono text-white/25 px-1 py-0.5 rounded bg-white/5 border border-white/5">
              /
            </span>
          )}
        </div>

        {/* Quick Rescan */}
        <button
          onClick={handleQuickScan}
          disabled={isScanning}
          title="Scan game libraries"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/[0.06] text-xs font-semibold transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw size={13} className={isScanning ? "animate-spin text-amber-400" : ""} />
          <span className="hidden sm:inline">{isScanning ? "Scanning..." : "Scan"}</span>
        </button>

        {/* Disk Space glance */}
        {freeGb !== null && (
          <div
            title={`Drive ${diskInfo?.drive || "Storage"}: ${freeGb} GB available`}
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.06] text-white/50 text-[11px] font-medium"
          >
            <HardDrive size={13} className="text-white/40" />
            <span>{freeGb} GB Free</span>
          </div>
        )}

        {/* Settings button */}
        <button
          onClick={() => navigate({ to: "/settings/launcher" })}
          title="Launcher Settings"
          className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-white/60 hover:text-white border border-white/[0.06] transition-colors cursor-pointer"
        >
          <Settings size={15} />
        </button>
      </div>
    </header>
  )
}
