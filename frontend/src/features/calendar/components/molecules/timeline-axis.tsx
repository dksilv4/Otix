import { memo, useId, useMemo } from 'react'
import { buildStarField, buildWavePath, WAVE_MID_Y } from '../../utils/timeline-wave'

interface TimelineAxisProps {
  /** Visible slice width (not the full canvas). */
  width: number
  /** World X of the left edge of this slice. */
  offsetX?: number
}

export const TimelineAxis = memo(({ width, offsetX = 0 }: TimelineAxisProps) => {
  const uid = useId().replace(/:/g, '')
  const path = useMemo(() => buildWavePath(width, offsetX), [width, offsetX])
  const stars = useMemo(
    () => buildStarField(width, Math.min(28, Math.max(10, Math.floor(width / 280))), offsetX),
    [width, offsetX]
  )

  if (width <= 0 || !path) return null

  return (
    <svg
      className="pointer-events-none absolute top-1/2 z-[1] h-[120px] -translate-y-1/2 overflow-visible"
      width={width}
      height={120}
      viewBox={`0 0 ${width} 120`}
      preserveAspectRatio="none"
      aria-hidden
      style={{ left: offsetX }}
    >
      <defs>
        <linearGradient id={`gal-stroke-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.75" />
          <stop offset="18%" stopColor="#a78bfa" stopOpacity="0.9" />
          <stop offset="42%" stopColor="#67e8f9" stopOpacity="0.95" />
          <stop offset="68%" stopColor="#e879f9" stopOpacity="0.9" />
          <stop offset="88%" stopColor="#38bdf8" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0.75" />
        </linearGradient>

        <linearGradient id={`gal-core-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#e0f2fe" stopOpacity="0.7" />
          <stop offset="35%" stopColor="#e0f2fe" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#fce7f3" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#e0f2fe" stopOpacity="0.7" />
        </linearGradient>

        <radialGradient id={`gal-nebula-${uid}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c4b5fd" stopOpacity="0.35" />
          <stop offset="45%" stopColor="#22d3ee" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
        </radialGradient>

        <filter id={`gal-glow-${uid}`} x="-20%" y="-200%" width="140%" height="500%">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={`gal-soft-${uid}`} x="-30%" y="-300%" width="160%" height="700%">
          <feGaussianBlur stdDeviation="7" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
          </feMerge>
        </filter>
      </defs>

      <ellipse
        cx={width * 0.35}
        cy={WAVE_MID_Y}
        rx={Math.min(width * 0.28, 420)}
        ry={22}
        fill={`url(#gal-nebula-${uid})`}
      />
      <ellipse
        cx={width * 0.72}
        cy={WAVE_MID_Y + 2}
        rx={Math.min(width * 0.22, 340)}
        ry={18}
        fill={`url(#gal-nebula-${uid})`}
        opacity={0.7}
      />

      <path
        d={path}
        fill="none"
        stroke={`url(#gal-stroke-${uid})`}
        strokeWidth={6}
        strokeLinecap="round"
        filter={`url(#gal-soft-${uid})`}
        opacity={0.4}
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#gal-stroke-${uid})`}
        strokeWidth={2}
        strokeLinecap="round"
        filter={`url(#gal-glow-${uid})`}
        opacity={0.85}
      />
      <path
        d={path}
        fill="none"
        stroke={`url(#gal-core-${uid})`}
        strokeWidth={1}
        strokeLinecap="round"
      />

      {stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o * 0.7} />
      ))}
    </svg>
  )
})
