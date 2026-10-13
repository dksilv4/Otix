import { describe, it, expect } from 'vitest'
import {
  formatContinueWatchingRemaining,
  getContinueWatchingSubtitle,
  getContinueWatchingArtwork,
} from '../continue-watching'
import type { DiscoverContinueWatchingItem } from '../../types'

describe('continue-watching utils', () => {
  describe('formatContinueWatchingRemaining', () => {
    it('returns null if duration or viewOffset is missing or invalid', () => {
      expect(formatContinueWatchingRemaining(undefined, undefined)).toBeNull()
      expect(formatContinueWatchingRemaining(0, 1000)).toBeNull()
      expect(formatContinueWatchingRemaining(1000, 0)).toBeNull()
      expect(formatContinueWatchingRemaining(1000, 1000)).toBeNull()
      expect(formatContinueWatchingRemaining(2000, 1000)).toBeNull() // viewOffset > duration
    })

    it('formats remaining minutes when less than 1 hour', () => {
      // 60m total, 35m watched -> 25m remaining
      expect(formatContinueWatchingRemaining(35 * 60 * 1000, 60 * 60 * 1000)).toBe('25m left')
    })

    it('formats <1m left when less than a minute remaining', () => {
      expect(formatContinueWatchingRemaining(59 * 60 * 1000 + 30 * 1000, 60 * 60 * 1000)).toBe('<1m left')
    })

    it('formats remaining hours and minutes when 1 hour or more', () => {
      // 120m total, 30m watched -> 90m remaining -> 1h 30m left
      expect(formatContinueWatchingRemaining(30 * 60 * 1000, 120 * 60 * 1000)).toBe('1h 30m left')
      // 120m total, 60m watched -> 60m remaining -> 1h left
      expect(formatContinueWatchingRemaining(60 * 60 * 1000, 120 * 60 * 1000)).toBe('1h left')
    })
  })

  describe('getContinueWatchingSubtitle', () => {
    it('formats show season and episode with title', () => {
      const item: DiscoverContinueWatchingItem = {
        id: '1',
        ratingKey: '10',
        mediaType: 'show',
        title: 'Severance',
        episodeTitle: 'The You You Are',
        seasonNumber: 1,
        episodeNumber: 4,
      }
      expect(getContinueWatchingSubtitle(item)).toBe('S1:E4 · The You You Are')
    })

    it('formats show season and episode without episode title', () => {
      const item: DiscoverContinueWatchingItem = {
        id: '1',
        ratingKey: '10',
        mediaType: 'show',
        title: 'Severance',
        seasonNumber: 2,
        episodeNumber: 1,
      }
      expect(getContinueWatchingSubtitle(item)).toBe('S2:E1')
    })

    it('formats movie with year', () => {
      const item: DiscoverContinueWatchingItem = {
        id: '2',
        ratingKey: '20',
        mediaType: 'movie',
        title: 'Inception',
        year: 2010,
      }
      expect(getContinueWatchingSubtitle(item)).toBe('2010')
    })
  })

  describe('getContinueWatchingArtwork', () => {
    it('prefers backdropUrl over thumb', () => {
      const item: DiscoverContinueWatchingItem = {
        id: '1',
        ratingKey: '10',
        mediaType: 'movie',
        title: 'Inception',
        backdropUrl: 'http://example.com/backdrop.jpg',
        thumb: 'http://example.com/thumb.jpg',
      }
      expect(getContinueWatchingArtwork(item)).toBe('http://example.com/backdrop.jpg')
    })

    it('falls back to thumb if backdropUrl is missing', () => {
      const item: DiscoverContinueWatchingItem = {
        id: '1',
        ratingKey: '10',
        mediaType: 'movie',
        title: 'Inception',
        thumb: 'http://example.com/thumb.jpg',
      }
      expect(getContinueWatchingArtwork(item)).toBe('http://example.com/thumb.jpg')
    })
  })
})
