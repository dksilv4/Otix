import {
  Sparkles,
  ArrowRight,
  DownloadCloud,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { DkDialog } from '@ui/molecules/dialog'
import { DkButton } from '@ui/atoms/button'
import { useAppUpdater } from '../hooks/use-app-updater'
import {
  formatBytes,
  formatSpeed,
  parseReleaseNotes,
  formatUpdateError,
} from '../utils/updater-utils'

export interface UpdateModalProps {
  isOpen?: boolean
  isExiting?: boolean
  onClose?: () => void
}

export const UpdateModal = ({
  isOpen,
  isExiting,
  onClose,
}: UpdateModalProps) => {
  const {
    status,
    currentVersion,
    availableVersion,
    releaseNotes,
    progress,
    error,
    isChecking,
    isDownloading,
    isDownloaded,
    isModalOpen,
    closeUpdateModal,
    checkForUpdates,
    downloadUpdate,
    installUpdate,
  } = useAppUpdater()

  const resolvedOpen = isOpen !== undefined ? isOpen : isModalOpen

  const handleClose = () => {
    onClose?.()
    closeUpdateModal()
  }

  const notesList = parseReleaseNotes(releaseNotes)

  const getTitle = () => {
    if (isDownloaded) return 'Update Ready to Install'
    if (isDownloading) return 'Downloading Update'
    if (status === 'available') return 'New Update Available'
    if (status === 'error') return 'Update Error'
    if (status === 'not-available') return 'Otix is Up to Date'
    return 'Software Update'
  }

  const getDescription = () => {
    if (isDownloaded) return 'The latest version has been downloaded and is ready to apply.'
    if (isDownloading) return 'Downloading the update package in the background.'
    if (status === 'available') return 'A newer release is available with updates and improvements.'
    if (status === 'error') return 'Could not complete update check or download.'
    if (status === 'not-available') return 'You are running the newest version of Otix.'
    return 'Manage client software updates and release notes.'
  }

  return (
    <DkDialog
      open={resolvedOpen && !isExiting}
      onOpenChange={(open) => {
        if (!open) handleClose()
      }}
      title={getTitle()}
      description={getDescription()}
      className="max-w-lg"
    >
      <div className="space-y-4 pt-1">
        {/* Version Overview */}
        <div
          className="flex items-center justify-between rounded-2xl p-4"
          style={{ backgroundColor: 'var(--dk-surface-raised)' }}
        >
          <div className="space-y-0.5">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              Installed
            </span>
            <div className="text-sm font-mono font-bold text-foreground">
              v{currentVersion}
            </div>
          </div>

          <div
            className="flex h-8 w-8 items-center justify-center rounded-xl"
            style={{
              backgroundColor: 'color-mix(in srgb, var(--primary) 12%, transparent)',
              color: 'var(--primary)',
            }}
          >
            <ArrowRight className="h-4 w-4" />
          </div>

          <div className="space-y-0.5 text-right">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {status === 'available' || isDownloaded ? 'Target Release' : 'Latest Check'}
            </span>
            <div className="text-sm font-mono font-bold text-primary">
              v{availableVersion || currentVersion}
            </div>
          </div>
        </div>

        {/* Checking spinner */}
        {isChecking && (
          <div
            className="flex flex-col items-center justify-center gap-2 rounded-2xl p-6 text-center"
            style={{ backgroundColor: 'var(--dk-surface-ghost)' }}
          >
            <RefreshCw className="h-6 w-6 animate-spin text-primary" />
            <span className="text-sm font-semibold text-foreground">Checking for updates...</span>
            <p className="text-xs text-muted-foreground">
              Contacting update servers to check for recent releases.
            </p>
          </div>
        )}

        {/* Up to date state */}
        {status === 'not-available' && !isChecking && (
          <div
            className="flex items-center gap-3 rounded-2xl p-4"
            style={{ backgroundColor: 'var(--dk-surface-ghost)' }}
          >
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground">No updates available</span>
              <p className="text-xs text-muted-foreground">
                You are on the latest build (v{currentVersion}).
              </p>
            </div>
          </div>
        )}

        {/* Download progress bar */}
        {isDownloading && (
          <div
            className="space-y-2 rounded-2xl p-4"
            style={{ backgroundColor: 'var(--dk-surface-raised)' }}
          >
            <div className="flex justify-between items-center text-xs font-semibold text-foreground">
              <span>Downloading update package</span>
              <span>{(progress?.percent ?? 0).toFixed(1)}%</span>
            </div>
            <div className="w-full bg-[var(--dk-surface-ghost)] rounded-full h-2 overflow-hidden">
              <div
                className="bg-primary h-full transition-all duration-300 rounded-full"
                style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}
              />
            </div>
            {progress && (
              <div className="flex justify-between items-center text-[11px] text-muted-foreground">
                <span>
                  {formatBytes(progress.transferred)} of {formatBytes(progress.total)}
                </span>
                <span>{formatSpeed(progress.bytesPerSecond)}</span>
              </div>
            )}
          </div>
        )}

        {/* Downloaded announcement */}
        {isDownloaded && (
          <div
            className="flex items-center gap-3 rounded-2xl p-4"
            style={{ backgroundColor: 'color-mix(in srgb, var(--primary) 10%, transparent)' }}
          >
            <Sparkles className="h-5 w-5 text-primary shrink-0" />
            <div className="space-y-0.5">
              <span className="text-xs font-semibold text-foreground">Update ready to install</span>
              <p className="text-xs text-muted-foreground">
                Restart the app to complete installation of v{availableVersion || currentVersion}.
              </p>
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="flex items-start gap-2.5 rounded-2xl p-3.5 text-destructive"
            style={{ backgroundColor: 'var(--dk-surface-ghost)' }}
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div className="space-y-0.5 text-xs leading-relaxed">
              <span className="font-semibold">Update encountered an issue</span>
              <p className="text-muted-foreground">{formatUpdateError(error)}</p>
            </div>
          </div>
        )}

        {/* Release Notes */}
        {(notesList.length > 0 || status === 'available' || isDownloaded) && (
          <div className="space-y-1.5 pt-1">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
              {availableVersion ? `What's New in v${availableVersion}` : "Release Notes"}
            </span>
            <div
              className="rounded-2xl p-4 text-xs text-muted-foreground max-h-48 overflow-y-auto space-y-2"
              style={{ backgroundColor: 'var(--dk-surface-base)' }}
            >
              {notesList.length > 0 ? (
                <ul className="space-y-1.5 list-disc pl-4">
                  {notesList.map((item, idx) => (
                    <li key={idx} className="leading-relaxed text-foreground/90">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="leading-relaxed">
                  Includes stability improvements, bug fixes, and general refinements.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Modal Actions */}
        <div className="flex items-center justify-end gap-2.5 pt-2">
          {isDownloaded ? (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Restart Later
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                rightIcon={ArrowRight}
                onClick={() => void installUpdate()}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Restart & Install
              </DkButton>
            </>
          ) : status === 'available' ? (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Later
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                leftIcon={DownloadCloud}
                onClick={() => void downloadUpdate()}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Download Update
              </DkButton>
            </>
          ) : isDownloading ? (
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleClose}
              className="rounded-xl px-4 text-xs font-semibold"
            >
              Run in Background
            </DkButton>
          ) : status === 'error' ? (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Dismiss
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                leftIcon={RefreshCw}
                onClick={() => void checkForUpdates()}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Retry
              </DkButton>
            </>
          ) : status === 'not-available' ? (
            <>
              <DkButton
                type="button"
                variant="secondary"
                size="sm"
                leftIcon={RefreshCw}
                onClick={() => void checkForUpdates()}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Check Again
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                onClick={handleClose}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Close
              </DkButton>
            </>
          ) : (
            <>
              <DkButton
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClose}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Close
              </DkButton>
              <DkButton
                type="button"
                variant="primary"
                size="sm"
                leftIcon={RefreshCw}
                loading={isChecking}
                onClick={() => void checkForUpdates()}
                className="rounded-xl px-4 text-xs font-semibold"
              >
                Check for Updates
              </DkButton>
            </>
          )}
        </div>
      </div>
    </DkDialog>
  )
};
