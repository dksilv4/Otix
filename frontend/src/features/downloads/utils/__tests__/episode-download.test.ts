import { describe, it, expect } from 'vitest'
import {
  parseEpisodeRelease,
  resolveEpisodeMetadata,
  resolveMovieMetadata,
} from '../episode-download'
import type { ServerArrQueueItem } from '../../arr-types'

describe('episode-download utils', () => {
  it('parses TV episode release titles accurately', () => {
    const res = parseEpisodeRelease(
      'Brothers.2026.S01E02.The.Hunt.2160p.ATVP.WEB-DL.DD+5.1.Atmos.DoVi.HDR.H.265-playWEB',
    )
    expect(res.showName).toBe('Brothers')
    expect(res.seasonNumber).toBe(1)
    expect(res.episodeNumber).toBe(2)
    expect(res.episodeTitle).toBe('The Hunt')
    expect(res.resolution).toBe('4K')
    expect(res.quality).toBe('WEB-DL')
  })

  it('parses Vikings episode title with season 6', () => {
    const res = parseEpisodeRelease(
      'Vikings.S06E17.The.Raft.of.Medusa.1080p.NF.WEB-DL.DD.5.1.H.264-playWEB',
    )
    expect(res.showName).toBe('Vikings')
    expect(res.seasonNumber).toBe(6)
    expect(res.episodeNumber).toBe(17)
    expect(res.episodeTitle).toBe('The Raft of Medusa')
    expect(res.resolution).toBe('1080p')
  })

  it('resolves episode metadata with Otix connected media and stills', () => {
    const item: ServerArrQueueItem = {
      id: 101,
      title: 'Brothers.2026.S01E02.The.Hunt.2160p.WEB-DL',
      status: 'downloading',
      size: 10_000_000_000,
      sizeLeft: 4_000_000_000,
      timeleft: '00:15:00',
      mediaItemId: 255737,
      showTitle: 'Brothers',
      seasonNumber: 1,
      episodeNumber: 2,
      episodeName: 'The Hunt',
      episodeStillUrl: 'https://image.tmdb.org/t/p/w300/still.jpg',
      showPosterUrl: 'https://image.tmdb.org/t/p/original/poster.jpg',
      protocol: 'usenet',
      downloadClient: 'SABnzbd',
      quality: {
        quality: {
          name: 'WEBDL-2160p',
          resolution: 2160,
        },
      },
    }

    const resolved = resolveEpisodeMetadata(item)
    expect(resolved.showTitle).toBe('Brothers')
    expect(resolved.seasonNumber).toBe(1)
    expect(resolved.episodeNumber).toBe(2)
    expect(resolved.episodeTitle).toBe('The Hunt')
    expect(resolved.mediaItemId).toBe(255737)
    expect(resolved.stillUrl).toBe('https://image.tmdb.org/t/p/w300/still.jpg')
    expect(resolved.posterUrl).toBe('https://image.tmdb.org/t/p/original/poster.jpg')
    expect(resolved.percentage).toBe(60)
    expect(resolved.downloadedBytes).toBe(6_000_000_000)
    expect(resolved.timeleft).toBe('00:15:00')
    expect(resolved.quality).toBe('WEBDL-2160p')
    expect(resolved.resolution).toBe('2160p')
  })

  it('resolves movie metadata with Otix connected media and posters', () => {
    const item: ServerArrQueueItem = {
      id: 202,
      title: 'Halloween.1978.4K.HDR.DV.2160p.BDRemux',
      status: 'downloading',
      size: 50_000_000_000,
      sizeLeft: 25_000_000_000,
      timeleft: '00:30:00',
      mediaItemId: 948,
      movieTitle: 'Halloween',
      movieYear: 1978,
      posterUrl: 'https://image.tmdb.org/t/p/original/halloween.jpg',
      protocol: 'torrent',
      quality: {
        quality: {
          name: 'Remux-2160p',
          resolution: 2160,
        },
      },
    }

    const resolved = resolveMovieMetadata(item)
    expect(resolved.movieTitle).toBe('Halloween')
    expect(resolved.year).toBe(1978)
    expect(resolved.mediaItemId).toBe(948)
    expect(resolved.posterUrl).toBe('https://image.tmdb.org/t/p/original/halloween.jpg')
    expect(resolved.percentage).toBe(50)
  })
})
