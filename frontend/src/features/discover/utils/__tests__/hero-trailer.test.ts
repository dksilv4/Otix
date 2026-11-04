import { describe, it, expect } from 'vitest'
import { extractTrailerYoutubeId, extractYoutubeIdFromUrl } from '../hero'

describe('extractYoutubeIdFromUrl', () => {
  it('extracts ID from standard https://www.youtube.com/watch?v=ID', () => {
    expect(extractYoutubeIdFromUrl('https://www.youtube.com/watch?v=_jgYEYERYFQ')).toBe('_jgYEYERYFQ')
  })

  it('extracts ID with extra query parameters in URL', () => {
    expect(extractYoutubeIdFromUrl('https://www.youtube.com/watch?v=GSycMV-_Csw&t=30s&feature=emb_title')).toBe(
      'GSycMV-_Csw',
    )
  })

  it('extracts ID from https://youtu.be/ID short links', () => {
    expect(extractYoutubeIdFromUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
  })

  it('extracts ID from embed URLs https://www.youtube.com/embed/ID', () => {
    expect(extractYoutubeIdFromUrl('https://www.youtube.com/embed/FeISX5E1uJc')).toBe('FeISX5E1uJc')
  })

  it('passes through raw 11-character YouTube IDs', () => {
    expect(extractYoutubeIdFromUrl('dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ')
    expect(extractYoutubeIdFromUrl('  GSycMV-_Csw  ')).toBe('GSycMV-_Csw')
  })

  it('returns null for null, undefined, or empty input', () => {
    expect(extractYoutubeIdFromUrl(null)).toBeNull()
    expect(extractYoutubeIdFromUrl(undefined)).toBeNull()
    expect(extractYoutubeIdFromUrl('')).toBeNull()
  })

  it('returns null for invalid strings and non-11-character IDs', () => {
    // 24-char TMDB ObjectId
    expect(extractYoutubeIdFromUrl('6373c5d021621b00cd6438a9')).toBeNull()
    expect(extractYoutubeIdFromUrl('https://vimeo.com/123456')).toBeNull()
  })
})

describe('extractTrailerYoutubeId', () => {
  it('extracts YouTube ID from TMDB video with 24-char providerId without returning TMDB hex', () => {
    const tmdbVideos = [
      {
        videoType: 'Opening Credits',
        url: 'https://www.youtube.com/watch?v=DX1iplQQJTo',
        providerId: '5336dbb79251417db4000ed8',
      },
      {
        videoType: 'Trailer',
        url: 'https://www.youtube.com/watch?v=_jgYEYERYFQ',
        providerId: '6373c5d021621b00cd6438a9', // TMDB ID
      },
    ]

    const result = extractTrailerYoutubeId(null, tmdbVideos)
    expect(result).toBe('_jgYEYERYFQ')
    expect(result).not.toBe('6373c5d021621b00cd6438a9')
  })

  it('prioritizes Trailer over Clip and Teaser even if Clip appears first in the list', () => {
    const videos = [
      {
        videoType: 'Clip',
        url: 'https://www.youtube.com/watch?v=u-YNd31tSZg',
        providerId: '61e8d7e8d37197006bca1016',
      },
      {
        videoType: 'Teaser',
        url: 'https://www.youtube.com/watch?v=vxyzFk_z-Wc',
        providerId: '6a8d047eb379f68ba54dc85c',
      },
      {
        videoType: 'Trailer',
        url: 'https://www.youtube.com/watch?v=GSycMV-_Csw',
        providerId: '61a90af0d2f5b50097032aec',
      },
    ]

    const result = extractTrailerYoutubeId(null, videos)
    expect(result).toBe('GSycMV-_Csw')
  })

  it('falls back to Teaser if no official Trailer exists', () => {
    const videos = [
      {
        videoType: 'Featurette',
        url: 'https://www.youtube.com/watch?v=d8N873GDkIk',
        providerId: '6ab0fd142a24cd5ea9c8bc06',
      },
      {
        videoType: 'Teaser',
        url: 'https://www.youtube.com/watch?v=bbvj-GdTtL4',
        providerId: '6ab24afbb1cdb40adf916656',
      },
    ]

    const result = extractTrailerYoutubeId(null, videos)
    expect(result).toBe('bbvj-GdTtL4')
  })

  it('extracts IGDB game_video correctly', () => {
    const igdbVideos = [
      {
        videoType: 'game_video',
        url: 'https://www.youtube.com/watch?v=QLfdTL8mPGs',
        providerId: 'QLfdTL8mPGs',
      },
    ]

    const result = extractTrailerYoutubeId(null, igdbVideos)
    expect(result).toBe('QLfdTL8mPGs')
  })

  it('accepts explicit direct youtubeVideoId', () => {
    expect(extractTrailerYoutubeId('dQw4w9WgXcQ', [])).toBe('dQw4w9WgXcQ')
    expect(extractTrailerYoutubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ', [])).toBe('dQw4w9WgXcQ')
  })

  it('returns null when no valid YouTube video is found', () => {
    expect(extractTrailerYoutubeId(null, null)).toBeNull()
    expect(extractTrailerYoutubeId(null, [])).toBeNull()
    expect(
      extractTrailerYoutubeId(null, [
        {
          videoType: 'Trailer',
          url: 'https://vimeo.com/12345',
          providerId: '6373c5d021621b00cd6438a9',
        },
      ]),
    ).toBeNull()
  })
})
