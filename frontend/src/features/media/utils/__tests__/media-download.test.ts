import { describe, it, expect } from 'vitest'
import {
  isMatchingArrRecord,
  matchEpisodeRecord,
  resolveItemSpeed,
  aggregateQueueProgress,
} from '../media-download'
import type { ServerArrQueueItem } from '@/features/downloads/arr-types'

describe('media-download utilities', () => {
  const mockSonarrRecord: ServerArrQueueItem = {
    id: 101,
    title: 'Severance.S01E03.1080p.WEB-DL.DDP5.1.Atmos.H.264',
    status: 'Downloading',
    size: 2_000_000_000,
    sizeLeft: 1_000_000_000,
    timeleft: '00:05:30',
    downloadId: 'nzo_123',
    mediaItemId: 42,
    showTitle: 'Severance',
    seasonNumber: 1,
    episodeNumber: 3,
    series: {
      id: 1,
      title: 'Severance',
      tvdbId: 371980,
      tmdbId: 95396,
    },
    episode: {
      id: 10,
      title: 'In Perpetuity',
      seasonNumber: 1,
      episodeNumber: 3,
    },
  }

  describe('isMatchingArrRecord', () => {
    it('matches by mediaItemId', () => {
      expect(isMatchingArrRecord(mockSonarrRecord, { mediaId: '42' })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { mediaId: 42 })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { mediaId: '99' })).toBe(false)
    })

    it('matches by tmdbId', () => {
      expect(isMatchingArrRecord(mockSonarrRecord, { tmdbId: 95396 })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { tmdbId: '95396' })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { tmdbId: '11111' })).toBe(false)
    })

    it('matches by tvdbId', () => {
      expect(isMatchingArrRecord(mockSonarrRecord, { tvdbId: 371980 })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { tvdbId: '371980' })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { tvdbId: '99999' })).toBe(false)
    })

    it('matches by title or release prefix', () => {
      expect(isMatchingArrRecord(mockSonarrRecord, { title: 'Severance' })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { title: 'severance' })).toBe(true)
      expect(isMatchingArrRecord(mockSonarrRecord, { title: 'Breaking Bad' })).toBe(false)
    })
  })

  describe('matchEpisodeRecord', () => {
    it('matches season and episode', () => {
      expect(matchEpisodeRecord(mockSonarrRecord, 1, 3)).toBe(true)
      expect(matchEpisodeRecord(mockSonarrRecord, 1, 4)).toBe(false)
      expect(matchEpisodeRecord(mockSonarrRecord, 2, 3)).toBe(false)
    })

    it('matches parsed release if episode object is missing', () => {
      const bareRecord: ServerArrQueueItem = {
        id: 102,
        title: 'Shogun.2024.S01E08.1080p.WEB.H264',
        status: 'Downloading',
        size: 1_000_000,
        sizeLeft: 500_000,
      }
      expect(matchEpisodeRecord(bareRecord, 1, 8)).toBe(true)
      expect(matchEpisodeRecord(bareRecord, 1, 7)).toBe(false)
    })
  })

  describe('resolveItemSpeed', () => {
    it('matches usenet items by downloadId/nzo_id', () => {
      const usenetItems = [
        { nzo_id: 'nzo_123', speed: '18.4 MB/s' },
        { nzo_id: 'nzo_999', speed: '2.1 MB/s' },
      ]
      expect(resolveItemSpeed(mockSonarrRecord, usenetItems)).toBe('18.4 MB/s')
    })

    it('falls back to direct speed or fallback speed', () => {
      const recWithSpeed: ServerArrQueueItem = {
        ...mockSonarrRecord,
        downloadId: 'unknown',
        speed: '12.0 MB/s',
      } as any
      expect(resolveItemSpeed(recWithSpeed, [])).toBe('12.0 MB/s')
      expect(resolveItemSpeed(mockSonarrRecord, [], '5.5 MB/s')).toBe('5.5 MB/s')
    })
  })

  describe('aggregateQueueProgress', () => {
    it('calculates aggregated progress across multiple records', () => {
      const rec2: ServerArrQueueItem = {
        id: 102,
        title: 'Severance.S01E04.1080p',
        status: 'Downloading',
        size: 2_000_000_000,
        sizeLeft: 1_500_000_000, // 25% done
      }

      // Total size: 4 GB, total left: 2.5 GB -> downloaded 1.5 GB -> 37.5%
      const res = aggregateQueueProgress([mockSonarrRecord, rec2])
      expect(res.activeCount).toBe(2)
      expect(res.totalSize).toBe(4_000_000_000)
      expect(res.totalRemaining).toBe(2_500_000_000)
      expect(res.overallProgress).toBe(37.5)
      expect(res.eta).toBe('00:05:30')
    })
  })
})
