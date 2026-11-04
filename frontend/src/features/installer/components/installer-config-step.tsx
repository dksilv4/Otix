import { ArrowLeft, Folder, HardDrive, AlertTriangle } from 'lucide-react'
import { DkButton } from '@/components/ui/atoms/button'
import { DkCheckbox } from '@/components/ui/atoms/checkbox'
import { DkBadge } from '@/components/ui/atoms/badge'
import { formatBytes } from '../utils/installer-utils'
import { REQUIRED_DISK_SPACE_BYTES } from '../constants'
import type { DiskSpaceInfo } from '../types'

interface InstallerConfigStepProps {
  version: string
  installPath: string
  onInstallPathChange: (path: string) => void
  onBrowse: () => void
  createDesktopShortcut: boolean
  onCreateDesktopShortcutChange: (val: boolean) => void
  createStartMenuShortcut: boolean
  onCreateStartMenuShortcutChange: (val: boolean) => void
  startOnBoot: boolean
  onStartOnBootChange: (val: boolean) => void
  diskSpace: DiskSpaceInfo
  hasSpace: boolean
  isElevated: boolean
  onStartInstall: () => void
  onBack: () => void
  onCancel: () => void
  isSubmitting: boolean
}

export const InstallerConfigStep = ({
  version,
  installPath,
  onInstallPathChange,
  onBrowse,
  createDesktopShortcut,
  onCreateDesktopShortcutChange,
  createStartMenuShortcut,
  onCreateStartMenuShortcutChange,
  startOnBoot,
  onStartOnBootChange,
  diskSpace,
  hasSpace,
  onStartInstall,
  onBack,
  onCancel,
  isSubmitting,
}: InstallerConfigStepProps) => {
  return (
    <div className="flex-1 flex flex-col justify-between p-6 sm:p-7 select-none overflow-y-auto">
      {/* Title - Clean & Borderless (No Header Bar) */}
      <div className="space-y-1 pt-1">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={onBack}
            disabled={isSubmitting}
            className="h-8 w-8 -ml-1 inline-flex items-center justify-center rounded-xl text-muted-foreground hover:text-foreground hover:bg-white/[0.06] transition-colors cursor-pointer"
            title="Go back"
            aria-label="Back"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">
            Install Otix
          </h1>
          <DkBadge variant="default" size="sm" className="font-medium tracking-wide">
            v{version}
          </DkBadge>
        </div>
        <p className="text-xs text-muted-foreground">
          Customize your installation destination and shortcut preferences
        </p>
      </div>

      {/* Options Cards */}
      <div className="space-y-4 my-auto py-2">
        {/* Install Location Card */}
        <div className="rounded-2xl bg-white/[0.03] p-4 space-y-3 backdrop-blur-xl shadow-lg shadow-black/20">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Folder className="h-3.5 w-3.5" />
              <span>Installation Directory</span>
            </span>
            <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <HardDrive className="h-3.5 w-3.5" />
              <span>{formatBytes(diskSpace.freeBytes)} available</span>
            </span>
          </div>

          <div
            className="flex items-center gap-2.5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <input
              type="text"
              value={installPath}
              onChange={(e) => onInstallPathChange(e.target.value)}
              className="flex-1 h-10 rounded-xl bg-black/40 px-3.5 text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary font-mono transition-colors"
              placeholder="C:\Program Files\Otix"
            />
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onBrowse}
              className="shrink-0 text-xs h-10 rounded-xl px-4 cursor-pointer bg-white/[0.06] hover:bg-white/[0.10]"
            >
              Browse...
            </DkButton>
          </div>

          {!hasSpace && (
            <div className="flex items-center gap-1.5 text-xs text-destructive pt-1">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
              <span>
                Low disk space. At least {formatBytes(REQUIRED_DISK_SPACE_BYTES)} is required.
              </span>
            </div>
          )}
        </div>

        {/* Shortcuts & Preferences Card */}
        <div className="rounded-2xl bg-white/[0.025] p-4 space-y-3.5 backdrop-blur-xl shadow-lg shadow-black/20">
          <div className="text-xs font-semibold text-muted-foreground tracking-wide">
            Shortcuts & Startup
          </div>

          <div
            className="grid grid-cols-2 gap-3"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DkCheckbox
              checked={createDesktopShortcut}
              onCheckedChange={onCreateDesktopShortcutChange}
              label="Create Desktop shortcut"
              className="text-xs text-foreground"
            />
            <DkCheckbox
              checked={createStartMenuShortcut}
              onCheckedChange={onCreateStartMenuShortcutChange}
              label="Create Start Menu shortcut"
              className="text-xs text-foreground"
            />
          </div>

          <div
            className="pt-2.5"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <DkCheckbox
              checked={startOnBoot}
              onCheckedChange={onStartOnBootChange}
              label="Start Otix automatically on Windows login"
              className="text-xs text-muted-foreground hover:text-foreground"
            />
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div className="flex items-center justify-between pt-4">
        <div
          className="flex items-center gap-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={isSubmitting}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Back</span>
          </DkButton>
          <span className="text-xs text-muted-foreground/80">
            Estimated size: ~{formatBytes(REQUIRED_DISK_SPACE_BYTES, 0)}
          </span>
        </div>

        <div
          className="flex items-center gap-2"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="default"
            size="md"
            onClick={onStartInstall}
            disabled={!hasSpace || isSubmitting || !installPath.trim()}
            className="text-xs px-6 font-semibold shadow-[0_0_24px_rgba(var(--primary-rgb),0.3)] rounded-xl cursor-pointer"
          >
            Install Otix
          </DkButton>
        </div>
      </div>
    </div>
  )
}
