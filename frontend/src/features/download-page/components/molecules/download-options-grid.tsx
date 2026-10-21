import { Info } from 'lucide-react'
import type { PlatformDownloadOption, PlatformId } from '../../types'
import { SYSTEM_REQUIREMENTS } from '../../constants/downloads-data'
import { DownloadCard } from '../atoms/download-card'
import { DownloadVerificationSection } from './download-verification-section'
import WindowsLogo from '@/assets/platform-logos/windows.svg?react'
import MacLogo from '@/assets/platform-logos/mac.svg?react'
import LinuxLogo from '@/assets/platform-logos/linux.svg?react'
import ServerLogo from '@/assets/platform-logos/server.svg?react'

interface DownloadOptionsGridProps {
  options: PlatformDownloadOption[]
  activeTab: PlatformId
  onSelectTab: (tab: PlatformId) => void
  onDownload: (option: PlatformDownloadOption) => void
}

export const DownloadOptionsGrid = ({
  options,
  activeTab,
  onSelectTab,
  onDownload,
}: DownloadOptionsGridProps) => {
  const filteredOptions = options.filter((opt) => opt.platform === activeTab)
  const req = SYSTEM_REQUIREMENTS.find((r) => r.platform === activeTab)
  const sampleFilename = filteredOptions[0]?.filename || 'Otix-Setup.exe'

  return (
    <div className="space-y-8">
      {/* Platform Switcher Tabs */}
      <div className="flex items-center justify-start sm:justify-center overflow-x-auto pb-2 scrollbar-none">
        <div className="flex items-center gap-1.5 p-1.5 rounded-2xl bg-[var(--dk-surface-ghost)] backdrop-blur-xl border border-[var(--dk-separator)]">
          <button
            type="button"
            onClick={() => onSelectTab('windows')}
            className={
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ' +
              (activeTab === 'windows'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
            }
          >
            <WindowsLogo className="h-4 w-4 fill-current" />
            <span>Windows</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('macos')}
            className={
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ' +
              (activeTab === 'macos'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
            }
          >
            <MacLogo className="h-4 w-4 fill-current" />
            <span>macOS</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('linux')}
            className={
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ' +
              (activeTab === 'linux'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
            }
          >
            <LinuxLogo className="h-4 w-4 fill-current" />
            <span>Linux</span>
          </button>

          <button
            type="button"
            onClick={() => onSelectTab('node')}
            className={
              'inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all ' +
              (activeTab === 'node'
                ? 'bg-[var(--dk-surface-raised)] text-foreground shadow-[var(--dk-shadow-sm)]'
                : 'text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost-hover)]')
            }
          >
            <ServerLogo className="h-4 w-4 fill-current" />
            <span>Otix Node</span>
          </button>
        </div>
      </div>

      {/* Package Options Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredOptions.map((opt) => (
          <DownloadCard key={opt.id} option={opt} onDownload={onDownload} />
        ))}
      </div>

      {/* System Requirements Card */}
      {req && (
        <div className="rounded-2xl p-5 sm:p-6 backdrop-blur-xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] space-y-4">
          <div className="flex items-center gap-2 text-foreground font-semibold text-sm">
            <Info className="h-4 w-4 text-primary" />
            <span>{req.osName} System Requirements</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
            <div className="space-y-1">
              <span className="text-muted-foreground">Minimum OS</span>
              <p className="font-semibold text-foreground">{req.minVersion}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Recommended OS</span>
              <p className="font-semibold text-foreground">{req.recommendedVersion}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Memory (RAM)</span>
              <p className="font-semibold text-foreground">{req.ram}</p>
            </div>
            <div className="space-y-1">
              <span className="text-muted-foreground">Storage</span>
              <p className="font-semibold text-foreground">{req.storage}</p>
            </div>
          </div>

          {req.notes && (
            <p className="text-xs text-muted-foreground border-t border-[var(--dk-separator)] pt-3">
              {req.notes}
            </p>
          )}
        </div>
      )}

      {/* Verification Instructions */}
      <DownloadVerificationSection
        currentPlatform={activeTab}
        sampleFilename={sampleFilename}
      />
    </div>
  )
}
