import { describe, it, expect } from 'vitest'
import {
  calculateCenterPlacement,
  calculateCollisionProgress,
  calculateMorphWidth,
  calculateMorphHeight,
} from '../center-layout'

describe('calculateCenterPlacement', () => {
  it('docks between when sufficient space exists', () => {
    const leftRect = { right: 140 } as DOMRect
    const rightRect = { left: 900 } as DOMRect

    const result = calculateCenterPlacement({
      windowWidth: 1024,
      leftRect,
      rightRect,
      minWidth: 380,
      gap: 12,
    })

    expect(result.placement).toBe('between')
    expect(result.center).toBe(520)
    expect(result.maxWidth).toBe(736)
  })

  it('falls back to sub-tier when space between is less than minWidth', () => {
    const leftRect = { right: 300 } as DOMRect
    const rightRect = { left: 500 } as DOMRect

    const result = calculateCenterPlacement({
      windowWidth: 800,
      leftRect,
      rightRect,
      minWidth: 380,
      gap: 12,
    })

    expect(result.placement).toBe('sub-tier')
    expect(result.center).toBe(400)
  })
})

describe('calculateCollisionProgress', () => {
  it('returns 0 when container is far below the nav line', () => {
    expect(calculateCollisionProgress(200, 16, 80)).toBe(0)
  })

  it('returns 1 when container touches or passes the nav line', () => {
    expect(calculateCollisionProgress(16, 16, 80)).toBe(1)
    expect(calculateCollisionProgress(10, 16, 80)).toBe(1)
  })

  it('returns fractional progress when inside the collision zone', () => {
    expect(calculateCollisionProgress(56, 16, 80)).toBeCloseTo(0.5, 2)
  })
})

describe('calculateMorphWidth', () => {
  it('interpolates correctly between full width and docked width', () => {
    expect(calculateMorphWidth(800, 400, 0)).toBe(800)
    expect(calculateMorphWidth(800, 400, 0.5)).toBe(600)
    expect(calculateMorphWidth(800, 400, 1)).toBe(400)
  })
})

describe('calculateMorphHeight', () => {
  it('interpolates correctly between full height and colliding pill height', () => {
    expect(calculateMorphHeight(120, 44, 0)).toBe(120)
    expect(calculateMorphHeight(120, 44, 0.5)).toBe(82)
    expect(calculateMorphHeight(120, 44, 1)).toBe(44)
  })
})
