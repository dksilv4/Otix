import { Folder, HardDrive, AlertTriangle } from 'lucide-react'
import { DkLogo } from '@/components/ui/atoms/logo'
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
    <div className="flex-1 flex flex-col justify-between p-6 overflow-y-auto">
      {/* Hero / Header Section */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          <DkLogo className="h-9 w-auto text-foreground" animateInfinity />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-foreground">
                Install Otix
              </h1>
              <DkBadge variant="default" size="sm">
                v{version}
              </DkBadge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              The unified modern game launcher & ecosystem
            </p>
          </div>
        </div>
      </div>

      {/* Middle Options & Folder Selector */}
      <div className="space-y-4 my-auto py-2">
        {/* Install Location Card */}
        <div className="rounded-xl bg-white/[0.03] border border-white/[0.04] p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-medium text-foreground">
            <span className="flex items-center gap-1.5">
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              Installation Directory
            </span>
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <HardDrive className="h-3 w-3" />
              {formatBytes(diskSpace.freeBytes)} available
            </span>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={installPath}
              onChange={(e) => onInstallPathChange(e.target.value)}
              className="flex-1 h-9 rounded-lg bg-black/25 px-3 text-xs text-foreground border border-white/[0.06] focus:outline-none focus:border-[var(--primary)] font-mono transition-colors"
              placeholder="C:\Program Files\Otix"
            />
            <DkButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={onBrowse}
              className="shrink-0 text-xs h-9"
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

        {/* Shortcuts & Preferences */}
        <div className="rounded-xl bg-white/[0.02] border border-white/[0.04] p-3.5 space-y-2.5">
          <div className="text-xs font-medium text-muted-foreground mb-1">
            Shortcuts & Startup
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          <div className="pt-1 border-t border-white/[0.03]">
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
      <div className="flex items-center justify-between pt-3 border-t border-white/[0.04]">
        <div className="flex items-center gap-2.5">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onBack}
            disabled={isSubmitting}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Back
          </DkButton>
          <span className="text-[11px] text-muted-foreground">
            Estimated size: ~{formatBytes(REQUIRED_DISK_SPACE_BYTES, 0)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <DkButton
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </DkButton>
          <DkButton
            type="button"
            variant="default"
            size="md"
            onClick={onStartInstall}
            disabled={!hasSpace || isSubmitting || !installPath.trim()}
            className="text-xs px-6 shadow-lg shadow-[var(--primary)]/15"
          >
            Install Otix
          </DkButton>
        </div>
      </div>
    </div>
  )
}
