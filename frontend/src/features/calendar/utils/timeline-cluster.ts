import {
  addMilliseconds,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from 'date-fns'
import type { CalendarEvent } from '../types'
import { parseEventDate, type TimelineScale } from './timeline-scale'

/** Minimum center-to-center px before multi-item buckets expand into separate beams. */
export const MIN_BEAM_SEP_PX = 64

const MS_PER_DAY = 86_400_000
const DAYS_PER_MONTH = 30.4375
const DAYS_PER_YEAR = 365.25

export type MediaKind = 'movie' | 'show' | 'game' | 'other'
export type ClusterGrain = 'hour' | 'day' | 'week' | 'month' | 'year'

export const MEDIA_COLORS: Record<MediaKind, { hex: string; glow: string; label: string }> = {
  movie: { hex: '#38bdf8', glow: 'rgba(56, 189, 248, 0.55)', label: 'Movie' },
  show: { hex: '#c084fc', glow: 'rgba(192, 132, 252, 0.55)', label: 'Show' },
  game: { hex: '#34d399', glow: 'rgba(52, 211, 153, 0.55)', label: 'Game' },
  other: { hex: '#94a3b8', glow: 'rgba(148, 163, 184, 0.45)', label: 'Other' },
}

export function mediaKind(mediaType: string): MediaKind {
  const t = mediaType?.toLowerCase()
  if (t === 'movie') return 'movie'
  if (t === 'show' || t === 'tv') return 'show'
  if (t === 'game') return 'game'
  return 'other'
}

/** Which time bucket a zoom scale collapses events into. */
export function grainForScale(scale: TimelineScale): ClusterGrain {
  switch (scale) {
    case 'hours':
      return 'hour'
    case 'week':
      return 'day'
    case 'month':
      return 'week'
    case 'year':
      return 'month'
    case 'fiveYears':
      return 'month'
    case 'decades':
      return 'year'
  }
}

export interface TimelineCluster {
  id: string
  key: string
  date: Date
  grain: ClusterGrain
  events: CalendarEvent[]
  count: number
  kinds: MediaKind[]
  isAura: boolean
  primary: CalendarEvent
}

function bucketDate(date: Date, grain: ClusterGrain): Date {
  switch (grain) {
    case 'hour':
      return startOfHour(date)
    case 'day':
      return startOfDay(date)
    case 'week':
      return startOfWeek(date, { weekStartsOn: 1 })
    case 'month':
      return startOfMonth(date)
    case 'year':
      return startOfYear(date)
  }
}

function bucketKey(date: Date, grain: ClusterGrain): string {
  const b = bucketDate(date, grain)
  switch (grain) {
    case 'hour':
      return `h-${b.getFullYear()}-${b.getMonth()}-${b.getDate()}-${b.getHours()}`
    case 'day':
      return `d-${b.getFullYear()}-${b.getMonth()}-${b.getDate()}`
    case 'week':
      return `w-${b.getFullYear()}-${b.getMonth()}-${b.getDate()}`
    case 'month':
      return `m-${b.getFullYear()}-${b.getMonth()}`
    case 'year':
      return `y-${b.getFullYear()}`
  }
}

/** Cluster events into the time grain for the current zoom scale. */
export function clusterEvents(events: CalendarEvent[], scale: TimelineScale): TimelineCluster[] {
  const grain = grainForScale(scale)
  const map = new Map<string, { date: Date; events: CalendarEvent[] }>()

  for (const event of events) {
    if (!event?.releaseDate) continue
    const raw = parseEventDate(event.releaseDate)
    if (Number.isNaN(raw.getTime())) continue
    const date = bucketDate(raw, grain)
    const key = bucketKey(raw, grain)
    const existing = map.get(key)
    if (existing) existing.events.push(event)
    else map.set(key, { date, events: [event] })
  }

  const clusters: TimelineCluster[] = []
  for (const [key, { date, events: list }] of map) {
    const sorted = [...list].sort((a, b) => {
      const ka = mediaKind(a.mediaType)
      const kb = mediaKind(b.mediaType)
      if (ka !== kb) return ka.localeCompare(kb)
      return a.title.localeCompare(b.title)
    })
    const kindSet = new Set(sorted.map((e) => mediaKind(e.mediaType)))
    const kinds = (['movie', 'show', 'game', 'other'] as MediaKind[]).filter((k) => kindSet.has(k))
    clusters.push({
      id: key,
      key,
      date,
      grain,
      events: sorted,
      count: sorted.length,
      kinds,
      isAura: kinds.length > 1,
      primary: sorted[0],
    })
  }

  return clusters.sort((a, b) => a.date.getTime() - b.date.getTime())
}

export function bucketWidthPx(grain: ClusterGrain, pxPerDay: number): number {
  switch (grain) {
    case 'hour':
      return pxPerDay / 24
    case 'day':
      return pxPerDay
    case 'week':
      return pxPerDay * 7
    case 'month':
      return pxPerDay * DAYS_PER_MONTH
    case 'year':
      return pxPerDay * DAYS_PER_YEAR
  }
}

function canSeparate(count: number, widthPx: number): boolean {
  return count > 1 && widthPx / count >= MIN_BEAM_SEP_PX
}

function singleEventCluster(
  seed: TimelineCluster,
  event: CalendarEvent,
  date: Date
): TimelineCluster {
  const kind = mediaKind(event.mediaType)
  return {
    id: `${seed.key}::${event.id}`,
    key: `${seed.key}::${event.id}`,
    date,
    grain: seed.grain,
    events: [event],
    count: 1,
    kinds: [kind],
    isAura: false,
    primary: event,
  }
}

function spreadDates(windowStart: Date, windowMs: number, count: number): Date[] {
  return Array.from({ length: count }, (_, i) =>
    addMilliseconds(windowStart, ((i + 0.5) / count) * windowMs)
  )
}

function expandClusterEvenly(cluster: TimelineCluster, widthPx: number, pxPerDay: number): TimelineCluster[] {
  const windowMs = (widthPx / pxPerDay) * MS_PER_DAY
  const dates = spreadDates(cluster.date, windowMs, cluster.count)
  return cluster.events.map((event, i) => singleEventCluster(cluster, event, dates[i]))
}

/**
 * When a time bucket is wide enough, fan each title into its own beam spaced
 * evenly across that window. At Day zoom, same-day items (often parked at noon)
 * spread across the full day. Otherwise keep the clustered/aura beam.
 */
export function expandClustersForSpace(
  clusters: TimelineCluster[],
  scale: TimelineScale,
  pxPerDay: number
): TimelineCluster[] {
  if (pxPerDay <= 0 || clusters.length === 0) return clusters

  // Day zoom: gather everything that lands on the same calendar day and fan
  // across the day when there's room — hour buckets alone are usually too narrow.
  if (scale === 'hours') {
    const byDay = new Map<string, TimelineCluster[]>()
    for (const c of clusters) {
      const day = startOfDay(c.date)
      const key = `d-${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`
      const list = byDay.get(key)
      if (list) list.push(c)
      else byDay.set(key, [c])
    }

    const out: TimelineCluster[] = []
    for (const dayClusters of byDay.values()) {
      const events = dayClusters
        .flatMap((c) => c.events)
        .sort((a, b) => {
          const ka = mediaKind(a.mediaType)
          const kb = mediaKind(b.mediaType)
          if (ka !== kb) return ka.localeCompare(kb)
          return a.title.localeCompare(b.title)
        })
      const dayStart = startOfDay(dayClusters[0].date)
      if (canSeparate(events.length, pxPerDay)) {
        const dates = spreadDates(dayStart, MS_PER_DAY, events.length)
        const seed = dayClusters[0]
        for (let i = 0; i < events.length; i++) {
          out.push(singleEventCluster({ ...seed, key: `day-${seed.key}` }, events[i], dates[i]))
        }
      } else {
        out.push(...dayClusters)
      }
    }
    return out.sort((a, b) => a.date.getTime() - b.date.getTime())
  }

  const out: TimelineCluster[] = []
  for (const cluster of clusters) {
    const width = bucketWidthPx(cluster.grain, pxPerDay)
    if (canSeparate(cluster.count, width)) {
      out.push(...expandClusterEvenly(cluster, width, pxPerDay))
    } else {
      out.push(cluster)
    }
  }
  return out
}

/** Stem height in px from item count (relative to the densest cluster). */
export function beamHeightForCount(count: number, maxCount: number): number {
  const minH = 36
  const maxH = 176
  if (count <= 0) return minH
  const denom = Math.max(maxCount, 1)
  // sqrt keeps small counts readable while large spikes still dominate
  const t = Math.sqrt(count / denom)
  return Math.round(minH + t * (maxH - minH))
}
