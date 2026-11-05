import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, Download, Loader2, Play, RotateCcw, Server, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { PlayInstance, PlayWidget, RequestInstance } from '../organisms/plugin-detail-actions'
import { getStreamButtonTheme, getStreamPresentation } from '../../utils/plugin-actions'

export interface MediaPlaySplitButtonProps {
  playWidget: PlayWidget
  otherPlayWidgets?: PlayWidget[]
  alternativeArrInstances?: RequestInstance[]
  onPlay: (pluginId: string, instance: PlayInstance) => Promise<void>
  onRequestAlternative?: (instanceId: string) => Promise<void> | void
  variant?: 'pill' | 'default'
}

export const MediaPlaySplitButton = ({
  playWidget,
  otherPlayWidgets = [],
  alternativeArrInstances = [],
  onPlay,
  onRequestAlternative,
  variant = 'pill',
}: MediaPlaySplitButtonProps) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()

  const allPlayInstances = [
    ...(playWidget.props.instances || []).map((inst) => ({ pluginId: playWidget.pluginId, instance: inst })),
    ...otherPlayWidgets.flatMap((w) => (w.props.instances || []).map((inst) => ({ pluginId: w.pluginId, instance: inst }))),
  ]

  const primary = allPlayInstances[0]
  const hasMultipleSources = allPlayInstances.length > 1
  const hasAlternativeRequests = alternativeArrInstances.length > 0
  const hasDropdown = hasMultipleSources || hasAlternativeRequests

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false)
        menuButtonRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (!primary) return null

  const handlePlayPrimary = async () => {
    setBusy(primary.instance.id)
    try {
      await onPlay(primary.pluginId, primary.instance)
    } finally {
      setBusy(null)
    }
  }

  const handlePlaySpecific = async (pluginId: string, instance: PlayInstance) => {
    setMenuOpen(false)
    setBusy(instance.id)
    try {
      await onPlay(pluginId, instance)
    } finally {
      setBusy(null)
    }
  }

  const handleRequestAlt = (instanceId: string) => {
    setMenuOpen(false)
    onRequestAlternative?.(instanceId)
  }

  const { isResume, isWatched, primaryText, subText, progressPercent } = getStreamPresentation(primary.instance)
  const theme = getStreamButtonTheme(primary.instance, variant)

  if (!hasDropdown) {
    return (
      <button
        type="button"
        onClick={handlePlayPrimary}
        disabled={busy != null}
        className={cn(
          'relative overflow-hidden group/stream-btn transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          'inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold shadow-lg backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] [&_svg]:h-4 [&_svg]:w-4',
          theme.className,
        )}
        title={subText ? `${primaryText} (${subText})` : primaryText}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />
        ) : isWatched ? (
          <RotateCcw className={cn('h-4 w-4 shrink-0', theme.iconClassName)} />
        ) : (
          <Play className={cn('h-4 w-4 shrink-0 fill-current text-current', theme.iconClassName)} />
        )}
        <span className="font-semibold">{primaryText}</span>
        {subText && (
          <span className="text-[11px] opacity-75 font-normal truncate max-w-[140px] hidden sm:inline">
            · {subText}
          </span>
        )}

        {isResume && progressPercent > 0 && (
          <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-foreground/20 rounded-full overflow-hidden">
            <span
              className={cn('block h-full transition-all duration-300', theme.progressBarClassName)}
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        )}
      </button>
    )
  }

  return (
    <div ref={menuRef} className="relative inline-flex overflow-visible rounded-full shadow-lg">
      <button
        type="button"
        onClick={handlePlayPrimary}
        disabled={busy != null}
        className={cn(
          'relative overflow-hidden inline-flex items-center gap-2 rounded-l-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed',
          theme.className,
        )}
        title={subText ? `${primaryText} (${subText})` : primaryText}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />
        ) : isWatched ? (
          <RotateCcw className={cn('h-4 w-4 shrink-0', theme.iconClassName)} />
        ) : (
          <Play className={cn('h-4 w-4 shrink-0 fill-current text-current', theme.iconClassName)} />
        )}
        <span className="font-semibold">{primaryText}</span>
        {subText && (
          <span className="text-[11px] opacity-75 font-normal truncate max-w-[120px] hidden sm:inline">
            · {subText}
          </span>
        )}

        {isResume && progressPercent > 0 && (
          <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-foreground/20 rounded-full overflow-hidden">
            <span
              className={cn('block h-full transition-all duration-300', theme.progressBarClassName)}
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        )}
      </button>

      <button
        ref={menuButtonRef}
        type="button"
        onClick={() => setMenuOpen((open) => !open)}
        aria-label="Playback and quality options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuId}
        className={cn(
          'inline-flex items-center justify-center rounded-r-full h-10 border-l border-primary-foreground/20 px-3 transition-all cursor-pointer',
          theme.className,
        )}
      >
        <ChevronDown className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')} />
      </button>

      {menuOpen && (
        <div
          id={menuId}
          role="menu"
          aria-label="Playback and quality options"
          className="absolute left-0 top-full z-50 mt-2 min-w-64 overflow-hidden rounded-2xl border border-white/[0.06] bg-[var(--dk-surface-base)]/95 p-1.5 shadow-2xl backdrop-blur-xl animate-fade-in"
        >
          {hasMultipleSources && (
            <div className="pb-1.5">
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground flex items-center justify-between">
                <span>Stream Sources</span>
                <Server className="h-3 w-3 text-primary" />
              </p>
              {allPlayInstances.map(({ pluginId, instance }) => (
                <button
                  key={`${pluginId}-${instance.id}`}
                  type="button"
                  role="menuitem"
                  onClick={() => handlePlaySpecific(pluginId, instance)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-[var(--dk-surface-glass)] cursor-pointer"
                >
                  <span className="font-medium truncate">{instance.name}</span>
                  <span className="text-[10px] text-muted-foreground capitalize">{instance.provider || 'Stream'}</span>
                </button>
              ))}
            </div>
          )}

          {hasAlternativeRequests && (
            <div className={cn(hasMultipleSources && 'border-t border-white/[0.04] pt-1.5')}>
              <p className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground flex items-center justify-between">
                <span>Request Other Quality</span>
                <Sparkles className="h-3 w-3 text-primary" />
              </p>
              {alternativeArrInstances.map((alt) => (
                <button
                  key={alt.id}
                  type="button"
                  role="menuitem"
                  onClick={() => handleRequestAlt(alt.id)}
                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs text-foreground transition-colors hover:bg-[var(--dk-surface-glass)] cursor-pointer"
                >
                  <span className="flex items-center gap-2 min-w-0">
                    <Download className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-medium truncate">{alt.name}</span>
                  </span>
                  <span className="text-[10px] text-primary shrink-0 font-medium">Request</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
