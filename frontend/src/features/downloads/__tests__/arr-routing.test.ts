import { describe, expect, it } from 'vitest'
import { createArrInstance } from '../arr-instances'
import {
  findBestArrInstance,
  isInstanceMatchingMedia,
} from '../utils/arr-routing'

describe('arr-routing utility', () => {
  const animeInstance = createArrInstance(
    {
      id: 'inst-anime',
      name: 'Sonarr Anime',
      tags: ['Anime', 'Japan', 'Animation'],
    },
    8989,
  )

  const defaultInstance = createArrInstance(
    {
      id: 'inst-default',
      name: 'Sonarr Default',
      tags: [],
    },
    8989,
  )

  const docInstance = createArrInstance(
    {
      id: 'inst-doc',
      name: 'Sonarr Documentaries',
      tags: ['Documentary'],
    },
    8989,
  )

  it('matches anime media to anime instance by isAnime flag', () => {
    const isMatch = isInstanceMatchingMedia(animeInstance, {
      title: 'Attack on Titan',
      isAnime: true,
      originalLanguage: 'ja',
      genres: ['Action', 'Animation'],
    })
    expect(isMatch).toBe(true)

    const best = findBestArrInstance([defaultInstance, animeInstance], {
      title: 'Attack on Titan',
      isAnime: true,
      originalLanguage: 'ja',
    })
    expect(best?.id).toBe('inst-anime')
  })

  it('matches media by original language ja', () => {
    const best = findBestArrInstance([defaultInstance, animeInstance], {
      title: 'Spirited Away',
      originalLanguage: 'ja',
      genres: ['Fantasy'],
    })
    expect(best?.id).toBe('inst-anime')
  })

  it('matches media by genre documentary', () => {
    const best = findBestArrInstance([defaultInstance, docInstance, animeInstance], {
      title: 'Planet Earth',
      genres: ['Documentary'],
    })
    expect(best?.id).toBe('inst-doc')
  })

  it('returns null if no tagged instance matches, falling back to default', () => {
    const best = findBestArrInstance([defaultInstance, animeInstance, docInstance], {
      title: 'Breaking Bad',
      genres: ['Crime', 'Drama'],
      originalLanguage: 'en',
    })
    expect(best).toBeNull()
  })
})
