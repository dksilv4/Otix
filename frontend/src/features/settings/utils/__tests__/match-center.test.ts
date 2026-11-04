import { describe, it, expect } from 'vitest'
import {
  synthesizeMatchRecordsFromLocalGames,
  filterMatchRecords,
  getConfidenceBadge,
} from '../match-center'

describe('match-center utils', () => {
  describe('getConfidenceBadge', () => {
    it('returns success for >= 85%', () => {
      expect(getConfidenceBadge(0.95).variant).toBe('success')
      expect(getConfidenceBadge(0.85).variant).toBe('success')
    })

    it('returns warning for >= 50% and < 85%', () => {
      expect(getConfidenceBadge(0.6).variant).toBe('warning')
    })

    it('returns muted for < 50%', () => {
      expect(getConfidenceBadge(0.3).variant).toBe('muted')
    })
  })

  describe('synthesizeMatchRecordsFromLocalGames', () => {
    it('synthesizes matched game with full media metadata', () => {
      const localGames = [
        {
          id: 'pc_eldenring',
          title: 'Elden Ring',
          exePath: 'C:\\Games\\Elden Ring\\eldenring.exe',
          installDir: 'C:\\Games\\Elden Ring',
          platform: 'pc',
          otixMediaId: 'game_elden_1',
          otixMediaTitle: 'Elden Ring',
          otixMediaSlug: 'elden-ring',
          otixPosterUrl: 'https://cdn.example.com/er_poster.jpg',
          otixBackdropUrl: 'https://cdn.example.com/er_backdrop.jpg',
          otixConfidence: 0.98,
          data: {
            releaseDate: '2022-02-25',
          },
        },
      ]

      const records = synthesizeMatchRecordsFromLocalGames(localGames)
      expect(records).toHaveLength(1)
      const rec = records[0]
      expect(rec.matchStatus).toBe('matched')
      expect(rec.confidence).toBe(0.98)
      expect(rec.media).toBeDefined()
      expect(rec.media?.title).toBe('Elden Ring')
      expect(rec.media?.posterUrl).toBe('https://cdn.example.com/er_poster.jpg')
      expect(rec.media?.backdropUrl).toBe('https://cdn.example.com/er_backdrop.jpg')
      expect(rec.media?.releaseDate).toBe('2022-02-25')
    })

    it('excludes standalone updates and standalone DLCs from review center', () => {
      const localGames = [
        {
          id: 'upd_1',
          title: 'Pokemon Scarlet [0100A55016140800].nsp',
          exePath: 'C:\\ROMs\\Pokemon Scarlet [0100A55016140800].nsp',
          platform: 'switch',
        },
        {
          id: 'upd_2',
          title: 'Zelda Tears of the Kingdom [Update v1.2.0]',
          exePath: 'C:\\ROMs\\Zelda [Update v1.2.0].nsp',
          platform: 'switch',
        },
        {
          id: 'dlc_1',
          title: 'Smash Bros Ultimate [01006A800016E001].nsp',
          exePath: 'C:\\ROMs\\Smash [01006A800016E001].nsp',
          platform: 'switch',
          isDlc: true,
        },
      ]

      const records = synthesizeMatchRecordsFromLocalGames(localGames)
      expect(records).toHaveLength(0)
    })

    it('preserves base games that state they bundle DLC or updates', () => {
      const localGames = [
        {
          id: 'base_1',
          title: 'Super Mario Odyssey [DLC Included]',
          exePath: 'C:\\ROMs\\Mario.nsp',
          platform: 'switch',
        },
        {
          id: 'base_2',
          title: 'The Witcher 3 [With Update]',
          exePath: 'C:\\Games\\W3\\bin\\x64\\witcher3.exe',
          platform: 'pc',
        },
      ]

      const records = synthesizeMatchRecordsFromLocalGames(localGames)
      expect(records).toHaveLength(2)
      expect(records[0].rawTitle).toBe('Super Mario Odyssey [DLC Included]')
      expect(records[1].rawTitle).toBe('The Witcher 3 [With Update]')
    })

    it('synthesizes candidate suggestions for review', () => {
      const localGames = [
        {
          id: 'cand_1',
          title: 'Hollow Knight',
          exePath: 'C:\\Games\\Hollow Knight\\hollow_knight.exe',
          platform: 'pc',
          suggestions: [
            {
              id: 'hk_igdb',
              title: 'Hollow Knight',
              slug: 'hollow-knight',
              posterUrl: 'https://cdn.example.com/hk.jpg',
              releaseDate: '2017-02-24',
              confidence: 0.88,
            },
          ],
        },
      ]

      const records = synthesizeMatchRecordsFromLocalGames(localGames)
      expect(records).toHaveLength(1)
      expect(records[0].matchStatus).toBe('needs_review')
      expect(records[0].candidates).toHaveLength(1)
      expect(records[0].candidates[0].mediaId).toBe('hk_igdb')
      expect(records[0].candidates[0].title).toBe('Hollow Knight')
      expect(records[0].candidates[0].releaseYear).toBe(2017)
    })
  })

  describe('filterMatchRecords', () => {
    it('filters accurately by tab and search query', () => {
      const records: any[] = [
        { id: 1, cleanedTitle: 'Hades', matchStatus: 'needs_review', candidates: [] },
        { id: 2, cleanedTitle: 'Hades II', matchStatus: 'unmatched', candidates: [] },
        { id: 3, cleanedTitle: 'Portal 2', matchStatus: 'matched', candidates: [] },
      ]

      expect(filterMatchRecords(records, 'matched', '')).toHaveLength(1)
      expect(filterMatchRecords(records, 'needs_review', '')).toHaveLength(1)
      expect(filterMatchRecords(records, 'all', 'hades')).toHaveLength(2)
    })
  })
})
