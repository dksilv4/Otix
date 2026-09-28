import { useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import OtixLogoSvg from '@/assets/otix-logo.svg?react'
import './logo.scss'

interface DkLogoProps {
  className?: string
  /** Explicit color override. Defaults to var(--foreground). */
  color?: string
  /**
   * Replace the solid center ∞ with a crawling snake. Outer ring stays.
   * Respects prefers-reduced-motion.
   */
  animateInfinity?: boolean
  /** @deprecated Logo variants are no longer supported. */
  variant?: string
}

const SNAKE_DURATION_MS = 2200
const BODY_FRACTION = 0.8
const SNAKE_STROKE_WIDTH = 118
/** Outline around snake; matches loading page `bg-background`. */
const SNAKE_BORDER = 36
const SNAKE_BORDER_COLOR = 'var(--background)'

function DkLogo({ className = 'h-7', color, animateInfinity = false }: DkLogoProps) {
  const wrapRef = useRef<HTMLSpanElement | null>(null)

  useEffect(() => {
    if (!animateInfinity) return
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return
    }

    let cancelled = false
    let interval = 0
    let raf = 0
    let tries = 0
    let restore: (() => void) | undefined

    const start = () => {
      if (cancelled) return
      const svg = wrapRef.current?.querySelector('svg')
      if (!svg) {
        if (tries++ < 20) raf = requestAnimationFrame(start)
        return
      }

      const mark = svg.querySelector<SVGPathElement>('.otix-logo-mark')
      const solid = svg.querySelector<SVGPathElement>('.otix-logo-infinity-solid')
      const ring = svg.querySelector<SVGElement>('.otix-logo-ring')
      const track = svg.querySelector<SVGPathElement>('.otix-logo-snake-track')
      const body = svg.querySelector<SVGPathElement>('.otix-logo-snake')
      if (!mark || !ring || !track || !body) return

      // Must be visible before measuring length (CSS hides these by default).
      body.style.visibility = 'visible'
      const len = body.getTotalLength()
      if (!len) return

      const prevMarkOp = mark.style.opacity
      const prevMarkVis = mark.style.visibility
      const prevSolidOp = solid?.style.opacity ?? ''
      const prevSolidVis = solid?.style.visibility ?? ''
      const prevRing = ring.style.visibility

      // Drop the static middle ∞; keep the ring. No separate head (its outline cut the body).
      mark.style.opacity = '0'
      mark.style.visibility = 'hidden'
      if (solid) {
        solid.style.opacity = '0'
        solid.style.visibility = 'hidden'
      }
      ring.style.visibility = 'visible'

      const paint = (
        path: SVGPathElement,
        width: number,
        fraction: number,
        stroke: string = 'currentColor',
      ) => {
        path.style.visibility = 'visible'
        path.style.opacity = '1'
        path.setAttribute('stroke', stroke)
        path.setAttribute('fill', 'none')
        path.setAttribute('stroke-width', String(width))
        path.setAttribute('stroke-linecap', 'round')
        path.setAttribute('stroke-linejoin', 'round')
        path.removeAttribute('clip-path')
        path.removeAttribute('mask')
        const dash = len * fraction
        const gap = Math.max(len - dash, 0)
        if (gap === 0) {
          path.removeAttribute('stroke-dasharray')
        } else {
          path.setAttribute('stroke-dasharray', `${dash} ${gap}`)
        }
      }

      // One continuous snake: border underlay, then fill — same dash, uniform width.
      paint(track, SNAKE_STROKE_WIDTH + SNAKE_BORDER * 2, BODY_FRACTION, SNAKE_BORDER_COLOR)
      paint(body, SNAKE_STROKE_WIDTH, BODY_FRACTION)

      const startedAt = performance.now()

      const tick = () => {
        if (cancelled) return
        const t = ((performance.now() - startedAt) % SNAKE_DURATION_MS) / SNAKE_DURATION_MS
        const offset = -(t * len)
        track.setAttribute('stroke-dashoffset', String(offset))
        body.setAttribute('stroke-dashoffset', String(offset))
      }

      tick()
      interval = window.setInterval(tick, 16)

      restore = () => {
        mark.style.opacity = prevMarkOp
        mark.style.visibility = prevMarkVis
        if (solid) {
          solid.style.opacity = prevSolidOp
          solid.style.visibility = prevSolidVis
        }
        ring.style.visibility = prevRing
        ;[track, body].forEach((p) => {
          p.style.visibility = ''
          p.style.opacity = ''
          p.removeAttribute('stroke-dasharray')
          p.removeAttribute('stroke-dashoffset')
        })
        svg.querySelector('.otix-logo-snake-head-border')?.remove()
      }
    }

    raf = requestAnimationFrame(start)

    return () => {
      cancelled = true
      if (raf) cancelAnimationFrame(raf)
      if (interval) window.clearInterval(interval)
      restore?.()
    }
  }, [animateInfinity])

  return (
    <span
      ref={wrapRef}
      className={cn('inline-flex overflow-visible', animateInfinity && 'dk-logo--animate-infinity')}
      style={{ color: color ?? 'var(--foreground)' }}
    >
      <OtixLogoSvg className={cn(className, 'w-auto overflow-visible')} aria-hidden />
    </span>
  )
}

export { DkLogo, DkLogo as Logo }
export type { DkLogoProps }
