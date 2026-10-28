import { describe, expect, it } from 'vitest'
import {
  formatSeasonBadgeText,
  resolveMediaCardRatingPosition,
} from '../media-badge'

describe('media-badge utils', () => {
  it('formats season badge text correctly', () => {
    expect(formatSeasonBadgeText(null)).toBe('New Season')
    expect(formatSeasonBadgeText(undefined)).toBe('New Season')
  })

  describe('resolveMediaCardRatingPosition', () => {
    it('positions rating to the left of the activity tag when tag is present', () => {
      const position = resolveMediaCardRatingPosition({
        hasActivityTag: true,
      })
      expect(position).toBe('top-3 right-11')
    })

    it('positions rating in top-right corner when activity tag is absent', () => {
      const position = resolveMediaCardRatingPosition({
        hasActivityTag: false,
      })
      expect(position).toBe('top-2.5 right-2.5')
    })

    it('shifts rating down and left when both newSeasonReleased and activity tag are present', () => {
      const position = resolveMediaCardRatingPosition({
        hasActivityTag: true,
        newSeasonReleased: true,
      })
      expect(position).toBe('top-10 right-11')
    })

    it('shifts rating down and left when both isAdult and activity tag are present', () => {
      const position = resolveMediaCardRatingPosition({
        hasActivityTag: true,
        isAdult: true,
      })
      expect(position).toBe('top-8 right-11')
    })

    it('positions rating correctly for adult badge when activity tag is absent', () => {
      const position = resolveMediaCardRatingPosition({
        hasActivityTag: false,
        isAdult: true,
      })
      expect(position).toBe('top-8 right-2.5')
    })
  })
})
