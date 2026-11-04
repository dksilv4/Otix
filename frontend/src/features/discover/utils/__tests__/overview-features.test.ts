import { describe, it, expect } from 'vitest'
import {
  HERO_TABS,
  HERO_TAB_ITEMS,
  getNextHeroTab,
  filterRecentTrendingMedia,
} from '../overview-features'
import type { MediaItemSummary } from '@media/queries/media-queries'

describe('overview-features', () => {
  describe('getNextHeroTab', () => {
    it('cycles sequentially through tabs: movie -> show -> game -> movie', () => {
      expect(getNextHeroTab('movie')).toBe('show')
      expect(getNextHeroTab('show')).toBe('game')
      expect(getNextHeroTab('game')).toBe('movie')
    })

    it('contains all 3 media tabs in order', () => {
      expect(HERO_TABS).toEqual(['movie', 'show', 'game'])
      expect(HERO_TAB_ITEMS.map((t) => t.id)).toEqual(['movie', 'show', 'game'])
    })
  })

  describe('filterRecentTrendingMedia', () => {
    const currentYear = new Date().getFullYear()

    const recentMovie: MediaItemSummary = {
      id: 'm1',
      title: 'Current Year Movie',
      mediaType: 'movie',
      releaseDate: `${currentYear}-06-15`,
      popularity: 150,
      avgRating: 8.5,
      ratingCount: 1200,
      posterUrl: '',
      backdropUrl: '',
    }

    const lastYearMovie: MediaItemSummary = {
      id: 'm2',
      title: 'Last Year Movie',
      mediaType: 'movie',
      releaseDate: `${currentYear - 1}-03-10`,
      popularity: 140,
      avgRating: 8.2,
      ratingCount: 900,
      posterUrl: '',
      backdropUrl: '',
    }

    const futureMovie: MediaItemSummary = {
      id: 'm3',
      title: 'Upcoming Viral Release',
      mediaType: 'movie',
      releaseDate: `${currentYear + 1}-01-20`,
      popularity: 250,
      avgRating: 0,
      ratingCount: 0,
      posterUrl: '',
      backdropUrl: '',
    }

    const oldMovie: MediaItemSummary = {
      id: 'm4',
      title: 'Classic Movie',
      mediaType: 'movie',
      releaseDate: '2012-05-04',
      popularity: 300,
      avgRating: 9.0,
      ratingCount: 15000,
      posterUrl: '',
      backdropUrl: '',
    }

    it('keeps recent and future releases while filtering out old catalog titles', () => {
      const filtered = filterRecentTrendingMedia([
        recentMovie,
        oldMovie,
        lastYearMovie,
        futureMovie,
      ])
      const titles = filtered.map((i) => i.title)

      expect(titles).toContain('Current Year Movie')
      expect(titles).toContain('Last Year Movie')
      expect(titles).toContain('Upcoming Viral Release')
      expect(titles).not.toContain('Classic Movie')
    })

    it('handles empty or null lists gracefully', () => {
      expect(filterRecentTrendingMedia([])).toEqual([])
      expect(filterRecentTrendingMedia(null)).toEqual([])
      expect(filterRecentTrendingMedia(undefined)).toEqual([])
    })
  })
})
