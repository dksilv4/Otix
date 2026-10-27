import { CheckCircle2, X } from 'lucide-react'
import type { PlatformDownloadOption } from '../../types'
import { getInstallationInstructions } from '../../utils/downloads-utils'

interface DownloadSuccessBannerProps {
  lastDownloadedOption: PlatformDownloadOption | null
  onDismiss: () => void
}

export const DownloadSuccessBanner = ({
  lastDownloadedOption,
  onDismiss,
}: DownloadSuccessBannerProps) => {
  if (!lastDownloadedOption) return null

  const steps = getInstallationInstructions(lastDownloadedOption.platform)

  return (
    <div
      role="status"
      aria-live="polite"
      className="relative rounded-2xl p-5 sm:p-6 backdrop-blur-xl bg-primary/[0.06] shadow-[var(--dk-shadow-sm)] space-y-4 animate-in fade-in slide-in-from-top-4 duration-300"
    >
      <button
        type="button"
        onClick={onDismiss}
        className="absolute top-4 right-4 p-1.5 rounded-xl text-muted-foreground hover:text-foreground hover:bg-[var(--dk-surface-ghost)] transition-colors"
        aria-label="Dismiss download status banner"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3.5 pr-8">
        <div className="h-9 w-9 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0">
          <CheckCircle2 className="h-5 w-5" />
        </div>

        <div className="space-y-1">
          <h3 className="font-bold text-sm sm:text-base text-foreground">
            Your download for {lastDownloadedOption.title} has started!
          </h3>
          <p className="text-xs text-muted-foreground">
            Saving{' '}
            <span className="font-mono text-foreground font-medium">
              {lastDownloadedOption.filename}
            </span>{' '}
            ({lastDownloadedOption.formattedSize}). If the download did not trigger automatically,{' '}
            <a
              href={lastDownloadedOption.downloadUrl}
              download={lastDownloadedOption.filename}
              className="text-primary font-semibold underline underline-offset-2 hover:opacity-80"
            >
              click here to restart download
            </a>
            .
          </p>
        </div>
      </div>

      {/* Next Steps for Platform */}
      <div className="pt-3">
        <h4 className="text-xs font-semibold text-foreground/90 uppercase tracking-wider mb-2">
          Next steps to get started:
        </h4>
        <ol className="space-y-2 text-xs text-muted-foreground">
          {steps.map((step, idx) => (
            <li key={idx} className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                {idx + 1}
              </span>
              <span className="leading-5">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  )
}
