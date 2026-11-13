/* ── IsoInstallingProgress — install progress bar + cancel button ── */

import { Loader2, X } from 'lucide-react'
import type { InstallInfo } from '@/features/launcher/types'

interface IsoInstallingProgressProps {
  install: InstallInfo
  onOpenInstaller: () => void
  onCancel: (isoPath: string) => void
}

export const IsoInstallingProgress = ({ install, onOpenInstaller, onCancel }: IsoInstallingProgressProps) => {
  return (
    <div className="flex gap-2 items-stretch h-10">
      <button
        onClick={onOpenInstaller}
        className="relative overflow-hidden px-4 bg-[var(--dk-surface-ghost)] hover:bg-[var(--dk-surface-field)] border border-[var(--dk-separator)] rounded-xl text-[11px] font-semibold flex items-center gap-2 transition-colors cursor-pointer backdrop-blur-md active:scale-[0.99] text-foreground w-48 justify-start"
      >
        <div className="absolute inset-0 bg-primary/10 animate-pulse pointer-events-none" />
        <Loader2 className="h-3.5 w-3.5 animate-spin text-primary shrink-0 relative z-10" />
        <div className="flex flex-col items-start relative z-10 text-left min-w-0 leading-tight">
          <span className="font-bold text-foreground truncate w-full text-[10px]">Installing...</span>
          <span className="text-[9px] text-muted-foreground truncate w-full">
            {install.progress?.message ?? 'Installing...'}
          </span>
        </div>
      </button>
      <button
        onClick={() => onCancel(install.isoPath)}
        className="px-3 bg-destructive/10 hover:bg-destructive/20 border border-destructive/20 text-destructive rounded-xl text-[11px] font-semibold transition cursor-pointer active:scale-95 flex items-center justify-center"
        title="Cancel Installation"
      >
        <X size={14} />
      </button>
    </div>
  )
};
