import { memo } from 'react'
import type { CalendarEvent } from '../../types'
import { MEDIA_COLORS, mediaKind, type MediaKind } from '../../utils/timeline-cluster'
import type { BeamSide } from './timeline-beam-types'

export type { BeamSide } from './timeline-beam-types'

interface TimelineBeamProps {
  id: string
  x: number
  axisOffsetY: number
  side: BeamSide
  kinds: MediaKind[]
  isAura: boolean
  events: CalendarEvent[]
  /** Stem height encodes item count for this time bucket. */
  stemHeight: number
  selected: boolean
  isPast: boolean
  showDetails: boolean
  onSelect: (id: string) => void
}

const ROOT_OVERLAP = 4

export const TimelineBeam = memo(function TimelineBeam({
  id,
  x,
  axisOffsetY,
  side,
  kinds,
  isAura,
  events,
  stemHeight,
  selected,
  isPast,
  showDetails,
  onSelect,
}: TimelineBeamProps) {
  const isUp = side === 'up'
  const colors = kinds.map((k) => MEDIA_COLORS[k] ?? MEDIA_COLORS.other)
  const count = events.length
  const title =
    count === 1
      ? events[0].title
      : `${count} releases · ${kinds.map((k) => MEDIA_COLORS[k].label).join(' · ')}`

  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      className={`absolute z-10 flex w-32 -translate-x-1/2 flex-col items-center outline-none ${
        selected ? 'z-30' : ''
      }`}
      style={{
        left: x,
        opacity: isPast ? 0.65 : 1,
        ...(isUp
          ? { bottom: `calc(50% - ${axisOffsetY + ROOT_OVERLAP}px)` }
          : { top: `calc(50% + ${axisOffsetY - ROOT_OVERLAP}px)` }),
      }}
      title={title}
    >
      {isUp ? (
        <>
          {showDetails && (
            <BeamTip events={events} kinds={kinds} isAura={isAura} selected={selected} titleOnTop />
          )}
          <BeamFilament
            colors={colors}
            isAura={isAura}
            height={stemHeight}
            side="up"
            selected={selected}
            count={count}
          />
        </>
      ) : (
        <>
          <BeamFilament
            colors={colors}
            isAura={isAura}
            height={stemHeight}
            side="down"
            selected={selected}
            count={count}
          />
          {showDetails && (
            <BeamTip
              events={events}
              kinds={kinds}
              isAura={isAura}
              selected={selected}
              titleOnTop={false}
            />
          )}
        </>
      )}
    </button>
  )
})

function BeamFilament({
  colors,
  isAura,
  height,
  side,
  selected,
  count,
}: {
  colors: { hex: string; glow: string }[]
  isAura: boolean
  height: number
  side: BeamSide
  selected: boolean
  count: number
}) {
  const toTip = side === 'up' ? 'to top' : 'to bottom'
  const bloomPos = side === 'up' ? { bottom: -4 } : { top: -4 }
  const core = selected ? 3 : 2
  const primary = colors[0]
  const bloomSize = isAura ? 28 : Math.min(22, 12 + count)

  const coreGradient = isAura
    ? `linear-gradient(${toTip},
        rgba(248,250,252,0.95) 0%,
        ${colors.map((c, i) => `${c.hex} ${18 + i * (50 / Math.max(colors.length, 1))}%`).join(', ')},
        transparent 100%)`
    : `linear-gradient(${toTip},
        rgba(248,250,252,0.95) 0%,
        rgba(226,232,240,0.9) 8%,
        ${primary.hex} 22%,
        ${primary.hex} 70%,
        transparent 100%)`

  return (
    <div className="relative w-12 shrink-0" style={{ height }}>
      <div
        className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
        style={{
          ...bloomPos,
          width: bloomSize,
          height: bloomSize,
          background: isAura
            ? `conic-gradient(from 0deg, ${colors.map((c) => c.hex).join(', ')}, ${colors[0].hex})`
            : `radial-gradient(circle, rgba(248,250,252,0.9) 0%, ${primary.glow} 50%, transparent 72%)`,
          filter: isAura ? 'blur(6px)' : 'blur(3px)',
          opacity: isAura ? 0.85 : 0.75,
        }}
      />
      {isAura && (
        <div
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 rounded-full"
          style={{
            ...bloomPos,
            width: 14,
            height: 14,
            background: `conic-gradient(from 90deg, ${colors.map((c) => c.hex).join(', ')}, ${colors[0].hex})`,
            boxShadow: '0 0 10px rgba(255,255,255,0.35)',
          }}
        />
      )}

      <div
        className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2"
        style={{
          width: isAura ? 18 : Math.min(16, 8 + count),
          background: isAura
            ? `linear-gradient(${toTip}, ${colors.map((c) => c.glow).join(', ')}, transparent)`
            : `linear-gradient(${toTip}, ${primary.glow} 0%, transparent 100%)`,
          filter: 'blur(5px)',
          opacity: selected ? 0.85 : 0.5,
        }}
      />

      <div
        className="absolute inset-y-0 left-1/2 -translate-x-1/2 rounded-full"
        style={{ width: core, background: coreGradient }}
      />
    </div>
  )
}

function BeamTip({
  events,
  kinds,
  isAura,
  selected,
  titleOnTop,
}: {
  events: CalendarEvent[]
  kinds: MediaKind[]
  isAura: boolean
  selected: boolean
  titleOnTop: boolean
}) {
  const posters = events.filter((e) => e.posterUrl).slice(0, 3)
  const label = events.length === 1 ? events[0].title : `${events.length} items`
  const overflow = Math.max(0, events.length - posters.length)

  const stack = (
    <div
      className={`relative flex h-16 items-end justify-center ${
        posters.length > 1 && posters.length <= 3 ? 'gap-1.5' : 'w-[4.5rem]'
      }`}
    >
      {posters.length === 0 && (
        <div className="flex h-14 w-10 items-center justify-center rounded-md bg-white/10 text-[10px] text-white/40 ring-1 ring-white/15">
          {events.length}
        </div>
      )}
      {posters.map((event, i) => {
        const ring = MEDIA_COLORS[mediaKind(event.mediaType)]
        const stacked = posters.length > 3
        const offset = stacked ? (i - (posters.length - 1) / 2) * 14 : 0
        return (
          <div
            key={event.id}
            className={`overflow-hidden rounded-md shadow-lg ${stacked ? 'absolute' : 'relative shrink-0'}`}
            style={{
              ...(stacked
                ? {
                    transform: `translateX(${offset}px) translateY(${i * -2}px)`,
                    zIndex: posters.length - i,
                  }
                : undefined),
              boxShadow: selected
                ? `0 0 0 2px rgba(255,255,255,0.45), 0 0 0 1px ${ring.hex}`
                : `0 0 0 1px ${ring.hex}88`,
            }}
          >
            <img
              src={event.posterUrl!}
              alt=""
              className="h-14 w-10 object-cover"
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          </div>
        )
      })}
      {overflow > 0 && posters.length > 0 && (
        <span className="absolute -right-1 -bottom-1 z-20 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white/80 ring-1 ring-white/20">
          +{overflow}
        </span>
      )}
      {isAura && (
        <span className="absolute -top-1 left-1/2 z-20 flex -translate-x-1/2 gap-0.5 rounded-full bg-black/50 px-1 py-0.5 backdrop-blur-sm">
          {kinds.map((k) => (
            <span
              key={k}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: MEDIA_COLORS[k].hex }}
            />
          ))}
        </span>
      )}
    </div>
  )

  const titleEl = (
    <span
      className={`max-w-[7rem] truncate text-center text-[10px] font-medium leading-tight ${
        selected ? 'text-white' : 'text-white/75'
      }`}
    >
      {label}
    </span>
  )

  return (
    <div
      className={`flex flex-col items-center gap-1.5 px-1 transition-transform ${selected ? 'scale-105' : ''}`}
    >
      {titleOnTop ? (
        <>
          {titleEl}
          {stack}
        </>
      ) : (
        <>
          {stack}
          {titleEl}
        </>
      )}
    </div>
  )
}
