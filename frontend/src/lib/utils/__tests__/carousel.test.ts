import { describe, it, expect } from 'vitest'
import {
  calculateCarouselItemWidth,
  calculateCarouselPageWidth,
  calculateCarouselSnapTarget,
} from '../carousel'

describe('carousel utils', () => {
  describe('calculateCarouselItemWidth', () => {
    it('returns minItemWidth if availableWidth is zero or negative', () => {
      expect(calculateCarouselItemWidth(0, 250, 12)).toBe(250)
      expect(calculateCarouselItemWidth(-100, 250, 12)).toBe(250)
    })

    it('calculates width matching available container', () => {
      const width = calculateCarouselItemWidth(1000, 250, 12)
      // 1000 + 12 = 1012. 250 + 12 = 262. 1012 / 262 = 3.86 -> 3 items.
      // (1000 - 2 * 12) / 3 = 976 / 3 = 325.33
      expect(width).toBeCloseTo(325.33, 1)
    })

    it('adapts on small screens to fit at least 2 cards', () => {
      const width = calculateCarouselItemWidth(360, 250, 12)
      expect(width).toBeLessThanOrEqual(250)
      expect(width).toBeGreaterThanOrEqual(140)
    })
  })

  describe('calculateCarouselPageWidth', () => {
    it('returns zero if stride is zero or negative', () => {
      expect(calculateCarouselPageWidth(1000, 0, 0)).toBe(0)
    })

    it('calculates page width as integer multiple of card stride', () => {
      const pageWidth = calculateCarouselPageWidth(1000, 250, 12)
      const stride = 250 + 12
      expect(pageWidth % stride).toBe(0)
      expect(pageWidth).toBeGreaterThan(0)
      expect(pageWidth).toBeLessThanOrEqual(1000 + 12)
    })
  })

  describe('calculateCarouselSnapTarget', () => {
    const defaultOptions = {
      currentScrollLeft: 250,
      dragDistance: 0,
      velocity: 0,
      itemWidth: 200,
      gap: 10,
      maxScroll: 1000,
    }

    it('snaps to nearest card when released with low velocity and small drag distance', () => {
      // Stride is 210. 250 is closer to 210 (index 1) than 420 (index 2)
      const target = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: 250,
      })
      expect(target).toBe(210)

      // 320 is closer to 420 (index 2)
      const target2 = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: 320,
      })
      expect(target2).toBe(420)
    })

    it('snaps forward to next card when flicked or dragged forward (content moved left)', () => {
      // Current 220, dragged with negative velocity (moving forward)
      const target = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: 220,
        dragDistance: -40,
        velocity: -0.5,
      })
      // Stride is 210, ceil(220 / 210) = 2 -> 420
      expect(target).toBe(420)
    })

    it('snaps backward to previous card when flicked or dragged backward (content moved right)', () => {
      // Current 380, dragged with positive velocity (moving backward)
      const target = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: 380,
        dragDistance: 40,
        velocity: 0.5,
      })
      // Stride is 210, floor(380 / 210) = 1 -> 210
      expect(target).toBe(210)
    })

    it('clamps snap target within [0, maxScroll]', () => {
      const targetMin = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: -50,
        dragDistance: 100,
        velocity: 1,
      })
      expect(targetMin).toBe(0)

      const targetMax = calculateCarouselSnapTarget({
        ...defaultOptions,
        currentScrollLeft: 950,
        dragDistance: -100,
        velocity: -1,
        maxScroll: 800,
      })
      expect(targetMax).toBe(800)
    })
  })
})
