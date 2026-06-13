/* ── IsoInstallingProgress — install progress bar + cancel button ── */

import { Loader2, X } from 'lucide-react'

interface InstallInfo {
  isoPath: string
  progress?: { message?: string }
}

interface Props {
  install: InstallInfo
  onOpenInstaller: () => void
  onCancel: (isoPath: string) => void
}

export function IsoInstallingProgress({ install, onOpenInstaller, onCancel }: Props) {
  return (
    <div className="flex gap-2 items-stretch h-[38px]">
      <button
        onClick={onOpenInstaller}
        className="relative overflow-hidden px-4 bg-white/5 hover:bg-white/8 border border-white/10 rounded-xl text-[11px] font-semibold flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.99] text-white w-48 justify-start"
      >
        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/20 to-indigo-600/30 animate-pulse pointer-events-none" />
        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-400 shrink-0 relative z-10" />
        <div className="flex flex-col items-start relative z-10 text-left min-w-0 leading-tight">
          <span className="font-bold text-white truncate w-full text-[10px]">Installing...</span>
          <span className="text-[9px] text-white/50 truncate w-full">
            {install.progress?.message ?? 'Installing...'}
          </span>
        </div>
      </button>
      <button
        onClick={() => onCancel(install.isoPath)}
        className="px-3 bg-red-500/10 hover:bg-red-500/25 border border-red-500/20 text-red-400 rounded-xl text-[11px] font-semibold transition-all cursor-pointer active:scale-95 flex items-center justify-center"
        title="Cancel Installation"
      >
        <X size={14} />
      </button>
    </div>
  )
}
