import { Download, ShieldCheck, Sparkles, HardDrive } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { DkBadge } from '@ui/atoms/badge'
import type { LatestReleaseInfo, PlatformDownloadOption, PlatformId } from '../../types'
import { formatReleaseDate } from '../../utils/downloads-utils'
import WindowsLogo from '@/assets/platform-logos/windows.svg?react'
import MacLogo from '@/assets/platform-logos/mac.svg?react'
import LinuxLogo from '@/assets/platform-logos/linux.svg?react'

interface DownloadHeroProps {
  releaseInfo: LatestReleaseInfo
  detectedPlatform: 'windows' | 'macos' | 'linux'
  primaryOption?: PlatformDownloadOption
  onSelectTab: (tab: PlatformId) => void
  onDownload: (option: PlatformDownloadOption) => void
}

export const DownloadHero = ({
  releaseInfo,
  detectedPlatform,
  primaryOption,
  onSelectTab,
  onDownload,
}: DownloadHeroProps) => {
  const platformName =
    detectedPlatform === 'windows'
      ? 'Windows'
      : detectedPlatform === 'macos'
        ? 'macOS'
        : 'Linux'

  const formattedDate = formatReleaseDate(releaseInfo.publishedAt)

  const handleHeroDownload = () => {
    if (primaryOption) {
      onDownload(primaryOption)
    }
  }

  return (
    <section className="relative overflow-hidden rounded-3xl p-6 sm:p-10 backdrop-blur-2xl bg-[var(--dk-surface-glass)] shadow-[var(--dk-shadow-glass)]">
      {/* Background ambient glow without harsh borders or hardcoded colors */}
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-72 w-72 rounded-full opacity-20 blur-3xl"
        style={{
          background: 'oklch(from var(--primary) l c h / 0.35)',
        }}
      />

      <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto space-y-6">
        {/* Release & Open Source Badges */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <DkBadge variant="default" size="sm" className="gap-1.5 px-3 py-1 font-semibold">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Latest Release {releaseInfo.tagName}</span>
          </DkBadge>
          <DkBadge variant="secondary" size="sm" className="gap-1.5 px-3 py-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            <span>100% Free &amp; Open Source</span>
          </DkBadge>
          {formattedDate && (
            <span className="text-xs text-muted-foreground px-2">
              Released {formattedDate}
            </span>
          )}
        </div>

        {/* Heading & Subtitle */}
        <div className="space-y-3">
          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-foreground">
            Get Otix for {platformName}
          </h1>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl leading-relaxed">
            Download the desktop client straight from the official build repository. Direct bitstream streaming, universal game launcher, server syncing, and zero media relay.
          </p>
        </div>

        {/* Primary 1-Click Download Button */}
        {primaryOption && (
          <div className="flex flex-col items-center gap-3 pt-2 w-full max-w-md">
            <a
              href={primaryOption.downloadUrl}
              download={primaryOption.filename}
              onClick={handleHeroDownload}
              className="w-full sm:w-auto"
            >
              <DkButton
                size="lg"
                variant="primary"
                className="w-full sm:w-auto min-w-[280px] h-14 px-8 text-base font-bold gap-3 rounded-2xl shadow-[var(--dk-shadow-sm)] hover:scale-[1.02] active:scale-[0.99] transition-transform"
              >
                {detectedPlatform === 'windows' && <WindowsLogo className="h-5 w-5 fill-current" />}
                {detectedPlatform === 'macos' && <MacLogo className="h-5 w-5 fill-current" />}
                {detectedPlatform === 'linux' && <LinuxLogo className="h-5 w-5 fill-current" />}
                <span>Download for {platformName}</span>
                <Download className="h-5 w-5" />
              </DkButton>
            </a>

            {/* Quick metadata line */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
              <span>{primaryOption.filename}</span>
              <span>·</span>
              <span>{primaryOption.formattedSize}</span>
              <span>·</span>
              <span>{primaryOption.architectureLabel}</span>
            </div>
          </div>
        )}

        {/* Other Platforms Switcher */}
        <div className="pt-4 w-full flex flex-wrap items-center justify-center gap-2 text-xs text-muted-foreground">
          <span>Looking for another platform?</span>
          <button
            type="button"
            onClick={() => onSelectTab('windows')}
            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--dk-surface-ghost)]"
          >
            <WindowsLogo className="h-3.5 w-3.5 fill-current" />
            <span>Windows</span>
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onSelectTab('macos')}
            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--dk-surface-ghost)]"
          >
            <MacLogo className="h-3.5 w-3.5 fill-current" />
            <span>macOS</span>
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onSelectTab('linux')}
            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--dk-surface-ghost)]"
          >
            <LinuxLogo className="h-3.5 w-3.5 fill-current" />
            <span>Linux</span>
          </button>
          <span>·</span>
          <button
            type="button"
            onClick={() => onSelectTab('node')}
            className="inline-flex items-center gap-1 font-semibold text-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-[var(--dk-surface-ghost)]"
          >
            <HardDrive className="h-3.5 w-3.5" />
            <span>Otix Node</span>
          </button>
        </div>
      </div>
    </section>
  )
}
