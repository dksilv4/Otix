import { useEffect, useId, useRef, useState } from 'react'
import { ArrowDownToLine, Check, ChevronDown, Clock, Loader2, Play, Server, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useRequestMedia, type RequestMediaState } from '../../hooks/use-request-media'
import { useOpenMediaRequestModal } from '../../hooks/use-open-media-request-modal'
import { requestableInstances } from '../../utils/request'

export interface RequestMediaButtonProps {
  state?: RequestMediaState
  onWatch?: () => void
  hideIfAvailable?: boolean
}

export const RequestMediaButton = ({
  state,
  onWatch,
  hideIfAvailable = false,
}: RequestMediaButtonProps = {}) => {
  if (state) {
    return (
      <RequestMediaButtonInner
        state={state}
        onWatch={onWatch}
        hideIfAvailable={hideIfAvailable}
      />
    )
  }
  return <RequestMediaButtonWithHook onWatch={onWatch} hideIfAvailable={hideIfAvailable} />
};

const RequestMediaButtonWithHook = ({
  onWatch,
  hideIfAvailable,
}: {
  onWatch?: () => void
  hideIfAvailable?: boolean
}) => {
  const state = useRequestMedia()
  return (
    <RequestMediaButtonInner
      state={state}
      onWatch={onWatch}
      hideIfAvailable={hideIfAvailable}
    />
  )
};

const RequestMediaButtonInner = ({
  state,
  onWatch,
  hideIfAvailable = false,
}: {
  state: RequestMediaState
  onWatch?: () => void
  hideIfAvailable?: boolean
}) => {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuButtonRef = useRef<HTMLButtonElement>(null)
  const menuId = useId()
  const { openRequestModal } = useOpenMediaRequestModal()

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setMenuOpen(false)
      menuButtonRef.current?.focus()
    }
    document.addEventListener('mousedown', handleClick)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handleClick)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [menuOpen])

  if (state.hidden || hideIfAvailable || state.loading) return null

  const openConfirm = (instanceId?: string) => {
    openRequestModal({
      state,
      initialInstanceId: instanceId,
      onWatch,
    })
  }

  if (state.queueItem) {
    const pct = Math.min(100, Math.max(0, state.queuePercent))
    const status = (state.queueItem.status || 'Downloading').toLowerCase()
    const isPaused = status.includes('pause')
    return (
      <div className="group/dl flex flex-wrap items-center gap-2">
        <div className="relative inline-flex items-center gap-2 overflow-hidden rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold text-foreground bg-[var(--dk-surface-glass)] border border-[var(--dk-separator)] shadow-lg">
          <span
            className={cn(
              'absolute inset-y-0 left-0 transition-[width] duration-500 ease-out',
              isPaused ? 'bg-amber-500/30' : 'bg-primary/30',
            )}
            style={{ width: `${pct}%` }}
          />
          <span className="relative flex items-center gap-2">
            <Loader2 className={cn('h-4 w-4', !isPaused && 'animate-spin')} />
            <span className="tabular-nums">{pct.toFixed(0)}%</span>
            {state.queueItem.timeleft && state.queueItem.timeleft !== '00:00:00' && (
              <span className="text-xs font-medium text-muted-foreground">{state.queueItem.timeleft}</span>
            )}
          </span>
        </div>
        <button
          type="button"
          onClick={state.handleCancelQueue}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--dk-surface-glass)] text-destructive hover:bg-destructive/15 transition-all cursor-pointer opacity-0 group-hover/dl:opacity-100"
          title="Cancel download"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  const downloaded = state.instances.some((item) => item.status === 'downloaded' || item.status === 'partially_available')
  const requested = state.instances.some((item) => item.status === 'requested')
  const targets = requestableInstances(state.instances)
  const busy = state.requesting != null

  if (downloaded && targets.length === 0) {
    const downloadedInstances = state.instances
      .filter((item) => item.status === 'downloaded' || item.status === 'partially_available')
      .map((item) => item.name)
      .join(', ')

    if (onWatch) {
      return (
        <button
          type="button"
          onClick={onWatch}
          className="inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
          title={downloadedInstances ? `Available in library on: ${downloadedInstances}. Click to watch/stream.` : 'Available in library. Click to watch/stream.'}
        >
          <Play className="h-4 w-4 fill-current text-current" />
          <span>Stream</span>
          <span className="text-[11px] opacity-75 font-normal truncate max-w-[120px] hidden sm:inline">
            · Available
          </span>
        </button>
      )
    }

    return (
      <div
        className="inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 shadow-lg"
        title={downloadedInstances ? `Available in library on: ${downloadedInstances}` : 'Available in library'}
      >
        <Check className="h-4 w-4" />
        Available
      </div>
    )
  }

  if (requested && targets.length === 0) {
    const requestedInstances = state.instances
      .filter((item) => item.status === 'requested')
      .map((item) => item.name)
      .join(', ')
    return (
      <div
        className="inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-amber-500/20 text-amber-700 dark:text-amber-300 shadow-lg"
        title={requestedInstances ? `Requested on: ${requestedInstances}` : 'Already requested'}
      >
        <Clock className="h-4 w-4" />
        Requested
      </div>
    )
  }

  const label = targets.length > 0 && (downloaded || requested)
    ? 'Request Additional'
    : targets.length === 0
      ? 'Request Unavailable'
      : state.requestLabel
  const singleTarget = targets.length <= 1

  if (singleTarget) {
    const target = targets[0]
    const buttonTitle = busy
      ? 'Request is in progress…'
      : !target
        ? (state.disabledReason || 'Request unavailable for this title')
        : `Request on ${target?.name || state.activeServerName}`

    return (
      <button
        type="button"
        onClick={() => openConfirm(target?.id)}
        disabled={busy || !target}
        className="inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all duration-200 active:scale-95 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        title={buttonTitle}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
        <span>{busy ? 'Requesting…' : label}</span>
      </button>
    )
  }

  return (
    <div
      ref={menuRef}
      className="relative inline-flex overflow-visible rounded-full shadow-lg"
    >
        <button
          type="button"
          onClick={() => openConfirm(targets[0]?.id)}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-l-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          title={busy ? 'Request is in progress…' : `Request on ${targets[0]?.name || state.activeServerName}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
          <span>{busy ? 'Requesting…' : label}</span>
        </button>
        <button
          ref={menuButtonRef}
          type="button"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Show request options"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          className="inline-flex items-center justify-center rounded-r-full h-10 border-l border-primary-foreground/20 bg-primary px-3 text-primary-foreground hover:bg-primary/90 transition-all cursor-pointer"
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', menuOpen && 'rotate-180')} />
        </button>
        {menuOpen && (
          <div
            id={menuId}
            role="menu"
            aria-label="Request options"
            className="absolute left-0 top-full z-50 mt-2 min-w-64 overflow-hidden rounded-2xl border border-[var(--dk-separator)] bg-[var(--dk-surface-base)]/95 p-1.5 shadow-2xl backdrop-blur-xl"
          >
            <p className="px-3 pb-1.5 pt-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {state.mediaType === 'movie' ? 'Radarr' : 'Sonarr'} instances
            </p>
            {targets.map((instance) => (
              <button
                key={instance.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false)
                  openConfirm(instance.id)
                }}
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground transition-colors hover:bg-[var(--dk-surface-glass)] cursor-pointer"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Server className="h-4 w-4 text-primary" />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground truncate">{instance.name}</span>
                  <span className="text-xs text-muted-foreground">Request on this instance</span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }


