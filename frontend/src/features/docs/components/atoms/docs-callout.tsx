import { Info, Sparkles, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { DocCalloutKind } from '../../types'

interface DocsCalloutProps {
  kind: DocCalloutKind
  title?: string
  text: string
}

export const DocsCallout = ({ kind, title, text }: DocsCalloutProps) => {
  const isTip = kind === 'tip'
  const isImportant = kind === 'important'
  const isWarning = kind === 'warning'

  const Icon = isTip
    ? Sparkles
    : isImportant
      ? CheckCircle2
      : isWarning
        ? AlertTriangle
        : Info

  const defaultTitle = isTip
    ? 'Pro Tip'
    : isImportant
      ? 'Important Notice'
      : isWarning
        ? 'Warning'
        : 'Note'

  return (
    <aside
      role="note"
      aria-label={title || defaultTitle}
      className="rounded-2xl p-4 sm:p-5 backdrop-blur-xl border border-white/[0.05] transition-all duration-200"
      style={{
        backgroundColor: isWarning
          ? 'var(--dk-surface-ghost)'
          : isTip || isImportant
            ? 'oklch(from var(--primary) l c h / 0.08)'
            : 'var(--dk-surface-raised)',
      }}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 p-1.5 rounded-xl shrink-0"
          style={{
            backgroundColor: isWarning
              ? 'oklch(from var(--destructive) l c h / 0.15)'
              : 'oklch(from var(--primary) l c h / 0.15)',
            color: isWarning ? 'var(--destructive)' : 'var(--primary)',
          }}
        >
          <Icon className="h-4 w-4" />
        </div>
        <div className="space-y-1 text-xs sm:text-sm">
          <p className="font-semibold text-foreground tracking-tight">
            {title || defaultTitle}
          </p>
          <p className="text-muted-foreground leading-relaxed">{text}</p>
        </div>
      </div>
    </aside>
  )
}
