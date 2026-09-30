import { useMemo } from 'react'
import { cn } from '@/lib/utils'
import { tokenizeTemplate, TOKEN_COLOR_MAP } from '../../utils/naming-template'

export interface TokenizedTemplateDisplayProps {
  template: string
  size?: 'xs' | 'sm' | 'md'
  className?: string
  interactive?: boolean
  onTokenClick?: (tokenKey: string) => void
}

export function TokenizedTemplateDisplay({
  template,
  size = 'sm',
  className,
  interactive = false,
  onTokenClick,
}: TokenizedTemplateDisplayProps) {
  const spans = useMemo(() => tokenizeTemplate(template), [template])

  const textSize = size === 'xs' ? 'text-[11px]' : size === 'sm' ? 'text-xs' : 'text-sm'
  const badgePadding = size === 'xs' ? 'px-1.5 py-0.5' : size === 'sm' ? 'px-2 py-0.5' : 'px-2.5 py-1'

  return (
    <div
      className={cn(
        'font-mono inline-flex flex-wrap items-center gap-1 select-none leading-relaxed',
        textSize,
        className,
      )}
    >
      {spans.map((span, idx) => {
        if (span.type === 'token') {
          const def = span.def ?? TOKEN_COLOR_MAP[span.tokenKey || '']
          const colorClass = def?.colorClass ?? 'text-primary'
          const bgClass = def?.bgClass ?? 'bg-primary/10'
          const borderClass = def?.borderClass ?? 'border-primary/20'

          return (
            <span
              key={`${span.text}-${idx}`}
              title={def ? `${def.label}: ${def.description} (e.g. ${def.example})` : span.text}
              onClick={interactive && span.tokenKey ? () => onTokenClick?.(span.tokenKey!) : undefined}
              className={cn(
                'inline-flex items-center rounded-lg border font-semibold tracking-tight shadow-sm transition-transform',
                colorClass,
                bgClass,
                borderClass,
                badgePadding,
                interactive && 'cursor-pointer hover:scale-105 active:scale-95',
              )}
            >
              {span.text}
            </span>
          )
        }

        // Literal separator (e.g. " (", ") [", "]/", etc.)
        const isSlash = span.text.includes('/')
        return (
          <span
            key={`lit-${idx}`}
            className={cn(
              'font-mono tracking-normal',
              isSlash ? 'text-white/70 font-bold px-0.5' : 'text-white/40',
            )}
          >
            {span.text}
          </span>
        )
      })}
    </div>
  )
}
