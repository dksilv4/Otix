import {
  addDays,
  addHours,
  eachDayOfInterval,
  eachMonthOfInterval,
  eachYearOfInterval,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfHour,
  startOfMonth,
  startOfYear,
} from 'date-fns'

/**
 * Six snap levels (zoomed in → out):
 * 1 hours  — one day fills most of the viewport, hour ticks
 * 2 week   — ~7 days across
 * 3 month  — ~30 days across
 * 4 year   — ~365 days across
 * 5 fiveYears
 * 6 decades (~20 years)
 */
export type TimelineScale = 'hours' | 'week' | 'month' | 'year' | 'fiveYears' | 'decades'

export const SCALE_ORDER: TimelineScale[] = [
  'hours',
  'week',
  'month',
  'year',
  'fiveYears',
  'decades',
]

const MS_PER_DAY = 86_400_000
const DAYS_PER_MONTH = 30.4375
const DAYS_PER_YEAR = 365.25

/** Build viewport-relative px/day stops: [hours, week, month, year, fiveYears, decades]. */
export function zoomStopsForViewport(viewportWidth: number): number[] {
  const w = Math.max(viewportWidth || 960, 640)
  return [
    w * 0.92, // 1 — day fills most of the timeline
    w / 7, // 2 — whole week
    w / DAYS_PER_MONTH, // 3 — month
    w / DAYS_PER_YEAR, // 4 — year
    w / (DAYS_PER_YEAR * 5), // 5 — five years
    w / (DAYS_PER_YEAR * 20), // 6 — decades
  ]
}

export function nearestZoomIndex(pxPerDay: number, stops: number[]): number {
  let best = 0
  let bestDist = Math.abs(pxPerDay - stops[0])
  for (let i = 1; i < stops.length; i++) {
    const d = Math.abs(pxPerDay - stops[i])
    if (d < bestDist) {
      best = i
      bestDist = d
    }
  }
  return best
}

/** direction > 0 = zoom in (toward hours), < 0 = zoom out (toward decades). */
export function snapZoom(pxPerDay: number, stops: number[], direction: 1 | -1): number {
  if (stops.length === 0) return pxPerDay
  const idx = nearestZoomIndex(pxPerDay, stops)
  // stops are ordered hours → decades (high px → low px)
  const next = idx - direction
  if (next < 0) return stops[0]
  if (next >= stops.length) return stops[stops.length - 1]
  return stops[next]
}

export function scaleFromZoomIndex(index: number): TimelineScale {
  return SCALE_ORDER[Math.min(Math.max(index, 0), SCALE_ORDER.length - 1)]
}

export function scaleFromPxPerDay(pxPerDay: number, stops: number[]): TimelineScale {
  return scaleFromZoomIndex(nearestZoomIndex(pxPerDay, stops))
}

export function scaleLabel(scale: TimelineScale): string {
  switch (scale) {
    case 'hours':
      return 'Day'
    case 'week':
      return 'Week'
    case 'month':
      return 'Month'
    case 'year':
      return 'Year'
    case 'fiveYears':
      return '5 Years'
    case 'decades':
      return 'Decades'
  }
}

export function dateToX(date: Date, origin: Date, pxPerDay: number): number {
  const originMs = startOfDay(origin).getTime()
  return ((date.getTime() - originMs) / MS_PER_DAY) * pxPerDay
}

export function xToDays(x: number, pxPerDay: number): number {
  return pxPerDay === 0 ? 0 : x / pxPerDay
}

export function daysToX(days: number, pxPerDay: number): number {
  return days * pxPerDay
}

export function xToDate(x: number, origin: Date, pxPerDay: number): Date {
  const days = xToDays(x, pxPerDay)
  return new Date(startOfDay(origin).getTime() + days * MS_PER_DAY)
}

/**
 * Parse a calendar release date. Date-only strings (YYYY-MM-DD) are parked at
 * local noon so they sit mid-day once the hours ruler appears.
 */
export function parseEventDate(releaseDate: string): Date {
  if (/^\d{4}-\d{2}-\d{2}$/.test(releaseDate)) {
    const [y, m, d] = releaseDate.split('-').map(Number)
    return new Date(y, m - 1, d, 12, 0, 0, 0)
  }
  const parsed = new Date(releaseDate)
  return Number.isNaN(parsed.getTime()) ? new Date(NaN) : parsed
}

/** Build a padded timeline range sized for the current zoom scale.
 *  `keepDates` (e.g. the viewport focus) are always included so zoom
 *  anchoring never scrolls a date off the canvas.
 */
export function computeTimelineRange(
  eventDates: Date[],
  today = new Date(),
  scale: TimelineScale = 'week',
  keepDates: Date[] = []
): { start: Date; end: Date } {
  const valid = [...eventDates, ...keepDates].filter((d) => !Number.isNaN(d.getTime()))
  const todayStart = startOfDay(today)

  const padDays = (() => {
    switch (scale) {
      case 'hours':
        return 21
      case 'week':
        return 90
      case 'month':
        return 365
      case 'year':
        return 365 * 2
      case 'fiveYears':
        return 365 * 6
      case 'decades':
        return 365 * 22
    }
  })()

  if (valid.length === 0) {
    return {
      start: addDays(todayStart, -padDays),
      end: addDays(todayStart, padDays),
    }
  }

  const minDate = valid.reduce((a, b) => (a < b ? a : b))
  const maxDate = valid.reduce((a, b) => (a > b ? a : b))
  const start = addDays(minDate < todayStart ? minDate : todayStart, -padDays)
  const end = addDays(maxDate > todayStart ? maxDate : todayStart, padDays)
  return { start: startOfDay(start), end: endOfDay(end) }
}

export interface TimelineTick {
  date: Date
  x: number
  label: string
  major: boolean
}

export function buildTicks(
  start: Date,
  end: Date,
  origin: Date,
  pxPerDay: number,
  scale: TimelineScale,
  viewWindow?: { start: Date; end: Date }
): TimelineTick[] {
  const from = viewWindow?.start ?? start
  const to = viewWindow?.end ?? end
  switch (scale) {
    case 'hours':
      return buildHourTicks(from, to, origin, pxPerDay)
    case 'week':
      return buildWeekTicks(from, to, origin, pxPerDay)
    case 'month':
      return buildMonthTicks(from, to, origin, pxPerDay)
    case 'year':
      return buildYearMonthsTicks(from, to, origin, pxPerDay)
    case 'fiveYears':
      return buildYearTicks(from, to, origin, pxPerDay, 1)
    case 'decades':
      return buildYearTicks(from, to, origin, pxPerDay, 2)
  }
}

function buildHourTicks(
  viewStart: Date,
  viewEnd: Date,
  origin: Date,
  pxPerDay: number
): TimelineTick[] {
  const ticks: TimelineTick[] = []
  const pxPerHour = pxPerDay / 24
  const hourStep = pxPerHour >= 40 ? 1 : pxPerHour >= 24 ? 2 : 3

  let cursor = startOfHour(addHours(viewStart, -6))
  const last = addHours(viewEnd, 6)

  while (cursor <= last) {
    const h = cursor.getHours()
    if (h % hourStep === 0) {
      const isMidnight = h === 0
      const isNoon = h === 12
      ticks.push({
        date: new Date(cursor),
        x: dateToX(cursor, origin, pxPerDay),
        label: isMidnight ? format(cursor, 'MMM d') : format(cursor, 'HH:mm'),
        major: isMidnight || isNoon,
      })
    }
    cursor = addHours(cursor, hourStep)
  }
  return ticks
}

function buildWeekTicks(start: Date, end: Date, origin: Date, pxPerDay: number): TimelineTick[] {
  const ticks: TimelineTick[] = []
  for (const d of eachDayOfInterval({ start: startOfDay(start), end: endOfDay(end) })) {
    const isWeekStart = d.getDay() === 1
    const isMonthStart = d.getDate() === 1
    ticks.push({
      date: d,
      x: dateToX(d, origin, pxPerDay),
      label: isMonthStart ? format(d, 'MMM d') : format(d, 'EEE d'),
      major: isWeekStart || isMonthStart,
    })
  }
  return ticks
}

function buildMonthTicks(start: Date, end: Date, origin: Date, pxPerDay: number): TimelineTick[] {
  const ticks: TimelineTick[] = []
  for (const d of eachDayOfInterval({ start: startOfDay(start), end: endOfDay(end) })) {
    const isMonthStart = d.getDate() === 1
    const isWeekStart = d.getDay() === 1
    if (!isMonthStart && !isWeekStart) continue
    ticks.push({
      date: d,
      x: dateToX(d, origin, pxPerDay),
      label: isMonthStart ? format(d, 'MMM d') : format(d, 'd'),
      major: isMonthStart,
    })
  }
  return ticks
}

function buildYearMonthsTicks(
  start: Date,
  end: Date,
  origin: Date,
  pxPerDay: number
): TimelineTick[] {
  const ticks: TimelineTick[] = []
  for (const d of eachMonthOfInterval({ start: startOfMonth(start), end: endOfMonth(end) })) {
    ticks.push({
      date: d,
      x: dateToX(d, origin, pxPerDay),
      label: format(d, d.getMonth() === 0 ? 'MMM yyyy' : 'MMM'),
      major: d.getMonth() === 0 || d.getMonth() % 3 === 0,
    })
  }
  return ticks
}

function buildYearTicks(
  start: Date,
  end: Date,
  origin: Date,
  pxPerDay: number,
  yearStep: number
): TimelineTick[] {
  const ticks: TimelineTick[] = []
  for (const d of eachYearOfInterval({ start: startOfYear(start), end: endOfYear(end) })) {
    if (yearStep > 1 && d.getFullYear() % yearStep !== 0) {
      ticks.push({
        date: d,
        x: dateToX(d, origin, pxPerDay),
        label: '',
        major: false,
      })
      continue
    }
    const isDecade = d.getFullYear() % 10 === 0
    ticks.push({
      date: d,
      x: dateToX(d, origin, pxPerDay),
      label: format(d, 'yyyy'),
      major: yearStep >= 2 ? isDecade : true,
    })
  }
  return ticks.filter((t) => t.label || !t.major)
}

export function focusLabel(date: Date, scale: TimelineScale): string {
  switch (scale) {
    case 'hours':
      return format(date, 'EEE, MMM d · HH:mm')
    case 'week':
      return format(date, 'EEE, MMM d yyyy')
    case 'month':
      return format(date, 'MMMM yyyy')
    case 'year':
      return format(date, 'yyyy')
    case 'fiveYears':
      return format(date, 'yyyy')
    case 'decades':
      return `${Math.floor(date.getFullYear() / 10) * 10}s`
  }
}
