import { ShieldAlert, ShieldCheck, User, RotateCcw, FolderOpen } from 'lucide-react'
import { DkButton } from '@/components/ui/atoms/button'
import { isPermissionError } from '../utils/installer-utils'

interface InstallerErrorStepProps {
  error: string | null
  installPath: string
  onRetry: () => void
  onRelaunchElevated: () => void
  onInstallToUserFolder: () => void
  onGoToConfig: () => void
  onExit: () => void
}

export const InstallerErrorStep = ({
  error,
  installPath,
  onRetry,
  onRelaunchElevated,
  onInstallToUserFolder,
  onGoToConfig,
  onExit,
}: InstallerErrorStepProps) => {
  const isPerm = isPermissionError(error)

  return (
    <div className="flex-1 flex flex-col justify-between p-7 select-none overflow-y-auto text-center">
      {/* Spacer for optical vertical centering */}
      <div className="h-2" />

      {/* Main Error Center Stage */}
      <div className="flex flex-col items-center justify-center space-y-6 max-w-md mx-auto my-auto w-full">
        {/* Glowing Status Icon Badge */}
        <div className="relative flex items-center justify-center">
          <div
            className={
              isPerm
                ? 'absolute -inset-8 rounded-full bg-amber-500/[0.25] blur-3xl pointer-events-none'
                : 'absolute -inset-8 rounded-full bg-destructive/[0.25] blur-3xl pointer-events-none'
            }
            aria-hidden="true"
          />
          <div
            className={
              isPerm
                ? 'relative p-4 rounded-3xl bg-amber-500/[0.12] text-amber-400 shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-2xl'
                : 'relative p-4 rounded-3xl bg-destructive/[0.12] text-destructive shadow-[0_12px_36px_rgba(0,0,0,0.4)] backdrop-blur-2xl'
            }
          >
            {isPerm ? <ShieldAlert className="h-10 w-10" /> : <ShieldAlert className="h-10 w-10" />}
          </div>
        </div>

        {/* Header & Description */}
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {isPerm ? 'Administrator Privileges Required' : 'Installation Failed'}
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
            {isPerm
              ? 'Windows restricts writing to Program Files without elevated administrator permissions.'
              : 'Setup encountered an unexpected issue while copying files.'}
          </p>
        </div>

        {/* High-Contrast Glass Details Pod */}
        <div className="w-full rounded-2xl bg-white/[0.04] p-4 backdrop-blur-xl shadow-lg shadow-black/20 text-left space-y-1.5">
          <div className="text-xs font-semibold text-muted-foreground">
            Target Destination
          </div>
          <div className="font-mono text-xs text-foreground bg-black/40 px-3 py-2 rounded-xl break-all">
            {installPath}
          </div>
          {error && !isPerm && (
            <p className="text-xs text-destructive/90 pt-1 leading-relaxed">
              {error}
            </p>
          )}
        </div>

        {/* Action Center */}
        <div
          className="flex flex-col items-center space-y-3 w-full"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          {isPerm ? (
            <>
              <DkButton
                type="button"
                variant="default"
                size="lg"
                onClick={onRelaunchElevated}
                className="w-full py-3.5 px-6 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_0_32px_rgba(var(--primary-rgb),0.35)] cursor-pointer"
              >
                <ShieldCheck className="h-4 w-4" />
                <span>Restart as Administrator</span>
              </DkButton>

              <DkButton
                type="button"
                variant="secondary"
                size="lg"
                onClick={onInstallToUserFolder}
                className="w-full py-3 px-6 rounded-2xl text-xs sm:text-sm font-medium flex items-center justify-center gap-2 bg-white/[0.06] hover:bg-white/[0.12] transition-colors cursor-pointer"
              >
                <User className="h-4 w-4" />
                <span>Install for Current User (No Admin Needed)</span>
              </DkButton>
            </>
          ) : (
            <DkButton
              type="button"
              variant="default"
              size="lg"
              onClick={onRetry}
              className="w-full py-3.5 px-6 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 shadow-[0_0_32px_rgba(var(--primary-rgb),0.35)] cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Try Again</span>
            </DkButton>
          )}
        </div>
      </div>

      {/* Clean Bottom Navigation Bar */}
      <div
        className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-auto"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={onGoToConfig}
          className="hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
        >
          <FolderOpen className="h-3.5 w-3.5" />
          <span>Choose Different Folder</span>
        </button>

        <button
          type="button"
          onClick={onExit}
          className="hover:text-foreground transition-colors cursor-pointer"
        >
          Exit Setup
        </button>
      </div>
    </div>
  )
}
