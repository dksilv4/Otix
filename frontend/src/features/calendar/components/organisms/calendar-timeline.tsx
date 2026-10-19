import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addDays, format, startOfDay } from 'date-fns'
import { Link } from '@tanstack/react-router'
import { Minus, Plus } from 'lucide-react'
import type { CalendarEvent } from '../../types'
import { CalendarEventRow } from '../molecules/calendar-event-row'
import { TimelineAxis } from '../molecules/timeline-axis'
import { TimelineBeam, type BeamSide } from '../molecules/timeline-beam'
import {
  buildTicks,
  computeTimelineRange,
  dateToX,
  daysToX,
  focusLabel,
  scaleFromPxPerDay,
  scaleLabel,
  xToDate,
  xToDays,
  zoomStopsForViewport,
  unionRange,
} from '../../utils/timeline-scale'
import { waveOffsetY } from '../../utils/timeline-wave'
import {
  MEDIA_COLORS,
  beamHeightForCount,
  clusterEvents,
  expandClustersForSpace,
  type TimelineCluster,
} from '../../utils/timeline-cluster'

interface CalendarTimelineProps {
  events: CalendarEvent[]
}

interface PlacedCluster {
  cluster: TimelineCluster
  x: number
  axisOffsetY: number
  side: BeamSide
  isPast: boolean
  stemHeight: number
}

const SIDE_PAD = 80
const CULL_PAD = 480
const MAX_CANVAS_PX = 480_000
const INITIAL_STOPS = zoomStopsForViewport(960)

export const CalendarTimeline = ({ events }: CalendarTimelineProps) => {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const zoomStops = useMemo(
    () => zoomStopsForViewport(viewportWidth || 960),
    [viewportWidth]
  )
  const [pxPerDay, setPxPerDay] = useState(() => INITIAL_STOPS[0])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [focusDate, setFocusDate] = useState(() => startOfDay(new Date()))
  const [scrollLeft, setScrollLeft] = useState(0)
  /** Expand-only scroll window — grows at the edges while panning, never shrinks. */
  const [span, setSpan] = useState<{ start: Date; end: Date } | null>(null)
  const didCenterRef = useRef(false)
  const dragRef = useRef<{ active: boolean; startX: number; scrollLeft: number }>({
    active: false,
    startX: 0,
    scrollLeft: 0,
  })
  const scrollRaf = useRef(0)
  const pxPerDayRef = useRef(pxPerDay)
  const originRef = useRef<Date>(startOfDay(new Date()))
  const canvasWidthRef = useRef(0)
  const zoomStopsRef = useRef(zoomStops)
  const zoomAnchorRef = useRef<{ time: number; offsetX: number } | null>(null)
  const zoomAtRef = useRef<(direction: 1 | -1) => void>(() => {})
  const zoomIndexRef = useRef(0)
  const pendingScrollShiftRef = useRef(0)
  const extendingRef = useRef(false)

  useEffect(() => {
    pxPerDayRef.current = pxPerDay
    zoomStopsRef.current = zoomStops
  }, [pxPerDay, zoomStops])

  const today = useMemo(() => startOfDay(new Date()), [])
  const scale = scaleFromPxPerDay(pxPerDay, zoomStops)
  const showDetails = scale === 'hours'

  // Keep the same snap *index* when the viewport (and thus stop values) change.
  useEffect(() => {
    const next = zoomStops[zoomIndexRef.current] ?? zoomStops[0]
    if (next == null || Math.abs(next - pxPerDayRef.current) <= 0.01) return
    const el = scrollerRef.current
    if (el && el.clientWidth > 0) {
      const offsetX = el.clientWidth / 2
      const centerDate = xToDate(
        el.scrollLeft + offsetX - SIDE_PAD,
        originRef.current,
        pxPerDayRef.current
      )
      zoomAnchorRef.current = { time: centerDate.getTime(), offsetX }
    }
    pxPerDayRef.current = next
    setPxPerDay(next)
  }, [zoomStops])

  // Fresh base pad when zoom scale changes.
  useEffect(() => {
    setSpan(null)
  }, [scale])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return
    const measure = () => setViewportWidth(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clusters = useMemo(() => clusterEvents(events, scale), [events, scale])
  const displayClusters = useMemo(
    () => expandClustersForSpace(clusters, scale, pxPerDay),
    [clusters, scale, pxPerDay]
  )
  const maxCount = useMemo(
    () => clusters.reduce((m, c) => Math.max(m, c.count), 1),
    [clusters]
  )

  const viewW = viewportWidth || 960

  const baseRange = useMemo(() => {
    const dates = displayClusters.map((c) => c.date)
    return computeTimelineRange(dates, today, scale, [today])
  }, [displayClusters, today, scale])

  const { origin, canvasWidth, placed } = useMemo(() => {
    const merged = span ? unionRange(baseRange, span) : baseRange
    const originDate = startOfDay(merged.start)
    const contentWidth = dateToX(merged.end, originDate, pxPerDay) + SIDE_PAD * 2
    const width = Math.min(Math.max(contentWidth, viewW * 2, 800), MAX_CANVAS_PX)

    const items: PlacedCluster[] = displayClusters.map((cluster, index) => {
      const x = dateToX(cluster.date, originDate, pxPerDay) + SIDE_PAD
      return {
        cluster,
        x,
        axisOffsetY: waveOffsetY(x),
        side: (index % 2 === 0 ? 'up' : 'down') as BeamSide,
        isPast: cluster.date < today,
        stemHeight: beamHeightForCount(cluster.count, maxCount),
      }
    })

    return { origin: originDate, canvasWidth: width, placed: items }
  }, [displayClusters, pxPerDay, today, viewW, maxCount, baseRange, span])

  useEffect(() => {
    originRef.current = origin
    canvasWidthRef.current = canvasWidth
  }, [origin, canvasWidth])

  const axisOffset = Math.max(0, scrollLeft - CULL_PAD)
  const axisWidth = Math.min(canvasWidth - axisOffset, viewW + CULL_PAD * 2)

  const visiblePlaced = useMemo(() => {
    const left = scrollLeft - CULL_PAD
    const right = scrollLeft + viewW + CULL_PAD
    return placed.filter((p) => p.x >= left && p.x <= right)
  }, [placed, scrollLeft, viewW])

  const visibleTicks = useMemo(() => {
    if (pxPerDay <= 0) return []
    const padDays = CULL_PAD / pxPerDay
    const startDays = xToDays(scrollLeft - SIDE_PAD, pxPerDay) - padDays
    const endDays = xToDays(scrollLeft + viewW - SIDE_PAD, pxPerDay) + padDays
    const viewStart = xToDate(daysToX(startDays, pxPerDay), origin, pxPerDay)
    const viewEnd = xToDate(daysToX(endDays, pxPerDay), origin, pxPerDay)
    return buildTicks(viewStart, viewEnd, origin, pxPerDay, scale, {
      start: viewStart,
      end: viewEnd,
    })
  }, [scrollLeft, viewW, scale, pxPerDay, origin])

  const centerOnDate = useCallback(
    (date: Date, nextPx?: number) => {
      const el = scrollerRef.current
      if (!el) return
      const px = nextPx ?? pxPerDayRef.current
      zoomAnchorRef.current = null
      const x = dateToX(date, origin, px) + SIDE_PAD
      el.scrollLeft = Math.max(0, x - el.clientWidth / 2)
      setScrollLeft(el.scrollLeft)
    },
    [origin]
  )

  useEffect(() => {
    if (didCenterRef.current) return
    const el = scrollerRef.current
    if (!el || canvasWidth <= 0 || pxPerDay <= 0) return
    didCenterRef.current = true
    const nearest =
      placed.length === 0
        ? today
        : placed.reduce((best, p) => {
            const bestDist = Math.abs(best.getTime() - today.getTime())
            const dist = Math.abs(p.cluster.date.getTime() - today.getTime())
            return dist < bestDist ? p.cluster.date : best
          }, placed[0].cluster.date)
    centerOnDate(nearest)
  }, [canvasWidth, centerOnDate, today, pxPerDay, placed])

  const zoomStep = useCallback((direction: 1 | -1) => {
    const el = scrollerRef.current
    if (!el) return
    const stops = zoomStopsRef.current
    if (stops.length === 0) return

    const idx = zoomIndexRef.current
    const nextIdx = Math.min(Math.max(idx - direction, 0), stops.length - 1)
    if (nextIdx === idx) return

    const current = pxPerDayRef.current || stops[idx] || stops[0]
    const next = stops[nextIdx]

    // Discrete snaps lock the date at the viewport center so the view doesn't jump.
    const offsetX = el.clientWidth / 2
    const centerDate = xToDate(el.scrollLeft + offsetX - SIDE_PAD, originRef.current, current)

    zoomIndexRef.current = nextIdx
    zoomAnchorRef.current = { time: centerDate.getTime(), offsetX }
    pxPerDayRef.current = next
    // Ensure the locked date stays inside the canvas after the scale pad resets.
    setSpan((prev) => {
      const pad = 45
      const cover = { start: addDays(centerDate, -pad), end: addDays(centerDate, pad) }
      return prev ? unionRange(prev, cover) : cover
    })
    setFocusDate(centerDate)
    setPxPerDay(next)
  }, [])

  useEffect(() => {
    zoomAtRef.current = zoomStep
  }, [zoomStep])

  useLayoutEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    if (pendingScrollShiftRef.current !== 0) {
      el.scrollLeft += pendingScrollShiftRef.current
      pendingScrollShiftRef.current = 0
      setScrollLeft(el.scrollLeft)
      extendingRef.current = false
    }

    const anchor = zoomAnchorRef.current
    if (!anchor) return
    if (canvasWidth <= 0 || pxPerDay <= 0) return

    const newX = dateToX(new Date(anchor.time), origin, pxPerDay) + SIDE_PAD
    const maxScroll = Math.max(0, canvasWidth - el.clientWidth)
    el.scrollLeft = Math.max(0, Math.min(newX - anchor.offsetX, maxScroll))
    setScrollLeft(el.scrollLeft)
    zoomAnchorRef.current = null
  }, [pxPerDay, canvasWidth, origin, span])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return

    let acc = 0
    let lastSnap = 0

    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) >= Math.abs(e.deltaX) && e.deltaY !== 0) {
        e.preventDefault()
        const now = performance.now()
        if (now - lastSnap < 220) return
        acc += e.deltaY
        if (Math.abs(acc) < 40) return
        const direction: 1 | -1 = acc < 0 ? 1 : -1
        acc = 0
        lastSnap = now
        zoomAtRef.current(direction)
        return
      }
      if (e.deltaX !== 0) {
        e.preventDefault()
        el.scrollLeft += e.deltaX
      }
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  const extendSpanIfNeeded = useCallback(
    (left: number, clientWidth: number, width: number, originDate: Date, px: number) => {
      if (px <= 0 || extendingRef.current) return
      const edge = Math.max(clientWidth * 0.9, 480)
      const chunkDays = Math.max(14, Math.ceil((clientWidth * 3) / px))

      if (left < edge) {
        extendingRef.current = true
        pendingScrollShiftRef.current += chunkDays * px
        setSpan((prev) => {
          const base = prev ?? baseRange
          const start = originDate < base.start ? originDate : base.start
          return { start: addDays(start, -chunkDays), end: base.end }
        })
        return
      }

      if (left + clientWidth > width - edge) {
        extendingRef.current = true
        setSpan((prev) => {
          const base = prev ?? baseRange
          const endFromOrigin = xToDate(Math.max(0, width - SIDE_PAD), originDate, px)
          const end = base.end > endFromOrigin ? base.end : endFromOrigin
          return { start: base.start, end: addDays(end, chunkDays) }
        })
        // Clear extending flag on next layout after canvas grows (no scroll shift).
        requestAnimationFrame(() => {
          extendingRef.current = false
        })
      }
    },
    [baseRange]
  )

  const onScroll = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current)
    scrollRaf.current = requestAnimationFrame(() => {
      setScrollLeft(el.scrollLeft)
      const mid = el.scrollLeft + el.clientWidth / 2
      setFocusDate(xToDate(mid - SIDE_PAD, originRef.current, pxPerDayRef.current))
      extendSpanIfNeeded(
        el.scrollLeft,
        el.clientWidth,
        canvasWidthRef.current,
        originRef.current,
        pxPerDayRef.current
      )
    })
  }, [extendSpanIfNeeded])

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const el = scrollerRef.current
    if (!el) return
    if ((e.target as HTMLElement).closest('button')) return
    dragRef.current = { active: true, startX: e.clientX, scrollLeft: el.scrollLeft }
    el.setPointerCapture(e.pointerId)
    el.style.cursor = 'grabbing'
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return
    const el = scrollerRef.current
    if (!el) return
    el.scrollLeft = dragRef.current.scrollLeft - (e.clientX - dragRef.current.startX)
  }, [])

  const endDrag = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current.active) return
    dragRef.current.active = false
    const el = scrollerRef.current
    if (!el) return
    try {
      el.releasePointerCapture(e.pointerId)
    } catch {
      /* already released */
    }
    el.style.cursor = 'grab'
  }, [])

  const handleSelect = useCallback((id: string) => {
    setSelectedId((prev) => (prev === id ? null : id))
  }, [])

  const goToday = useCallback(() => {
    zoomIndexRef.current = 0
    const dayPx = zoomStopsRef.current[0]
    if (!dayPx) return
    zoomAnchorRef.current = { time: today.getTime(), offsetX: 0 }
    // Use center offset after layout; temporarily set and fix in rAF.
    pxPerDayRef.current = dayPx
    setSpan(null)
    setPxPerDay(dayPx)
    setFocusDate(today)
    requestAnimationFrame(() => {
      const el = scrollerRef.current
      if (el) {
        zoomAnchorRef.current = {
          time: today.getTime(),
          offsetX: el.clientWidth / 2,
        }
        centerOnDate(today, dayPx)
      }
    })
  }, [centerOnDate, today])

  const todayX = dateToX(today, origin, pxPerDay) + SIDE_PAD
  const todayAxisY = waveOffsetY(todayX)
  const selectedCluster = placed.find((p) => p.cluster.id === selectedId)?.cluster ?? null

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col">
      <div className="absolute top-3 right-4 left-4 z-30 flex flex-wrap items-center justify-between gap-3 sm:right-6 sm:left-6 lg:right-8 lg:left-8">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-lg font-bold text-foreground">Timeline</h1>
          <span className="rounded-md border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold tracking-wider text-amber-600 dark:text-amber-400 uppercase">
            Beta
          </span>
          <span className="rounded-md border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-sm">
            {scaleLabel(scale)}
          </span>
          <span className="text-sm font-medium text-foreground">{focusLabel(focusDate, scale)}</span>
          <Legend />
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-[var(--dk-separator)] bg-[var(--dk-surface-glass)] p-0.5 backdrop-blur-sm">
          <Link
            to="/calendar"
            className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
          >
            Classic
          </Link>
          <button
            type="button"
            onClick={() => zoomStep(-1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
            aria-label="Zoom out"
          >
            <Minus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => zoomStep(1)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
            aria-label="Zoom in"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-md px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
          >
            Today
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        onScroll={onScroll}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="relative min-h-0 w-full flex-1 cursor-grab overflow-x-auto overflow-y-hidden bg-[radial-gradient(ellipse_at_center,_rgba(99,102,241,0.08)_0%,_transparent_55%),radial-gradient(ellipse_at_20%_50%,_rgba(56,189,248,0.06)_0%,_transparent_40%),radial-gradient(ellipse_at_80%_50%,_rgba(232,121,249,0.06)_0%,_transparent_40%)] select-none"
        style={{ touchAction: 'pan-x' }}
      >
        <div className="relative h-full" style={{ width: canvasWidth, minWidth: '100%' }}>
          <TimelineAxis width={axisWidth} offsetX={axisOffset} />

          {visibleTicks.map((tick) => {
            const x = tick.x + SIDE_PAD
            const oy = waveOffsetY(x)
            return (
              <div
                key={`${tick.major ? 'M' : 'm'}-${tick.date.toISOString()}`}
                className="pointer-events-none absolute top-0 bottom-0"
                style={{ left: x }}
              >
                <div
                  className={`absolute left-0 w-px -translate-x-1/2 ${
                    tick.major ? 'h-5 bg-foreground/20' : 'h-2.5 bg-foreground/10'
                  }`}
                  style={{ top: `calc(50% + ${oy}px - ${tick.major ? 10 : 5}px)` }}
                />
                {tick.major && tick.label && (
                  <span
                    className="absolute left-0 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium tracking-wide text-muted-foreground"
                    style={{ top: `calc(50% + ${oy}px + 14px)` }}
                  >
                    {tick.label}
                  </span>
                )}
              </div>
            )
          })}

          <div
            className="pointer-events-none absolute z-20 w-px bg-gradient-to-b from-transparent via-primary/70 to-transparent"
            style={{ left: todayX, top: 12, bottom: 12 }}
          >
            <span className="absolute top-14 left-1/2 -translate-x-1/2 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] font-semibold tracking-wider text-primary uppercase">
              Today
            </span>
            <div
              className="absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_16px_var(--primary)]"
              style={{ top: `calc(50% + ${todayAxisY}px)` }}
            />
          </div>

          {visiblePlaced.map((beam) => (
            <TimelineBeam
              key={beam.cluster.id}
              id={beam.cluster.id}
              x={beam.x}
              axisOffsetY={beam.axisOffsetY}
              side={beam.side}
              kinds={beam.cluster.kinds}
              isAura={beam.cluster.isAura}
              events={beam.cluster.events}
              stemHeight={beam.stemHeight}
              selected={beam.cluster.id === selectedId}
              isPast={beam.isPast}
              showDetails={showDetails}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </div>

      {selectedCluster && (
        <ClusterDetailPanel cluster={selectedCluster} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
};

const Legend = () => {
  return (
    <div className="hidden items-center gap-2 sm:flex">
      {(['movie', 'show', 'game'] as const).map((k) => (
        <span key={k} className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: MEDIA_COLORS[k].hex }} />
          {MEDIA_COLORS[k].label}
        </span>
      ))}
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{
            background: `conic-gradient(${MEDIA_COLORS.movie.hex}, ${MEDIA_COLORS.show.hex}, ${MEDIA_COLORS.game.hex})`,
          }}
        />
        Mixed
      </span>
    </div>
  )
};

const ClusterDetailPanel = ({
  cluster,
  onClose,
}: {
  cluster: TimelineCluster
  onClose: () => void
}) => {
  const heading =
    cluster.grain === 'hour'
      ? format(cluster.date, 'EEE, MMM d · HH:mm')
      : cluster.grain === 'week'
        ? `Week of ${format(cluster.date, 'MMM d yyyy')}`
        : cluster.grain === 'month'
          ? format(cluster.date, 'MMMM yyyy')
          : cluster.grain === 'year'
            ? format(cluster.date, 'yyyy')
            : format(cluster.date, 'EEEE, MMM d yyyy')

  return (
    <div className="absolute right-4 bottom-4 left-4 z-30 max-h-[42%] max-w-xl overflow-y-auto rounded-xl border border-[var(--dk-separator)] bg-[var(--dk-surface-root)]/95 p-3 shadow-2xl backdrop-blur-md sm:right-6 sm:bottom-6 sm:left-6 lg:left-8">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{heading}</h3>
          <p className="text-[11px] text-muted-foreground">
            {cluster.count} release{cluster.count === 1 ? '' : 's'}
            {cluster.isAura ? ' · mixed types' : ''}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-[var(--dk-surface-ghost)] hover:text-foreground"
        >
          Close
        </button>
      </div>
      <div className="space-y-1">
        {cluster.events.map((event) => (
          <CalendarEventRow key={event.id} event={event} />
        ))}
      </div>
    </div>
  )
};
