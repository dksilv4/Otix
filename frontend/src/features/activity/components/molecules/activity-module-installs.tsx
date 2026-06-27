import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react'
import { useInstallProgress } from '@/features/launcher/data/install-store'
import { ActivityModuleSection } from './activity-module-section'

/** Molecule showing in-progress and completed game installs. */
export function ActivityModuleInstalls() {
  const { installs, dismissInstall, cancelInstall } = useInstallProgress()

  if (installs.length === 0) return null

  return (
    <ActivityModuleSection className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center justify-center">
            {installs.some(i => i.active) ? (
              <Loader2 className="h-4 w-4 text-emerald-400 animate-spin" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
            )}
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider text-white/50">
            Game Installs ({installs.length})
          </span>
        </div>
        <div className="space-y-4">
          {installs.map((inst) => (
            <div key={inst.isoPath} className="flex flex-col gap-2">
              <div className="flex items-center gap-3">
                {inst.active ? (
                  <Loader2 className="h-4 w-4 text-emerald-400 animate-spin shrink-0" />
                ) : inst.result?.success ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate text-white/90" title={inst.gameTitle ?? ''}>
                    {inst.gameTitle ?? 'Game'}
                  </p>
                </div>
                <div className="shrink-0 flex items-center">
                  {inst.active ? (
                    <button
                      type="button"
                      onClick={() => cancelInstall(inst.isoPath)}
                      className="h-7 w-7 flex items-center justify-center rounded-full transition-all cursor-pointer text-white/30 hover:text-red-400 hover:bg-red-400/10"
                      title="Cancel Install"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => dismissInstall(inst.isoPath)}
                      className="h-7 w-7 flex items-center justify-center rounded-full transition-all cursor-pointer text-white/30 hover:text-red-400 hover:bg-red-400/10"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>

              {inst.active && inst.progress && (
                <div className="flex items-center gap-3">
                  <div className="h-1.5 rounded-full overflow-hidden flex-1 bg-white/[0.06]">
                    <div
                      className="h-full rounded-full transition-all duration-700 bg-gradient-to-r from-blue-500 to-indigo-500"
                      style={{ width: `${inst.progress.progress}%` }}
                    />
                  </div>
                  <span className="text-[10px] font-mono tabular-nums font-medium text-white/40">
                    {inst.progress.progress}%
                  </span>
                </div>
              )}

              {inst.active && inst.progress && (
                <p className="text-[11px] rounded-xl px-3 py-2 leading-relaxed break-words font-medium text-rose-400/80 bg-rose-400/5">
                  {inst.progress.message || inst.progress.phase}
                </p>
              )}

              {inst.error && !inst.active && (
                <p className="text-[11px] rounded-xl px-3 py-2 leading-relaxed break-words font-medium text-rose-400/80 bg-rose-400/5">
                  {inst.error}
                </p>
              )}
            </div>
          ))}
        </div>
    </ActivityModuleSection>
  )
}
