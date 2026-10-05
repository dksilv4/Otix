import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, ArrowDownToLine, Check, ChevronDown, Clock, Loader2, Play, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useMediaDetailPluginActions } from '@/features/media/hooks/use-media-detail-plugin-actions'

export interface RequestInstance {
  id: string
  name: string
  status: 'downloaded' | 'requested' | 'not_exists' | 'error' | 'partially_available'
  file?: {
    name?: string | null
    size?: number | null
    quality?: string | null
    video?: string | null
    audio?: string | null
  } | null
}

export interface RequestWidget {
  pluginId: string
  label: string
  props: {
    label?: string
    mediaType: string
    mediaId: string
    instances: RequestInstance[]
  }
}

export interface PlayInstance {
  id: string
  serverId: string
  name: string
  ratingKey: string
  baseUrl?: string
  token?: string
  provider?: string
  providerLabel?: string
  serverName?: string
  mediaType?: 'movie' | 'show' | 'episode'
  seasonNumber?: number
  episodeNumber?: number
  episodeTitle?: string
  viewOffset?: number
  duration?: number
  progressPercent?: number
  viewed?: boolean
  itemId?: string
  title?: string
}

export interface PlayWidget {
  pluginId: string
  label: string
  props: {
    mediaType: string
    mediaId: string
    instances: PlayInstance[]
  }
}

function formatBytes(bytes?: number | null): string {
  if (bytes == null || isNaN(bytes) || bytes < 0) return ''
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let i = 0
  let n = bytes
  while (n >= 1024 && i < units.length - 1) { n /= 1024; i++ }
  return `${n >= 10 || i === 0 ? n.toFixed(0) : n.toFixed(1)} ${units[i]}`
}

const REQUESTABLE = new Set(['not_exists', 'error'])
const IN_LIBRARY = new Set(['downloaded', 'requested', 'partially_available'])

// Aggregate state of a request widget's instances → button label, glow and
// icon. Shows Available or Partially Available if downloaded, while reflecting
// any requested instances honestly.
function getButtonState(widget: RequestWidget) {
  const instances = widget.props.instances || []
  const anyInLib = instances.some(i => IN_LIBRARY.has(i.status))
  const anyNotInLib = instances.some(i => REQUESTABLE.has(i.status))
  const anyDownloaded = instances.some(i => i.status === 'downloaded' || i.status === 'partially_available')
  const anyRequested = instances.some(i => i.status === 'requested' || i.status === 'partially_available')

  const requestLabel = widget.props.mediaType === 'movie' ? 'Request Movie' : 'Request Show'
  let label: string
  if (anyNotInLib) label = anyInLib ? 'Request Additional' : requestLabel
  else if (anyDownloaded && anyRequested) label = 'Partially Available'
  else if (anyDownloaded) label = 'Available'
  else label = 'Requested'

  let glow: string | null = null
  let icon = <ArrowDownToLine className="relative h-5 w-5 transition-all duration-200 text-primary scale-100" />
  if (anyDownloaded) {
    glow = 'dk-interaction__glow--emerald'
    icon = <Check className="relative h-5 w-5 transition-all duration-200 text-emerald-400 scale-110" />
  } else if (anyRequested) {
    glow = 'dk-interaction__glow--amber'
    icon = <Clock className="relative h-5 w-5 transition-all duration-200 text-amber-400 scale-110" />
  }
  return { label, glow, icon }
}

function FileDetails({ file }: { file: NonNullable<RequestInstance['file']> }) {
  return (
    <div className="mt-1">
      <div className="text-[11px] leading-relaxed text-white/40">
        {file.quality && <span className="text-white/70 font-medium mr-1.5">{file.quality}</span>}
        {file.video && <span className="mr-1.5">{file.video}</span>}
        {file.audio && <span className="mr-1.5">· {file.audio}</span>}
        {formatBytes(file.size) && <span className="text-white/50">{formatBytes(file.size)}</span>}
      </div>
      {file.name && <div className="text-[10px] text-white/25 mt-0.5 break-all">{file.name}</div>}
    </div>
  )
}

const STATUS_CHIP: Record<RequestInstance['status'], { cls: string; icon: React.ReactNode; label: string }> = {
  downloaded: { cls: 'bg-green-500/10 text-green-400/90', icon: <Check className="h-3 w-3" />, label: 'Available' },
  partially_available: { cls: 'bg-amber-500/10 text-amber-300/90', icon: <Clock className="h-3 w-3" />, label: 'Partially Available' },
  requested: { cls: 'bg-amber-500/10 text-amber-300/90', icon: <Clock className="h-3 w-3" />, label: 'Requested' },
  not_exists: { cls: 'bg-white/5 text-white/40', icon: <ArrowDownToLine className="h-3 w-3" />, label: 'Not in library' },
  error: { cls: 'bg-red-500/10 text-red-400/90', icon: <AlertTriangle className="h-3 w-3" />, label: 'Error' },
}

function StatusChip({ status }: { status: RequestInstance['status'] }) {
  const s = STATUS_CHIP[status]
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-medium', s.cls)}>
      {s.icon}
      {s.label}
    </span>
  )
}

// Per-widget library status list: one row per instance with status chip and,
// when downloaded, the file details. Rendered inside the page's "Library
// Status" section (and the legacy standalone plugin actions block).
function LibraryStatusPanel({ widget }: { widget: RequestWidget }) {
  const instances = widget.props.instances || []
  return (
    <div className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 text-left">
      <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-white/35">
        {widget.label} library status
      </div>
      <ul className="space-y-2.5">
        {instances.map((instance) => (
          <li key={instance.id} className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="truncate text-xs font-medium text-white/90">{instance.name}</span>
                <StatusChip status={instance.status} />
              </div>
              {instance.status === 'downloaded' && instance.file && <FileDetails file={instance.file} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Grid request button carrying the aggregate status icon. A single requestable
// instance requests immediately; multiple requestable instances open a small
// picker (portal into document.body, same as the shared DkDropdown atom, so the
// fixed overlay escapes overflow-hidden ancestors). When nothing is requestable
// the button is a status display only.
function RequestButton({
  widget,
  requesting,
  onRequest,
  variant = 'default',
}: {
  widget: RequestWidget
  requesting: string | null
  onRequest: (pluginId: string, instanceId: string) => Promise<void> | void
  variant?: 'default' | 'pill'
}) {
  const { label, glow, icon } = getButtonState(widget)
  const requestable = (widget.props.instances || []).filter(i => REQUESTABLE.has(i.status))

  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)

  const updateCoords = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width })
  }, [])

  useEffect(() => {
    if (open) updateCoords()
  }, [open, updateCoords])

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (
        triggerRef.current && !triggerRef.current.contains(t) &&
        menuRef.current && !menuRef.current.contains(t)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    function onScrollOrResize() {
      if (open) updateCoords()
    }
    if (open) {
      document.addEventListener('mousedown', onDown)
      document.addEventListener('keydown', onKey)
      window.addEventListener('scroll', onScrollOrResize, true)
      window.addEventListener('resize', onScrollOrResize)
    }
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updateCoords])

  const handleClick = () => {
    if (requestable.length === 1) {
      onRequest(widget.pluginId, requestable[0]?.id)
    } else if (requestable.length > 1) {
      setOpen(o => !o)
    }
  }

  const isMovie = widget.props.mediaType === 'movie'
  const serviceName = widget.label || (isMovie ? 'Radarr' : 'Sonarr')
  let buttonTitle: string
  if (requesting != null) {
    buttonTitle = `Requesting from ${serviceName}…`
  } else if (requestable.length === 0) {
    const anyInLib = (widget.props.instances || []).some(i => i.status === 'downloaded' || i.status === 'requested')
    buttonTitle = anyInLib
      ? `Already in library or requested on ${serviceName}`
      : `No requestable ${serviceName} instances available`
  } else {
    buttonTitle = label
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={requestable.length === 0 || requesting != null}
        onClick={handleClick}
        title={buttonTitle}
        className={cn(
          variant === 'pill'
            ? 'inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold bg-white/[0.08] hover:bg-white/[0.14] text-white/90 border border-white/10 shadow-lg backdrop-blur-md transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed [&_svg]:h-4 [&_svg]:w-4 [&_svg]:scale-100'
            : cn(
                'dk-interaction__btn glass-inset disabled:cursor-not-allowed',
                requesting && 'dk-interaction__btn--pending',
              ),
        )}
      >
        {glow && variant !== 'pill' && <div className={cn('dk-interaction__glow', glow)} />}
        {requesting ? (
          <Loader2 className={cn('animate-spin text-primary', variant === 'pill' ? 'h-4 w-4' : 'relative h-5 w-5')} />
        ) : (
          icon
        )}
        <span className={variant === 'pill' ? '' : 'dk-interaction__label'}>
          {requesting ? 'Requesting...' : label}
        </span>
      </button>

      {open && coords && requestable.length > 1 && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999] rounded-xl border border-white/10 bg-[var(--dk-surface-overlay)] p-1 shadow-2xl backdrop-blur-md"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${Math.max(coords.width, 220)}px`,
            }}
          >
            <div className="px-2.5 py-1.5 border-b border-white/5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/35">{widget.label} Instances</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {requestable.map((instance) => (
                <button
                  key={instance.id}
                  type="button"
                  disabled={requesting != null}
                  onClick={() => {
                    onRequest(widget.pluginId, instance.id)
                    setOpen(false)
                  }}
                  className="w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left text-white/80 hover:bg-white/5 hover:text-white disabled:opacity-50"
                >
                  <span className="font-medium truncate">{instance.name}</span>
                  <span className="text-[10px] text-primary">Request</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function formatRemaining(offsetMs: number, durationMs: number): string {
  const leftMs = Math.max(0, durationMs - offsetMs)
  const totalMins = Math.round(leftMs / 60000)
  if (totalMins < 60) return `${totalMins}m left`
  const hours = Math.floor(totalMins / 60)
  const mins = totalMins % 60
  return `${hours}h ${mins > 0 ? `${mins}m ` : ''}left`
}

function getStreamPresentation(inst: PlayInstance) {
  const offset = inst.viewOffset || 0
  const duration = inst.duration || 0
  const isResume = Boolean(offset > 5000 && (!duration || offset < duration - 15000) && !inst.viewed)
  const isWatched = Boolean(inst.viewed) && !isResume
  const hasEpisode = inst.seasonNumber != null && inst.episodeNumber != null

  let primaryText: string
  let subText: string | null = null

  if (hasEpisode) {
    const epTag = `S${inst.seasonNumber}:E${inst.episodeNumber}`
    if (isResume) {
      primaryText = `Resume ${epTag}`
      subText = inst.episodeTitle || null
    } else if (isWatched) {
      primaryText = `Rewatch ${epTag}`
      subText = inst.episodeTitle || null
    } else {
      primaryText = `Play ${epTag}`
      subText = inst.episodeTitle || null
    }
  } else {
    if (isResume) {
      primaryText = 'Resume'
      subText = duration > 0 ? formatRemaining(offset, duration) : null
    } else if (isWatched) {
      primaryText = 'Watch Again'
    } else {
      primaryText = inst.title || 'Stream'
    }
  }

  const progressPercent =
    inst.progressPercent ??
    (duration > 0 && offset > 0 ? Math.min(100, Math.round((offset / duration) * 100)) : 0)

  return { isResume, isWatched, primaryText, subText, progressPercent }
}

function StreamMediaButton({
  widget,
  onPlay,
  variant = 'default',
}: {
  widget: PlayWidget
  onPlay: (pluginId: string, instance: PlayInstance) => Promise<void>
  variant?: 'default' | 'pill'
}) {
  const instances = widget.props.instances || []
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const run = async (instance: PlayInstance) => {
    setBusy(instance.id)
    try {
      await onPlay(widget.pluginId, instance)
    } finally {
      setBusy(null)
      setCoords(null)
    }
  }

  if (instances.length === 1) {
    const single = instances[0]
    const { isResume, isWatched, primaryText, subText, progressPercent } = getStreamPresentation(single)

    return (
      <button
        type="button"
        onClick={() => run(single)}
        disabled={busy != null}
        className={cn(
          'relative overflow-hidden group/stream-btn transition-all duration-200',
          variant === 'pill'
            ? cn(
                'inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold shadow-lg backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4',
                isResume
                  ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-500/35 hover:ring-amber-400/70 shadow-amber-500/10'
                  : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 hover:ring-emerald-400/60 shadow-emerald-500/10',
              )
            : cn(
                'dk-interaction__btn glass-inset',
                'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-9 text-sm font-semibold',
                'text-white hover:text-white/90 transition-all cursor-pointer disabled:opacity-50',
              ),
        )}
        title={subText ? `${primaryText} (${subText})` : primaryText}
      >
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-current shrink-0" />
        ) : isWatched ? (
          <RotateCcw className="h-4 w-4 text-current shrink-0" />
        ) : (
          <Play className="h-4 w-4 fill-current text-current shrink-0" />
        )}
        <span className="font-semibold">{primaryText}</span>
        {subText && (
          <span className="text-[11px] opacity-75 font-normal truncate max-w-[140px] hidden sm:inline">
            · {subText}
          </span>
        )}
        {single.providerLabel && (
          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/80 hidden md:inline-flex ml-0.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                isResume ? 'bg-amber-400' : 'bg-emerald-400',
              )}
            />
            {single.providerLabel}
          </span>
        )}

        {/* Illuminated Progress Bar Accent */}
        {isResume && progressPercent > 0 && (
          <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-white/20 rounded-full overflow-hidden">
            <span
              className="block h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)] transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        )}
      </button>
    )
  }

  // Multi-server / Multi-provider dropdown
  const first = instances[0]
  const { isResume, primaryText, subText, progressPercent } = getStreamPresentation(first)
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width })
        }}
        className={cn(
          'relative overflow-hidden group/stream-btn transition-all duration-200',
          variant === 'pill'
            ? cn(
                'inline-flex items-center gap-2 rounded-full h-10 px-4 sm:px-5 py-2 text-sm font-semibold shadow-lg backdrop-blur-md hover:scale-[1.02] active:scale-[0.98] [&_svg]:h-4 [&_svg]:w-4',
                isResume
                  ? 'bg-amber-500/25 text-amber-200 ring-1 ring-amber-400/50 hover:bg-amber-500/35 hover:ring-amber-400/70 shadow-amber-500/10'
                  : 'bg-emerald-500/20 text-emerald-200 ring-1 ring-emerald-500/40 hover:bg-emerald-500/30 hover:ring-emerald-400/60 shadow-emerald-500/10',
              )
            : cn(
                'dk-interaction__btn glass-inset',
                'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-9 text-sm font-semibold',
                'text-white hover:text-white/90 transition-all cursor-pointer',
              ),
        )}
      >
        <Play className="h-4 w-4 fill-current shrink-0" />
        <span className="font-semibold">{primaryText}</span>
        {subText && (
          <span className="text-[11px] opacity-75 font-normal truncate max-w-[120px] hidden sm:inline">
            · {subText}
          </span>
        )}
        {first.providerLabel && (
          <span className="inline-flex items-center gap-1 text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-white/10 text-white/80 hidden md:inline-flex ml-0.5">
            <span
              className={cn(
                'w-1.5 h-1.5 rounded-full animate-pulse',
                isResume ? 'bg-amber-400' : 'bg-emerald-400',
              )}
            />
            {first.providerLabel}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 opacity-60 ml-0.5" />

        {isResume && progressPercent > 0 && (
          <span className="absolute bottom-0 left-3 right-3 h-[2px] bg-white/20 rounded-full overflow-hidden">
            <span
              className="block h-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]"
              style={{ width: `${progressPercent}%` }}
            />
          </span>
        )}
      </button>

      {coords &&
        createPortal(
          <div className="fixed inset-0 z-[120]" onMouseDown={() => setCoords(null)}>
            <div
              className="absolute overflow-hidden rounded-2xl border border-white/10 bg-[#14161b]/95 backdrop-blur-2xl p-1.5 shadow-2xl shadow-black/80 space-y-1"
              style={{ top: coords.top, left: coords.left, width: Math.max(coords.width, 240) }}
            >
              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-white/40 border-b border-white/5">
                Available Stream Sources
              </div>
              {instances.map((inst) => {
                const pres = getStreamPresentation(inst)
                return (
                  <button
                    key={inst.id}
                    type="button"
                    disabled={busy != null}
                    onClick={() => run(inst)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2.5 rounded-xl text-left text-xs text-white/90 hover:bg-white/[0.08] transition-all cursor-pointer disabled:opacity-50 group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {busy === inst.id ? (
                        <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                      ) : pres.isWatched ? (
                        <RotateCcw className="h-4 w-4 text-emerald-400 shrink-0" />
                      ) : (
                        <Play className="h-4 w-4 text-primary fill-current shrink-0" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold truncate text-white">{inst.name}</div>
                        <div className="text-[10px] text-white/50 truncate">
                          {pres.primaryText} {pres.subText ? `· ${pres.subText}` : ''}
                        </div>
                      </div>
                    </div>
                    {inst.providerLabel && (
                      <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-white/10 text-white/60 shrink-0">
                        {inst.providerLabel}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

// Request/Play action buttons meant to live inside the base interaction
// `.dk-interaction__btns` row (no own wrapper). These talk to the user's own
// servers via the desktop plugins, so they render even when signed out.
export function MediaDetailPluginButtons({
  widgets,
  playWidgets,
  requesting,
  onRequest,
  onPlay,
  variant = 'default',
}: {
  widgets: RequestWidget[]
  playWidgets: PlayWidget[]
  requesting: string | null
  onRequest: (pluginId: string, instanceId: string) => Promise<void> | void
  onPlay: (pluginId: string, instance: PlayInstance) => Promise<void>
  variant?: 'default' | 'pill'
}) {
  if (widgets.length === 0 && playWidgets.length === 0) return null
  return (
    <>
      {playWidgets.map((widget) => (
        <StreamMediaButton key={widget.pluginId} widget={widget} onPlay={onPlay} variant={variant} />
      ))}
      {widgets.map((widget) => (
        <RequestButton
          key={widget.pluginId}
          widget={widget}
          requesting={requesting}
          onRequest={onRequest}
          variant={variant}
        />
      ))}
    </>
  )
}

// Per-instance library status + file details, rendered inside the page's own
// "Library Status" section. Hidden until at least one instance is requested,
// downloaded or errored so a fresh "Request" page stays clean.
export function MediaDetailPluginLibraryStatus({ widgets }: { widgets: RequestWidget[] }) {
  const visible = widgets.filter(w =>
    (w.props.instances || []).some(i => i.status === 'requested' || i.status === 'downloaded' || i.status === 'error'))
  if (visible.length === 0) return null
  return (
    <div className="space-y-3">
      {visible.map(w => <LibraryStatusPanel key={w.pluginId} widget={w} />)}
    </div>
  )
}

// Standalone request/play actions block (buttons row + status) — kept for the
// legacy media detail modal which doesn't share the base interaction row.
export function MediaDetailPluginActions({
  mediaId,
  mediaType,
  tmdbId,
}: {
  mediaId: string
  mediaType: string
  tmdbId?: string | null
}) {
  const p = useMediaDetailPluginActions(mediaType, mediaId, tmdbId)
  if (p.loading || (p.widgets.length === 0 && p.playWidgets.length === 0)) return null
  return (
    <section className="dk-interaction">
      <div className="dk-interaction__btns">
        <MediaDetailPluginButtons {...p} />
      </div>
      {p.hasLibraryStatus && (
        <div className="mt-3">
          <MediaDetailPluginLibraryStatus widgets={p.widgets} />
        </div>
      )}
    </section>
  )
}
