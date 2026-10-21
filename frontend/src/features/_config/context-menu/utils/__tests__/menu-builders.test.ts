import { describe, it, expect, vi } from 'vitest'
import {
  buildMediaMenuItems,
  buildGameMenuItems,
  buildPersonMenuItems,
  buildListMenuItems,
  buildTrackMenuItems,
  buildLinkMenuItems,
  buildImageMenuItems,
  buildTextMenuItems,
  buildInputMenuItems,
  buildPageMenuItems,
} from '../menu-builders'

describe('menu-builders', () => {
  it('buildMediaMenuItems creates full set of media actions', () => {
    const navigate = vi.fn()
    const items = buildMediaMenuItems(
      {
        type: 'media',
        id: '123',
        mediaType: 'movie',
        title: 'Interstellar',
        posterUrl: 'https://example.com/poster.jpg',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-details')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('library-submenu')
    expect(ids).toContain('favorite')
    expect(ids).toContain('add-to-list')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('view-poster')
    expect(ids).toContain('external-search')

    // Click view details
    const viewDetails = items.find((i) => i.id === 'view-details')
    viewDetails?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/media/$mediaType/$mediaId',
      params: { mediaType: 'movie', mediaId: '123' },
    })
  })

  it('buildGameMenuItems creates game launcher actions', () => {
    const navigate = vi.fn()
    const items = buildGameMenuItems(
      {
        type: 'game',
        gameId: 'g-1',
        title: 'Hades',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('game-details')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('search-steam')
    expect(ids).toContain('search-google')

    const details = items.find((i) => i.id === 'game-details')
    details?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/launcher/$gameId',
      params: { gameId: 'g-1' },
    })
  })

  it('buildPersonMenuItems creates person actions', () => {
    const navigate = vi.fn()
    const items = buildPersonMenuItems(
      {
        type: 'person',
        id: 'p-1',
        name: 'Cillian Murphy',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-person')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('search-tmdb')

    const view = items.find((i) => i.id === 'view-person')
    view?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/person/$personId',
      params: { personId: 'p-1' },
    })
  })

  it('buildListMenuItems creates user list actions', () => {
    const navigate = vi.fn()
    const items = buildListMenuItems(
      {
        type: 'list',
        id: 'l-1',
        name: 'Top Sci-Fi',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-list')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-name')
    expect(ids).toContain('copy-link')
  })

  it('buildTrackMenuItems creates audio track actions', () => {
    const items = buildTrackMenuItems({
      type: 'track',
      id: 't-1',
      title: 'Cornfield Chase',
      artist: 'Hans Zimmer',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('play-track')
    expect(ids).toContain('copy-title')
    expect(ids).toContain('search-youtube')
    expect(ids).toContain('search-spotify')
  })

  it('buildLinkMenuItems creates link actions', () => {
    const items = buildLinkMenuItems({
      type: 'link',
      href: 'https://otix.tv/docs',
      text: 'Documentation',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('open-link')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-link')
    expect(ids).toContain('copy-text')
  })

  it('buildImageMenuItems creates image actions', () => {
    const items = buildImageMenuItems({
      type: 'image',
      src: 'https://example.com/banner.jpg',
      alt: 'Banner',
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('view-image')
    expect(ids).toContain('open-new-tab')
    expect(ids).toContain('copy-url')
    expect(ids).toContain('download-image')
  })

  it('buildTextMenuItems creates text selection actions', () => {
    const navigate = vi.fn()
    const items = buildTextMenuItems(
      {
        type: 'text',
        text: 'Dune Part Two',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('copy-text')
    expect(ids).toContain('search-otix')
    expect(ids).toContain('search-google')

    const searchOtix = items.find((i) => i.id === 'search-otix')
    searchOtix?.onClick?.()
    expect(navigate).toHaveBeenCalledWith({
      to: '/search',
      search: { q: 'Dune Part Two' },
    })
  })

  it('buildInputMenuItems creates clipboard input actions', () => {
    const input = document.createElement('input')
    const items = buildInputMenuItems({
      type: 'input',
      element: input,
    })

    const ids = items.map((i) => i.id)
    expect(ids).toContain('cut')
    expect(ids).toContain('copy')
    expect(ids).toContain('paste')
    expect(ids).toContain('select-all')
  })

  it('buildPageMenuItems creates fallback navigation actions', () => {
    const navigate = vi.fn()
    const items = buildPageMenuItems(
      {
        type: 'page',
        url: 'https://otix.tv/settings',
        title: 'Settings',
      },
      { navigate },
    )

    const ids = items.map((i) => i.id)
    expect(ids).toContain('history-back')
    expect(ids).toContain('history-forward')
    expect(ids).toContain('reload-page')
    expect(ids).toContain('go-home')
    expect(ids).toContain('command-palette')
    expect(ids).toContain('copy-url')
  })
})
