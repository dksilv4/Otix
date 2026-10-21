import { useState } from 'react'
import { ShieldCheck, Copy, Check } from 'lucide-react'
import { DkButton } from '@ui/atoms/button'
import type { PlatformId } from '../../types'
import { getVerificationCommand } from '../../utils/downloads-utils'

interface DownloadVerificationSectionProps {
  currentPlatform: PlatformId
  sampleFilename: string
}

export const DownloadVerificationSection = ({
  currentPlatform,
  sampleFilename,
}: DownloadVerificationSectionProps) => {
  const [copied, setCopied] = useState(false)
  const command = getVerificationCommand(currentPlatform, sampleFilename)

  const handleCopy = () => {
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <section className="rounded-2xl sm:rounded-3xl p-6 sm:p-7 backdrop-blur-xl bg-[var(--dk-surface-base)] border border-[var(--dk-separator)] shadow-[var(--dk-shadow-xs)] space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h3 className="font-bold text-sm sm:text-base text-foreground">
              Verify Checksum &amp; Binary Integrity
            </h3>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Verify your download using SHA-256 to ensure authenticity and protect against tampering.
          </p>
        </div>

        <DkButton
          size="sm"
          variant="secondary"
          onClick={handleCopy}
          className="text-xs font-semibold gap-1.5"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-primary" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
          <span>{copied ? 'Copied' : 'Copy Checksum Command'}</span>
        </DkButton>
      </div>

      <div className="p-3.5 rounded-xl bg-[var(--dk-surface-ghost)] border border-[var(--dk-separator)] font-mono text-xs text-foreground/90 flex items-center justify-between gap-3 overflow-x-auto select-all">
        <code>{command}</code>
      </div>
    </section>
  )
}
