import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ArrowDownToLine, Check, ChevronDown, Clock, Loader2, Play } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface RequestInstance {
  id: string
  name: string
  status: 'downloaded' | 'requested' | 'not_exists' | 'error'
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

// Multi-instance request dropdown. Renders its menu through a portal into
// document.body (the same pattern as the shared DkDropdown atom) so the fixed
// overlay escapes overflow-hidden ancestors and is never clipped.
function RequestMenuButton({
  widget,
  requesting,
  onRequest,
}: {
  widget: RequestWidget
  requesting: string | null
  onRequest: (pluginId: string, instanceId: string) => Promise<void> | void
}) {
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

  const instances = widget.props.instances || []
  const inLibrary = new Set(['downloaded', 'requested'])
  const anyInLib = instances.some(i => inLibrary.has(i.status))
  const anyNotInLib = instances.some(i => i.status === 'not_exists' || i.status === 'error')
  const anyDownloaded = instances.some(i => i.status === 'downloaded')
  const anyRequested = instances.some(i => i.status === 'requested')

  const requestLabel = widget.props.mediaType === 'movie' ? 'Request Movie' : 'Request Show'
  let label: string
  if (anyNotInLib) label = anyInLib ? 'Request Additional' : requestLabel
  else if (anyDownloaded) label = 'In Library'
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

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        disabled={requesting != null}
        onClick={() => setOpen(o => !o)}
        className={cn(
          'dk-interaction__btn glass-inset',
          requesting && 'dk-interaction__btn--pending',
        )}
      >
        {glow && <div className={cn('dk-interaction__glow', glow)} />}
        {requesting ? (
          <Loader2 className="relative h-5 w-5 animate-spin text-primary" />
        ) : icon}
        <span className="dk-interaction__label">
          {requesting ? 'Requesting...' : label}
        </span>
      </button>

      {open && coords && typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-[99999] rounded-xl border border-white/10 bg-[var(--dk-surface-overlay)] p-1 shadow-2xl backdrop-blur-md"
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              minWidth: `${Math.max(coords.width, 260)}px`,
            }}
          >
            <div className="px-2.5 py-1.5 border-b border-white/5">
              <span className="text-[10px] uppercase font-bold tracking-wider text-white/35">{widget.label} Instances</span>
            </div>
            <div className="mt-1 space-y-0.5">
              {instances.map((instance) => {
                const st = instance.status
                const isDownloaded = st === 'downloaded'
                const isRequested = st === 'requested'
                const isError = st === 'error'
                const requestable = st === 'not_exists' || st === 'error'
                const file = instance.file
                return (
                  <div
                    key={instance.id}
                    className={cn('rounded-lg', isDownloaded && 'bg-green-500/5', isRequested && 'bg-blue-500/5')}
                  >
                    <button
                      type="button"
                      disabled={!requestable || requesting != null}
                      onClick={() => {
                        onRequest(widget.pluginId, instance.id)
                        setOpen(false)
                      }}
                      className={cn(
                        'w-full flex items-center justify-between px-2.5 py-2 text-xs rounded-lg transition-colors text-left',
                        isDownloaded ? 'text-green-400/80 cursor-default' :
                        isRequested ? 'text-amber-300/80 cursor-default' :
                        isError ? 'text-red-400/80 hover:bg-white/5' :
                        'text-white/80 hover:bg-white/5 hover:text-white'
                      )}
                    >
                      <span className="font-medium">{instance.name}</span>
                      {isDownloaded ? (
                        <span className="text-[10px] bg-green-500/10 px-1.5 py-0.5 rounded-full font-medium">In Library</span>
                      ) : isRequested ? (
                        <span className="text-[10px] bg-amber-500/10 px-1.5 py-0.5 rounded-full font-medium">Requested</span>
                      ) : isError ? (
                        <span className="text-[10px] bg-red-500/10 px-1.5 py-0.5 rounded-full font-medium">Error</span>
                      ) : (
                        <span className="text-[10px] text-white/40 hover:text-primary transition-colors">Request</span>
                      )}
                    </button>
                    {isDownloaded && file && (
                      <div className="px-2.5 pb-2 -mt-0.5">
                        <div className="text-[10px] leading-relaxed text-white/40">
                          {file.quality && <span className="text-white/70 font-medium mr-1.5">{file.quality}</span>}
                          {file.video && <span className="mr-1.5">{file.video}</span>}
                          {file.audio && <span className="mr-1.5">· {file.audio}</span>}
                          {formatBytes(file.size) && <span className="text-white/50">{formatBytes(file.size)}</span>}
                        </div>
                        {file.name && <div className="text-[9px] text-white/25 mt-0.5 break-all">{file.name}</div>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}

function PlayOnPlexButton({
  widget,
  onPlay,
}: {
  widget: PlayWidget
  onPlay: (pluginId: string, instance: PlayInstance) => Promise<void>
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
    return (
      <button
        type="button"
        onClick={() => run(single)}
        disabled={busy != null}
        className={cn(
          'dk-interaction__btn glass-inset',
          'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-9 text-sm font-semibold',
          'text-white hover:text-white/90 transition-all cursor-pointer disabled:opacity-50',
        )}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
        Play on {single.name}
      </button>
    )
  }

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          setCoords({ top: rect.bottom + 6, left: rect.left, width: rect.width })
        }}
        className={cn(
          'dk-interaction__btn glass-inset',
          'inline-flex items-center justify-center gap-1.5 rounded-xl px-4 h-9 text-sm font-semibold',
          'text-white hover:text-white/90 transition-all cursor-pointer',
        )}
      >
        <Play className="h-4 w-4 fill-current" />
        Play on Plex
        <ChevronDown className="h-3.5 w-3.5 text-white/50" />
      </button>
      {coords &&
        createPortal(
          <div className="fixed inset-0 z-[120]" onMouseDown={() => setCoords(null)}>
            <div
              className="absolute overflow-hidden rounded-xl border border-white/10 bg-[#16181d] shadow-2xl shadow-black/60"
              style={{ top: coords.top, left: coords.left, width: Math.max(coords.width, 200) }}
            >
              <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">
                Plex Servers
              </div>
              {instances.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  disabled={busy != null}
                  onClick={() => run(inst)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-white/80 hover:bg-white/[0.06] transition-colors cursor-pointer disabled:opacity-50"
                >
                  {busy === inst.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  ) : (
                    <Play className="h-3.5 w-3.5 text-primary fill-current" />
                  )}
                  <span className="truncate">{inst.name}</span>
                </button>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

interface PluginApi {
  getSlotData: (location: string, context?: Record<string, unknown>) => Promise<unknown>
  callData: (pluginId: string, method: string, ...args: unknown[]) => Promise<unknown>
}

function getPluginApi(): PluginApi | undefined {
  return (window as Window & { desktopAPI?: { plugin?: PluginApi } }).desktopAPI?.plugin
}

// Request (Radarr/Sonarr) + Play-on-Plex actions from the desktop plugins.
// These talk to the user's own servers via the plugins, so they render even
// when the user is signed out of their Otix account.
export function MediaDetailPluginActions({ mediaId, mediaType, tmdbId }: { mediaId: string; mediaType: string; tmdbId?: string | null }) {
  // Radarr/other source services need the real TMDB id, not the internal ULID.
  const requestId = tmdbId || mediaId
  const [widgets, setWidgets] = useState<RequestWidget[]>([])
  const [playWidgets, setPlayWidgets] = useState<PlayWidget[]>([])
  const [loading, setLoading] = useState(true)
  const [requesting, setRequesting] = useState<string | null>(null)

  const loadSlots = useCallback(async () => {
    const api = getPluginApi()
    if (!api?.getSlotData) {
      setLoading(false)
      return
    }
    try {
      const data = await api.getSlotData('media/detail/actions', { mediaId: requestId, mediaType }) as Array<{
        pluginId: string
        label: string
        data?: {
          widgets?: Array<{
            type: string
            props: {
              label?: string
              mediaType: string
              mediaId: string
              instances: RequestInstance[] | PlayInstance[]
            }
          }>
        }
      }>
      const requestWidgets: RequestWidget[] = []
      const playList: PlayWidget[] = []
      if (data) {
        for (const entry of data) {
          for (const widget of entry.data?.widgets || []) {
            if (widget.type === 'request-button') {
              requestWidgets.push({
                pluginId: entry.pluginId,
                label: entry.label,
                props: widget.props as RequestWidget['props'],
              })
            } else if (widget.type === 'play-button') {
              playList.push({
                pluginId: entry.pluginId,
                label: entry.label,
                props: widget.props as PlayWidget['props'],
              })
            }
          }
        }
      }
      setWidgets(requestWidgets)
      setPlayWidgets(playList)
    } catch (err) {
      console.error('Failed to load plugin slots:', err)
    } finally {
      setLoading(false)
    }
  }, [requestId, mediaType])

  useEffect(() => {
    Promise.resolve().then(() => {
      loadSlots()
    })
  }, [loadSlots])

  if (loading || (widgets.length === 0 && playWidgets.length === 0)) return null

  const handleRequest = async (pluginId: string, instanceId: string) => {
    setRequesting(instanceId)
    const api = getPluginApi()
    if (!api?.callData) {
      setRequesting(null)
      return
    }

    try {
      const method = mediaType === 'movie' ? 'request-movie' : 'request-series'
      const res = await api.callData(pluginId, method, { instanceId, tmdbId: requestId }) as {
        success?: boolean
        error?: string
        message?: string
      } | null
      if (res?.success) {
        await loadSlots()
      } else {
        alert(res?.error || 'Failed to request')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to request')
    } finally {
      setRequesting(null)
    }
  }

  const handlePlay = async (pluginId: string, instance: PlayInstance) => {
    const api = getPluginApi()
    try {
      const res = await api?.callData(pluginId, 'play.open', { serverId: instance.serverId, ratingKey: instance.ratingKey }) as {
        success?: boolean
        url?: string
        error?: string
      } | null
      if (!res?.success || !res?.url) {
        alert(res?.error || 'Failed to open Plex')
        return
      }
      const desktopAPI = (window as any).desktopAPI
      if (desktopAPI?.openExternal) {
        await desktopAPI.openExternal(res.url)
      } else {
        window.open(res.url, '_blank', 'noopener,noreferrer')
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to open Plex')
    }
  }

  return (
    <section className="dk-interaction">
      <div className="dk-interaction__btns">
        {playWidgets.map((widget) => (
          <PlayOnPlexButton key={widget.pluginId} widget={widget} onPlay={handlePlay} />
        ))}
        {widgets.map((widget) => {
        const instances = widget.props.instances || []
        const inLibrary = new Set(['downloaded', 'requested'])
        const anyInLib = instances.some(i => inLibrary.has(i.status))
        const anyNotInLib = instances.some(i => i.status === 'not_exists' || i.status === 'error')
        const anyDownloaded = instances.some(i => i.status === 'downloaded')

        const requestLabel = widget.props.mediaType === 'movie' ? 'Request Movie' : 'Request Show'
        let label: string
        if (anyNotInLib) label = anyInLib ? 'Request Additional' : requestLabel
        else if (anyDownloaded) label = 'In Library'
        else label = 'Requested'

        if (instances.length === 1) {
          const single = instances[0]
          const isDownloaded = single.status === 'downloaded'
          const isRequested = single.status === 'requested'
          const requestable = single.status === 'not_exists' || single.status === 'error'
          const file = single.file
          return (
            <div key={widget.pluginId} className="flex flex-col items-center gap-1.5">
              <button
                type="button"
                disabled={!requestable || requesting != null}
                onClick={() => handleRequest(widget.pluginId, single.id)}
                className={cn(
                  'dk-interaction__btn glass-inset',
                  requesting === single.id && 'dk-interaction__btn--pending',
                  (isDownloaded || isRequested) && 'cursor-default'
                )}
              >
                {(isDownloaded || isRequested) && (
                  <div
                    className={cn(
                      'dk-interaction__glow',
                      isDownloaded ? 'dk-interaction__glow--emerald' : 'dk-interaction__glow--amber'
                    )}
                  />
                )}
                {requesting === single.id ? (
                  <Loader2 className="relative h-5 w-5 animate-spin text-primary" />
                ) : isDownloaded ? (
                  <Check className="relative h-5 w-5 transition-all duration-200 text-emerald-400 scale-110" />
                ) : isRequested ? (
                  <Clock className="relative h-5 w-5 transition-all duration-200 text-amber-400 scale-110" />
                ) : (
                  <ArrowDownToLine className="relative h-5 w-5 transition-all duration-200 text-primary scale-100" />
                )}
                <span className="dk-interaction__label">
                  {requesting === single.id ? 'Requesting...' : label}
                </span>
              </button>
              {isDownloaded && file && (
                <div className="text-left text-[10px] leading-relaxed text-white/40 max-w-[260px]">
                  {file.quality && <span className="text-white/70 font-medium mr-1.5">{file.quality}</span>}
                  {file.video && <span className="mr-1.5">{file.video}</span>}
                  {file.audio && <span className="mr-1.5">· {file.audio}</span>}
                  {formatBytes(file.size) && <span className="text-white/50">{formatBytes(file.size)}</span>}
                  {file.name && <div className="text-[9px] text-white/25 mt-0.5 break-all">{file.name}</div>}
                </div>
              )}
            </div>
          )
        }

        return (
          <RequestMenuButton
            key={widget.pluginId}
            widget={widget}
            requesting={requesting}
            onRequest={handleRequest}
          />
        )
      })}
      </div>
    </section>
  )
}
