import { useState } from 'react'
import { Download, Check, Copy } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import { PlatformBadge } from './platform-badge'
import type { PlatformDownloadOption } from '../../types'
import WindowsLogo from '@/assets/platform-logos/windows.svg?react'
import MacLogo from '@/assets/platform-logos/mac.svg?react'
import LinuxLogo from '@/assets/platform-logos/linux.svg?react'
import ServerLogo from '@/assets/platform-logos/server.svg?react'

interface DownloadCardProps {
  option: PlatformDownloadOption
  onDownload: (option: PlatformDownloadOption) => void
}

export const DownloadCard = ({ option, onDownload }: DownloadCardProps) => {
  const [copied, setCopied] = useState(false)

  const handleCopyCommand = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!option.command) return
    navigator.clipboard.writeText(option.command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  const handleDownloadClick = () => {
    onDownload(option)
  }

  return (
    <div
      className={
        'group relative flex flex-col justify-between p-5 rounded-2xl backdrop-blur-xl transition-all duration-200 ' +
        (option.isPrimary
          ? 'bg-[var(--dk-surface-raised)] shadow-[var(--dk-shadow-sm)] hover:shadow-[var(--dk-shadow-glass)]'
          : 'bg-[var(--dk-surface-glass)] hover:bg-[var(--dk-surface-ghost-hover)] shadow-[var(--dk-shadow-glass)]')
      }
    >
      <div className="space-y-3">
        {/* Header: Platform Icon + Title + Badges */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div
              className={
                'h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ' +
                (option.isPrimary
                  ? 'bg-primary/10 text-primary'
                  : 'bg-[var(--dk-surface-ghost)] text-foreground/80')
              }
            >
              {option.platform === 'windows' && <WindowsLogo className="h-5 w-5 fill-current" />}
              {option.platform === 'macos' && <MacLogo className="h-5 w-5 fill-current" />}
              {option.platform === 'linux' && <LinuxLogo className="h-5 w-5 fill-current" />}
              {option.platform === 'node' && <ServerLogo className="h-5 w-5 fill-current" />}
            </div>

            <div>
              <h3 className="font-semibold text-base text-foreground leading-tight">
                {option.title}
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                {option.architectureLabel}
              </p>
            </div>
          </div>

          {option.badge && (
            <PlatformBadge
              label={option.badge}
              variant={option.isPrimary ? 'default' : 'secondary'}
            />
          )}
        </div>

        {/* Description */}
        <p className="text-xs text-muted-foreground leading-relaxed">
          {option.description}
        </p>

        {/* Optional command snippet (e.g. chmod +x or dpkg) */}
        {option.command && (
          <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[var(--dk-surface-ghost)] font-mono text-[11px] text-muted-foreground">
            <span className="truncate">{option.command}</span>
            <button
              type="button"
              onClick={handleCopyCommand}
              className="text-muted-foreground hover:text-foreground shrink-0 transition-colors"
              title="Copy command"
              aria-label="Copy command"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-primary" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </button>
          </div>
        )}
      </div>

      {/* Footer: File info & Direct Download Action */}
      <div className="pt-4 mt-4 flex items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono text-muted-foreground">
            {option.filename}
          </span>
          <span className="text-xs font-semibold text-foreground/90">
            {option.formattedSize}
          </span>
        </div>

        <a
          href={option.downloadUrl}
          download={option.filename}
          onClick={handleDownloadClick}
          className="inline-flex"
        >
          <DkButton
            size="sm"
            variant={option.isPrimary ? 'primary' : 'secondary'}
            className="gap-2 text-xs font-semibold px-4"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Download</span>
          </DkButton>
        </a>
      </div>
    </div>
  )
}
